// Calcul de recrutement piloté par le taux de conversion.
//
// Idée : l'utilisateur dit « je veux N sous-traitants d'un métier ». On calcule
// le VOLUME à démarcher à partir du taux de conversion RÉEL (dépôts ÷ contactés),
// mesuré sur une fenêtre glissante et TOUS MÉTIERS confondus (taux global).
//
// Garde-fou : tant qu'on n'a pas assez de dépôts dans la fenêtre pour que le taux
// soit fiable, on retombe sur un taux par défaut prudent. Une marge de sécurité
// est toujours appliquée (le taux reste une estimation).

import type { SousTraitant } from "../recrutement"

export const TAUX_DEFAUT = 0.03 // 3 % de dépôt, prudent, avant d'avoir des données
export const MARGE = 0.25 // +25 % de sécurité sur le volume
export const FENETRE_JOURS = 60 // fenêtre de mesure du taux
export const MIN_DEPOTS_FIABLE = 15 // en-dessous, le taux observé n'est pas fiable
const JOUR_MS = 86_400_000

export interface TauxGlobal {
  contactes: number // contactés dans la fenêtre
  depots: number // dépôts dans la fenêtre
  tauxObserve: number // dépôts ÷ contactés (0 si aucun contacté)
  fiable: boolean // assez de dépôts pour faire confiance au taux observé ?
  taux: number // taux effectivement UTILISÉ (observé si fiable, sinon défaut)
}

// Taux de conversion global (tous métiers) sur les FENETRE_JOURS derniers jours.
export function tauxGlobal(liste: SousTraitant[], now: number = Date.now()): TauxGlobal {
  const seuil = now - FENETRE_JOURS * JOUR_MS
  const dans = (d?: string | null) => !!d && new Date(d).getTime() >= seuil
  const contactes = liste.filter((s) => dans(s.demarreLe)).length
  const depots = liste.filter((s) => (s.statut === "depose" || s.deposeLe) && dans(s.deposeLe)).length
  const tauxObserve = contactes > 0 ? depots / contactes : 0
  const fiable = depots >= MIN_DEPOTS_FIABLE && contactes > 0
  return { contactes, depots, tauxObserve, fiable, taux: fiable ? tauxObserve : TAUX_DEFAUT }
}

// Volume à démarcher pour obtenir `objectif` dépôts au taux donné (marge incluse).
export function volumeADemarcher(objectif: number, taux: number): number {
  if (objectif <= 0 || taux <= 0) return 0
  return Math.ceil((objectif / taux) * (1 + MARGE))
}

// Prospects d'un métier encore À CONTACTER (jamais démarchés) et joignables.
export function dispoAContacter(liste: SousTraitant[], metier: string): number {
  const m = metier.trim().toLowerCase()
  if (!m) return 0
  return liste.filter(
    (s) =>
      (s.metier || "").trim().toLowerCase() === m &&
      s.statut === "a_contacter" &&
      (s.email || s.telephone),
  ).length
}
