// ── QUITTER UN ÉCRAN AVEC DES MODIFICATIONS NON ENREGISTRÉES (lot 5, 26/11/2026) ──
// Un écran de saisie pose une garde tant qu'il a des modifications non enregistrées ; le menu,
// les boutons « Retour » et la fermeture de l'onglet demandent alors confirmation avant de
// jeter la saisie. Une seule garde à la fois (un seul éditeur ouvert).
let message: string | null = null

/** Pose (texte) ou lève (null) la garde. */
export function poserGarde(texte: string | null): void {
  message = texte
}

export const gardeActive = (): boolean => message !== null

/** Vrai si l'on peut quitter : pas de garde, ou la personne confirme (la garde est alors levée). */
export function peutQuitter(confirmer: (texte: string) => boolean = (t) => window.confirm(t)): boolean {
  if (message === null) return true
  if (!confirmer(message)) return false
  message = null
  return true
}

/** À brancher une fois : la fermeture ou le rechargement de l'onglet préviennent aussi. */
export function retenirFermeture(e: BeforeUnloadEvent): void {
  if (message === null) return
  e.preventDefault()
  e.returnValue = ""
}
