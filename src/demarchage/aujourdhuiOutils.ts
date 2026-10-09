// ════════════════════════════════════════════════════════════════════════════
// LES OUTILS DES ÉCRANS « AUJOURD'HUI », « AGENDA » ET DES RAPPELS DE RDV
//
// Des calculs purs (bornes de jour / semaine / mois, groupement des tâches par
// moment, taux, progression d'objectif, libellés relatifs) testés dans
// aujourdhuiOutils.test.ts, et deux petits comptes en base qui manquaient à
// db.ts (on ne touche pas à db.ts : d'autres chantiers y travaillent).
// Aucun `new Date()` ici sans paramètre : « maintenant » vient toujours de
// l'appelant, c'est ce qui rend tout testable et le rendu pur.
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from "../lib/supabase"
import type { StatsCompte, TacheAgenda } from "./db"
import { ETAPES, ETAPES_ACTIVES, SORTIES, libelleEtape, pastilleEtape, type RolePastille } from "./modele"

const MIN_MS = 60_000
const HEURE_MS = 3_600_000
export const JOUR_MS = 86_400_000

// ── Les bornes (heure locale du navigateur ; la borne de fin est EXCLUE) ──
export function debutDuJour(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
export function finDuJour(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
}
/** Le lundi 0 h de la semaine de `d`. */
export function debutDeSemaine(d: Date): Date {
  const recul = (d.getDay() + 6) % 7 // lundi = 0 … dimanche = 6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - recul)
}
/** Le lundi suivant, 0 h. */
export function finDeSemaine(d: Date): Date {
  const lundi = debutDeSemaine(d)
  return new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + 7)
}
export function debutDuMois(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
export function finDuMois(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1)
}
/** Les sept jours de la semaine de `d`, du lundi au dimanche, à 0 h. */
export function joursDeLaSemaine(d: Date): Date[] {
  const lundi = debutDeSemaine(d)
  return Array.from({ length: 7 }, (_, i) => new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + i))
}
export function memeJour(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
export function ajouterJours(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes())
}

// ── Les dates à proposer pour « Reporter » ──
export function demainA(maintenant: Date, heure = 10): Date {
  return new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1, heure, 0, 0, 0)
}
export function dansNJoursA(maintenant: Date, n: number, heure = 10): Date {
  return new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + n, heure, 0, 0, 0)
}
/** « 2026-10-12 » + « 14:30 » → la date locale ; null si l'un des deux manque ou est illisible. */
export function composerDate(jour: string, heure: string): Date | null {
  const j = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour || "")
  const h = /^(\d{1,2}):(\d{2})$/.exec(heure || "")
  if (!j || !h) return null
  const d = new Date(Number(j[1]), Number(j[2]) - 1, Number(j[3]), Number(h[1]), Number(h[2]), 0, 0)
  return Number.isNaN(d.getTime()) ? null : d
}
/** La date d'une échéance découpée pour deux champs date + heure. */
export function decomposerDate(iso: string | null): { jour: string; heure: string } {
  if (!iso) return { jour: "", heure: "" }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { jour: "", heure: "" }
  return { jour: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, heure: heureCourte(d) }
}

// ── Les libellés ──
/** « vendredi 9 octobre ». */
export function dateLongue(d: Date): string {
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
}
/** « ven. 9 oct. ». */
export function dateCourte(d: Date): string {
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
}
/** « 14:05 ». */
export function heureCourte(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(x.getTime())) return ""
  return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`
}
/** « 9 – 15 octobre » ou « 28 septembre – 4 octobre » : l'intitulé d'une semaine. */
export function libelleSemaine(d: Date): string {
  const jours = joursDeLaSemaine(d)
  const a = jours[0], b = jours[6]
  const moisA = a.toLocaleDateString("fr-FR", { month: "long" })
  const moisB = b.toLocaleDateString("fr-FR", { month: "long" })
  return moisA === moisB ? `${a.getDate()} – ${b.getDate()} ${moisA}` : `${a.getDate()} ${moisA} – ${b.getDate()} ${moisB}`
}

/**
 * Un libellé relatif, du point de vue de « maintenant » :
 * « à l'instant », « dans 5 min », « dans 2 h », « demain », « dans 3 j »,
 * « il y a 20 min », « il y a 3 h », « hier », « il y a 5 j », sinon la date courte.
 */
export function libelleRelatif(date: Date | string, maintenant: Date): string {
  const t = typeof date === "string" ? new Date(date) : date
  if (Number.isNaN(t.getTime())) return ""
  const ecart = t.getTime() - maintenant.getTime()
  const abs = Math.abs(ecart)
  if (abs < MIN_MS) return "à l'instant"
  const futur = ecart > 0
  if (abs < HEURE_MS) {
    const min = Math.round(abs / MIN_MS)
    return futur ? `dans ${min} min` : `il y a ${min} min`
  }
  if (memeJour(t, maintenant)) {
    const h = Math.round(abs / HEURE_MS)
    return futur ? `dans ${h} h` : `il y a ${h} h`
  }
  const jours = Math.round((debutDuJour(t).getTime() - debutDuJour(maintenant).getTime()) / JOUR_MS)
  if (jours === 1) return "demain"
  if (jours === -1) return "hier"
  if (Math.abs(jours) < 7) return jours > 0 ? `dans ${jours} j` : `il y a ${-jours} j`
  return dateCourte(t)
}

// ── Les tâches du jour, groupées par moment ──
export type MomentTache = "rdv" | "enRetard" | "ceMatin" | "cetApresMidi" | "plusTard"
export type TachesParMoment = Record<MomentTache, TacheAgenda[]>
/** L'heure (locale) à partir de laquelle on est « cet après-midi ». */
export const HEURE_APRES_MIDI = 13

/** Vrai si la tâche n'est pas faite et que son heure est passée. */
export function estEnRetard(t: Pick<TacheAgenda, "echeance" | "faitLe">, maintenant: Date): boolean {
  if (t.faitLe || !t.echeance) return false
  return new Date(t.echeance).getTime() < maintenant.getTime()
}

/**
 * Les RDV du jour à part (en tête), puis : en retard = les jours d'avant ;
 * ce matin / cet après-midi = aujourd'hui, avant / après 13 h ; plus tard =
 * après aujourd'hui. Une tâche sans échéance va dans « en retard » (elle
 * n'aurait pas dû exister). Chaque groupe est trié par heure.
 */
export function grouperTaches(taches: TacheAgenda[], maintenant: Date): TachesParMoment {
  const out: TachesParMoment = { rdv: [], enRetard: [], ceMatin: [], cetApresMidi: [], plusTard: [] }
  const debut = debutDuJour(maintenant).getTime()
  const fin = finDuJour(maintenant).getTime()
  for (const t of taches) {
    const e = t.echeance ? new Date(t.echeance) : null
    const ms = e ? e.getTime() : Number.NEGATIVE_INFINITY
    if (ms >= debut && ms < fin && t.type === "rdv") out.rdv.push(t)
    else if (ms < debut) out.enRetard.push(t)
    else if (ms >= fin) out.plusTard.push(t)
    else if (e && e.getHours() < HEURE_APRES_MIDI) out.ceMatin.push(t)
    else out.cetApresMidi.push(t)
  }
  const parHeure = (x: TacheAgenda, y: TacheAgenda) => (x.echeance ?? "").localeCompare(y.echeance ?? "")
  for (const k of Object.keys(out) as MomentTache[]) out[k].sort(parHeure)
  return out
}

/** Les tâches d'un jour, groupées par heure pleine (« 09:00 », « 14:00 »…), dans l'ordre. */
export function grouperParHeure(taches: TacheAgenda[]): { heure: string; taches: TacheAgenda[] }[] {
  const groupes = new Map<string, TacheAgenda[]>()
  for (const t of [...taches].sort((x, y) => (x.echeance ?? "").localeCompare(y.echeance ?? ""))) {
    const d = t.echeance ? new Date(t.echeance) : null
    const cle = d ? `${String(d.getHours()).padStart(2, "0")}:00` : "Sans heure"
    const g = groupes.get(cle) ?? []
    g.push(t)
    groupes.set(cle, g)
  }
  return [...groupes.entries()].map(([heure, taches]) => ({ heure, taches }))
}

// ── Les taux et l'objectif ──
export const pourcent = (n: number, d: number): number => (d > 0 ? Math.round((100 * n) / d) : 0)
/** Le taux de gestionnaires joints sur les appels passés. */
export function tauxJoints(s: Pick<StatsCompte, "appels" | "joints">): number {
  return pourcent(s.joints, s.appels)
}
/** La ligne « Total » d'un tableau par commercial. */
export function totalStats(stats: StatsCompte[]): StatsCompte {
  const t: StatsCompte = { compteNom: "Total", appels: 0, joints: 0, interesses: 0, rdv: 0, pasInteresses: 0, dureeS: 0 }
  for (const s of stats) {
    t.appels += s.appels; t.joints += s.joints; t.interesses += s.interesses; t.rdv += s.rdv; t.pasInteresses += s.pasInteresses; t.dureeS += s.dureeS
  }
  return t
}
/** L'objectif lu dans `parametres` : un entier > 0, sinon 0 (= pas d'objectif fixé). */
export function lireObjectif(valeur: string | null | undefined): number {
  const n = Number(valeur)
  return valeur && Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}
export type Progression = { pct: number; atteint: boolean; reste: number }
export function progressionObjectif(recus: number, objectif: number): Progression {
  if (objectif <= 0) return { pct: 0, atteint: false, reste: 0 }
  return { pct: Math.min(100, pourcent(recus, objectif)), atteint: recus >= objectif, reste: Math.max(0, objectif - recus) }
}

// ── Où en est la base : la barre segmentée des étapes ──
export type SegmentBase = { code: string; libelle: string; n: number; pct: number; fond: string; texte: string }
// Les couleurs de fond : les mêmes teintes que la pastille de l'étape (écrites en
// toutes lettres, Tailwind ne génère que les classes qu'il lit dans le code).
const FOND_PAR_ROLE: Record<RolePastille, { fond: string; texte: string }> = {
  fait: { fond: "bg-ok-fond", texte: "text-ok" },
  actif: { fond: "bg-signature-doux", texte: "text-signature" },
  info: { fond: "bg-info-fond", texte: "text-info" },
  attente: { fond: "bg-attention-fond", texte: "text-attention" },
  probleme: { fond: "bg-alerte-fond", texte: "text-alerte" },
  inerte: { fond: "bg-fond-3", texte: "text-encre-2" },
}
export function segmentsBase(parEtape: Record<string, number>): SegmentBase[] {
  const codes = [...ETAPES.map((e) => e.code), ...SORTIES.map((s) => s.code)]
  const total = codes.reduce((s, c) => s + (parEtape[c] ?? 0), 0)
  return codes.map((code) => {
    const n = parEtape[code] ?? 0
    const teinte = FOND_PAR_ROLE[pastilleEtape(code)]
    return { code, libelle: libelleEtape(code), n, pct: pourcent(n, total), ...teinte }
  })
}

// ── La fenêtre de rappel d'un RDV : de 5 min avant à 20 min après ──
export const RAPPEL_AVANT_MIN = 5
export const RAPPEL_APRES_MIN = 20
export function dansLaFenetreDeRappel(echeance: string | null, maintenantMs: number): boolean {
  if (!echeance) return false
  const t = new Date(echeance).getTime()
  if (Number.isNaN(t)) return false
  return maintenantMs >= t - RAPPEL_AVANT_MIN * MIN_MS && maintenantMs <= t + RAPPEL_APRES_MIN * MIN_MS
}

// ── Deux comptes en base qui manquaient (count exact, sans charger les lignes) ──
function sb() {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  return supabase
}
/** Les agences actives (pas une sortie, pas un apporteur) dont aucun gestionnaire n'a jamais été joint. */
export async function compterAgencesJamaisJointes(): Promise<number> {
  const { count, error } = await sb().from("agences_liste").select("id", { count: "exact", head: true }).neq("type", "apporteur").in("etape", ETAPES_ACTIVES).eq("joint_fois", 0)
  if (error) throw new Error(error.message)
  return count ?? 0
}
/** Les endormies dont la date de réveil tombe entre deux dates (fin exclue). */
export async function compterReveils(de: Date, a: Date): Promise<number> {
  const { count, error } = await sb().from("agences_liste").select("id", { count: "exact", head: true }).neq("type", "apporteur").eq("etape", "endormie").gte("reveil_le", jourIso(de)).lt("reveil_le", jourIso(a))
  if (error) throw new Error(error.message)
  return count ?? 0
}
const jourIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
