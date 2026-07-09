// Un créneau d'appel : quels prospects (par état) appeler, dans quelle plage
// horaire, à quelle cadence, quels jours.
export type Creneau = {
  id?: string
  nom: string
  etatId: string
  heureDebut: string // "HH:MM"
  heureFin: string
  cadenceSecondes: number
  jours: number[] // 1 = lundi … 7 = dimanche
  actif: boolean
}

export const joursLabels: { num: number; court: string }[] = [
  { num: 1, court: "L" },
  { num: 2, court: "M" },
  { num: 3, court: "M" },
  { num: 4, court: "J" },
  { num: 5, court: "V" },
  { num: 6, court: "S" },
  { num: 7, court: "D" },
]
