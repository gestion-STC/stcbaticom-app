// ════════════════════════════════════════════════════════════════════════════
// LEADS REÇUS (Mahdi, 09/11/2026 : « un endroit où les leads tombent, comme Meta ; et pour les admins,
// un sélecteur sur quelle campagne on veut voir les leads »).
//
// Tout ce qui s'est manifesté, des deux bases, au même endroit, rangé par chaleur :
//   1. Fiche remplie : l'artisan a déposé son dossier (demain : l'agence a rempli le formulaire d'une campagne).
//   2. A répondu : une réponse à un mail.
//   3. Intérêt : un clic, une page ou une plaquette ouverte.
// Les plus chauds en tête, puis le plus récent d'abord. Chaque lead dit de quelle campagne il vient
// (la dernière campagne où le contact est entré), ou « hors campagne ».
// Fichier PUR : leadsRecus.test.ts le lit ; la lecture en base est dans leadsRecusDb.ts.
// ════════════════════════════════════════════════════════════════════════════
import type { EtatDossier } from "./dossierStatut"
import type { Espace } from "./messagesDb"

export type Niveau = "fiche" | "reponse" | "interet"
export const LIBELLE_NIVEAU: Record<Niveau, string> = { fiche: "Fiche remplie", reponse: "A répondu", interet: "Intérêt" }
const RANG: Record<Niveau, number> = { fiche: 0, reponse: 1, interet: 2 }

/** Ce vers quoi le lead mène : l'agence (appel), le dossier déposé, l'artisan (appel). */
export type Cible = { type: "agence"; id: string } | { type: "dossier"; id: string } | { type: "artisan"; id: string }

export type LeadRecu = {
  id: string
  espace: Espace
  niveau: Niveau
  nom: string
  /** Ce qu'il a fait, en clair. */
  signal: string
  detail: string
  quand: string
  aTraiter: boolean
  /** L'état d'un dossier déposé (nouveau, vu, contrats envoyés…). */
  etat?: EtatDossier
  /** Le compte à qui le contact est attribué (agences), null sinon. */
  proprietaireId: string | null
  /** L'id du contact (agence ou artisan) : sert à retrouver sa campagne. */
  contactRef: string
  campagne: { id: string; nom: string } | null
  cible: Cible
}

/** La chaleur d'un lead d'agence, d'après sa source (leads_demarchage.source). */
export function niveauAgence(source: string): Niveau {
  if (source === "formulaire") return "fiche"
  if (source === "mail") return "reponse"
  return "interet"
}

/** Les plus chauds d'abord, puis le plus récent. */
export function trierLeads(l: LeadRecu[]): LeadRecu[] {
  return [...l].sort((a, b) => RANG[a.niveau] - RANG[b.niveau] || (a.quand < b.quand ? 1 : a.quand > b.quand ? -1 : 0))
}

export type FiltreCampagne = "toutes" | "hors" | string
export type FiltresLeads = { espace: Espace | "tout"; campagne: FiltreCampagne; aTraiter: boolean }

export function filtrerLeads(l: LeadRecu[], f: FiltresLeads): LeadRecu[] {
  return l.filter((x) =>
    (f.espace === "tout" || x.espace === f.espace) &&
    x.aTraiter === f.aTraiter &&
    (f.campagne === "toutes" || (f.campagne === "hors" ? !x.campagne : x.campagne?.id === f.campagne)),
  )
}

/** Un téléprospecteur ne voit que les leads de ses bases, et parmi les agences celles qui lui sont attribuées. */
export function leadsVisibles(l: LeadRecu[], espaces: Espace[], moiId: string, admin: boolean): LeadRecu[] {
  return l.filter((x) => espaces.includes(x.espace) && (admin || x.espace !== "demarchage" || x.proprietaireId === moiId))
}

/** La campagne de chaque contact : la DERNIÈRE où il est entré. */
export function campagneParContact(inscriptions: { campagneId: string; contactRef: string; entreeLe: string }[], noms: Map<string, string>): Map<string, { id: string; nom: string }> {
  const out = new Map<string, { id: string; nom: string; le: string }>()
  for (const i of inscriptions) {
    const deja = out.get(i.contactRef)
    if (!deja || i.entreeLe > deja.le) out.set(i.contactRef, { id: i.campagneId, nom: noms.get(i.campagneId) ?? "Campagne", le: i.entreeLe })
  }
  return new Map([...out].map(([k, v]) => [k, { id: v.id, nom: v.nom }]))
}

export function compterParNiveau(l: LeadRecu[]): Record<Niveau, number> {
  const c: Record<Niveau, number> = { fiche: 0, reponse: 0, interet: 0 }
  for (const x of l) c[x.niveau]++
  return c
}
