// Session de call · Recrutement (11/10/2026) — la partie PURE : les libellés,
// qui est un lead, dans quel ordre on les appelle. Testée dans appelsStOutils.test.ts.
// Les règles d'après-appel (rappels, injoignable, arrêt de séquence) sont dans
// la base : `st_appel_enregistrer`. Ici on ne fait que décrire et trier.
import type { SousTraitant } from "../recrutement"

export type ResultatST = "pas_de_reponse" | "standard" | "joint" | "faux_numero"
export type IssueST = "" | "va_deposer" | "a_rappeler" | "pas_interesse" | "hors_cible"
export type SuiviST = "" | "a_rappeler" | "va_deposer" | "pas_interesse" | "hors_cible" | "injoignable"
export type FileST = "leads" | "rappels" | "promis"

export const RESULTATS_ST: { code: ResultatST; touche: string; libelle: string; aide: string }[] = [
  { code: "pas_de_reponse", touche: "1", libelle: "Pas de réponse", aide: "Personne n'a décroché : nouvel essai le prochain jour ouvré à 10 h." },
  { code: "standard", touche: "2", libelle: "Quelqu'un d'autre", aide: "Joint quelqu'un, mais pas l'artisan : nouvel essai le prochain jour ouvré." },
  { code: "joint", touche: "3", libelle: "Artisan joint", aide: "On a parlé à l'artisan : dis-nous ce qu'il en sort." },
  { code: "faux_numero", touche: "4", libelle: "Faux numéro", aide: "Numéro invalide ou attribué : la fiche devient injoignable." },
]
export const ISSUES_ST: { code: Exclude<IssueST, "">; touche: string; libelle: string; aide: string }[] = [
  { code: "va_deposer", touche: "1", libelle: "Va déposer son dossier", aide: "Relance automatique à J+7 si le dossier n'est pas arrivé." },
  { code: "a_rappeler", touche: "2", libelle: "À rappeler le…", aide: "Il demande qu'on le rappelle : choisis le jour et l'heure." },
  { code: "pas_interesse", touche: "3", libelle: "Pas intéressé", aide: "La séquence s'arrête, on ne l'appelle plus." },
  { code: "hors_cible", touche: "4", libelle: "Hors cible", aide: "Pas le bon métier, pas la bonne zone… la séquence s'arrête." },
]
export const MOTIFS_ST = ["Trop de travail déjà", "Ne travaille pas avec des entreprises", "Tarifs trop bas", "Trop loin", "Plus en activité", "Autre"]

export const LIBELLE_SUIVI: Record<SuiviST, string> = {
  "": "", a_rappeler: "À rappeler", va_deposer: "Va déposer", pas_interesse: "Pas intéressé", hors_cible: "Hors cible", injoignable: "Injoignable",
}
export const LIBELLE_RESULTAT: Record<ResultatST, string> = { pas_de_reponse: "pas de réponse", standard: "quelqu'un d'autre", joint: "joint", faux_numero: "faux numéro" }
export const LIBELLE_ISSUE: Record<IssueST, string> = { "": "", va_deposer: "va déposer", a_rappeler: "à rappeler", pas_interesse: "pas intéressé", hors_cible: "hors cible" }

export const FILES_ST: { code: FileST; libelle: string; aide: string }[] = [
  { code: "leads", libelle: "Leads à appeler", aide: "Ont cliqué (barème, candidature) sans déposer de dossier, jamais appelés ou à réessayer" },
  { code: "rappels", libelle: "À rappeler aujourd'hui", aide: "Rappels demandés, relances « va déposer » et nouveaux essais datés d'aujourd'hui ou en retard" },
  { code: "promis", libelle: "Ont promis de déposer", aide: "Ont dit qu'ils déposeraient leur dossier : on vérifie qu'il arrive" },
]

/** Un lead : a cliqué quelque part, n'a pas déposé, n'est pas sorti du circuit. */
export const aClique = (st: SousTraitant): boolean => !!st.baremeVuLe || !!st.candidatureClicLe || (st.nbClics ?? 0) > 0
export const estLead = (st: SousTraitant): boolean => aClique(st) && !st.deposeLe && !st.desinscritLe && !!st.telephone && !st.telephoneInvalide && (st.suivi ?? "") === ""

/** Les leads les plus chauds d'abord : candidature cliquée (la plus récente en tête), puis barème vu, puis le dernier clic. */
export function ordonnerLeads(liste: SousTraitant[]): SousTraitant[] {
  const t = (iso?: string | null) => (iso ? new Date(iso).getTime() : 0)
  return [...liste].sort((a, b) => {
    const ca = t(a.candidatureClicLe), cb = t(b.candidatureClicLe)
    if ((ca > 0) !== (cb > 0)) return ca > 0 ? -1 : 1
    if (ca !== cb) return cb - ca
    const ba = t(a.baremeVuLe), bb = t(b.baremeVuLe)
    if (ba !== bb) return bb - ba
    return t(b.dernierClicLe) - t(a.dernierClicLe)
  })
}
/** Les rappels : le plus en retard d'abord. */
export const ordonnerRappelsST = (liste: SousTraitant[]): SousTraitant[] => [...liste].sort((a, b) => (a.rappelLe ?? "").localeCompare(b.rappelLe ?? ""))

/** Ce qui s'est passé, en une ligne, après l'enregistrement d'un appel. */
export function effetAppel(resultat: ResultatST, issue: IssueST, suivi: string, rappelLe: string | null): string {
  const quand = rappelLe ? new Date(rappelLe).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : ""
  if (suivi === "injoignable") return resultat === "faux_numero" ? "Faux numéro : la fiche est injoignable." : "Quatre appels sans réponse : la fiche est injoignable."
  if (resultat !== "joint") return `Pas joint. Nouvel essai ${quand}.`
  if (issue === "va_deposer") return `Il va déposer son dossier. S'il n'arrive pas, relance ${quand}.`
  if (issue === "a_rappeler") return `Rappel prévu ${quand}.`
  if (issue === "pas_interesse") return "Pas intéressé : la séquence est arrêtée, on ne l'appelle plus."
  if (issue === "hors_cible") return "Hors cible : la séquence est arrêtée, on ne l'appelle plus."
  return "Appel enregistré."
}

/** Les signaux qui font de lui un lead, lisibles. */
export function signaux(st: SousTraitant): string[] {
  const d = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "")
  const out: string[] = []
  if (st.candidatureClicLe) out.push(`a cliqué « candidater » le ${d(st.candidatureClicLe)}`)
  if (st.baremeVuLe) out.push(`a consulté le barème le ${d(st.baremeVuLe)}`)
  if ((st.nbClics ?? 0) > 0 && !st.candidatureClicLe && !st.baremeVuLe) out.push(`${st.nbClics} clic${st.nbClics > 1 ? "s" : ""}, le dernier le ${d(st.dernierClicLe)}`)
  if (st.deposeLe) out.push(`dossier déposé le ${d(st.deposeLe)}`)
  return out
}

export const dureeLisibleST = (s: number | null | undefined): string => {
  if (!s) return ""
  const m = Math.floor(s / 60), r = s % 60
  return m ? `${m} min ${String(r).padStart(2, "0")}` : `${r} s`
}
