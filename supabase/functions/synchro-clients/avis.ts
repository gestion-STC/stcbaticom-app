// La passerelle des avis : lit STC Bâtiment (avis_pour_baticom) et range les contacts dans avis_contacts.
// Une panne ici n'arrête jamais la synchro des clients signés.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { aRetirer, aSolliciter, versAvisContact, type LigneAvisStc } from "./avisRegles.ts"

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
    // Ceux que STC Bâtiment ne renvoie plus (faux numéros, doublons, pros…) sortent de la liste, sauf déjà en campagne.
    const { data: existants } = await sb.from("avis_contacts").select("id, ref_stc").eq("source", "stc_batiment")
    const { data: inscrits } = await sb.from("cmp_inscriptions").select("contact_ref")
    const retirer = aRetirer((existants ?? []) as { id: string; ref_stc: string | null }[], lignes.map((l) => l.ref_stc), new Set((inscrits ?? []).map((i: { contact_ref: string }) => String(i.contact_ref))))
    for (let i = 0; i < retirer.length; i += 200) await sb.from("avis_contacts").delete().in("id", retirer.slice(i, i + 200))
    return { avis_retires: retirer.length, avis_locataires: lignes.filter((l) => l.public === "locataires").length, avis_sous_traitants: lignes.filter((l) => l.public === "sous_traitants_actifs").length }
  } catch (e) {
    console.error("[SYNCHRO-AVIS]", e)
    return { avis_erreur: String(e) }
  }
}
