// Les textes écrits par l'IA pour les campagnes : les essais sur de vraies fiches, et ceux gardés pour l'envoi.
import { supabase } from "./supabase"
import { lireParLots } from "./pagination"
import type { ReglageIA } from "../prospection/ia"

export type LigneIA = { contactRef: string; nom: string; detail: string; texte: string; pauvre: boolean; cout: number; modifie?: boolean }
export type TexteARelire = { id: string; contactRef: string; nom: string; texte: string }
const sb = () => { if (!supabase) throw new Error("Supabase n'est pas configuré."); return supabase }

export async function essayerIA(a: { baseId: string; campagneNom: string; objet: string; corps: string; ia: ReglageIA; nombre?: number; contactRef?: string }): Promise<{ lignes: LigneIA[]; cout: number }> {
  const { data, error } = await sb().functions.invoke("campagnes-ia", { body: a })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const lu = ctx && typeof ctx.json === "function" ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null
    throw new Error(lu?.error ?? error.message)
  }
  return data as { lignes: LigneIA[]; cout: number }
}

/** Les exemples relus : ces fiches recevront exactement ces textes. */
export async function enregistrerTextesIA(campagneId: string, creatifId: string, varianteId: string, lignes: LigneIA[]): Promise<void> {
  const aGarder = lignes.filter((l) => !l.pauvre && l.texte.trim()).map((l) => ({ campagne_id: campagneId, creatif_id: creatifId, variante_id: varianteId, contact_ref: l.contactRef, texte: l.texte.trim(), valide: true, modifie: Boolean(l.modifie), cout: l.cout }))
  if (!aGarder.length) return
  const { error } = await sb().from("cmp_textes_ia").upsert(aGarder, { onConflict: "campagne_id,variante_id,contact_ref" })
  if (error) throw new Error(error.message)
}

export async function compterTextesValides(campagneId: string): Promise<number> {
  const { count } = await sb().from("cmp_textes_ia").select("id", { count: "exact", head: true }).eq("campagne_id", campagneId).eq("valide", true)
  return count ?? 0
}

export async function chargerTextesARelire(campagneId: string): Promise<{ id: string; contactRef: string; texte: string }[]> {
  const { data, error } = await sb().from("cmp_textes_ia").select("id, contact_ref, texte").eq("campagne_id", campagneId).eq("valide", false).order("cree_le").limit(200)
  if (error) throw new Error(error.message)
  return ((data ?? []) as { id: string; contact_ref: string; texte: string }[]).map((l) => ({ id: l.id, contactRef: l.contact_ref, texte: l.texte }))
}

export async function validerTexteIA(id: string, texte: string): Promise<void> {
  const { error } = await sb().from("cmp_textes_ia").update({ texte: texte.trim(), valide: true, maj_le: new Date().toISOString() }).eq("id", id)
  if (error) throw new Error(error.message)
}

const DOLLAR_EN_EURO = 0.95

/** Ce que les textes de l'IA ont coûté à cette campagne, en euros (taux approximatif). */
export async function chargerCoutIA(campagneId: string): Promise<number> {
  const l = await lireParLots<{ cout: number }>((d, f) => sb().from("cmp_textes_ia").select("cout").eq("campagne_id", campagneId).order("id").range(d, f) as never)
  return l.reduce((s, x) => s + Number(x.cout || 0), 0) * DOLLAR_EN_EURO
}

/** Le tri des réponses reçues des contacts de cette campagne. */
export async function chargerTrisCampagne(inscrits: Map<string, string>): Promise<Record<string, number>> {
  const l = await lireParLots<{ tri: string; agence_id: string | null; sous_traitant_id: string | null; created_at: string }>((d, f) => sb().from("messages").select("tri, agence_id, sous_traitant_id, created_at").eq("sens", "entrant").not("tri", "is", null).order("id").range(d, f) as never)
  const totaux: Record<string, number> = {}
  for (const m of l) { const depuis = inscrits.get(m.agence_id ?? m.sous_traitant_id ?? ""); if (depuis && m.created_at >= depuis) totaux[m.tri] = (totaux[m.tri] ?? 0) + 1 }
  return totaux
}
