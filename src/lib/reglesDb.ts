import { supabase } from "./supabase"
import type { Regle, UniteDelai, SensDelai } from "../regles"

type LigneRegle = {
  id: string
  etat_id: string
  email_id: string
  delai_valeur: number
  delai_unite: string
  delai_sens: string
  heure_min: string | null
  heure_max: string | null
  jours: number[] | null
  filtre_type: string | null
  filtre_arrondissement: string | null
  repeter: boolean
  repeter_max: number
  repeter_intervalle: number
  actif: boolean
}

function vers(r: LigneRegle): Regle {
  return {
    id: r.id,
    etatId: r.etat_id,
    emailId: r.email_id,
    delaiValeur: r.delai_valeur ?? 0,
    delaiUnite: (r.delai_unite ?? "jours") as UniteDelai,
    delaiSens: (r.delai_sens ?? "apres") as SensDelai,
    heureMin: r.heure_min ?? "",
    heureMax: r.heure_max ?? "",
    jours: r.jours ?? [],
    filtreType: r.filtre_type ?? "",
    filtreArrondissement: r.filtre_arrondissement ?? "",
    repeter: r.repeter ?? false,
    repeterMax: r.repeter_max ?? 0,
    repeterIntervalle: r.repeter_intervalle ?? 0,
    actif: r.actif,
  }
}

function versLigne(r: Regle) {
  return {
    etat_id: r.etatId,
    email_id: r.emailId,
    delai_valeur: r.delaiValeur,
    delai_unite: r.delaiUnite,
    delai_sens: r.delaiSens,
    heure_min: r.heureMin,
    heure_max: r.heureMax,
    jours: r.jours,
    filtre_type: r.filtreType,
    filtre_arrondissement: r.filtreArrondissement,
    repeter: r.repeter,
    repeter_max: r.repeterMax,
    repeter_intervalle: r.repeterIntervalle,
    actif: r.actif,
  }
}

export async function chargerRegles(): Promise<Regle[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("regles_envoi")
    .select("*")
    .order("cree_le", { ascending: true })
  if (error) throw new Error(error.message)
  return (data as LigneRegle[]).map(vers)
}

export async function creerRegle(r: Regle): Promise<Regle> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("regles_envoi")
    .insert(versLigne(r))
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return vers(data as LigneRegle)
}

export async function majRegle(id: string, r: Regle): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("regles_envoi").update(versLigne(r)).eq("id", id)
  if (error) throw new Error(error.message)
}

export async function supprimerRegle(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("regles_envoi").delete().eq("id", id)
  if (error) throw new Error(error.message)
}
