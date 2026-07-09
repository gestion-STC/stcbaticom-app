import { supabase } from "./supabase"
import type { Rdv } from "../rdv"

type LigneRdv = {
  id: string
  prospect_id: string | null
  titre: string | null
  telephone: string | null
  type: string | null
  date: string
  heure: string
  note: string | null
  fait: boolean
  prospects: { entreprise: string; telephone: string; contact: string } | null
}

function vers(r: LigneRdv): Rdv {
  return {
    id: r.id,
    prospectId: r.prospect_id,
    titre: r.titre ?? "",
    type: r.type ?? "Téléphone",
    date: r.date,
    heure: r.heure,
    note: r.note ?? "",
    fait: r.fait,
    // Affichage : prospect joint, sinon saisie libre
    entreprise: r.prospects?.entreprise || r.titre || "(RDV)",
    telephone: r.prospects?.telephone || r.telephone || "",
    contact: r.prospects?.contact ?? "",
  }
}

export async function chargerRdv(): Promise<Rdv[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("rdv")
    .select("id, prospect_id, titre, telephone, type, date, heure, note, fait, prospects(entreprise, telephone, contact)")
    .order("date", { ascending: true })
    .order("heure", { ascending: true })
  if (error) throw new Error(error.message)
  return (data as unknown as LigneRdv[]).map(vers)
}

export async function creerRdv(r: {
  prospectId: string | null
  titre?: string
  telephone?: string
  type?: string
  date: string
  heure: string
  note: string
}): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("rdv").insert({
    prospect_id: r.prospectId,
    titre: r.titre ?? "",
    telephone: r.telephone ?? "",
    type: r.type ?? "Téléphone",
    date: r.date,
    heure: r.heure,
    note: r.note,
  })
  if (error) throw new Error(error.message)
}

export async function majRdvFait(id: string, fait: boolean): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("rdv").update({ fait }).eq("id", id)
  if (error) throw new Error(error.message)
}

export async function supprimerRdv(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("rdv").delete().eq("id", id)
  if (error) throw new Error(error.message)
}
