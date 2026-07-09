import { supabase } from "./supabase"
import type { Email, PieceJointe } from "../emails"

type LigneEmail = {
  id: string
  nom: string
  objet: string
  corps: string
  ordre: number
  pieces_jointes: PieceJointe[] | null
}

function vers(e: LigneEmail): Email {
  return {
    id: e.id,
    nom: e.nom,
    objet: e.objet,
    corps: e.corps,
    ordre: e.ordre,
    pieces: e.pieces_jointes ?? [],
  }
}

function versLigne(e: Email) {
  return {
    nom: e.nom,
    objet: e.objet,
    corps: e.corps,
    ordre: e.ordre,
    pieces_jointes: e.pieces ?? [],
  }
}

export async function chargerEmails(): Promise<Email[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("emails")
    .select("*")
    .order("ordre", { ascending: true })
  if (error) throw new Error(error.message)
  return (data as LigneEmail[]).map(vers)
}

export async function creerEmail(e: Email): Promise<Email> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("emails")
    .insert(versLigne(e))
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return vers(data as LigneEmail)
}

export async function majEmail(id: string, e: Email): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("emails").update(versLigne(e)).eq("id", id)
  if (error) throw new Error(error.message)
}

export async function supprimerEmail(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("emails").delete().eq("id", id)
  if (error) throw new Error(error.message)
}
