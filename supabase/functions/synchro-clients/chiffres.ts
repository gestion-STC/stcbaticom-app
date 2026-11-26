// Les vrais chiffres du cockpit (Mahdi, 11/11/2026) : lit STC Bâtiment (chiffres_pour_baticom) — les chiffres bruts de
// chaque agence (OS, facturé), les règles étant appliquées dans le dashboard — et les range dans parametres.chiffres_stc, que le dashboard Croissance lit.
// Les sous-traitants (e-mails, paiements, missions) vont à part, dans parametres.chiffres_stc_st (26/11/2026) : seuls les
// administrateurs la lisent (dashboards Sous-traitants et Campagnes) ; chiffres_stc reste lisible par toute l'équipe.
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
    const chiffres = (await r.json()) as { version?: number; agences?: unknown[] } | null
    if (!chiffres || !Array.isArray(chiffres.agences)) return { chiffres_erreur: "réponse vide (clé refusée ?)" }
    const { sous_traitants, ...pourTous } = chiffres as typeof chiffres & { sous_traitants?: unknown[] }
    // Les sous-traitants d'abord : si leur clé ne s'écrit pas, chiffres_stc garde sa version d'avant plutôt que de les perdre.
    if (Array.isArray(sous_traitants)) {
      const { error: eSt } = await sb.from("parametres").upsert({ cle: "chiffres_stc_st", valeur: JSON.stringify(sous_traitants) }, { onConflict: "cle" })
      if (eSt) return { chiffres_erreur: `sous-traitants : ${eSt.message}` }
    }
    const { error } = await sb.from("parametres").upsert({ cle: "chiffres_stc", valeur: JSON.stringify(pourTous) }, { onConflict: "cle" })
    if (error) return { chiffres_erreur: error.message }
    return { chiffres_agences: chiffres.agences.length, chiffres_version: chiffres.version ?? 1, chiffres_sous_traitants: Array.isArray(sous_traitants) ? sous_traitants.length : null }
  } catch (e) {
    console.error("[SYNCHRO-CHIFFRES]", e)
    return { chiffres_erreur: String(e) }
  }
}
