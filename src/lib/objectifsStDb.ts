import { supabase } from "./supabase"
import type { ObjectifMetier } from "../recrutement"

type LigneObjectif = {
  id: string
  metier: string
  objectif_hebdo: number
  actif: boolean
}

function vers(r: LigneObjectif): ObjectifMetier {
  return {
    id: r.id,
    metier: r.metier ?? "",
    objectifHebdo: r.objectif_hebdo ?? 0,
    actif: r.actif ?? true,
  }
}

export async function chargerObjectifs(): Promise<ObjectifMetier[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("st_objectifs")
    .select("*")
    .order("cree_le", { ascending: true })
  if (error) throw new Error(error.message)
  return (data as LigneObjectif[]).map(vers)
}

export async function creerObjectif(o: ObjectifMetier): Promise<ObjectifMetier> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("st_objectifs")
    .insert({ metier: o.metier, objectif_hebdo: o.objectifHebdo, actif: o.actif })
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return vers(data as LigneObjectif)
}

export async function majObjectif(id: string, o: Partial<ObjectifMetier>): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const ligne: Record<string, unknown> = {}
  if (o.metier !== undefined) ligne.metier = o.metier
  if (o.objectifHebdo !== undefined) ligne.objectif_hebdo = o.objectifHebdo
  if (o.actif !== undefined) ligne.actif = o.actif
  const { error } = await supabase.from("st_objectifs").update(ligne).eq("id", id)
  if (error) throw new Error(error.message)
}

export async function supprimerObjectif(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("st_objectifs").delete().eq("id", id)
  if (error) throw new Error(error.message)
}
