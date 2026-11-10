// LE TEST A/B COMPLET (Mahdi, 11/11/2026 : « le but du test AB, c'est ça, faut qu'il soit complet »). On ne désigne un gagnant
// que s'il y a assez d'envois et que l'écart n'est pas dû au hasard ; on peut alors basculer tous les envois sur lui.
// Copie exacte côté serveur (_shared/campagnes/abTest.ts), vérifiée par un test. Fichier PUR.

export type CritereAB = "auto" | "leads" | "reponses" | "clics" | "ouvertures"
export type ReglageAB = { critere: CritereAB; minEnvois: number; basculer: boolean }
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

export function critereEffectif(l: MesureVariante[], r: ReglageAB): Exclude<CritereAB, "auto"> {
  if (r.critere !== "auto") return r.critere
  const total = (c: keyof typeof CHAMP) => l.reduce((n, x) => n + x[CHAMP[c]], 0)
  return total("leads") >= RESULTATS_MIN ? "leads" : total("reponses") >= RESULTATS_MIN ? "reponses" : "clics"
}

/** Le verdict d'un test : le gagnant, ou pourquoi il n'y en a pas encore. Écart « net » : test des deux proportions à 95 %. */
export function verdictAB(l: MesureVariante[], r: ReglageAB = AB_DEPART): VerdictAB {
  const critere = critereEffectif(l, r)
  if (l.length < 2) return { gagnant: null, critere, message: "Une seule variante : rien à comparer." }
  const faible = [...l].sort((a, b) => a.envoyes - b.envoyes)[0]
  const manque = Math.max(0, r.minEnvois - faible.envoyes)
  if (manque > 0) return { gagnant: null, critere, message: `Pas encore de gagnant : il manque ${manque} envoi${manque > 1 ? "s" : ""} à la variante ${faible.nom}.` }
  const taux = (x: MesureVariante) => x[CHAMP[critere]] / Math.max(1, x.envoyes)
  const [a, b] = [...l].sort((x, y) => taux(y) - taux(x))
  const total = l.reduce((n, x) => n + x[CHAMP[critere]], 0)
  if (total < 5) return { gagnant: null, critere, message: `Pas encore assez ${MOT[critere]} pour conclure (${total} en tout).` }
  const n1 = a.envoyes, n2 = b.envoyes, s1 = a[CHAMP[critere]], s2 = b[CHAMP[critere]]
  const p = (s1 + s2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
  const z = se > 0 ? (s1 / n1 - s2 / n2) / se : 0
  if (z < 1.96) return { gagnant: null, critere, message: `Écart trop faible pour conclure : ${a.nom} ${pct(taux(a))}, ${b.nom} ${pct(taux(b))} ${MOT[critere]}. Le test continue.` }
  return { gagnant: a.varianteId, critere, message: `${a.nom} gagne : ${pct(taux(a))} ${MOT[critere]} contre ${pct(taux(b))} pour ${b.nom}. L'écart est net.` }
}
