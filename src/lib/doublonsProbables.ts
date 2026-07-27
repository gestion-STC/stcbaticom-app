// Repérage des doublons AU FIL DE L'EAU (pendant le démarchage).
//
// Principe voulu par l'utilisateur : on ne nettoie JAMAIS la base en masse.
// Quand une fiche s'ouvre pendant une session d'appel, on lui signale les autres
// fiches qui pourraient être la même personne — et c'est LUI qui tranche, au
// moment où il a le prospect au téléphone (le seul moment où l'information est
// vraiment fiable). Chaque réponse est mémorisée, donc la question ne revient plus.
//
// Attention métier : deux gestionnaires DIFFÉRENTS partagent souvent le standard
// de leur agence. Un même numéro n'est donc PAS une preuve de doublon — c'est une
// simple piste, à confirmer. D'où le champ `certain`.

import type { Prospect } from "../data"
import { normaliserTel } from "./dedup"

export type RaisonDoublon = "email" | "nom" | "telephone"

export type CandidatDoublon = {
  prospect: Prospect
  raison: RaisonDoublon
  libelle: string // explication affichée à l'utilisateur
  certain: boolean // false = piste à confirmer (cas du standard partagé)
}

// Minuscules, sans accents ni espaces superflus — pour comparer des textes saisis
// à la main (« Mme Bolot » / « mme bolot »).
export function normTexte(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
}

// Clé d'une PAIRE de fiches, indépendante de l'ordre : la décision « ce ne sont
// pas des doublons » vaut dans les deux sens.
export function clePaire(idA: string, idB: string): string {
  return [idA, idB].sort().join("|")
}

// Force de chaque indice : on ne garde que le plus fort par fiche candidate.
const FORCE: Record<RaisonDoublon, number> = { email: 3, nom: 2, telephone: 1 }

// Fiches qui pourraient être la même personne que `cible`.
// `ecartees` = paires déjà tranchées par l'utilisateur (« non, 2 personnes »).
// Pur → testable.
export function candidatsDoublon(
  cible: Prospect,
  tous: Prospect[],
  ecartees: Set<string> = new Set(),
): CandidatDoublon[] {
  // Sans id, impossible de mémoriser une décision : on ne propose rien
  // (mieux vaut ne rien dire que harceler sans pouvoir clore la question).
  if (!cible.id) return []

  const email = normTexte(cible.email)
  const tel = normaliserTel(cible.telephone)
  const contact = normTexte(cible.contact)
  const entreprise = normTexte(cible.entreprise)

  const trouves = new Map<string, CandidatDoublon>()

  for (const p of tous) {
    if (!p.id || p.id === cible.id) continue
    if (ecartees.has(clePaire(cible.id, p.id))) continue // déjà tranché

    let candidat: CandidatDoublon | null = null

    if (email && normTexte(p.email) === email) {
      candidat = {
        prospect: p,
        raison: "email",
        libelle: `même e-mail (${cible.email})`,
        certain: true,
      }
    } else if (contact && entreprise && normTexte(p.contact) === contact && normTexte(p.entreprise) === entreprise) {
      candidat = {
        prospect: p,
        raison: "nom",
        libelle: `même nom dans la même agence (${cible.contact})`,
        certain: true,
      }
    } else if (tel && normaliserTel(p.telephone) === tel) {
      candidat = {
        prospect: p,
        raison: "telephone",
        libelle: `même numéro (${cible.telephone}) — c'est peut-être le standard de l'agence`,
        certain: false,
      }
    }

    if (!candidat) continue
    const dejaVu = trouves.get(p.id)
    // Une même fiche peut cocher plusieurs indices : on garde le plus fort.
    if (!dejaVu || FORCE[candidat.raison] > FORCE[dejaVu.raison]) trouves.set(p.id, candidat)
  }

  // Les indices les plus solides en premier.
  return [...trouves.values()].sort((a, b) => FORCE[b.raison] - FORCE[a.raison])
}
