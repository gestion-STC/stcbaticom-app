// Les clients signés, venus de STC Bâtiment (10/10/2026).
//
// Toutes les heures (cron) : on lit dans STC Bâtiment la liste des gestionnaires
// qui ont envoyé un ordre de service (lecture seule, fonction `clients_pour_baticom`
// protégée par une clé partagée), on cherche l'agence correspondante ici, et on
// dépose une PROPOSITION dans `clients_signales`. Rien ne devient client tout
// seul : un humain confirme sur Aujourd'hui (Mahdi : « une confirmation humaine »).
//
// Secrets côté Baticom : STC_BATIMENT_URL, STC_BATIMENT_ANON, PASSERELLE_CLE.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { candidats, type AgenceRef, type Candidat, type GestionnaireRef } from "./rapprochement.ts"

type LigneGestionnaire = {
  gestionnaire_id: string; societe: string; nom: string; email: string; telephone: string; telephone_fixe: string; telephone_portable: string
  premier_os_le: string | null; premier_os_numero: string | null; dernier_os_le: string | null; nb_os: number; noms_agence: string | null; codes_postaux: string | null
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "POST attendu" }, 405)
  const base = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const urlBatiment = Deno.env.get("STC_BATIMENT_URL") || ""
  const anonBatiment = Deno.env.get("STC_BATIMENT_ANON") || ""
  const cle = Deno.env.get("PASSERELLE_CLE") || ""
  if (!urlBatiment || !anonBatiment || !cle) return json({ error: "Secrets STC_BATIMENT_URL / STC_BATIMENT_ANON / PASSERELLE_CLE manquants" }, 500)

  try {
    // 1) Les gestionnaires de STC Bâtiment qui ont envoyé au moins un OS.
    const r = await fetch(`${urlBatiment}/rest/v1/rpc/clients_pour_baticom`, {
      method: "POST",
      headers: { apikey: anonBatiment, Authorization: `Bearer ${anonBatiment}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_cle: cle }),
    })
    if (!r.ok) return json({ error: `STC Bâtiment répond ${r.status}`, detail: (await r.text()).slice(0, 300) }, 502)
    const gestionnaires = (await r.json()) as LigneGestionnaire[]

    // 2) Les agences et contacts d'ici, pour le rapprochement.
    const sb = createClient(base, service)
    // PostgREST s'arrête à 1 000 lignes sans le dire : on lit page par page, dans un ordre stable.
    const toutes = async <T>(table: string, colonnes: string): Promise<T[]> => {
      const out: T[] = []
      for (let de = 0; ; de += 1000) {
        const { data, error } = await sb.from(table).select(colonnes).order("id").range(de, de + 999)
        if (error) throw error
        out.push(...((data ?? []) as T[]))
        if (!data || data.length < 1000) return out
      }
    }
    const [lignesAgences, lignesContacts, lignesDeja] = await Promise.all([
      toutes<{ id: string; nom: string; secteur: string | null; telephone: string; email: string; etape: string; premier_os_le: string | null }>("agences", "id, nom, secteur, telephone, email, etape, premier_os_le"),
      toutes<{ agence_id: string; email: string; ligne_directe: string; mobile: string }>("contacts", "id, agence_id, email, ligne_directe, mobile"),
      toutes<{ gestionnaire_id: string; statut: string; agence_id: string | null }>("clients_signales", "id, gestionnaire_id, statut, agence_id"),
    ])
    const contactsPar = new Map<string, { emails: string[]; tels: string[] }>()
    for (const c of lignesContacts) {
      const e = contactsPar.get(c.agence_id) ?? { emails: [], tels: [] }
      if (c.email) e.emails.push(c.email)
      if (c.ligne_directe) e.tels.push(c.ligne_directe)
      if (c.mobile) e.tels.push(c.mobile)
      contactsPar.set(c.agence_id, e)
    }
    const agences: AgenceRef[] = lignesAgences.map((a) => ({
      id: a.id, nom: a.nom, secteur: a.secteur, telephone: a.telephone, email: a.email, etape: a.etape, premierOsLe: a.premier_os_le,
      contactsEmails: contactsPar.get(a.id)?.emails ?? [], contactsTels: contactsPar.get(a.id)?.tels ?? [],
    }))
    const dejaPar = new Map(lignesDeja.map((d) => [d.gestionnaire_id, d]))

    // 3) Une proposition par gestionnaire nouveau ; les décisions prises ne bougent plus.
    let nouvelles = 0, misesAJour = 0, dejaClients = 0
    for (const g of gestionnaires) {
      const existant = dejaPar.get(g.gestionnaire_id)
      const telephones = [g.telephone, g.telephone_fixe, g.telephone_portable].filter(Boolean)
      const commun = {
        societe: g.societe, nom: g.nom, email: g.email, telephones, premier_os_le: g.premier_os_le, premier_os_numero: g.premier_os_numero ?? "",
        dernier_os_le: g.dernier_os_le, nb_os: g.nb_os, noms_agence: g.noms_agence ?? "", codes_postaux: g.codes_postaux ?? "", maj_le: new Date().toISOString(),
      }
      if (existant && existant.statut !== "a_confirmer") {
        await sb.from("clients_signales").update(commun).eq("gestionnaire_id", g.gestionnaire_id)
        misesAJour++
        continue
      }
      const ref: GestionnaireRef = { societe: g.societe, nom: g.nom, email: g.email, telephones, nomsAgence: g.noms_agence ?? "", codesPostaux: g.codes_postaux ?? "" }
      const liste: Candidat[] = candidats(ref, agences)
      // Déjà cliente ici, avec un premier OS daté : rien à confirmer.
      const premier = liste[0] ? agences.find((a) => a.id === liste[0].agenceId) : undefined
      const dejaClient = !!premier && premier.etape === "client" && !!premier.premierOsLe && liste[0].score >= 100
      const ligne = { gestionnaire_id: g.gestionnaire_id, ...commun, candidats: liste, statut: dejaClient ? "deja_client" : "a_confirmer", agence_id: dejaClient ? premier!.id : null }
      const { error } = await sb.from("clients_signales").upsert(ligne, { onConflict: "gestionnaire_id" })
      if (error) throw error
      if (dejaClient) dejaClients++
      else nouvelles++
    }
    return json({ ok: true, agences_lues: agences.length, gestionnaires: gestionnaires.length, nouvelles_ou_revues: nouvelles, mises_a_jour: misesAJour, deja_clients: dejaClients })
  } catch (e) {
    console.error("[SYNCHRO-CLIENTS]", e)
    return json({ error: String(e) }, 500)
  }
})
