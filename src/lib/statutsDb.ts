import { supabase } from "./supabase"
import type { Statut, CleCouleur, Categorie } from "../statuts"

type LigneStatut = {
  id: string
  libelle: string
  couleur: string
  ordre: number
  est_objectif: boolean
  categorie: string | null
  relance_jours: number | null
}

function vers(s: LigneStatut): Statut {
  return {
    id: s.id,
    libelle: s.libelle,
    couleur: s.couleur as CleCouleur,
    ordre: s.ordre,
    estObjectif: s.est_objectif,
    categorie: (s.categorie ?? "") as Categorie,
    relanceJours: s.relance_jours,
  }
}

function versLigne(s: Statut) {
  return {
    libelle: s.libelle,
    couleur: s.couleur,
    ordre: s.ordre,
    est_objectif: s.estObjectif,
    categorie: s.categorie,
    relance_jours: s.relanceJours,
  }
}

export async function chargerStatuts(): Promise<Statut[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("statuts")
    .select("*")
    .order("ordre", { ascending: true })
  if (error) throw new Error(error.message)
  return (data as LigneStatut[]).map(vers)
}

export async function creerStatut(s: Statut): Promise<Statut> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("statuts")
    .insert(versLigne(s))
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return vers(data as LigneStatut)
}

export async function majStatut(id: string, s: Statut): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("statuts").update(versLigne(s)).eq("id", id)
  if (error) throw new Error(error.message)
}

// Met à jour uniquement l'ordre (réorganisation).
export async function majOrdreStatut(id: string, ordre: number): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("statuts").update({ ordre }).eq("id", id)
  if (error) throw new Error(error.message)
}

export async function supprimerStatut(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("statuts").delete().eq("id", id)
  if (error) throw new Error(error.message)
}
