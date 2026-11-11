// Le filtre « Moi · Tout le monde · un commercial » de la boîte de réception (11/11/2026), comme STC Bâtiment
// (src/lib/filtrePersonne.ts). ⚠ UN FILTRE D'AFFICHAGE, PAS UN DROIT : la base ne montre à un commercial que
// ses mails ; un administrateur ouvre sur « Tout le monde ».

export const MOI = "__moi__"
export const TOUS = "__tous__"
export type Personne = { id: string; nom: string }

export function libelleChoix(choix: string, personnes: Personne[]): string {
  if (choix === MOI) return "Moi"
  if (choix === TOUS) return "Tout le monde"
  return personnes.find((p) => p.id === choix)?.nom ?? "Tout le monde"
}

/** Le compte retenu par le choix : le mien, celui d'un commercial, ou null pour tout le monde. */
export function compteDuChoix(choix: string, moi: string): string | null {
  if (choix === TOUS) return null
  return choix === MOI ? moi : choix
}

/** Les mails gardés : au démarchage, ceux du compte choisi ; le recrutement (commun) n'est jamais filtré. */
export function filtrerParPersonne<T extends { espace: string; compteId?: string | null }>(messages: T[], compte: string | null): T[] {
  if (!compte) return messages
  return messages.filter((m) => m.espace !== "demarchage" || (m.compteId ?? null) === compte)
}
