// Les vrais chiffres du cockpit (Mahdi, 11/11/2026) : lit STC Bâtiment (chiffres_pour_baticom) — agences actives et
// chiffre d'affaires facturé — et les range dans parametres.chiffres_stc, que le dashboard Croissance lit.
// Une panne ici n'arrête jamais la synchro des clients signés.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

export async function synchroChiffres(sb: SupabaseClient, urlBatiment: string, anonBatiment: string, cle: string): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(`${urlBatiment}/rest/v1/rpc/chiffres_pour_baticom`, {
      method: "POST",
      headers: { apikey: anonBatiment, Authorization: `Bearer ${anonBatiment}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_cle: cle }),
    })
    // Pas encore installée côté STC Bâtiment : rien à faire, sans erreur.
    if (r.status === 404) return { chiffres: "passerelle pas encore installée côté STC Bâtiment" }
    if (!r.ok) return { chiffres_erreur: `STC Bâtiment répond ${r.status}`, detail: (await r.text()).slice(0, 200) }
    const chiffres = (await r.json()) as { agences_actives?: number } | null
    if (!chiffres || typeof chiffres.agences_actives !== "number") return { chiffres_erreur: "réponse vide (clé refusée ?)" }
    const { error } = await sb.from("parametres").upsert({ cle: "chiffres_stc", valeur: JSON.stringify(chiffres) }, { onConflict: "cle" })
    if (error) return { chiffres_erreur: error.message }
    return { agences_actives: chiffres.agences_actives }
  } catch (e) {
    console.error("[SYNCHRO-CHIFFRES]", e)
    return { chiffres_erreur: String(e) }
  }
}
