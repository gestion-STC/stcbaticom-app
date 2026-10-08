// Les chiffres de l'écran Machine, calculés sans le DOM ni la base : à partir
// des fiches, du journal des envois, des clics, des dossiers et des passages.
// Tout est testé dans statsMachine.test.ts.
import type { ClicST, DossierST, EnvoiST, ObjectifMetier, PassageST, SousTraitant } from "../recrutement"
import { CORPS_METIERS, exerceCorps } from "./recrutementCalc"

const JOUR_MS = 86_400_000
const dans = (iso: string | null | undefined, depuis: number) => !!iso && new Date(iso).getTime() >= depuis
/** Le début du jour civil (heure locale du navigateur). */
export function debutDuJour(maintenant: number): number {
  const d = new Date(maintenant)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// ── Aujourd'hui ──────────────────────────────────────────────────────────────
export type Aujourdhui = { mails: number; sms: number; erreurs: number; rejoues: number; enAttenteDeRejeu: number }
export function compterAujourdhui(envois: EnvoiST[], maintenant = Date.now()): Aujourdhui {
  const depuis = debutDuJour(maintenant)
  const jour = envois.filter((e) => dans(e.envoyeLe, depuis))
  return {
    mails: jour.filter((e) => e.statut === "envoye" && e.canal === "email").length,
    sms: jour.filter((e) => e.statut === "envoye" && e.canal === "sms").length,
    erreurs: jour.filter((e) => e.statut === "erreur").length,
    rejoues: jour.filter((e) => e.statut === "envoye" && e.tentative > 1).length,
    enAttenteDeRejeu: envois.filter((e) => e.statut === "erreur" && !!e.rejouerApres).length,
  }
}

// ── La série par jour (activité) ─────────────────────────────────────────────
export type PointJour = { jour: string; mails: number; sms: number; erreurs: number; clics: number; depots: number; demarres: number }
const cleJour = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
export function seriesParJour(envois: EnvoiST[], clics: ClicST[], fiches: SousTraitant[], jours: number, maintenant = Date.now()): PointJour[] {
  const points = new Map<string, PointJour>()
  const premier = debutDuJour(maintenant) - (jours - 1) * JOUR_MS
  for (let i = 0; i < jours; i++) {
    const cle = cleJour(premier + i * JOUR_MS)
    points.set(cle, { jour: cle, mails: 0, sms: 0, erreurs: 0, clics: 0, depots: 0, demarres: 0 })
  }
  const au = (iso: string | null | undefined) => (iso ? points.get(cleJour(new Date(iso).getTime())) : undefined)
  for (const e of envois) {
    const p = au(e.envoyeLe)
    if (!p) continue
    if (e.statut === "erreur") p.erreurs++
    else if (e.statut === "envoye" && e.canal === "sms") p.sms++
    else if (e.statut === "envoye") p.mails++
  }
  for (const c of clics) { const p = au(c.cliqueLe); if (p && c.destination !== "stop") p.clics++ }
  for (const f of fiches) {
    const d = au(f.deposeLe); if (d) d.depots++
    const m = au(f.demarreLe); if (m) m.demarres++
  }
  return [...points.values()]
}

// ── Les erreurs, par cause ───────────────────────────────────────────────────
export type ErreurParCause = { cause: string; n: number; dernier: string; enAttente: number; abandonnees: number }
export function erreursParCause(envois: EnvoiST[], depuis: number): ErreurParCause[] {
  const map = new Map<string, ErreurParCause>()
  for (const e of envois) {
    if ((e.statut !== "erreur" && e.statut !== "abandonne") || !dans(e.envoyeLe, depuis)) continue
    const cause = e.cause || e.erreur.slice(0, 60) || "(sans détail)"
    const r = map.get(cause) ?? { cause, n: 0, dernier: "", enAttente: 0, abandonnees: 0 }
    r.n++
    if (e.envoyeLe > r.dernier) r.dernier = e.envoyeLe
    if (e.statut === "erreur" && e.rejouerApres) r.enAttente++
    if (e.statut === "abandonne") r.abandonnees++
    map.set(cause, r)
  }
  return [...map.values()].sort((a, b) => b.n - a.n)
}

// ── Le tunnel ────────────────────────────────────────────────────────────────
export type Tunnel = { demarres: number; joints: number; cliques: number; deposes: number }
/** Fenêtre en jours (0 = tout l'historique), corps de métier facultatif. */
export function tunnel(fiches: SousTraitant[], jours: number, corps = "", maintenant = Date.now()): Tunnel {
  const depuis = jours > 0 ? maintenant - jours * JOUR_MS : 0
  const base = fiches.filter((f) => f.demarreLe && dans(f.demarreLe, depuis) && (!corps || exerceCorps(f, corps)))
  return {
    demarres: base.length,
    joints: base.filter((f) => f.nbEnvoisOk > 0).length,
    cliques: base.filter((f) => !!f.candidatureClicLe || !!f.baremeVuLe || f.nbClics > 0).length,
    deposes: base.filter((f) => f.statut === "depose" || !!f.deposeLe).length,
  }
}
export const pourcent = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : 0)

// ── Les campagnes, corps par corps ───────────────────────────────────────────
export type LigneCampagne = {
  corps: string; libelle: string; voulu: number; actif: boolean; enSequence: number; demarres7j: number
  joints: number; clics: number; depots: number; taux: number; dispo: number; objectifId?: string
}
export function campagnes(fiches: SousTraitant[], objectifs: ObjectifMetier[], jours: number, maintenant = Date.now()): LigneCampagne[] {
  const depuis7j = maintenant - 7 * JOUR_MS
  return objectifs.map((o) => {
    const t = tunnel(fiches, jours, o.metier, maintenant)
    const libelle = CORPS_METIERS.find((c) => c.value === o.metier)?.label ?? o.metier
    return {
      corps: o.metier, libelle, voulu: o.objectifHebdo, actif: o.actif, objectifId: o.id,
      enSequence: fiches.filter((f) => f.statut === "en_sequence" && exerceCorps(f, o.metier)).length,
      demarres7j: fiches.filter((f) => exerceCorps(f, o.metier) && dans(f.demarreLe, depuis7j)).length,
      joints: t.joints, clics: t.cliques, depots: t.deposes, taux: t.demarres > 0 ? t.deposes / t.demarres : 0,
      dispo: fiches.filter((f) => f.statut === "a_contacter" && exerceCorps(f, o.metier) && !f.emailInvalide).length,
    }
  })
}

// ── Dans combien de temps la base sera-t-elle vide ? ─────────────────────────
/** Jours restants au rythme des 7 derniers jours ; null si rien ne démarre. */
export function joursAvantEpuisement(fiches: SousTraitant[], maintenant = Date.now()): number | null {
  const depuis7j = maintenant - 7 * JOUR_MS
  const demarres7j = fiches.filter((f) => dans(f.demarreLe, depuis7j)).length
  const reste = fiches.filter((f) => f.statut === "a_contacter").length
  if (demarres7j === 0) return null
  return Math.ceil(reste / (demarres7j / 7))
}

// ── À traiter ────────────────────────────────────────────────────────────────
export type ATraiter = {
  interesses: SousTraitant[] // ont cliqué « candidater » sans déposer
  reponses: number // messages entrants non lus de l'espace recrutement (fourni)
  erreursEnAttente: number
  dossiersSansFiche: DossierST[]
  dossiersATraiter: DossierST[]
  desinscrits7j: SousTraitant[]
}
export function aTraiter(fiches: SousTraitant[], envois: EnvoiST[], dossiers: DossierST[], reponsesNonLues: number, maintenant = Date.now()): ATraiter {
  const depuis7j = maintenant - 7 * JOUR_MS
  return {
    interesses: fiches
      .filter((f) => f.candidatureClicLe && !f.deposeLe && f.statut !== "depose" && f.statut !== "desinscrit")
      .sort((a, b) => (b.candidatureClicLe! > a.candidatureClicLe! ? 1 : -1)),
    reponses: reponsesNonLues,
    erreursEnAttente: envois.filter((e) => e.statut === "erreur" && !!e.rejouerApres).length,
    dossiersSansFiche: dossiers.filter((d) => !d.sousTraitantId),
    dossiersATraiter: dossiers.filter((d) => !d.traiteLe),
    desinscrits7j: fiches.filter((f) => f.statut === "desinscrit" && dans(f.desinscritLe, depuis7j)),
  }
}

// ── Le dernier passage et la machine ─────────────────────────────────────────
export type EtatPassages = { dernier: PassageST | null; enCours: boolean; depuisMs: number | null; prochainDansMs: number | null }
export function etatDesPassages(passages: PassageST[], periodeMin = 15, maintenant = Date.now()): EtatPassages {
  const dernier = passages[0] ?? null
  if (!dernier) return { dernier: null, enCours: false, depuisMs: null, prochainDansMs: null }
  const debut = new Date(dernier.debut).getTime()
  const enCours = !dernier.fin && maintenant - debut < 10 * 60_000
  const prochain = debut + periodeMin * 60_000
  return { dernier, enCours, depuisMs: maintenant - debut, prochainDansMs: Math.max(0, prochain - maintenant) }
}

/** « il y a 4 min », « il y a 2 h », « il y a 3 j ». */
export function depuis(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} j`
}
/** « dans 4 min » */
export function dansCombien(ms: number): string {
  const min = Math.ceil(ms / 60_000)
  return min <= 0 ? "maintenant" : `dans ${min} min`
}
