// Qui a envoyé son PREMIER ordre de service, et quand.
//
// Le logiciel n'a aucun moyen de le deviner : l'OS arrive hors du logiciel
// (mail, téléphone). Jusqu'ici on saisissait seulement un TOTAL mensuel, ce qui
// donne un chiffre mais pas de nom — donc aucun parcours reconstituable.
//
// Ici on garde la même simplicité (saisie à la main, rangée dans `parametres`)
// mais en désignant la fiche : dès lors le logiciel sait qui et quand, et peut
// remonter tout l'historique qui a mené à cet OS.

const CLE = "os_gestionnaires"

export type OsGestionnaire = {
  prospectId: string
  date: string // jour de l'OS, au format AAAA-MM-JJ
}

export const cleOsGestionnaires = CLE

// Une date saisie ("2026-08-04") doit inclure TOUT ce jour-là : sans ça, un appel
// du 4 août à 16:39 serait considéré comme postérieur à l'OS et donc exclu.
export function finDeJournee(date: string): string {
  if (!date) return date
  return date.includes("T") ? date : `${date}T23:59:59.999Z`
}

export function parserOsGestionnaires(brut: string | null): OsGestionnaire[] {
  if (!brut) return []
  let arr: unknown
  try {
    arr = JSON.parse(brut)
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const vus = new Set<string>()
  const out: OsGestionnaire[] = []
  for (const x of arr) {
    if (!x || typeof x !== "object") continue
    const o = x as Record<string, unknown>
    const prospectId = typeof o.prospectId === "string" ? o.prospectId : ""
    const date = typeof o.date === "string" ? o.date : ""
    if (!prospectId || vus.has(prospectId)) continue
    vus.add(prospectId)
    out.push({ prospectId, date })
  }
  return out
}

export function serialiserOsGestionnaires(liste: OsGestionnaire[]): string {
  return JSON.stringify(liste)
}

// Ajoute un gestionnaire. S'il est déjà là, on garde la date la PLUS ANCIENNE :
// c'est le PREMIER ordre de service qui nous intéresse, pas le dernier.
export function ajouterOsGestionnaire(
  liste: OsGestionnaire[],
  prospectId: string,
  date: string,
): OsGestionnaire[] {
  if (!prospectId || !date) return liste
  const existant = liste.find((o) => o.prospectId === prospectId)
  if (!existant) return [...liste, { prospectId, date }]
  const gardee = existant.date && existant.date < date ? existant.date : date
  return liste.map((o) => (o.prospectId === prospectId ? { ...o, date: gardee } : o))
}

export function retirerOsGestionnaire(
  liste: OsGestionnaire[],
  prospectId: string,
): OsGestionnaire[] {
  return liste.filter((o) => o.prospectId !== prospectId)
}
