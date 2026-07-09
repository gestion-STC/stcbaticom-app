import { supabase } from "./supabase"
import type { Creneau } from "../creneaux"

type LigneCreneau = {
  id: string
  nom: string
  etat_id: string
  heure_debut: string
  heure_fin: string
  cadence_secondes: number
  jours: number[] | null
  actif: boolean
}

function vers(c: LigneCreneau): Creneau {
  return {
    id: c.id,
    nom: c.nom,
    etatId: c.etat_id,
    heureDebut: c.heure_debut,
    heureFin: c.heure_fin,
    cadenceSecondes: c.cadence_secondes,
    jours: c.jours ?? [],
    actif: c.actif,
  }
}

function versLigne(c: Creneau) {
  return {
    nom: c.nom,
    etat_id: c.etatId,
    heure_debut: c.heureDebut,
    heure_fin: c.heureFin,
    cadence_secondes: c.cadenceSecondes,
    jours: c.jours,
    actif: c.actif,
  }
}

export async function chargerCreneaux(): Promise<Creneau[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("creneaux")
    .select("*")
    .order("cree_le", { ascending: true })
  if (error) throw new Error(error.message)
  return (data as LigneCreneau[]).map(vers)
}

export async function creerCreneau(c: Creneau): Promise<Creneau> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("creneaux")
    .insert(versLigne(c))
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return vers(data as LigneCreneau)
}

export async function majCreneau(id: string, c: Creneau): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("creneaux").update(versLigne(c)).eq("id", id)
  if (error) throw new Error(error.message)
}

export async function supprimerCreneau(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("creneaux").delete().eq("id", id)
  if (error) throw new Error(error.message)
}
