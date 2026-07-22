import { supabase } from "./supabase"
import type { SequenceST, EtapeST, CanalEtape } from "../recrutement"

// ---- Séquences --------------------------------------------------------------
type LigneSeq = { id: string; nom: string; actif: boolean; cree_le: string }

function versSeq(r: LigneSeq): SequenceST {
  return { id: r.id, nom: r.nom ?? "", actif: r.actif ?? false, creeLe: r.cree_le }
}

export async function chargerSequences(): Promise<SequenceST[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("st_sequences")
    .select("*")
    .order("cree_le", { ascending: true })
  if (error) throw new Error(error.message)
  return (data as LigneSeq[]).map(versSeq)
}

export async function creerSequence(nom: string): Promise<SequenceST> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("st_sequences")
    .insert({ nom })
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return versSeq(data as LigneSeq)
}

export async function majSequence(id: string, s: Partial<SequenceST>): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const ligne: Record<string, unknown> = {}
  if (s.nom !== undefined) ligne.nom = s.nom
  if (s.actif !== undefined) ligne.actif = s.actif
  const { error } = await supabase.from("st_sequences").update(ligne).eq("id", id)
  if (error) throw new Error(error.message)
}

export async function supprimerSequence(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("st_sequences").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// ---- Étapes -----------------------------------------------------------------
type LigneEtape = {
  id: string
  sequence_id: string
  ordre: number
  canal: string
  delai_jours: number
  objet: string
  contenu: string
  actif: boolean
}

function versEtape(r: LigneEtape): EtapeST {
  return {
    id: r.id,
    sequenceId: r.sequence_id,
    ordre: r.ordre ?? 0,
    canal: (r.canal ?? "email") as CanalEtape,
    delaiJours: r.delai_jours ?? 0,
    objet: r.objet ?? "",
    contenu: r.contenu ?? "",
    actif: r.actif ?? true,
  }
}

function versLigneEtape(e: EtapeST) {
  return {
    sequence_id: e.sequenceId,
    ordre: e.ordre,
    canal: e.canal,
    delai_jours: e.delaiJours,
    objet: e.objet,
    contenu: e.contenu,
    actif: e.actif,
  }
}

export async function chargerEtapes(sequenceId: string): Promise<EtapeST[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("st_etapes")
    .select("*")
    .eq("sequence_id", sequenceId)
    .order("ordre", { ascending: true })
  if (error) throw new Error(error.message)
  return (data as LigneEtape[]).map(versEtape)
}

export async function creerEtape(e: EtapeST): Promise<EtapeST> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("st_etapes")
    .insert(versLigneEtape(e))
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return versEtape(data as LigneEtape)
}

export async function majEtape(id: string, e: EtapeST): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("st_etapes").update(versLigneEtape(e)).eq("id", id)
  if (error) throw new Error(error.message)
}

export async function supprimerEtape(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("st_etapes").delete().eq("id", id)
  if (error) throw new Error(error.message)
}
