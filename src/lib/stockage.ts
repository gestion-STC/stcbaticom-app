import { supabase } from "./supabase"
import type { PieceJointe } from "../emails"

const BUCKET = "pieces-jointes"

// L'extension et le type d'un fichier : par son nom, sinon par son type (05/11/2026 : trois Kbis
// déposés sans extension étaient enregistrés en « .bin » et ne s'ouvraient plus comme des PDF).
const TYPES: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
export function extensionEtType(nom: string, type: string): { ext: string; type: string; nom: string } {
  const parNom = nom.includes(".") ? nom.split(".").pop()!.toLowerCase() : ""
  const parType = Object.entries(TYPES).find(([, t]) => t === type)?.[0] ?? ""
  const ext = parNom && parNom.length <= 5 ? parNom : parType || "pdf"
  return { ext, type: type || TYPES[ext] || "application/octet-stream", nom: parNom ? nom : `${nom}.${ext}` }
}

// Téléverse un fichier dans Supabase Storage et renvoie la pièce jointe.
export async function televerser(file: File): Promise<PieceJointe> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { ext, type, nom } = extensionEtType(file.name, file.type)
  const chemin = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(chemin, file, {
    contentType: type,
    upsert: false,
  })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(chemin)
  return { nom, url: data.publicUrl, taille: file.size, chemin }
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
