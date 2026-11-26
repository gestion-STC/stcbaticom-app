// LE TEST A/B COMPLET (Mahdi, 11/11/2026 : « le but du test AB, c'est ça, faut qu'il soit complet »). On ne désigne un gagnant
// que s'il y a assez d'envois et que l'écart n'est pas dû au hasard ; on peut alors basculer tous les envois sur lui.
// Copie exacte côté serveur (_shared/campagnes/abTest.ts), vérifiée par un test. Fichier PUR.

export type CritereAB = "auto" | "leads" | "reponses" | "clics" | "ouvertures"
export type ReglageAB = { critere: CritereAB; minEnvois: number; basculer: boolean; /** Résultats (leads, réponses…) en tout avant de conclure. */ minResultats?: number }
/** Jamais de verdict sous 100 envois par variante (Mahdi, 11/11/2026 : « dix envois c'est pas assez du tout »). */
export const AB_ENVOIS_PLANCHER = 100
export const AB_DEPART: ReglageAB = { critere: "auto", minEnvois: 100, basculer: false }
export const LIBELLE_CRITERE: Record<CritereAB, string> = {
  auto: "Automatique : les leads, sinon les réponses, sinon les clics",
  leads: "Les leads", reponses: "Les réponses", clics: "Les clics", ouvertures: "Les ouvertures (peu fiable)",
}
const MOT: Record<Exclude<CritereAB, "auto">, string> = { leads: "de leads", reponses: "de réponses", clics: "de clics", ouvertures: "d'ouvertures" }

export type MesureVariante = { varianteId: string; nom: string; envoyes: number; leads: number; repondants: number; cliqueurs: number; ouvreurs: number }
export type VerdictAB = { gagnant: string | null; critere: Exclude<CritereAB, "auto">; message: string }

const CHAMP = { leads: "leads", reponses: "repondants", clics: "cliqueurs", ouvertures: "ouvreurs" } as const
/** Au moins 10 résultats en tout pour que le critère choisi automatiquement ait un sens. */
export const RESULTATS_MIN = 10
const pct = (x: number) => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`

/** Un lead d'agence fermé « robot » (25/11/2026) : un robot de sécurité a ouvert les liens, ce n'est pas un lead. */
export const estLeadRobot = (l: { resultat?: string | null }) => l.resultat === "robot"

type EntreeCampagne = { campagneId: string; contactId: string; entreeLe: string }
/** La campagne d'un contact à un instant : son inscription la plus récente entrée avant (ou à) cet instant ; aucune : null. */
function campagnesAu(inscriptions: EntreeCampagne[]): (contactId: string, quand: string) => string | null {
  const m = new Map<string, EntreeCampagne[]>()
  for (const i of [...inscriptions].sort((a, b) => new Date(a.entreeLe).getTime() - new Date(b.entreeLe).getTime())) m.set(i.contactId, [...(m.get(i.contactId) ?? []), i])
  return (contactId, quand) => {
    const l = m.get(contactId) ?? [], t = new Date(quand).getTime()
    for (let k = l.length - 1; k >= 0; k--) if (new Date(l[k].entreeLe).getTime() <= t) return l[k].campagneId
    return null
  }
}

export type LeadRattache = { contactId: string; campagneId: string | null }
/** QUI EST LEAD D'UNE CAMPAGNE (26/11/2026) : LA règle de la liste des campagnes et du Suivi, reprise telle quelle par le
 *  test A/B (écran et moteur, qui décide de la bascule). Un lead d'agence (leads_demarchage, hors robots) revient à la
 *  campagne où l'agence était entrée à sa date ; avant toute entrée, à aucune. */
export function leadsAgencesRattaches(leads: { agenceId: string; creeLe: string; resultat?: string | null }[], inscriptions: EntreeCampagne[]): LeadRattache[] {
  const au = campagnesAu(inscriptions)
  return leads.filter((l) => !estLeadRobot(l)).map((l) => ({ contactId: l.agenceId, campagneId: au(l.agenceId, l.creeLe) }))
}
/** Un artisan inscrit, passé « lead » ou « gagné », revient à la campagne de son premier vrai clic (les clics de robots
 *  sont retirés avant). Sans clic, il n'est le lead d'aucune campagne. */
export function leadsArtisansRattaches(fiches: { id: string; statut: string }[], clics: { contactId: string; campagneId: string; le: string }[], inscrits: Set<string>): LeadRattache[] {
  const premier = new Map<string, { campagneId: string; le: string }>()
  for (const e of clics) { const p = premier.get(e.contactId); if (!p || e.le < p.le) premier.set(e.contactId, e) }
  return fiches.filter((k) => (k.statut === "lead" || k.statut === "gagne") && inscrits.has(k.id) && premier.has(k.id)).map((k) => ({ contactId: k.id, campagneId: premier.get(k.id)!.campagneId }))
}
/** Les contacts lead de cette campagne. Avant (25/11), le test A/B comptait toute fiche « lead » ou « gagné », même
 *  devenue lead ailleurs ou avant d'entrer : les leads du test ne recoupaient pas ceux de la liste et du Suivi. */
export function leadsPourAB(campagneId: string, leads: LeadRattache[]): Set<string> {
  return new Set(leads.filter((l) => l.campagneId === campagneId).map((l) => l.contactId))
}

const CONFIRME = ["delivre", "ouvert", "clic", "reponse", "rebond"]
/** Un envoi PARTI (26/11/2026), la règle de « Touchés » partout : « envoyé » en base ; et pour un mail confié à
 *  Instantly, confirmé (délivré, ouvert, cliqué, répondu ou rebondi). */
export function envoiParti(e: { id: string; statut: string; canal: string; test?: boolean }, instantly: boolean, confirmes: Set<string>): boolean {
  return e.statut === "envoye" && (!instantly || (e.canal !== "mail" && e.canal !== "newsletter") || Boolean(e.test) || confirmes.has(e.id))
}
export const envoisConfirmes = (evenements: { envoiId: string | null; type: string }[]) => new Set(evenements.filter((e) => e.envoiId && CONFIRME.includes(e.type)).map((e) => e.envoiId as string))

/** Les chiffres de chaque variante d'une étape, calculés de la même façon à l'écran et au moteur : les envois PARTIS
 *  (hors envois de test), et ceux de leurs contacts qui ont ouvert, cliqué, répondu, ou sont leads de la campagne. */
export function mesuresAB(variantes: { id: string; nom: string }[], envois: { id: string; contactId: string; varianteId: string | null; statut: string; canal: string; test?: boolean }[], evenements: { envoiId: string | null; contactId: string; type: string }[], leads: Set<string>, instantly: boolean): MesureVariante[] {
  const confirmes = envoisConfirmes(evenements)
  return variantes.map((v) => {
    const ee = envois.filter((e) => e.varianteId === v.id && !e.test && envoiParti(e, instantly, confirmes)), ids = new Set(ee.map((e) => e.id))
    const ev = evenements.filter((e) => e.envoiId && ids.has(e.envoiId))
    const qui = (t: string) => new Set(ev.filter((e) => e.type === t).map((e) => e.contactId)).size
    return { varianteId: v.id, nom: v.nom, envoyes: ee.length, leads: new Set(ee.map((e) => e.contactId).filter((x) => leads.has(x))).size, repondants: qui("reponse"), cliqueurs: qui("clic"), ouvreurs: qui("ouvert") }
  })
}

export function critereEffectif(l: MesureVariante[], r: ReglageAB): Exclude<CritereAB, "auto"> {
  if (r.critere !== "auto") return r.critere
  const total = (c: keyof typeof CHAMP) => l.reduce((n, x) => n + x[CHAMP[c]], 0)
  const min = r.minResultats ?? RESULTATS_MIN
  return total("leads") >= min ? "leads" : total("reponses") >= min ? "reponses" : "clics"
}

/** Le verdict d'un test : le gagnant, ou pourquoi il n'y en a pas encore. Écart « net » : test des deux proportions à 95 %. */
export function verdictAB(l: MesureVariante[], r: ReglageAB = AB_DEPART): VerdictAB {
  const critere = critereEffectif(l, r)
  if (l.length < 2) return { gagnant: null, critere, message: "Une seule variante : rien à comparer." }
  const faible = [...l].sort((a, b) => a.envoyes - b.envoyes)[0]
  const manque = Math.max(0, Math.max(AB_ENVOIS_PLANCHER, r.minEnvois) - faible.envoyes)
  if (manque > 0) return { gagnant: null, critere, message: `Pas encore de gagnant : il manque ${manque} envoi${manque > 1 ? "s" : ""} à la variante ${faible.nom}.` }
  const taux = (x: MesureVariante) => x[CHAMP[critere]] / Math.max(1, x.envoyes)
  const [a, b] = [...l].sort((x, y) => taux(y) - taux(x))
  const total = l.reduce((n, x) => n + x[CHAMP[critere]], 0)
  if (total < (r.minResultats ?? RESULTATS_MIN)) return { gagnant: null, critere, message: `Pas encore assez ${MOT[critere]} pour conclure (${total} en tout).` }
  const n1 = a.envoyes, n2 = b.envoyes, s1 = a[CHAMP[critere]], s2 = b[CHAMP[critere]]
  const p = (s1 + s2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
  const z = se > 0 ? (s1 / n1 - s2 / n2) / se : 0
  if (z < 1.96) return { gagnant: null, critere, message: `Écart trop faible pour conclure : ${a.nom} ${pct(taux(a))}, ${b.nom} ${pct(taux(b))} ${MOT[critere]}. Le test continue.` }
  return { gagnant: a.varianteId, critere, message: `${a.nom} gagne : ${pct(taux(a))} ${MOT[critere]} contre ${pct(taux(b))} pour ${b.nom}. L'écart est net.` }
}
