// ════════════════════════════════════════════════════════════════════════════
// LA PAGE AUJOURD'HUI, VUES « L'ÉQUIPE EN DIRECT » ET « TABLEAU DE BORD » (06/11/2026).
// Les calculs, purs et testés (tableauOutils.test.ts) ; les lectures sont dans db.ts.
// ════════════════════════════════════════════════════════════════════════════
import { heureDeParis } from "./analyseOutils"

/** Un appel sortant tel que la page le lit. */
export type AppelLu = { id: string; date: string; compteId: string | null; compteNom: string; resultat: string; issue: string; agenceId: string; agenceNom: string }

// ── Le parcours : appels → décrochés → joints → intéressés → RDV → premiers OS ──
export type Parcours = { appels: number; decroches: number; joints: number; interesses: number; rdv: number; premiersOs: number }
export const ETAPES_PARCOURS: { cle: keyof Parcours; libelle: string }[] = [
  { cle: "appels", libelle: "Appels" }, { cle: "decroches", libelle: "Décrochés" }, { cle: "joints", libelle: "Gestionnaires joints" },
  { cle: "interesses", libelle: "Intéressés" }, { cle: "rdv", libelle: "RDV" }, { cle: "premiersOs", libelle: "Premiers OS" },
]
/** Décroché = quelqu'un a répondu (gestionnaire ou standard). Un appel non noté (« lance ») compte comme appel seulement. */
export function parcoursDepuis(appels: Pick<AppelLu, "resultat" | "issue">[], premiersOs: number): Parcours {
  let decroches = 0, joints = 0, interesses = 0, rdv = 0
  for (const a of appels) {
    if (a.resultat === "joint" || a.resultat === "standard") decroches++
    if (a.resultat === "joint") joints++
    if (a.issue === "interesse") interesses++
    if (a.issue === "rdv") rdv++
  }
  return { appels: appels.length, decroches, joints, interesses, rdv, premiersOs }
}
/** Le taux de passage d'une étape à la suivante, en % entier ; null sans base. */
export const tauxPassage = (n: number, precedent: number): number | null => (precedent > 0 ? Math.round((n / precedent) * 100) : null)

// ── Quand joindre un gestionnaire : le taux de « joint » par heure de Paris ──
export type LigneHeure = { heure: number; appels: number; joints: number; taux: number }
export const HEURES_OUVREES = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
/** Les heures ouvrées qui ont assez d'appels pour dire quelque chose (MIN_APPELS_HEURE). */
export const MIN_APPELS_HEURE = 10
export function tauxJointParHeure(appels: Pick<AppelLu, "date" | "resultat">[]): LigneHeure[] {
  const par = new Map<number, { appels: number; joints: number }>()
  for (const a of appels) {
    if (a.resultat === "" || a.resultat === "lance") continue
    const h = heureDeParis(a.date)
    const l = par.get(h) ?? { appels: 0, joints: 0 }
    l.appels++
    if (a.resultat === "joint") l.joints++
    par.set(h, l)
  }
  return HEURES_OUVREES.flatMap((heure) => {
    const l = par.get(heure)
    return l && l.appels >= MIN_APPELS_HEURE ? [{ heure, appels: l.appels, joints: l.joints, taux: Math.round((l.joints / l.appels) * 100) }] : []
  })
}
export const meilleureHeure = (l: LigneHeure[]): LigneHeure | null => (l.length ? l.reduce((a, b) => (b.taux > a.taux ? b : a)) : null)

// ── Le rythme de l'objectif du mois ──
/** Les jours ouvrés (lundi → vendredi) de [de ; a[. */
export function joursOuvres(de: Date, a: Date): number {
  let n = 0
  for (let d = new Date(de.getFullYear(), de.getMonth(), de.getDate()); d < a; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const j = d.getDay()
    if (j !== 0 && j !== 6) n++
  }
  return n
}
/**
 * Où on en est face à l'objectif : ce qui était attendu à cette date (au prorata des jours ouvrés
 * écoulés, aujourd'hui compris), la projection à la fin du mois, et les jours ouvrés restants.
 */
export function rythmeObjectif(recus: number, objectif: number, debutMois: Date, finMois: Date, maintenant: Date): { attendu: number; projection: number; restants: number; part: number } {
  const total = joursOuvres(debutMois, finMois)
  const demain = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1)
  const ecoules = Math.max(1, joursOuvres(debutMois, demain))
  const restants = joursOuvres(demain, finMois)
  return {
    attendu: objectif > 0 && total > 0 ? Math.round((objectif * ecoules) / total) : 0,
    projection: total > 0 ? Math.round((recus * total) / ecoules) : recus,
    restants,
    part: total > 0 ? Math.min(1, ecoules / total) : 0,
  }
}

// ── Les victoires du jour : RDV, intéressés, apporteurs trouvés, premiers OS ──
export type Victoire = { id: string; date: string; qui: string; quoi: string; type: "rdv" | "interesse" | "apporteur" | "os"; agenceId: string; quandTexte?: string }
export const prenomDe = (nom: string): string => (nom || "").trim().split(/\s+/)[0] || "L'équipe"
export function victoiresDepuis(appels: AppelLu[], premiersOs: { agenceId: string; nom: string; date: string; commercialNom: string }[]): Victoire[] {
  const v: Victoire[] = []
  for (const a of appels) {
    const qui = prenomDe(a.compteNom)
    if (a.issue === "rdv") v.push({ id: a.id, date: a.date, qui, quoi: `RDV pris avec ${a.agenceNom}`, type: "rdv", agenceId: a.agenceId })
    else if (a.issue === "interesse") v.push({ id: a.id, date: a.date, qui, quoi: `${a.agenceNom} intéressée`, type: "interesse", agenceId: a.agenceId })
    else if (a.resultat === "apporteur") v.push({ id: a.id, date: a.date, qui, quoi: `Apporteur d'affaires trouvé : ${a.agenceNom}`, type: "apporteur", agenceId: a.agenceId })
  }
  for (const o of premiersOs) v.push({ id: `os-${o.agenceId}`, date: o.date, qui: o.commercialNom ? prenomDe(o.commercialNom) : "L'équipe", quoi: `Premier OS reçu de ${o.nom}`, type: "os", agenceId: o.agenceId, quandTexte: "aujourd'hui" })
  return v.sort((x, y) => y.date.localeCompare(x.date))
}

/** « il y a 12 min », « il y a 2 h », « hier », « le 04/11 ». */
export function ilYa(iso: string, maintenant: Date): string {
  const d = new Date(iso)
  const min = Math.max(0, Math.floor((maintenant.getTime() - d.getTime()) / 60_000))
  const jourJ = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
  if (d >= jourJ) return min < 1 ? "à l'instant" : min < 60 ? `il y a ${min} min` : `il y a ${Math.floor(min / 60)} h`
  const hier = new Date(jourJ.getFullYear(), jourJ.getMonth(), jourJ.getDate() - 1)
  if (d >= hier) return "hier"
  return `le ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Un écart affiché « +12 » / « −3 » / « = ». */
export const ecart = (n: number, avant: number): string => (n === avant ? "=" : n > avant ? `+${n - avant}` : `−${avant - n}`)
/** Une évolution en % : « +18 % » ; null sans base. */
export const evolution = (n: number, avant: number): string | null => (avant > 0 ? `${n >= avant ? "+" : "−"}${Math.abs(Math.round(((n - avant) / avant) * 100))} %` : null)

// ── Ma base de prospection : où en est chaque agence, et combien sont devenues clientes ──
export type BilanProspection = { total: number; parEtape: Record<string, number>; travaillees: number; clients: number; tauxSignature: number | null }
/** « Travaillées » = sorties de « À prospecter » (on les a jointes au moins une fois, ou classées). */
export function bilanProspection(lignes: { etape: string }[]): BilanProspection {
  const parEtape: Record<string, number> = {}
  for (const l of lignes) parEtape[l.etape] = (parEtape[l.etape] ?? 0) + 1
  const total = lignes.length
  const travaillees = total - (parEtape.a_prospecter ?? 0)
  const clients = parEtape.client ?? 0
  return { total, parEtape, travaillees, clients, tauxSignature: travaillees > 0 ? Math.round((clients / travaillees) * 1000) / 10 : null }
}

// ── Ma base de leads : reçus, traités, devenus RDV, devenus clients ──
export type LeadBilan = { statut: "a_traiter" | "traite" | "retombe"; resultat: string; creeLe: string; traiteLe: string | null; etapeAgence: string; commercialId: string | null }
export type BilanLeads = { recus: number; aTraiter: number; traites: number; retombes: number; interesses: number; rdv: number; clients: number; tauxRdv: number | null; tauxClient: number | null; delaiMoyenMin: number | null }
export function bilanLeads(leads: LeadBilan[]): BilanLeads {
  const traites = leads.filter((l) => l.statut === "traite")
  const rdv = leads.filter((l) => l.resultat === "rdv" || l.etapeAgence === "rdv_planifie").length
  const interesses = leads.filter((l) => l.resultat === "interesse" || l.etapeAgence === "interesse").length
  const clients = leads.filter((l) => l.etapeAgence === "client").length
  const delais = traites.flatMap((l) => (l.traiteLe ? [(new Date(l.traiteLe).getTime() - new Date(l.creeLe).getTime()) / 60_000] : [])).filter((m) => m >= 0)
  const fermes = leads.length - leads.filter((l) => l.statut === "a_traiter").length
  return {
    recus: leads.length, aTraiter: leads.length - fermes, traites: traites.length, retombes: leads.filter((l) => l.statut === "retombe").length, interesses, rdv, clients,
    tauxRdv: leads.length ? Math.round((rdv / leads.length) * 100) : null,
    tauxClient: leads.length ? Math.round((clients / leads.length) * 1000) / 10 : null,
    delaiMoyenMin: delais.length ? Math.round(delais.reduce((a, b) => a + b, 0) / delais.length) : null,
  }
}
/** « 42 min », « 3 h 05 », « 2 j ». */
export function delaiLisible(min: number | null): string {
  if (min == null) return "—"
  if (min < 60) return `${min} min`
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`
  return `${Math.round(min / (24 * 60))} j`
}

// ── Le style courtier (06/11/2026) : la série jour par jour, les signaux regroupés, les retards ──
/** Les n derniers jours ouvrés (lundi → vendredi), aujourd'hui compris s'il est ouvré, du plus ancien au plus récent, à 0 h. */
export function joursOuvresRecents(maintenant: Date, n: number): Date[] {
  const jours: Date[] = []
  for (let d = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()); jours.length < n; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) jours.unshift(d)
  }
  return jours
}
export type Jour6 = { appels: number; decroches: number; joints: number; interesses: number; rdv: number; apporteurs: number }
export const JOUR_VIDE: Jour6 = { appels: 0, decroches: 0, joints: 0, interesses: 0, rdv: 0, apporteurs: 0 }
/** Pour chaque jour, les appels qui passent le filtre, comptés par étape (heure de Paris = heure locale du poste). */
export function serieParJour(appels: AppelLu[], jours: Date[], garder: (a: AppelLu) => boolean = () => true): Jour6[] {
  const cle = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const index = new Map(jours.map((d, i) => [cle(d), i]))
  const serie = jours.map(() => ({ ...JOUR_VIDE }))
  for (const a of appels) {
    if (!garder(a)) continue
    const i = index.get(cle(new Date(a.date)))
    if (i === undefined) continue
    const j = serie[i]
    j.appels++
    if (a.resultat === "joint" || a.resultat === "standard") j.decroches++
    if (a.resultat === "joint") j.joints++
    if (a.issue === "interesse") j.interesses++
    if (a.issue === "rdv") j.rdv++
    if (a.resultat === "apporteur") j.apporteurs++
  }
  return serie
}
/** La somme d'une série sur des jours choisis (par leur rang). */
export function sommeJours(serie: Jour6[], rangs: number[]): Jour6 {
  return rangs.reduce((t, i) => { const j = serie[i] ?? JOUR_VIDE; return { appels: t.appels + j.appels, decroches: t.decroches + j.decroches, joints: t.joints + j.joints, interesses: t.interesses + j.interesses, rdv: t.rdv + j.rdv, apporteurs: t.apporteurs + j.apporteurs } }, { ...JOUR_VIDE })
}
/** Les rangs des jours d'une série qui tombent dans [de ; a[. */
export const rangsEntre = (jours: Date[], de: Date, a: Date): number[] => jours.flatMap((d, i) => (d >= de && d < a ? [i] : []))

/** Les signaux du site regroupés par agence : combien, de quels types, le plus récent. */
export type GroupeSignal = { agenceId: string; agenceNom: string; commercialId: string | null; n: number; detail: string; dernier: string }
export function regrouperSignaux(signaux: { date: string; titre: string; agenceId: string; agenceNom: string; commercialId: string | null }[]): GroupeSignal[] {
  const court = (t: string) => (/plaquette/i.test(t) ? "plaquette" : /e-mail ouvert/i.test(t) ? "mail ouvert" : /créer un compte/i.test(t) ? "« Créer un compte »" : /compte ouvert/i.test(t) ? "compte ouvert" : t.toLowerCase())
  const par = new Map<string, { g: GroupeSignal; types: Map<string, number> }>()
  for (const s of signaux) {
    const e = par.get(s.agenceId) ?? { g: { agenceId: s.agenceId, agenceNom: s.agenceNom, commercialId: s.commercialId, n: 0, detail: "", dernier: s.date }, types: new Map() }
    e.g.n++
    if (s.date > e.g.dernier) e.g.dernier = s.date
    const k = court(s.titre)
    e.types.set(k, (e.types.get(k) ?? 0) + 1)
    par.set(s.agenceId, e)
  }
  return [...par.values()].map(({ g, types }) => ({ ...g, detail: [...types.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(" · ") }))
    .sort((a, b) => b.n - a.n || b.dernier.localeCompare(a.dernier))
}

/** Le retard d'une échéance, en jours entiers (0 = aujourd'hui). */
export function joursDeRetard(echeance: string | null, maintenant: Date): number {
  if (!echeance) return 0
  const e = new Date(echeance)
  const de = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime(), a = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()).getTime()
  return Math.max(0, Math.round((a - de) / 86_400_000))
}
