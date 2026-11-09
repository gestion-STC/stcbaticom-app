// ════════════════════════════════════════════════════════════════════════════
// LEADS REÇUS (Mahdi, 09/11/2026 : « un endroit où les leads tombent, comme Meta ; et pour les admins,
// un sélecteur sur quelle campagne on veut voir les leads »).
//
// Rangés comme Meta (Mahdi, 09/11, maquette validée) : à gauche d'où ils viennent (la campagne), en haut l'étape
// (Nouveaux, Contactés, Qualifiés, Gagnés, Perdus), une seule liste, un clic sur la ligne ouvre la fiche.
// Dans une étape, les plus chauds d'abord :
//   1. Fiche remplie : l'artisan a déposé son dossier (demain : l'agence a rempli le formulaire d'une campagne).
//   2. A répondu : une réponse à un mail.
//   3. Intérêt : un clic, une page ou une plaquette ouverte.
// Les plus chauds en tête, puis le plus récent d'abord. Chaque lead dit de quelle campagne il vient
// (la dernière campagne où le contact est entré), ou « hors campagne ».
// Fichier PUR : leadsRecus.test.ts le lit ; la lecture en base est dans leadsRecusDb.ts.
// ════════════════════════════════════════════════════════════════════════════
import type { EtatDossier } from "./dossierStatut"
import type { EtapeParcours } from "../prospection/configCampagne"
import type { EtapeLead } from "./parcoursLead"
import type { Espace } from "./messagesDb"

export type Niveau = "fiche" | "reponse" | "interet"
export const LIBELLE_NIVEAU: Record<Niveau, string> = { fiche: "Fiche remplie", reponse: "A répondu", interet: "Intérêt" }
const RANG: Record<Niveau, number> = { fiche: 0, reponse: 1, interet: 2 }

/** Ce vers quoi le lead mène : l'agence (appel), le dossier déposé, l'artisan (appel). */
export type { EtapeLead }
export type ParcoursDuLead = { etapes: EtapeParcours[]; leadA: string; gagneA: string; atteintes: string[]; valides: string[]; courante: string | null }
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
  etape: EtapeLead
  /** L'état d'un dossier déposé (nouveau, vu, contrats envoyés…). */
  etat?: EtatDossier
  /** Le compte à qui le contact est attribué (agences), null sinon. */
  proprietaireId: string | null
  /** L'id du contact (agence ou artisan) : sert à retrouver sa campagne. */
  contactRef: string
  campagne: { id: string; nom: string } | null
  /** Le niveau de qualité (A, B…) selon les règles de la campagne. */
  qualite?: string
  /** Le parcours de sa campagne, et où il en est. */
  parcours?: ParcoursDuLead
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

// ── L'étape d'un lead ──
export const ETAPES_LEAD: { id: EtapeLead; label: string; aide: string }[] = [
  { id: "nouveaux", label: "Nouveaux", aide: "Personne ne s'en est encore occupé" },
  { id: "contactes", label: "Contactés", aide: "Appelé sans réponse, ou dossier ouvert" },
  { id: "qualifies", label: "Qualifiés", aide: "Intéressé, RDV, dossier traité, contrats envoyés" },
  { id: "gagnes", label: "Gagnés", aide: "Client, ou artisan partenaire" },
  { id: "perdus", label: "Perdus", aide: "Pas intéressé, hors cible, injoignable" },
]

/** D'où il vient : l'id de sa campagne, ou la ligne « hors campagne » de sa base. */
export const sourceDe = (l: Pick<LeadRecu, "campagne" | "espace">): string => l.campagne?.id ?? "hors:" + l.espace

/** La colonne de gauche : par base, ses campagnes puis son « hors campagne », s'ils ont des leads. */
export function sourcesDe(l: LeadRecu[]): { espace: Espace; id: string; nom: string; n: number; nouveaux: number }[] {
  const m = new Map<string, { espace: Espace; id: string; nom: string; n: number; nouveaux: number }>()
  for (const x of l) {
    const id = sourceDe(x)
    const s = m.get(id) ?? { espace: x.espace, id, nom: x.campagne?.nom ?? "Hors campagne", n: 0, nouveaux: 0 }
    s.n++
    if (x.etape === "nouveaux") s.nouveaux++
    m.set(id, s)
  }
  return [...m.values()].sort((a, b) => Number(a.id.startsWith("hors:")) - Number(b.id.startsWith("hors:")) || b.n - a.n)
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

