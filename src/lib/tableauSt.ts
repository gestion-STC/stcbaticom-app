// ════════════════════════════════════════════════════════════════════════════
// SOUS-TRAITANTS › DASHBOARD (maquette « Cockpit » validée par le gérant le 26/11/2026) : les calculs du recrutement.
// Fichier PUR (tableauSt.test.ts). Les sous-traitants qui travaillent chez STC Bâtiment : lib/cockpitStc.ts.
// Règles :
//   · contacté = au moins un envoi réussi de la machine (sa date : le premier envoi réussi) ;
//   · a cliqué = un lien de candidature ou le barème ouvert, HORS ROBOTS : un clic à moins de 2 secondes d'un autre
//     clic du même artisan est une rafale de robot de messagerie (les liens ouverts d'un coup pour les vérifier) ;
//   · lien avec STC Bâtiment = l'e-mail : un compte STC « issu de la machine » porte l'e-mail d'une fiche ou d'un
//     dossier du recrutement ; « site, hors base » = l'e-mail n'est que celui d'un dossier sans fiche ;
//   · mois et semaines à l'heure du poste (Paris) ; comparaisons de mois à jours égaux (du 1er au même quantième).
// ════════════════════════════════════════════════════════════════════════════
import type { ClicST, DossierST, EnvoiST, ObjectifMetier, SousTraitant } from "../recrutement"
import { CORPS_METIERS, dispoAContacter, exerceCorps } from "./recrutementCalc"
import { estActif, type LigneSt } from "./cockpitStc"

const JOUR = 86_400_000
export const RAFALE_MS = 2_000
const moisIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

/** Les artisans qui ont vraiment cliqué (hors rafales de robots), et la date de leur premier vrai clic. */
export function clicsHorsRobots(clics: ClicST[]): { premier: Map<string, string>; robotsSeuls: number; rafale: { clics: number; artisans: number } } {
  const par = new Map<string, number[]>()
  for (const c of clics) if (c.destination !== "stop") par.set(c.sousTraitantId, [...(par.get(c.sousTraitantId) ?? []), new Date(c.cliqueLe).getTime()])
  const premier = new Map<string, string>()
  let robotsSeuls = 0, nRafale = 0, artisansRafale = 0
  for (const [id, l] of par) {
    const t = [...l].sort((a, b) => a - b)
    const rafale = t.map((x, i) => (i > 0 && x - t[i - 1] < RAFALE_MS) || (i + 1 < t.length && t[i + 1] - x < RAFALE_MS))
    const vrais = t.filter((_, i) => !rafale[i])
    const r = rafale.filter(Boolean).length
    nRafale += r
    if (r) artisansRafale++
    if (vrais.length) premier.set(id, new Date(vrais[0]).toISOString())
    else robotsSeuls++
  }
  return { premier, robotsSeuls, rafale: { clics: nRafale, artisans: artisansRafale } }
}

/** Le premier envoi réussi de chaque fiche : sa date de premier contact. */
export function premiersContacts(envois: EnvoiST[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const e of envois) if (e.statut === "envoye" && (!m.has(e.sousTraitantId) || e.envoyeLe < m.get(e.sousTraitantId)!)) m.set(e.sousTraitantId, e.envoyeLe)
  return m
}

/** Combien de dates dans [de ; a[. */
const entre = (dates: (string | null | undefined)[], de: Date, a: Date) => dates.filter((d) => d && new Date(d).getTime() >= de.getTime() && new Date(d).getTime() < a.getTime()).length
/** Ce mois-ci et le mois d'avant, du 1er au même instant (à jours égaux). */
export function moisAuJour(dates: (string | null | undefined)[], m: Date): { mois: number; avant: number } {
  const finAvant = new Date(m.getFullYear(), m.getMonth(), 0).getDate()
  return {
    mois: entre(dates, new Date(m.getFullYear(), m.getMonth(), 1), new Date(m.getTime() + 1)),
    avant: entre(dates, new Date(m.getFullYear(), m.getMonth() - 1, 1), new Date(m.getFullYear(), m.getMonth() - 1, Math.min(m.getDate(), finAvant), m.getHours(), m.getMinutes(), m.getSeconds() + 1)),
  }
}
/** Par mois, de `debut` (AAAA-MM) au mois en cours. */
export function parMois(dates: (string | null | undefined)[], debut: string, m: Date): { mois: string[]; n: number[] } {
  const mois: string[] = []
  for (let d = new Date(Number(debut.slice(0, 4)), Number(debut.slice(5, 7)) - 1, 1); moisIso(d) <= moisIso(m); d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) mois.push(moisIso(d))
  return { mois, n: mois.map((x) => dates.filter((d) => d && moisIso(new Date(d)) === x).length) }
}
/** Par semaine, sur les lundis donnés (la dernière semaine va jusqu'à maintenant). */
export const parSemaines = (dates: (string | null | undefined)[], lundis: Date[], m: Date): number[] =>
  lundis.map((l, i) => entre(dates, l, i + 1 < lundis.length ? lundis[i + 1] : new Date(m.getTime() + 1)))

/** L'origine d'un compte STC : la machine (fiche ou dossier), le site sans fiche, ou rien. */
export function origineParEmail(fiches: Pick<SousTraitant, "email">[], dossiers: Pick<DossierST, "email" | "sousTraitantId">[]): (email: string) => "machine" | "hors base" | null {
  const fichesMails = new Set(fiches.map((f) => norm(f.email)).filter(Boolean))
  const dossiersAvecFiche = new Set(dossiers.filter((d) => d.sousTraitantId).map((d) => norm(d.email)).filter(Boolean))
  const dossiersSansFiche = new Set(dossiers.filter((d) => !d.sousTraitantId).map((d) => norm(d.email)).filter(Boolean))
  return (email) => {
    const e = norm(email)
    if (!e) return null
    if (fichesMails.has(e) || dossiersAvecFiche.has(e)) return "machine"
    return dossiersSansFiche.has(e) ? "hors base" : null
  }
}

// Les mots qui rattachent la spécialité libre d'un compte STC à un corps de métier (un artisan multi-corps compte dans chacun).
const MOTS_CORPS: Record<string, string[]> = {
  "Peinture": ["peint"], "Plomberie / sanitaire": ["plomb", "sanitaire"], "Électricité": ["electri"], "Revêtements de sols et carrelage": ["sol", "carrel"],
  "Plâtrerie / placo / isolation": ["platr", "placo", "isolat", "cloison"], "Menuiserie": ["menuis"], "Chauffage / VMC / ventilation": ["chauff", "vmc", "ventil"],
}
export const stDuCorps = (metier: string, corps: string) => (MOTS_CORPS[corps] ?? [norm(corps)]).some((m) => norm(metier).includes(m))

export type LigneCorps = { corps: string; libelle: string; objectif: number; base: number; reste: number; contactes: number; cliques: number; deposes: number; actifsStc: number }
/** Par corps de métier : le besoin (objectif par semaine de la machine), la base, ce qu'il reste à contacter, le parcours, les actifs chez STC. */
export function parCorps(fiches: SousTraitant[], objectifs: ObjectifMetier[], contactes: Map<string, string>, cliques: Map<string, string>, actifsStc: LigneSt[]): LigneCorps[] {
  return CORPS_METIERS.map((c) => {
    const du = fiches.filter((f) => exerceCorps(f, c.value))
    return {
      corps: c.value, libelle: c.label,
      objectif: objectifs.filter((o) => o.actif && norm(o.metier) === norm(c.value)).reduce((t, o) => t + o.objectifHebdo, 0),
      base: du.length, reste: dispoAContacter(fiches, c.value),
      contactes: du.filter((f) => f.id && contactes.has(f.id)).length,
      cliques: du.filter((f) => f.id && cliques.has(f.id)).length,
      deposes: du.filter((f) => f.deposeLe || f.statut === "depose").length,
      actifsStc: actifsStc.filter((s) => estActif(s) && stDuCorps(s.metier, c.value)).length,
    }
  })
}

/** La zone d'une fiche, rangée : Paris, Petite couronne, Grande couronne, Autre ou vide. */
export function zoneRangee(z: string): string {
  const n = norm(z)
  if (!n) return "Autre ou vide"
  if (/grande/.test(n)) return "Grande couronne"
  if (/petite/.test(n)) return "Petite couronne"
  if (/paris|^75/.test(n)) return "Paris"
  return "Autre ou vide"
}
export function parZone(fiches: SousTraitant[], contactes: Map<string, string>, cliques: Map<string, string>): { zone: string; base: number; reste: number; contactes: number; cliques: number; deposes: number }[] {
  const ordre = ["Grande couronne", "Petite couronne", "Paris", "Autre ou vide"]
  return ordre.map((zone) => {
    const du = fiches.filter((f) => zoneRangee(f.zone) === zone)
    return { zone, base: du.length, reste: du.filter((f) => f.statut === "a_contacter").length, contactes: du.filter((f) => f.id && contactes.has(f.id)).length, cliques: du.filter((f) => f.id && cliques.has(f.id)).length, deposes: du.filter((f) => f.deposeLe || f.statut === "depose").length }
  }).filter((z) => z.base > 0)
}

/** Les actifs chez STC par secteur (un artisan qui couvre plusieurs secteurs compte dans chacun). */
export function parSecteur(actifs: LigneSt[]): { secteur: string; actifs: number; noms: string }[] {
  const m = new Map<string, string[]>()
  for (const s of actifs) for (const x of s.secteurs.length ? s.secteurs : ["Pas de secteur"]) m.set(x, [...(m.get(x) ?? []), s.nom])
  return [...m.entries()].map(([secteur, noms]) => ({ secteur, actifs: noms.length, noms: noms.join(", ") })).sort((a, b) => (a.secteur === "Pas de secteur" ? 1 : b.secteur === "Pas de secteur" ? -1 : a.secteur.localeCompare(b.secteur, "fr")))
}

/** Les jours écoulés depuis une date (au jour près). */
export const joursDepuis = (iso: string, m: Date) => { const d = new Date(iso); return Math.round((new Date(m.getFullYear(), m.getMonth(), m.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / JOUR) }
