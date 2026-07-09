import { supabase } from "./supabase"

export type Evenement = {
  type: "appel" | "email" | "rdv"
  date: string // ISO pour le tri
  libelle: string
  detail?: string
  sens?: "entrant" | "sortant" // appels et emails : sens de l'échange
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function lire(query: any): Promise<any[]> {
  try {
    const { data, error } = await query
    if (error) return []
    return data ?? []
  } catch {
    return []
  }
}

// Historique complet d'un prospect (appels + emails + RDV), du plus récent au plus ancien.
export async function chargerHistorique(prospectId: string): Promise<Evenement[]> {
  if (!supabase || !prospectId) return []
  const ev: Evenement[] = []

  // « * » : tolère l'absence de la colonne « sens » avant la migration SQL.
  const appels = await lire(
    supabase.from("appels").select("*").eq("prospect_id", prospectId),
  )
  appels.forEach((a) => {
    const entrant = a.sens === "entrant"
    ev.push({
      type: "appel",
      date: a.horodatage,
      sens: entrant ? "entrant" : "sortant",
      libelle: entrant ? "Appel entrant" : `Appel sortant — ${a.resultat}`,
      detail: !entrant && a.nouvel_etat ? `état → ${a.nouvel_etat}` : undefined,
    })
  })

  const emails = await lire(
    supabase.from("emails_envoyes").select("modele_nom, objet, envoye_le").eq("prospect_id", prospectId),
  )
  emails.forEach((e) =>
    ev.push({
      type: "email",
      date: e.envoye_le,
      sens: "sortant",
      libelle: `Email envoyé — ${e.modele_nom || "modèle"}`,
      detail: e.objet || undefined,
    }),
  )

  // Emails REÇUS (boîte de réception). Les envoyés viennent déjà de emails_envoyes
  // ci-dessus — on ne prend ici que les entrants pour ne pas les compter deux fois.
  const recus = await lire(
    supabase
      .from("messages")
      .select("objet, created_at")
      .eq("prospect_id", prospectId)
      .eq("sens", "entrant"),
  )
  recus.forEach((m) =>
    ev.push({
      type: "email",
      date: m.created_at,
      sens: "entrant",
      libelle: "Email reçu",
      detail: m.objet || undefined,
    }),
  )

  const rdvs = await lire(
    supabase.from("rdv").select("date, heure, type, note").eq("prospect_id", prospectId),
  )
  rdvs.forEach((r) =>
    ev.push({
      type: "rdv",
      date: `${r.date}T${r.heure || "00:00"}:00`,
      libelle: `RDV — ${r.type || "Téléphone"} (${r.heure})`,
      detail: r.note || undefined,
    }),
  )

  return ev
    .filter((e) => e.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}
