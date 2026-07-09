import { supabase } from "./supabase"
import type { PieceJointe } from "../emails"

const BUCKET = "pieces-jointes"

// Téléverse un fichier dans Supabase Storage et renvoie la pièce jointe.
export async function televerser(file: File): Promise<PieceJointe> {
  if (!supabase) throw new Error("Supabase non configuré")
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin"
  const chemin = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(chemin, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(chemin)
  return { nom: file.name, url: data.publicUrl, taille: file.size, chemin }
}

// Supprime un fichier du stockage (best effort).
export async function supprimerFichier(chemin: string): Promise<void> {
  if (!supabase) return
  await supabase.storage.from(BUCKET).remove([chemin])
}

// Format lisible d'une taille de fichier.
export function formatTaille(octets: number): string {
  if (octets < 1024) return octets + " o"
  if (octets < 1024 * 1024) return Math.round(octets / 1024) + " Ko"
  return (octets / (1024 * 1024)).toFixed(1) + " Mo"
}
