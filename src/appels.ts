// Sens d'un appel : sortant (on appelle le prospect) ou entrant (le prospect nous appelle).
export type SensAppel = "sortant" | "entrant"

// Un appel enregistré dans le journal.
export type Appel = {
  id?: string
  prospectId: string
  resultat: string // Décroché / Répondeur / Pas de réponse / Occupé / Faux numéro
  nouvelEtat: string // état du prospect après l'appel
  horodatage?: string // ISO (rempli par la base)
  sens?: SensAppel // défaut "sortant" (appels historiques + prospection)
}

// Un faux numéro ne mène à personne : la fiche n'a aucune valeur, on propose
// de la retirer tout de suite (nettoyage au fil des appels).
export const RESULTAT_FAUX_NUMERO = "Faux numéro"

// Résultats où la personne n'a pas été jointe (boutons « pas joint »).
export const resultatsNonJoint = [
  "Répondeur",
  "Pas de réponse",
  "Occupé",
  RESULTAT_FAUX_NUMERO,
] as const

export const RESULTAT_DECROCHE = "Décroché"
