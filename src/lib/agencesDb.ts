import { supabase } from "./supabase"
import { lireParLots } from "./pagination"
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
  const sb = supabase
  // Les DEUX lectures sont paginées : au-delà de 1000 lignes, Supabase tronque
  // en silence — on perdrait des agences, et surtout le nombre de gestionnaires
  // par agence serait faux (le compte se fait sur la table de liens).
  const lignes = await lireParLots<LigneAgence>((debut, fin) =>
    sb
      .from("agences")
      .select("*")
      .order("nom", { ascending: true })
      .order("id", { ascending: true })
      .range(debut, fin)
      .then(({ data, error }) => ({ data: data as LigneAgence[] | null, error })),
  )
  const liens = await lireParLots<{ agence_id: string }>((debut, fin) =>
    sb
      .from("prospect_agence")
      .select("agence_id")
      .order("agence_id", { ascending: true })
      .range(debut, fin)
      .then(({ data, error }) => ({ data: data as { agence_id: string }[] | null, error })),
  )
  const compte: Record<string, number> = {}
  liens.forEach((l) => {
    compte[l.agence_id] = (compte[l.agence_id] ?? 0) + 1
  })
  return lignes.map((a) => vers(a, compte[a.id] ?? 0))
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
  // Cette table n'a PAS de colonne « id » : sa clé est le couple
  // (prospect_id, agence_id). On rattache les gestionnaires manquants à l'agence
  // gardée, puis on retire les liens des agences absorbées.
  const vus = new Set((dejaLies ?? []).map((l: { prospect_id: string }) => l.prospect_id))
  for (const ancien of ids) {
    const { data: liens } = await supabase
      .from("prospect_agence")
      .select("prospect_id")
      .eq("agence_id", ancien)
    for (const l of (liens ?? []) as { prospect_id: string }[]) {
      if (!vus.has(l.prospect_id)) {
        await supabase
          .from("prospect_agence")
          .insert({ prospect_id: l.prospect_id, agence_id: gardeId })
        vus.add(l.prospect_id)
      }
    }
    await supabase.from("prospect_agence").delete().eq("agence_id", ancien)
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
