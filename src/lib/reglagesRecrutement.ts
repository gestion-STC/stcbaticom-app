// ════════════════════════════════════════════════════════════════════════════
// LES RÉGLAGES DE LA MACHINE DE RECRUTEMENT — la règle, sans écran
//
// Mahdi, 08/10/2026 : les réglages quittent l'écran « Machine » (qui ne garde
// que l'interrupteur et les campagnes par corps de métier) pour vivre dans
// Réglages → onglet « Recrutement ». Ce fichier porte ce qui se teste sans
// navigateur : la validation avant enregistrement, le tri des champs qui
// appartiennent à l'onglet, la ligne d'état, et les jours de la semaine.
// ════════════════════════════════════════════════════════════════════════════
import type { PilotageST } from "../recrutement"

/** Les jours, numérotés comme en base (1 = lundi … 7 = dimanche). */
export const JOURS_SEMAINE: { n: number; court: string; long: string }[] = [
  { n: 1, court: "Lun", long: "Lundi" },
  { n: 2, court: "Mar", long: "Mardi" },
  { n: 3, court: "Mer", long: "Mercredi" },
  { n: 4, court: "Jeu", long: "Jeudi" },
  { n: 5, court: "Ven", long: "Vendredi" },
  { n: 6, court: "Sam", long: "Samedi" },
  { n: 7, court: "Dim", long: "Dimanche" },
]

/** Le seul domaine d'envoi vérifié chez Resend : une autre adresse serait refusée à l'envoi. */
export const DOMAINE_ENVOI = "crm.stcbatiment.fr"

// Bornes de cadence : en dessous de 300 ms on dépasse ce que Resend accepte
// (~2 envois/s) ; au-dessus d'une minute, le passage n'arrive plus à vider
// sa journée.
export const CADENCE_MIN_MS = 300
export const CADENCE_MAX_MS = 60_000

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HEURE_VALIDE = /^([01]\d|2[0-3]):[0-5]\d$/

export const emailValide = (s: string) => EMAIL_VALIDE.test(s.trim())
const heureValide = (s: string) => HEURE_VALIDE.test(s)

// Un nombre fini dans les bornes (NaN = champ vidé à l'écran → refusé).
const dansBornes = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max
const entierDansBornes = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max

/** Les champs que l'onglet Réglages a le droit d'écrire — jamais l'interrupteur ni l'objectif global. */
export const CHAMPS_REGLAGES = [
  "plafondJour", "plafondSmsJour", "cadenceEmailMs", "cadenceSmsMs",
  "heureMin", "heureMax", "heureMinSms", "heureMaxSms", "jours", "sequenceId",
  "delaiMinTouchesH", "tentativesMax", "abandonApresJours",
  "alerteEmail", "seuilErreursPct", "emailTest", "adresseEnvoi", "recalerAuDemarrage",
] as const satisfies readonly (keyof PilotageST)[]

export type Reglages = Pick<PilotageST, (typeof CHAMPS_REGLAGES)[number]>

/**
 * Ne garde que les champs de l'onglet. C'est ce qui part à `majPilotage` :
 * on n'enverra jamais `actif` depuis ici, sinon un onglet resté ouvert
 * pourrait rallumer (ou éteindre) la machine sans qu'on l'ait voulu.
 */
export function extraireReglages(p: PilotageST): Reglages {
  const r = {} as Record<string, unknown>
  for (const k of CHAMPS_REGLAGES) r[k] = p[k]
  return r as Reglages
}

/** Deux jeux de réglages disent-ils la même chose ? (sert au bouton « Enregistrer » grisé) */
export function memesReglages(a: PilotageST, b: PilotageST): boolean {
  return JSON.stringify(extraireReglages(a)) === JSON.stringify(extraireReglages(b))
}

/** La liste des erreurs, en français ; vide = on peut enregistrer. */
export function validerReglages(p: PilotageST): string[] {
  const e: string[] = []

  if (!entierDansBornes(p.plafondJour, 1, Number.MAX_SAFE_INTEGER)) e.push("Le plafond d'e-mails par jour doit être un nombre entier d'au moins 1.")
  if (!entierDansBornes(p.plafondSmsJour, 1, Number.MAX_SAFE_INTEGER)) e.push("Le plafond de SMS par jour doit être un nombre entier d'au moins 1.")
  if (!dansBornes(p.cadenceEmailMs, CADENCE_MIN_MS, CADENCE_MAX_MS)) e.push(`La cadence e-mail doit être entre ${CADENCE_MIN_MS} et ${CADENCE_MAX_MS} ms.`)
  if (!dansBornes(p.cadenceSmsMs, CADENCE_MIN_MS, CADENCE_MAX_MS)) e.push(`La cadence SMS doit être entre ${CADENCE_MIN_MS} et ${CADENCE_MAX_MS} ms.`)

  // Heures : au format HH:MM, et le début avant la fin, pour chaque canal.
  // Comparer les chaînes suffit : « 09:00 » < « 18:00 » caractère par caractère.
  if (!heureValide(p.heureMin) || !heureValide(p.heureMax)) e.push("Les heures d'envoi des e-mails doivent être au format HH:MM.")
  else if (p.heureMin >= p.heureMax) e.push("Pour les e-mails, l'heure de début doit être avant l'heure de fin.")
  if (!heureValide(p.heureMinSms) || !heureValide(p.heureMaxSms)) e.push("Les heures d'envoi des SMS doivent être au format HH:MM.")
  else if (p.heureMinSms >= p.heureMaxSms) e.push("Pour les SMS, l'heure de début doit être avant l'heure de fin.")

  if (!Array.isArray(p.jours) || p.jours.length === 0) e.push("Choisissez au moins un jour d'envoi.")
  else if (p.jours.some((j) => !entierDansBornes(j, 1, 7))) e.push("Un jour d'envoi est inconnu (attendu : 1 = lundi … 7 = dimanche).")

  if (!entierDansBornes(p.tentativesMax, 1, 10)) e.push("Le nombre de tentatives doit être entre 1 et 10.")
  if (!dansBornes(p.delaiMinTouchesH, 0, 720)) e.push("Le délai minimum entre deux touches doit être entre 0 et 720 heures (30 jours).")
  if (!entierDansBornes(p.abandonApresJours, 1, 365)) e.push("L'abandon des étapes en retard doit être entre 1 et 365 jours.")
  if (!dansBornes(p.seuilErreursPct, 1, 100)) e.push("Le seuil d'erreurs doit être entre 1 et 100 %.")

  if (p.alerteEmail.trim() && !emailValide(p.alerteEmail)) e.push("L'e-mail d'alerte n'est pas une adresse valide.")
  if (p.emailTest.trim() && !emailValide(p.emailTest)) e.push("L'adresse de test n'est pas une adresse valide.")

  const envoi = p.adresseEnvoi.trim().toLowerCase()
  if (!emailValide(envoi) || !envoi.endsWith(`@${DOMAINE_ENVOI}`)) e.push(`L'adresse d'envoi doit être une adresse @${DOMAINE_ENVOI} (le seul domaine vérifié chez Resend).`)

  return e
}

const dateLongue = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })

/** « Machine en marche depuis le 8 octobre 2026 à 09:12 » — l'interrupteur, lui, est sur l'écran Machine. */
export function ligneEtatMachine(p: Pick<PilotageST, "actif" | "actifDepuis" | "arreteLe">): string {
  if (p.actif) return p.actifDepuis ? `Machine en marche depuis le ${dateLongue(p.actifDepuis)}.` : "Machine en marche."
  return p.arreteLe ? `Machine à l'arrêt depuis le ${dateLongue(p.arreteLe)}.` : "Machine à l'arrêt."
}
