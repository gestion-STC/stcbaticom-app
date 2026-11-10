// Les textes écrits par l'IA pour les campagnes : les essais sur de vraies fiches, et ceux gardés pour l'envoi.
import { supabase } from "./supabase"
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
