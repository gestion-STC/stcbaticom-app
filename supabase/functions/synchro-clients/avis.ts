// La passerelle des avis : lit STC Bâtiment (avis_pour_baticom) et range les contacts dans avis_contacts.
// Une panne ici n'arrête jamais la synchro des clients signés.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { aRetirer, aSolliciter, versAvisContact, type LigneAvisStc } from "./avisRegles.ts"

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>
/** Toutes les lignes, 1 000 par 1 000, dans un ordre stable ; une erreur arrête tout (rien n'est retiré). */
async function toutes<T>(page: (de: number, a: number) => Page<T>): Promise<T[]> {
  const out: T[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await page(de, de + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

export async function synchroAvis(sb: SupabaseClient, urlBatiment: string, anonBatiment: string, cle: string): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(`${urlBatiment}/rest/v1/rpc/avis_pour_baticom`, {
      method: "POST",
      headers: { apikey: anonBatiment, Authorization: `Bearer ${anonBatiment}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_cle: cle }),
    })
    // Pas encore installée côté STC Bâtiment : rien à faire, sans erreur.
    if (r.status === 404) return { avis: "passerelle pas encore installée côté STC Bâtiment" }
    if (!r.ok) return { avis_erreur: `STC Bâtiment répond ${r.status}`, detail: (await r.text()).slice(0, 200) }
    const maintenant = new Date()
    const lignes = aSolliciter((await r.json()) as LigneAvisStc[], maintenant).map((l) => versAvisContact(l, maintenant))
    for (let i = 0; i < lignes.length; i += 200) {
      const { error } = await sb.from("avis_contacts").upsert(lignes.slice(i, i + 200), { onConflict: "ref_stc" })
      if (error) return { avis_erreur: error.message }
    }
    // Ceux que STC Bâtiment ne renvoie plus (faux numéros, doublons, pros…) sortent de la liste, sauf déjà en campagne ou
    // désinscrits. 27/11/2026 : lus PAGE PAR PAGE (PostgREST s'arrête à 1 000 lignes sans le dire : au-delà, des inscrits
    // passaient pour « jamais en campagne » et étaient effacés) ; une lecture qui échoue n'efface rien.
    const existants = await toutes<{ id: string; ref_stc: string | null; desinscrit: boolean }>((d, f) => sb.from("avis_contacts").select("id, ref_stc, desinscrit").eq("source", "stc_batiment").order("id").range(d, f))
    const { data: campsAvis, error: eCamps } = await sb.from("cmp_campagnes").select("id").in("base_id", ["locataires", "sous_traitants_actifs"])
    if (eCamps) throw new Error(eCamps.message)
    const idsCamps = (campsAvis ?? []).map((c: { id: string }) => c.id)
    const inscrits = idsCamps.length ? await toutes<{ contact_ref: string }>((d, f) => sb.from("cmp_inscriptions").select("contact_ref").in("campagne_id", idsCamps).order("id").range(d, f)) : []
    const retirer = aRetirer(existants, lignes.map((l) => l.ref_stc), new Set(inscrits.map((i) => String(i.contact_ref))))
    for (let i = 0; i < retirer.length; i += 200) {
      const { error } = await sb.from("avis_contacts").delete().in("id", retirer.slice(i, i + 200)).eq("desinscrit", false)
      if (error) return { avis_erreur: error.message }
    }
    return { avis_retires: retirer.length, avis_locataires: lignes.filter((l) => l.public === "locataires").length, avis_sous_traitants: lignes.filter((l) => l.public === "sous_traitants_actifs").length }
  } catch (e) {
    console.error("[SYNCHRO-AVIS]", e)
    return { avis_erreur: String(e) }
  }
}
