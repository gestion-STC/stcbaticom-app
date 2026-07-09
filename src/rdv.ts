// Un rendez-vous : soit lié à un prospect de la liste, soit en saisie libre.
export const typesRdv = ["Téléphone", "Visio", "Sur place"] as const
export type TypeRdv = (typeof typesRdv)[number]

export type Rdv = {
  id?: string
  prospectId: string | null // null = RDV libre (pas un prospect de la liste)
  titre: string // utilisé si pas de prospect
  type: string
  date: string // AAAA-MM-JJ
  heure: string // HH:MM
  note: string
  fait: boolean
  // Affichage (calculé : prospect joint OU saisie libre)
  entreprise?: string
  telephone?: string
  contact?: string
}
