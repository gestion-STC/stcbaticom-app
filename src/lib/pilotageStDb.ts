import { supabase } from "./supabase"
import type { PilotageST } from "../recrutement"

// Le pilotage tient sur UNE seule ligne (id = 1).
type LignePilotage = {
  id: number
  actif: boolean
  objectif_hebdo: number
  plafond_jour: number
  heure_min: string
  heure_max: string
  jours: number[]
  sequence_id: string | null
}

function vers(r: LignePilotage): PilotageST {
  return {
    actif: r.actif ?? false,
    objectifHebdo: r.objectif_hebdo ?? 2,
    plafondJour: r.plafond_jour ?? 20,
    heureMin: (r.heure_min ?? "09:00").slice(0, 5),
    heureMax: (r.heure_max ?? "18:00").slice(0, 5),
    jours: r.jours ?? [1, 2, 3, 4, 5],
    sequenceId: r.sequence_id,
  }
}

export async function chargerPilotage(): Promise<PilotageST> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase.from("st_pilotage").select("*").eq("id", 1).single()
  if (error) throw new Error(error.message)
  return vers(data as LignePilotage)
}

export async function majPilotage(p: Partial<PilotageST>): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const ligne: Record<string, unknown> = { maj_le: new Date().toISOString() }
  if (p.actif !== undefined) ligne.actif = p.actif
  if (p.objectifHebdo !== undefined) ligne.objectif_hebdo = p.objectifHebdo
  if (p.plafondJour !== undefined) ligne.plafond_jour = p.plafondJour
  if (p.heureMin !== undefined) ligne.heure_min = p.heureMin
  if (p.heureMax !== undefined) ligne.heure_max = p.heureMax
  if (p.jours !== undefined) ligne.jours = p.jours
  if (p.sequenceId !== undefined) ligne.sequence_id = p.sequenceId
  const { error } = await supabase.from("st_pilotage").update(ligne).eq("id", 1)
  if (error) throw new Error(error.message)
}
