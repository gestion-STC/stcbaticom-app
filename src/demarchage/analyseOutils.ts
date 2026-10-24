// ════════════════════════════════════════════════════════════════════════════
// L'ANALYSE DES APPELS — les calculs de l'onglet « Analyse IA » (24/10/2026).
//
// Mahdi : « savoir exactement quel argumentaire marche, ce qui tape ».
// Un appel ABOUTI = noté « Intéressé » ou « RDV » par le commercial (l'issue qu'il a
// choisie, pas l'avis de l'IA). Pour chaque argument : sur combien d'appels il a été
// avancé, combien ont abouti, et l'écart avec le taux moyen de la période.
// ⚠ Ce sont des CORRÉLATIONS : un argument qui « tape » est souvent avancé dans
// les bons appels. Sous MIN_APPELS appels, le chiffre est marqué « trop peu ».
// Fonctions PURES, testées dans analyseOutils.test.ts.
// ════════════════════════════════════════════════════════════════════════════
import type { AppelIa } from "./appelsIa"

export const MIN_APPELS = 5

export const abouti = (a: Pick<AppelIa, "issue">): boolean => a.issue === "interesse" || a.issue === "rdv"
const taux = (n: number, sur: number): number | null => (sur > 0 ? n / sur : null)
// Deux écritures du même libellé (« Réactivité 48 h » / « réactivité 48h ») comptent ensemble.
export const cleLibelle = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "")

export type Bilan = { appels: number; aboutis: number; taux: number | null; dureeMoyenneS: number | null; interetFort: number }
export function bilanGlobal(appels: AppelIa[]): Bilan {
  const prets = appels.filter((a) => a.statut === "pret")
  const durees = prets.map((a) => a.dureeS).filter((d): d is number => typeof d === "number" && d > 0)
  const aboutis = prets.filter(abouti).length
  return {
    appels: prets.length, aboutis, taux: taux(aboutis, prets.length),
    dureeMoyenneS: durees.length ? Math.round(durees.reduce((s, d) => s + d, 0) / durees.length) : null,
    interetFort: prets.filter((a) => a.interet === "fort").length,
  }
}

export type LigneArgument = {
  libelle: string; appels: number; aboutis: number; taux: number | null; ecart: number | null
  positives: number; fiable: boolean; exemple: string
}
/** Les arguments avancés : sur combien d'appels, combien aboutis, l'écart au taux moyen. */
export function statsArguments(appels: AppelIa[]): LigneArgument[] {
  const prets = appels.filter((a) => a.statut === "pret" && a.analyse)
  const moyen = taux(prets.filter(abouti).length, prets.length)
  const parCle = new Map<string, { libelle: string; appels: Set<string>; aboutis: Set<string>; positives: number; exemple: string }>()
  for (const a of prets) {
    for (const arg of a.analyse!.arguments) {
      const k = cleLibelle(arg.libelle)
      if (!k) continue
      const l = parCle.get(k) ?? { libelle: arg.libelle.trim(), appels: new Set(), aboutis: new Set(), positives: 0, exemple: "" }
      l.appels.add(a.id)
      if (abouti(a)) l.aboutis.add(a.id)
      if (arg.reaction === "positive") l.positives += 1
      if (!l.exemple && arg.extrait) l.exemple = arg.extrait
      parCle.set(k, l)
    }
  }
  return [...parCle.values()].map((l) => {
    const t = taux(l.aboutis.size, l.appels.size)
    return {
      libelle: l.libelle, appels: l.appels.size, aboutis: l.aboutis.size, taux: t, ecart: t != null && moyen != null ? t - moyen : null,
      positives: l.positives, fiable: l.appels.size >= MIN_APPELS, exemple: l.exemple,
    }
  }).sort((x, y) => Number(y.fiable) - Number(x.fiable) || (y.taux ?? -1) - (x.taux ?? -1) || y.appels - x.appels || x.libelle.localeCompare(y.libelle, "fr"))
}

export type LigneObjection = {
  libelle: string; appels: number; levees: number; tauxLevee: number | null; aboutis: number; taux: number | null
  fiable: boolean; exemple: string; meilleureReponse: string
}
/** Les objections entendues : leur fréquence, combien ont été levées, et la réponse qui a marché. */
export function statsObjections(appels: AppelIa[]): LigneObjection[] {
  const prets = appels.filter((a) => a.statut === "pret" && a.analyse)
  const parCle = new Map<string, { libelle: string; appels: Set<string>; levees: number; aboutis: Set<string>; exemple: string; meilleureReponse: string }>()
  for (const a of prets) {
    for (const o of a.analyse!.objections) {
      const k = cleLibelle(o.libelle)
      if (!k) continue
      const l = parCle.get(k) ?? { libelle: o.libelle.trim(), appels: new Set(), levees: 0, aboutis: new Set(), exemple: "", meilleureReponse: "" }
      l.appels.add(a.id)
      if (o.levee) l.levees += 1
      if (abouti(a)) l.aboutis.add(a.id)
      if (!l.exemple && o.extrait) l.exemple = o.extrait
      // La réponse à retenir : celle d'une objection LEVÉE dans un appel qui a ABOUTI, sinon d'une objection levée.
      if (o.reponse && o.levee && (abouti(a) || !l.meilleureReponse)) l.meilleureReponse = o.reponse
      parCle.set(k, l)
    }
  }
  return [...parCle.values()].map((l) => ({
    libelle: l.libelle, appels: l.appels.size, levees: l.levees, tauxLevee: taux(l.levees, l.appels.size),
    aboutis: l.aboutis.size, taux: taux(l.aboutis.size, l.appels.size), fiable: l.appels.size >= MIN_APPELS, exemple: l.exemple, meilleureReponse: l.meilleureReponse,
  })).sort((x, y) => y.appels - x.appels || x.libelle.localeCompare(y.libelle, "fr"))
}

export type LigneCommercial = { nom: string; appels: number; aboutis: number; taux: number | null; dureeMoyenneS: number | null; argumentsParAppel: number | null }
export function statsParCommercial(appels: AppelIa[]): LigneCommercial[] {
  const groupes = new Map<string, AppelIa[]>()
  for (const a of appels.filter((x) => x.statut === "pret")) {
    const nom = a.compteNom || "?"
    groupes.set(nom, [...(groupes.get(nom) ?? []), a])
  }
  return [...groupes.entries()].map(([nom, liste]) => {
    const b = bilanGlobal(liste)
    const avecAnalyse = liste.filter((a) => a.analyse)
    const nArgs = avecAnalyse.reduce((s, a) => s + a.analyse!.arguments.length, 0)
    return { nom, appels: b.appels, aboutis: b.aboutis, taux: b.taux, dureeMoyenneS: b.dureeMoyenneS, argumentsParAppel: avecAnalyse.length ? Math.round((nArgs / avecAnalyse.length) * 10) / 10 : null }
  }).sort((x, y) => y.appels - x.appels || x.nom.localeCompare(y.nom, "fr"))
}

/** L'heure de Paris d'une date ISO (8 h, 9 h…). */
export function heureDeParis(iso: string): number {
  const morceaux = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(iso))
  return Number(morceaux.find((m) => m.type === "hour")?.value ?? NaN)
}
export type LigneHeure = { heure: number; appels: number; aboutis: number; taux: number | null }
export function statsParHeure(appels: AppelIa[]): LigneHeure[] {
  const prets = appels.filter((a) => a.statut === "pret")
  const parHeure = new Map<number, AppelIa[]>()
  for (const a of prets) {
    const h = heureDeParis(a.creeLe)
    parHeure.set(h, [...(parHeure.get(h) ?? []), a])
  }
  return [...parHeure.entries()].sort((x, y) => x[0] - y[0]).map(([heure, liste]) => {
    const n = liste.filter(abouti).length
    return { heure, appels: liste.length, aboutis: n, taux: taux(n, liste.length) }
  })
}

/** « 1 min 35 s » */
export function dureeLisible(s: number | null): string {
  if (s == null) return "—"
  const m = Math.floor(s / 60)
  return m ? `${m} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`
}
/** « 42 % » ; « — » sans base. */
export const pourcent = (t: number | null): string => (t == null ? "—" : `${Math.round(t * 100)} %`)
/** « +12 pts » / « −8 pts » ; « — » sans base. */
export const ecartLisible = (e: number | null): string => (e == null ? "—" : `${e >= 0 ? "+" : "−"}${Math.abs(Math.round(e * 100))} pts`)
