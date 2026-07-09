// Une règle d'envoi : quand un prospect entre dans un état, envoyer un email,
// avec délai, plage horaire/jours, ciblage et relance multiple optionnels.
export type UniteDelai = "heures" | "jours"
export type SensDelai = "avant" | "apres"

export type Regle = {
  id?: string
  etatId: string
  emailId: string
  // Délai
  delaiValeur: number
  delaiUnite: UniteDelai
  delaiSens: SensDelai
  // Plage horaire d'envoi ('' = pas de restriction) + jours ([] = tous)
  heureMin: string
  heureMax: string
  jours: number[]
  // Ciblage ('' = tous)
  filtreType: string
  filtreArrondissement: string
  // Relance multiple
  repeter: boolean
  repeterMax: number
  repeterIntervalle: number
  actif: boolean
}

// Valeurs par défaut d'une nouvelle règle.
export function regleVide(etatId: string, emailId: string): Regle {
  return {
    etatId,
    emailId,
    delaiValeur: 0,
    delaiUnite: "jours",
    delaiSens: "apres",
    heureMin: "",
    heureMax: "",
    jours: [],
    filtreType: "",
    filtreArrondissement: "",
    repeter: false,
    repeterMax: 0,
    repeterIntervalle: 0,
    actif: true,
  }
}
