// Parcours d'un gestionnaire jusqu'à son PREMIER ordre de service.
//
// But : comprendre ce qui déclenche un 1er OS. Combien d'appels, combien de
// mails, sur combien de temps — pour repérer un schéma qui se répète et le
// reproduire sur les autres gestionnaires.
//
// La bascule n'est tracée nulle part dans une table dédiée : la seule trace
// est le détail de l'appel qui a changé l'état (« état → Client signé »).
// C'est donc de là qu'on date le 1er OS.

import type { Evenement } from "./historiqueDb"

export type Comptes = {
  appelsSortants: number
  appelsEntrants: number
  emailsEnvoyes: number
  emailsRecus: number
  rdv: number
}

export type Parcours = {
  dateOS: string | null // moment du 1er ordre de service (null si jamais passé par un appel)
  avant: Evenement[] // actions jusqu'à l'OS inclus, de la PLUS ANCIENNE à la plus récente
  nbApres: number // actions postérieures à l'OS (non comptées dans l'analyse)
  comptes: Comptes // ce qu'il a fallu pour arriver à l'OS
  delaiJours: number | null // du 1er contact à l'OS
}

// Le 1er moment où un appel a fait basculer la fiche dans un état « objectif ».
// On prend le PREMIER, pas le dernier : un gestionnaire peut repasser plusieurs
// fois par cet état, seule la première fois répond à « qu'est-ce qui l'a décidé ».
export function trouverMomentOS(events: Evenement[], objectifLibelles: string[]): string | null {
  const cibles = objectifLibelles.map((l) => `état → ${l}`)
  const dates = events
    .filter((e) => e.type === "appel" && e.detail && cibles.includes(e.detail) && e.date)
    .map((e) => e.date)
    .sort()
  return dates[0] ?? null
}

function compter(events: Evenement[]): Comptes {
  const c: Comptes = {
    appelsSortants: 0,
    appelsEntrants: 0,
    emailsEnvoyes: 0,
    emailsRecus: 0,
    rdv: 0,
  }
  for (const e of events) {
    if (e.type === "appel") e.sens === "entrant" ? c.appelsEntrants++ : c.appelsSortants++
    else if (e.type === "email") e.sens === "entrant" ? c.emailsRecus++ : c.emailsEnvoyes++
    else if (e.type === "rdv") c.rdv++
  }
  return c
}

// Nombre de jours entiers entre deux dates ISO (0 si le même jour ou si illisible).
function ecartJours(debut: string, fin: string): number | null {
  const d = new Date(debut).getTime()
  const f = new Date(fin).getTime()
  if (Number.isNaN(d) || Number.isNaN(f)) return null
  return Math.max(0, Math.round((f - d) / 86_400_000))
}

// Découpe l'historique au moment du 1er OS et compte ce qui a précédé.
// `events` peut arriver dans n'importe quel ordre : on retrie ici.
export function analyserParcours(events: Evenement[], objectifLibelles: string[]): Parcours {
  const tries = events.filter((e) => e.date).sort((a, b) => (a.date < b.date ? -1 : 1))
  const dateOS = trouverMomentOS(tries, objectifLibelles)

  // Sans marqueur d'appel, on ne sait pas dater l'OS : on rend tout l'historique
  // plutôt que rien, mais sans prétendre analyser un déclencheur.
  if (!dateOS) {
    return {
      dateOS: null,
      avant: tries,
      nbApres: 0,
      comptes: compter(tries),
      delaiJours: null,
    }
  }

  const avant = tries.filter((e) => e.date <= dateOS)
  return {
    dateOS,
    avant,
    nbApres: tries.length - avant.length,
    comptes: compter(avant),
    delaiJours: avant.length ? ecartJours(avant[0].date, dateOS) : null,
  }
}

// Moyennes sur l'ensemble des gestionnaires signés — la réponse à « au bout de
// combien de contacts un gestionnaire est-il mûr ? ». Ne compte que les parcours
// réellement datés : inclure les autres fausserait la moyenne.
export function moyenneParcours(parcours: Parcours[]): {
  nb: number
  appels: number | null
  emails: number | null
  jours: number | null
} {
  const datés = parcours.filter((p) => p.dateOS)
  if (!datés.length) return { nb: 0, appels: null, emails: null, jours: null }
  const moy = (vals: number[]) => Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10
  const avecDelai = datés.filter((p) => p.delaiJours != null)
  return {
    nb: datés.length,
    appels: moy(datés.map((p) => p.comptes.appelsSortants + p.comptes.appelsEntrants)),
    emails: moy(datés.map((p) => p.comptes.emailsEnvoyes + p.comptes.emailsRecus)),
    jours: avecDelai.length ? moy(avecDelai.map((p) => p.delaiJours as number)) : null,
  }
}
