// Numéros d'émission (rotation intelligente).
//
// Objectif : émettre avec PLUSIEURS numéros pour ne pas se faire signaler « spam »,
// MAIS toujours appeler un même prospect avec LE MÊME numéro (il reconnaît l'appelant).
//
// - La « réserve » = la liste des numéros Ringover de l'utilisateur (stockée dans
//   la table parametres, clé "numeros_emission", au format JSON).
// - Chaque prospect garde son numéro attribué dans son champ `numeroEmission`.
// - À la 1re fois, on lui donne le numéro le MOINS utilisé (pour équilibrer le volume).

import type { Prospect } from "../data"
import { lireParametre, ecrireParametre } from "./parametresDb"

const CLE = "numeros_emission"

// Un numéro d'émission, éventuellement mis EN PAUSE (gardé mais retiré de la rotation).
// `compteId` (13/10) : la personne à qui ce numéro appartient dans Ringover. Ringover fait
// sonner le propriétaire du numéro : on n'appelle donc QU'avec ses propres numéros.
export type NumeroEmission = { numero: string; pause: boolean; compteId?: string }

// Normalise un numéro pour comparer (ne garde que les chiffres).
export function normaliser(n: string): string {
  return (n || "").replace(/\D/g, "")
}

// Parse la valeur stockée (JSON) → liste {numero, pause}, dédoublonnée sur les chiffres.
// Gère l'ANCIEN format (tableau de chaînes) ET le nouveau (tableau d'objets). Pur → testable.
export function parserNumeros(brut: string | null): NumeroEmission[] {
  if (!brut) return []
  let arr: unknown
  try {
    arr = JSON.parse(brut)
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const vus = new Set<string>()
  const out: NumeroEmission[] = []
  for (const x of arr) {
    const numero =
      typeof x === "string"
        ? x
        : x && typeof x === "object"
          ? String((x as { numero?: unknown }).numero ?? "")
          : ""
    const pause = !!(x && typeof x === "object" && (x as { pause?: unknown }).pause)
    const compteId = x && typeof x === "object" && typeof (x as { compteId?: unknown }).compteId === "string" ? (x as { compteId: string }).compteId : ""
    const t = numero.trim()
    if (!t) continue
    const c = normaliser(t)
    if (vus.has(c)) continue
    vus.add(c)
    out.push(compteId ? { numero: t, pause, compteId } : { numero: t, pause })
  }
  return out
}

// Charge la liste COMPLÈTE (actifs + en pause) pour l'écran de gestion.
// Une lecture ratée LÈVE (13/10) : une liste vide prise pour vraie, puis enregistrée, viderait la réserve.
export async function chargerNumerosComplet(): Promise<NumeroEmission[]> {
  const brut = await lireParametre(CLE)
  if (brut && brut.trim()) {
    try { JSON.parse(brut) } catch { throw new Error("La liste des numéros enregistrée est illisible : rien n'est modifié.") }
  }
  return parserNumeros(brut)
}

// Enregistre la liste complète (avec l'état pause de chacun).
export async function enregistrerNumerosComplet(liste: NumeroEmission[]): Promise<void> {
  const propres = parserNumeros(JSON.stringify(liste)) // réutilise le nettoyage/dédoublonnage
  await ecrireParametre(CLE, JSON.stringify(propres))
}

// Numéros ACTIFS uniquement (en rotation) — ceux qui NE sont PAS en pause.
// C'est ce que la logique d'appel utilise : un numéro en pause n'est plus attribué.
export async function chargerNumeros(): Promise<string[]> {
  return (await chargerNumerosComplet()).filter((n) => !n.pause).map((n) => n.numero)
}

// Les numéros de CE compte (13/10) : « miens » = ceux avec lesquels il appelle ; « autres » = ceux
// des collègues (une agence qui en porte un est réattribuée à mon numéro, jamais bloquée).
// Tant qu'aucun numéro n'a de propriétaire, tout le monde utilise toute la réserve (comme avant).
export type NumerosDuCompte = { miens: string[]; autres: string[]; parCompte: boolean }
export function numerosDuCompte(liste: NumeroEmission[], compteId: string): NumerosDuCompte {
  const actifs = liste.filter((n) => !n.pause)
  const parCompte = liste.some((n) => n.compteId)
  if (!parCompte) return { miens: actifs.map((n) => n.numero), autres: [], parCompte }
  return {
    miens: actifs.filter((n) => n.compteId === compteId).map((n) => n.numero),
    autres: liste.filter((n) => n.compteId && n.compteId !== compteId).map((n) => n.numero),
    parCompte,
  }
}
export async function chargerNumerosDuCompte(compteId: string): Promise<NumerosDuCompte> {
  return numerosDuCompte(await chargerNumerosComplet(), compteId)
}

// Vrai si `numero` (comparé sur les chiffres) est présent dans la réserve.
export function estDansLaReserve(numero: string, reserve: string[]): boolean {
  if (!numero) return false
  const n = normaliser(numero)
  return reserve.some((r) => normaliser(r) === n)
}

// Renvoie le numéro de la réserve le MOINS attribué aux prospects (équilibrage).
// En cas d'égalité, garde l'ordre de la réserve (le 1er trouvé).
export function numeroLeMoinsUtilise(reserve: string[], prospects: Prospect[]): string {
  if (reserve.length === 0) return ""
  const compte = new Map<string, number>(reserve.map((r) => [normaliser(r), 0]))
  for (const p of prospects) {
    const n = normaliser(p.numeroEmission ?? "")
    if (n && compte.has(n)) compte.set(n, (compte.get(n) ?? 0) + 1)
  }
  let meilleur = reserve[0]
  let min = Infinity
  for (const r of reserve) {
    const c = compte.get(normaliser(r)) ?? 0
    if (c < min) {
      min = c
      meilleur = r
    }
  }
  return meilleur
}

// Compte les appels par numéro d'émission (clé = chiffres du numéro).
// `appels` = journal (du jour) avec l'id du prospect appelé ; le numéro utilisé est
// celui attribué à la fiche du prospect (toujours le même). Pur → testable.
export function compterAppelsParNumero(
  appels: { prospectId: string }[],
  prospects: { id?: string; numeroEmission?: string }[],
): Map<string, number> {
  const parProspect = new Map<string, string>()
  for (const p of prospects) {
    if (p.id && p.numeroEmission) parProspect.set(p.id, normaliser(p.numeroEmission))
  }
  const compte = new Map<string, number>()
  for (const a of appels) {
    const n = parProspect.get(a.prospectId)
    if (!n) continue
    compte.set(n, (compte.get(n) ?? 0) + 1)
  }
  return compte
}

// Décide quel numéro utiliser pour appeler ce prospect.
// - S'il a déjà un numéro attribué ET toujours en rotation → on le garde.
// - S'il a un numéro attribué mais SORTI de la rotation (pause/supprimé) → BLOQUÉ :
//   on n'appelle JAMAIS un prospect avec un autre numéro que le sien en douce
//   (anti-spam : il doit toujours voir le même numéro). `numero` = le numéro attendu.
// - S'il n'a encore AUCUN numéro → on attribue le moins utilisé (aEnregistrer = true).
export function numeroPourProspect(
  prospect: Prospect,
  reserve: string[],
  tousProspects: Prospect[],
): { numero: string; aEnregistrer: boolean; bloque: boolean } {
  const actuel = prospect.numeroEmission ?? ""
  if (actuel && estDansLaReserve(actuel, reserve)) {
    return { numero: actuel, aEnregistrer: false, bloque: false }
  }
  if (actuel) {
    return { numero: actuel, aEnregistrer: false, bloque: true }
  }
  const choisi = numeroLeMoinsUtilise(reserve, tousProspects)
  return { numero: choisi, aEnregistrer: Boolean(choisi), bloque: false }
}
