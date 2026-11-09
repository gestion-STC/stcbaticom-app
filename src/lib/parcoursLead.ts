// ════════════════════════════════════════════════════════════════════════════
// LA CAMPAGNE DÉCIDE (Mahdi, 09/11/2026 : « à partir de quel moment c'est un lead, ça doit venir de la campagne »).
//
// Chaque contact a des FAITS (ce qui s'est réellement passé) ; le parcours de sa campagne dit ce qu'ils valent.
// Il n'est un lead qu'à partir de l'étape choisie (« Devient lead ici ») ; avant, il reste en session de call.
// Une étape est atteinte par un fait, ou validée à la main. Fichier PUR : parcoursLead.test.ts le lit.
// ════════════════════════════════════════════════════════════════════════════
import type { EtapeParcours, Qualification } from "../prospection/configCampagne"

export type EtapeLead = "nouveaux" | "contactes" | "qualifies" | "gagnes" | "perdus"
export type Faits = {
  interet: boolean; jointInteresse: boolean; formulaireProspect: boolean; formulaireTel: boolean; dossier: boolean
  contratsEnvoyes: boolean; contratsSignes: boolean; rdv: boolean; testApp: boolean; compteOuvert: boolean; premierOs: boolean; perdu: boolean
}
export const AUCUN_FAIT: Faits = { interet: false, jointInteresse: false, formulaireProspect: false, formulaireTel: false, dossier: false, contratsEnvoyes: false, contratsSignes: false, rdv: false, testApp: false, compteOuvert: false, premierOs: false, perdu: false }

const FAIT_DU_TYPE: Record<string, keyof Faits> = {
  "Intérêt détecté": "interet", "Appel : joint et intéressé": "jointInteresse", "Formulaire rempli par le prospect": "formulaireProspect",
  "Formulaire rempli au téléphone": "formulaireTel", "Dossier et pièces reçus": "dossier", "Contrats envoyés": "contratsEnvoyes", "Contrats signés": "contratsSignes",
  RDV: "rdv", "Test de l'application": "testApp", "Compte ouvert": "compteOuvert", "1er ordre de service": "premierOs",
}

export function etapeAtteinte(e: EtapeParcours, f: Faits, valides: ReadonlySet<string>): boolean {
  const fait = FAIT_DU_TYPE[e.type]
  return valides.has(e.id) || (fait ? f[fait] : false)
}

export type Position = { estLead: boolean; etape: EtapeLead; atteintes: string[]; courante: string | null }

/** Où en est un contact dans le parcours : la dernière étape atteinte fait foi (les précédentes ont pu être sautées). */
export function positionDans(q: Qualification, f: Faits, valides: ReadonlySet<string>, contacte: boolean): Position {
  const atteintes = q.etapes.filter((e) => etapeAtteinte(e, f, valides)).map((e) => e.id)
  const dernier = q.etapes.reduce((m, e, i) => (atteintes.includes(e.id) ? i : m), -1)
  const iLead = q.etapes.findIndex((e) => e.id === q.leadA), iGagne = q.etapes.findIndex((e) => e.id === q.gagneA)
  const estLead = iLead >= 0 && dernier >= iLead
  const courante = dernier >= 0 ? q.etapes[dernier].id : null
  const etape: EtapeLead = iGagne >= 0 && dernier >= iGagne ? "gagnes" : f.perdu ? "perdus" : dernier > iLead ? "qualifies" : contacte ? "contactes" : "nouveaux"
  return { estLead, etape, atteintes, courante }
}

function reponseValide(reponse: string | undefined, operateur: string, valeur: string): boolean {
  if (!reponse) return false
  const a = reponse.trim().toLowerCase(), b = valeur.trim().toLowerCase()
  const nA = Number(a.replace(",", ".")), nB = Number(b.replace(",", "."))
  if (operateur === "au moins") return !Number.isNaN(nA) && !Number.isNaN(nB) && nA >= nB
  if (operateur === "au plus") return !Number.isNaN(nA) && !Number.isNaN(nB) && nA <= nB
  if (operateur === "contient") return a.includes(b)
  return a === b
}

/** Le niveau de qualité : la première règle vraie, de haut en bas. */
export function niveauDe(q: Qualification, atteintes: string[], reponses: Record<string, string> = {}): string {
  for (const n of q.qualites) {
    if (n.source === "toujours") return n.niveau
    if (n.source === "etape" && atteintes.includes(n.etapeId)) return n.niveau
    if (n.source === "question" && reponseValide(reponses[n.questionId], n.operateur, n.valeur)) return n.niveau
  }
  return ""
}
