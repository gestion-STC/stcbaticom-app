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
  arrondissement?: string | null
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
    arrondissement: c.arrondissement ?? "",
  }
}

function versLigne(c: Creneau, avecSecteur = true) {
  const base: Record<string, unknown> = {
    nom: c.nom,
    etat_id: c.etatId,
    heure_debut: c.heureDebut,
    heure_fin: c.heureFin,
    cadence_secondes: c.cadenceSecondes,
    jours: c.jours,
    actif: c.actif,
  }
  // La colonne « arrondissement » peut ne pas encore exister (migration non faite) :
  // les fonctions ci-dessous réessaient sans si l'écriture échoue.
  if (avecSecteur) base.arrondissement = c.arrondissement ?? ""
  return base
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
  let res = await supabase.from("creneaux").insert(versLigne(c)).select("*").single()
  if (res.error) {
    // Repli : colonne « arrondissement » absente (migration non faite).
    res = await supabase.from("creneaux").insert(versLigne(c, false)).select("*").single()
  }
  if (res.error) throw new Error(res.error.message)
  return vers(res.data as LigneCreneau)
}

export async function majCreneau(id: string, c: Creneau): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  let res = await supabase.from("creneaux").update(versLigne(c)).eq("id", id)
  if (res.error) {
    res = await supabase.from("creneaux").update(versLigne(c, false)).eq("id", id)
  }
  if (res.error) throw new Error(res.error.message)
}

export async function supprimerCreneau(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("creneaux").delete().eq("id", id)
  if (error) throw new Error(error.message)
}
