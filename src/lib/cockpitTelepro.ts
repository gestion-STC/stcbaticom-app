// ════════════════════════════════════════════════════════════════════════════
// LE COCKPIT : LA TÉLÉPROSPECTION (26/11/2026, proposition 1 validée par le gérant). Fichier PUR, testé.
// Règles uniques, les mêmes pour les deux écrans :
//   · appel = activité « appel » SORTANTE (les appels entrants ne comptent pas) ;
//   · joint = appel au résultat « joint » (gestionnaire eu) ;
//   · intéressé = AGENCE DISTINCTE dont un appel de la période s'est conclu « intéressé » ou « RDV » ;
//   · premier OS = agences.premier_os_le (hors apporteurs), rattaché au commercial de l'agence ;
//   · comparaisons à JOURS ÉGAUX : la semaine contre la semaine dernière jusqu'à la même heure, le mois contre le
//     mois d'avant du 1er au même quantième, à la même heure ;
//   · heure de Paris = l'heure du poste.
// ════════════════════════════════════════════════════════════════════════════
import type { AppelLu } from "../demarchage/tableauOutils"

const JOUR = 86_400_000
export type StatsCockpit = { appels: number; joints: number; interesses: number; rdv: number; premiersOs: number }
export const STATS_ZERO: StatsCockpit = { appels: 0, joints: 0, interesses: 0, rdv: 0, premiersOs: 0 }
export type OsDate = { agenceId: string; date: string; commercialId: string | null }
type Appel = Pick<AppelLu, "date" | "compteId" | "resultat" | "issue" | "agenceId">

const dans = (iso: string, de: Date, a: Date) => { const t = new Date(iso).getTime(); return t >= de.getTime() && t < a.getTime() }
/** Un premier OS est daté au jour (AAAA-MM-JJ) : il compte si ce jour tombe dans [de ; a[. */
const osDans = (jour: string, de: Date, a: Date) => { const t = new Date(Number(jour.slice(0, 4)), Number(jour.slice(5, 7)) - 1, Number(jour.slice(8, 10))).getTime(); return t >= new Date(de.getFullYear(), de.getMonth(), de.getDate()).getTime() && t < a.getTime() }

/** Les chiffres d'une période pour un ensemble d'appels (et de premiers OS). */
export function stats(appels: Appel[], os: OsDate[], de: Date, a: Date): StatsCockpit {
  const l = appels.filter((x) => dans(x.date, de, a))
  return {
    appels: l.length,
    joints: l.filter((x) => x.resultat === "joint").length,
    interesses: new Set(l.filter((x) => x.issue === "interesse" || x.issue === "rdv").map((x) => x.agenceId)).size,
    rdv: l.filter((x) => x.issue === "rdv").length,
    premiersOs: os.filter((o) => osDans(o.date, de, a)).length,
  }
}
/** La ligne « Équipe » du tableau par commercial (26/11/2026) : EXACTEMENT les commerciaux affichés (leurs appels, les
 *  premiers OS de leurs agences), et à part ce que le tableau ne montre pas : les appels et premiers OS des comptes hors
 *  classement (direction, recrutement), et les premiers OS d'agences sans commercial. Avant, « Équipe » comptait tout,
 *  et l'info-bulle « sans commercial attribué » comptait aussi les agences d'un compte hors classement. */
export function equipeEtReste(appels: Appel[], os: OsDate[], comptes: string[], de: Date, a: Date): { equipe: StatsCockpit; horsClassement: { appels: number; premiersOs: number }; sansCommercial: number } {
  const ids = new Set(comptes)
  const equipe = stats(appels.filter((x) => x.compteId && ids.has(x.compteId)), os.filter((o) => o.commercialId && ids.has(o.commercialId)), de, a)
  const hors = stats(appels.filter((x) => !x.compteId || !ids.has(x.compteId)), os.filter((o) => o.commercialId && !ids.has(o.commercialId)), de, a)
  return { equipe, horsClassement: { appels: hors.appels, premiersOs: hors.premiersOs }, sansCommercial: stats([], os.filter((o) => !o.commercialId), de, a).premiersOs }
}
/** Par commercial : ses appels, et les premiers OS des agences dont il est responsable. */
export function statsParCompte(appels: Appel[], os: OsDate[], comptes: string[], de: Date, a: Date): Record<string, StatsCockpit> {
  return Object.fromEntries(comptes.map((id) => [id, stats(appels.filter((x) => x.compteId === id), os.filter((o) => o.commercialId === id), de, a)]))
}

export type PeriodeCockpit = "jour" | "semaine" | "mois" | "moisDernier" | "annee"
export const lundiDe = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
/** Les bornes [de ; a[ de chaque période, et la même période d'avant À JOURS ÉGAUX (jusqu'à la même heure). */
export function bornes(p: PeriodeCockpit, m: Date): { de: Date; a: Date; avantDe: Date; avantA: Date } {
  const apres = new Date(m.getTime() + 1)
  if (p === "jour") { const d = new Date(m.getFullYear(), m.getMonth(), m.getDate()); return { de: d, a: apres, avantDe: new Date(d.getTime() - 7 * JOUR), avantA: new Date(apres.getTime() - 7 * JOUR) } }
  if (p === "semaine") { const l = lundiDe(m); return { de: l, a: apres, avantDe: new Date(l.getFullYear(), l.getMonth(), l.getDate() - 7), avantA: new Date(apres.getTime() - 7 * JOUR) } }
  if (p === "mois") {
    const de = new Date(m.getFullYear(), m.getMonth(), 1), avantDe = new Date(m.getFullYear(), m.getMonth() - 1, 1)
    const finAvant = new Date(m.getFullYear(), m.getMonth(), 0).getDate()
    const memeInstant = new Date(m.getFullYear(), m.getMonth() - 1, Math.min(m.getDate(), finAvant), m.getHours(), m.getMinutes(), m.getSeconds(), m.getMilliseconds() + 1)
    return { de, a: apres, avantDe, avantA: memeInstant }
  }
  if (p === "moisDernier") { const de = new Date(m.getFullYear(), m.getMonth() - 1, 1), a = new Date(m.getFullYear(), m.getMonth(), 1); return { de, a, avantDe: new Date(m.getFullYear(), m.getMonth() - 2, 1), avantA: de } }
  const de = new Date(m.getFullYear(), 0, 1)
  return { de, a: apres, avantDe: new Date(m.getFullYear() - 1, 0, 1), avantA: new Date(m.getFullYear() - 1, m.getMonth(), m.getDate(), m.getHours(), m.getMinutes() + 1) }
}

/** Les lundis des n dernières semaines (la semaine en cours comprise), du plus ancien au plus récent. */
export const lundisRecents = (m: Date, n: number): Date[] => { const l = lundiDe(m); return Array.from({ length: n }, (_, i) => new Date(l.getFullYear(), l.getMonth(), l.getDate() - 7 * (n - 1 - i))) }
/** La cadence : appels, joints, agences intéressées par semaine. */
export function cadence(appels: Appel[], lundis: Date[], m: Date): { appels: number[]; joints: number[]; interesses: number[] } {
  const s = lundis.map((l, i) => stats(appels, [], l, i + 1 < lundis.length ? lundis[i + 1] : new Date(m.getTime() + 1)))
  return { appels: s.map((x) => x.appels), joints: s.map((x) => x.joints), interesses: s.map((x) => x.interesses) }
}
/** Les jours du mois jusqu'à aujourd'hui : appels et joints par jour (week-ends sans appel retirés). */
export function joursDuMois(appels: Appel[], m: Date): { jour: Date; appels: number; joints: number }[] {
  const out: { jour: Date; appels: number; joints: number }[] = []
  for (let d = new Date(m.getFullYear(), m.getMonth(), 1); d <= m; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const s = stats(appels, [], d, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))
    if (s.appels || (d.getDay() !== 0 && d.getDay() !== 6)) out.push({ jour: d, appels: s.appels, joints: s.joints })
  }
  return out
}
/** La semaine jour par jour, lundi → vendredi : null pour les jours à venir. */
export function semaineJours(appels: Appel[], m: Date): { jour: Date; appels: number | null; joints: number | null; enCours: boolean }[] {
  const l = lundiDe(m)
  const aujourdhui = new Date(m.getFullYear(), m.getMonth(), m.getDate()).getTime()
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(l.getFullYear(), l.getMonth(), l.getDate() + i)
    if (d.getTime() > aujourdhui) return { jour: d, appels: null, joints: null, enCours: false }
    const s = stats(appels, [], d, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))
    return { jour: d, appels: s.appels, joints: s.joints, enCours: d.getTime() === aujourdhui }
  })
}
/** La moyenne d'appels (et de joints) par jour ouvré écoulé du mois, aujourd'hui exclu. */
export function moyenneJour(appels: Appel[], m: Date): { appels: number; joints: number; jours: number } {
  const jours = joursDuMois(appels, m).filter((j) => j.jour.getTime() < new Date(m.getFullYear(), m.getMonth(), m.getDate()).getTime() && j.jour.getDay() !== 0 && j.jour.getDay() !== 6 && j.appels > 0)
  const n = jours.length
  return { appels: n ? Math.round(jours.reduce((t, j) => t + j.appels, 0) / n) : 0, joints: n ? Math.round(jours.reduce((t, j) => t + j.joints, 0) / n) : 0, jours: n }
}

// ── « À appeler aujourd'hui » : des AGENCES DISTINCTES (une agence en lead ET en rappel ne compte qu'une fois),
// rangées dans leur groupe le plus urgent : lead > campagne > rappel. Même calcul que sessionOutils.repartirAAppeler
// (lot 4) : à remplacer par lui quand il sera fusionné. ──
export function repartirAAppeler(leads: string[], campagne: string[], rappels: string[]): { leads: string[]; campagne: string[]; rappels: string[]; total: number } {
  const vus = new Set<string>()
  const garder = (l: string[]) => l.filter((id) => (vus.has(id) ? false : (vus.add(id), true)))
  const a = garder(leads), b = garder(campagne), c = garder(rappels)
  return { leads: a, campagne: b, rappels: c, total: vus.size }
}

// ── Les agences qui bougent : plaquette ouverte et mail ouvert, par agence (désinscriptions et rebonds exclus) ──
export type SignalSite = { date: string; titre: string; agenceId: string; agenceNom: string; etape: string }
export function agencesQuiBougent(signaux: SignalSite[]): { agenceId: string; agenceNom: string; etape: string; plaquette: number; mail: number; dernier: string }[] {
  const par = new Map<string, { agenceId: string; agenceNom: string; etape: string; plaquette: number; mail: number; dernier: string }>()
  for (const s of signaux) {
    const plaq = /plaquette/i.test(s.titre), mail = /e-mail ouvert/i.test(s.titre)
    if (!plaq && !mail) continue
    const e = par.get(s.agenceId) ?? { agenceId: s.agenceId, agenceNom: s.agenceNom, etape: s.etape, plaquette: 0, mail: 0, dernier: s.date }
    if (plaq) e.plaquette++
    if (mail) e.mail++
    if (s.date > e.dernier) e.dernier = s.date
    par.set(s.agenceId, e)
  }
  return [...par.values()].sort((a, b) => b.plaquette + b.mail - (a.plaquette + a.mail) || b.dernier.localeCompare(a.dernier))
}

/** Les leads reçus d'une période (hors robots), à traiter, traités, devenus clients. */
export function leadsPeriode(leads: { statut: string; resultat: string; creeLe: string; etapeAgence: string }[], de: Date, a: Date): { recus: number; aTraiter: number; traites: number; clients: number } {
  const l = leads.filter((x) => x.resultat !== "robot" && dans(x.creeLe, de, a))
  return { recus: l.length, aTraiter: l.filter((x) => x.statut === "a_traiter").length, traites: l.filter((x) => x.statut !== "a_traiter").length, clients: l.filter((x) => x.etapeAgence === "client").length }
}

/** L'objectif de premiers OS, calé sur le calendrier : attendu à cette date au prorata des JOURS du mois (comme la maquette). */
export function attenduMois(objectif: number, m: Date): { attendu: number; projection: (n: number) => number; jour: number; jours: number } {
  const jours = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()
  return { attendu: Math.round((objectif * m.getDate()) / jours), projection: (n) => Math.round((n * jours) / Math.max(1, m.getDate())), jour: m.getDate(), jours }
}
