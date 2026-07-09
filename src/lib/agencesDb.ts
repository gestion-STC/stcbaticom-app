import { supabase } from "./supabase"
import type { Agence } from "../agences"
import type { Prospect } from "../data"

type LigneAgence = {
  id: string
  nom: string
  adresse: string | null
  arrondissement: string | null
  logo_url?: string | null
  nb_lots?: number | null
}

function vers(a: LigneAgence, nb = 0): Agence {
  return {
    id: a.id,
    nom: a.nom,
    adresse: a.adresse ?? "",
    arrondissement: a.arrondissement ?? "",
    logoUrl: a.logo_url ?? "",
    nbLots: a.nb_lots ?? 0,
    nbGestionnaires: nb,
  }
}

// Toutes les agences, avec le nombre de gestionnaires reliés.
export async function chargerAgences(): Promise<Agence[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("agences")
    .select("*")
    .order("nom", { ascending: true })
  if (error) throw new Error(error.message)
  const liens = await supabase.from("prospect_agence").select("agence_id")
  const compte: Record<string, number> = {}
  ;(liens.data ?? []).forEach((l: { agence_id: string }) => {
    compte[l.agence_id] = (compte[l.agence_id] ?? 0) + 1
  })
  return (data as LigneAgence[]).map((a) => vers(a, compte[a.id] ?? 0))
}

// Agences reliées à un gestionnaire (prospect).
export async function chargerAgencesDuProspect(prospectId: string): Promise<Agence[]> {
  if (!supabase || !prospectId) return []
  const { data, error } = await supabase
    .from("prospect_agence")
    .select("agences(id, nom, adresse, arrondissement)")
    .eq("prospect_id", prospectId)
  if (error) throw new Error(error.message)
  return (data as unknown as { agences: LigneAgence }[])
    .filter((r) => r.agences)
    .map((r) => vers(r.agences))
}

// Gestionnaires (prospects) reliés à une agence.
export async function chargerGestionnaires(agenceId: string): Promise<Prospect[]> {
  if (!supabase || !agenceId) return []
  const { data, error } = await supabase
    .from("prospect_agence")
    .select("prospects(id, entreprise, contact, telephone, email, statut, priorite)")
    .eq("agence_id", agenceId)
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).filter((r) => r.prospects).map((r) => r.prospects as Prospect)
}

export async function creerAgence(a: { nom: string; adresse?: string; arrondissement?: string }): Promise<Agence> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("agences")
    .insert({ nom: a.nom, adresse: a.adresse ?? "", arrondissement: a.arrondissement ?? "" })
    .select("id, nom, adresse, arrondissement")
    .single()
  if (error) throw new Error(error.message)
  return vers(data as LigneAgence)
}

export async function majAgence(id: string, champs: Partial<{ nom: string; adresse: string; arrondissement: string; logo_url: string; nb_lots: number }>): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("agences").update(champs).eq("id", id)
  if (error) throw new Error(error.message)
}

export async function supprimerAgence(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("agences").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// Fusionne plusieurs agences en une seule (la fiche "garde").
// On rapatrie les gestionnaires reliés (sans doublon de lien) et on comble
// les trous (adresse, logo, nb de lots) avant de supprimer les autres.
export async function fusionnerAgences(gardeId: string, autresIds: string[]): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const ids = autresIds.filter((x) => x && x !== gardeId)
  if (ids.length === 0) return

  // 1. Déplacer les liens gestionnaire→agence sans créer de doublon.
  const { data: dejaLies } = await supabase
    .from("prospect_agence")
    .select("prospect_id")
    .eq("agence_id", gardeId)
  const vus = new Set((dejaLies ?? []).map((l: { prospect_id: string }) => l.prospect_id))
  for (const ancien of ids) {
    const { data: liens } = await supabase
      .from("prospect_agence")
      .select("id, prospect_id")
      .eq("agence_id", ancien)
    for (const l of (liens ?? []) as { id: string; prospect_id: string }[]) {
      if (vus.has(l.prospect_id)) {
        await supabase.from("prospect_agence").delete().eq("id", l.id)
      } else {
        await supabase.from("prospect_agence").update({ agence_id: gardeId }).eq("id", l.id)
        vus.add(l.prospect_id)
      }
    }
  }

  // 2. Combler les champs vides de la fiche gardée à partir des autres.
  const { data: rows } = await supabase
    .from("agences")
    .select("*")
    .in("id", [gardeId, ...ids])
  const fiches = (rows ?? []) as LigneAgence[]
  const garde = fiches.find((a) => a.id === gardeId)
  if (garde) {
    const autres = fiches.filter((a) => a.id !== gardeId)
    const champs: Partial<{ adresse: string; arrondissement: string; logo_url: string; nb_lots: number }> = {}
    if (!garde.adresse) champs.adresse = autres.map((a) => a.adresse).find((v) => v?.trim()) ?? ""
    if (!garde.arrondissement) champs.arrondissement = autres.map((a) => a.arrondissement).find((v) => v?.trim()) ?? ""
    if (!garde.logo_url) champs.logo_url = autres.map((a) => a.logo_url).find((v) => v?.trim()) ?? ""
    const lots = Math.max(garde.nb_lots ?? 0, ...autres.map((a) => a.nb_lots ?? 0))
    if (lots > (garde.nb_lots ?? 0)) champs.nb_lots = lots
    if (Object.keys(champs).length > 0) await majAgence(gardeId, champs)
  }

  // 3. Supprimer les autres agences.
  for (const ancien of ids) await supprimerAgence(ancien)
}

export async function lierProspectAgence(prospectId: string, agenceId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase
    .from("prospect_agence")
    .upsert({ prospect_id: prospectId, agence_id: agenceId }, { onConflict: "prospect_id,agence_id" })
  if (error) throw new Error(error.message)
}

export async function delierProspectAgence(prospectId: string, agenceId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase
    .from("prospect_agence")
    .delete()
    .eq("prospect_id", prospectId)
    .eq("agence_id", agenceId)
  if (error) throw new Error(error.message)
}
