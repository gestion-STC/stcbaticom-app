// Le rapprochement d'un gestionnaire de STC Bâtiment avec une agence de STC Baticom.
// Pur (pas d'accès réseau) : testé par vitest depuis src/demarchage/rapprochementClients.test.ts.
//
// Un gestionnaire = une société, un nom, un e-mail, des téléphones, les noms
// d'agence écrits sur ses ordres de service, des codes postaux. On note chaque
// agence de la base sur quatre indices, et on garde les trois meilleures :
//   · même e-mail (sur l'agence ou un contact) ......... 100
//   · même domaine d'e-mail, s'il n'est pas générique .... 60
//   · même téléphone (standard, ligne directe, mobile) .... 50
//   · même nom (exact 40, l'un contient l'autre 25, mots communs 15)
//   · même code postal ............................................. +5

export type AgenceRef = {
  id: string
  nom: string
  secteur: string | null
  telephone: string
  email: string
  etape: string
  premierOsLe: string | null
  contactsEmails: string[]
  contactsTels: string[]
}
export type GestionnaireRef = {
  societe: string
  nom: string
  email: string
  telephones: string[]
  nomsAgence: string
  codesPostaux: string
}
export type Candidat = { agenceId: string; nom: string; secteur: string | null; score: number; raisons: string[] }

const DOMAINES_GENERIQUES = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "live.com", "live.fr", "msn.com", "yahoo.com", "yahoo.fr",
  "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "laposte.net", "bbox.fr", "numericable.fr", "icloud.com", "me.com", "aol.com", "protonmail.com", "proton.me",
])
const MOTS_VIDES = new Set(["agence", "agences", "immobilier", "immobiliere", "immo", "gestion", "locative", "cabinet", "groupe", "sas", "sarl", "sa", "eurl", "sci", "paris", "de", "du", "des", "la", "le", "les", "et", "societe", "sté", "ste"])

export const domaine = (email: string): string => (email.split("@")[1] || "").toLowerCase().trim()
export const domaineGenerique = (d: string): boolean => !d || DOMAINES_GENERIQUES.has(d)
export const telCle = (t: string): string => {
  const c = (t || "").replace(/\D/g, "").replace(/^0033/, "0").replace(/^33/, "0")
  return c.length >= 9 ? c.slice(-9) : ""
}
export const nomCle = (s: string): string =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
export const mots = (s: string): string[] => nomCle(s).split(" ").filter((m) => m.length >= 3 && !MOTS_VIDES.has(m))

function scoreNom(cible: string, nomAgence: string): { score: number; raison: string } | null {
  const a = nomCle(cible), b = nomCle(nomAgence)
  if (!a || !b) return null
  if (a === b) return { score: 40, raison: `même nom « ${nomAgence} »` }
  if ((a.length >= 5 && b.includes(a)) || (b.length >= 5 && a.includes(b))) return { score: 25, raison: `nom proche « ${nomAgence} »` }
  const ma = new Set(mots(cible)), mb = mots(nomAgence)
  const communs = mb.filter((m) => ma.has(m))
  if (communs.length >= 2 || (communs.length === 1 && communs[0].length >= 6)) return { score: 15, raison: `mots communs : ${communs.join(", ")}` }
  return null
}

export function candidats(g: GestionnaireRef, agences: AgenceRef[], max = 3): Candidat[] {
  const email = (g.email || "").toLowerCase().trim()
  const dom = domaine(email)
  const tels = new Set(g.telephones.map(telCle).filter(Boolean))
  const noms = [g.societe, ...g.nomsAgence.split("|")].map((s) => s.trim()).filter(Boolean)
  const cps = new Set(g.codesPostaux.split("|").map((s) => s.trim()).filter((s) => /^\d{5}$/.test(s)))
  const out: Candidat[] = []
  for (const a of agences) {
    let score = 0
    const raisons: string[] = []
    const emailsAgence = [a.email, ...a.contactsEmails].map((e) => (e || "").toLowerCase().trim()).filter(Boolean)
    if (email && emailsAgence.includes(email)) { score += 100; raisons.push("même e-mail") }
    else if (dom && !domaineGenerique(dom) && emailsAgence.some((e) => domaine(e) === dom)) { score += 60; raisons.push(`même domaine @${dom}`) }
    const telsAgence = [a.telephone, ...a.contactsTels].map(telCle).filter(Boolean)
    if (tels.size && telsAgence.some((t) => tels.has(t))) { score += 50; raisons.push("même téléphone") }
    let meilleurNom: { score: number; raison: string } | null = null
    for (const n of noms) {
      const r = scoreNom(n, a.nom)
      if (r && (!meilleurNom || r.score > meilleurNom.score)) meilleurNom = r
    }
    if (meilleurNom) { score += meilleurNom.score; raisons.push(meilleurNom.raison) }
    if (score > 0 && a.secteur && cps.has(a.secteur)) { score += 5; raisons.push(`code postal ${a.secteur}`) }
    if (score > 0) out.push({ agenceId: a.id, nom: a.nom, secteur: a.secteur, score, raisons })
  }
  return out.sort((x, y) => y.score - x.score || x.nom.localeCompare(y.nom, "fr")).slice(0, max)
}

// Un candidat qu'on peut proposer en premier sans rougir : e-mail ou téléphone + nom, ou domaine + nom.
export const candidatSolide = (c: Candidat | undefined): boolean => !!c && c.score >= 65
