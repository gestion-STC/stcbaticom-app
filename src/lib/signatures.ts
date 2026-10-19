// ═══════════════════════════════════════════════════════════════════════════
// PLUSIEURS SIGNATURES PAR COMPTE, LE CHOIX À L'ENVOI (Mahdi, 19/10/2026)
//
// « Ajoute-moi une deuxième signature sur mon compte, Alexandre Parade, et
// dans les mails, laisse-moi choisir la signature que je vais utiliser. »
//
// Chaque compte signe de son nom (la signature STC Bâtiment, src/lib/signatureStc.ts).
// Il peut en plus porter d'AUTRES NOMS, réglés dans Paramétrage › Emails ›
// Mes signatures : même format, seul le nom change. Au moment d'envoyer
// (après un appel, boîte de réception), un sélecteur « Signé par » propose
// le nom du compte puis ces autres noms ; le dernier choix est retenu sur
// ce navigateur.
//
// Rangement : le magasin de réglages clé/valeur (`parametres`), une clé par
// compte (`signatures_<id du compte>`), la valeur = liste JSON des autres noms.
// Pas de table, pas de SQL, pas de fonction serveur : le serveur reçoit déjà
// la signature toute faite (`signature_html`) et le prénom (`commercial`).
// ═══════════════════════════════════════════════════════════════════════════
import { lireParametre, ecrireParametre } from "./parametresDb"

/** La clé du magasin pour un compte. */
export const cleSignatures = (compteId: string): string => `signatures_${compteId}`

const propre = (nom: string) => nom.replace(/\s+/g, " ").trim()
const meme = (a: string, b: string) => propre(a).localeCompare(propre(b), "fr", { sensitivity: "base" }) === 0

/** La valeur rangée → la liste des autres noms (robuste : rien, texte faux, doublons, vides). */
export function analyserSignatures(valeur: string | null | undefined): string[] {
  if (!valeur) return []
  let brut: unknown
  try {
    brut = JSON.parse(valeur)
  } catch {
    return []
  }
  if (!Array.isArray(brut)) return []
  const sortie: string[] = []
  for (const x of brut) {
    if (typeof x !== "string") continue
    const n = propre(x)
    if (n && !sortie.some((s) => meme(s, n))) sortie.push(n)
  }
  return sortie
}

export const serialiserSignatures = (autres: string[]): string => JSON.stringify(autres)

/** Pourquoi on refuse d'ajouter ce nom, ou null si c'est bon. */
export function motifRefusSignature(autres: string[], nom: string, principale: string): string | null {
  const n = propre(nom)
  if (!n) return "Écris un nom."
  if (n.length > 80) return "Ce nom est trop long."
  if (meme(n, principale)) return "C'est déjà le nom de ton compte."
  if (autres.some((s) => meme(s, n))) return "Cette signature existe déjà."
  return null
}

export const ajouterSignature = (autres: string[], nom: string): string[] => [...autres, propre(nom)]
export const retirerSignature = (autres: string[], nom: string): string[] => autres.filter((s) => !meme(s, nom))

/** Tous les noms qui peuvent signer : le compte d'abord, puis les autres. */
export const signatairesDe = (principale: string, autres: string[]): string[] => [principale, ...autres.filter((s) => !meme(s, principale))]

/** Le nom retenu pour signer : le dernier choisi s'il existe encore, sinon le compte. */
export function signataireRetenu(noms: string[], dernierChoix: string | null | undefined): string {
  if (dernierChoix) {
    const trouve = noms.find((n) => meme(n, dernierChoix))
    if (trouve) return trouve
  }
  return noms[0] ?? ""
}

// ── Le magasin ────────────────────────────────────────────────────────────────

export async function lireSignatures(compteId: string): Promise<string[]> {
  return analyserSignatures(await lireParametre(cleSignatures(compteId)))
}

export async function ecrireSignatures(compteId: string, autres: string[]): Promise<void> {
  await ecrireParametre(cleSignatures(compteId), serialiserSignatures(autres))
}

// ── Le dernier choix, sur ce navigateur ───────────────────────────────────────

const cleChoix = (compteId: string) => `signature_choisie_${compteId}`

export function dernierChoixSignature(compteId: string): string | null {
  try {
    return localStorage.getItem(cleChoix(compteId))
  } catch {
    return null
  }
}

export function retenirChoixSignature(compteId: string, nom: string): void {
  try {
    localStorage.setItem(cleChoix(compteId), nom)
  } catch {
    // Navigation privée ou stockage bloqué : on signe quand même, on n'a juste pas de mémoire.
  }
}
