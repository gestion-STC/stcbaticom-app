// Suivi d'un appel sortant, pour l'AFFICHER pendant qu'il a lieu.
//
// Le mode auto surveillait déjà l'appel pour enchaîner tout seul, mais sans rien
// montrer en mode manuel : on cliquait « Appeler », et l'écran restait figé. On
// ne savait pas si l'appel était parti, en cours, ou terminé.
//
// Rappel du déroulé réel : Ringover fait d'abord sonner TON téléphone, et ce
// n'est qu'une fois décroché qu'il compose le prospect. Il y a donc un temps où
// l'appel n'est pas encore « actif » côté Ringover — d'où l'étape « attente ».

export type EtapeAppel =
  | "attente" // lancé, mais pas encore vu en ligne (ton téléphone sonne)
  | "en_cours" // appel en ligne
  | "termine" // a été en ligne, ne l'est plus → à toi d'enregistrer le résultat
  | "sans_suivi" // jamais vu en ligne après un long moment : on cesse de prétendre suivre

// Au-delà, on arrête d'attendre : soit l'appel n'a jamais abouti, soit Ringover
// ne nous renvoie pas d'identifiant exploitable. Mieux vaut le dire que mentir.
export const DELAI_ABANDON_MS = 120_000

export function prochaineEtape(args: {
  vuActif: boolean // l'appel a-t-il déjà été observé en ligne ?
  sondageOk: boolean // la vérification auprès de Ringover a-t-elle abouti ?
  actif: boolean // l'appel est-il en ligne maintenant ?
  depuisMs: number // temps écoulé depuis le lancement
}): EtapeAppel {
  const { vuActif, sondageOk, actif, depuisMs } = args
  if (actif) return "en_cours"
  // Une vérification ratée (réseau) ne doit pas faire croire que l'appel est fini.
  if (!sondageOk) return vuActif ? "en_cours" : "attente"
  if (vuActif) return "termine"
  return depuisMs >= DELAI_ABANDON_MS ? "sans_suivi" : "attente"
}

// « 45 s », « 1 min 05 s », « 12 min 30 s »
export function dureeLisible(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const min = Math.floor(total / 60)
  const sec = total % 60
  if (min === 0) return `${sec} s`
  return `${min} min ${String(sec).padStart(2, "0")} s`
}

// Le texte affiché à l'écran pour chaque étape.
export function texteEtape(etape: EtapeAppel): string {
  switch (etape) {
    case "attente":
      return "Appel lancé — décroche sur ton téléphone ou ton appli Ringover, le prospect sera composé ensuite."
    case "en_cours":
      return "Appel en cours"
    case "termine":
      return "Appel terminé — enregistre le résultat ci-dessous."
    case "sans_suivi":
      return "Suivi de l'appel indisponible — enregistre le résultat à la main quand tu auras raccroché."
  }
}

// Faut-il continuer à interroger Ringover ?
export function doitContinuer(etape: EtapeAppel): boolean {
  return etape === "attente" || etape === "en_cours"
}
