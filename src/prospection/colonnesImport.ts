// Les colonnes d'un fichier importé (10/11/2026) : Baticom propose, Mahdi corrige. Le choix réécrit la ligne d'en-tête
// avec les noms que les imports savent lire ; le reste de l'import ne change pas. Fichier PUR.

export const IGNORER = "Ignorer"
export const CHAMPS_GESTIONNAIRES = ["Agence", "Type", "Adresse", "Code postal", "Téléphone", "E-mail", "Contact", "E-mail du contact", "Ligne directe", "Note"]
export const CHAMPS_ARTISANS = ["Entreprise", "Contact", "E-mail", "Téléphone", "Métier", "Zone", "Source"]
export const champsDe = (baseId: string) => (baseId === "artisans" ? CHAMPS_ARTISANS : CHAMPS_GESTIONNAIRES)

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()

function devinerGestionnaire(h: string): string {
  const contact = /contact|gestionnaire|interlocuteur|responsable|personne|prenom/.test(h)
  if (/ligne directe|direct|portable|mobile|gsm/.test(h)) return "Ligne directe"
  if (contact && /mail|courriel/.test(h)) return "E-mail du contact"
  if (/mail|courriel/.test(h)) return "E-mail"
  if (contact) return "Contact"
  if (/tel|phone|standard/.test(h)) return "Téléphone"
  if (/code postal|^cp$|secteur|arrondissement/.test(h)) return "Code postal"
  if (/adresse|rue|ville/.test(h)) return "Adresse"
  if (/^type|categorie|nature/.test(h)) return "Type"
  if (/note|commentaire|remarque|observation/.test(h)) return "Note"
  if (/agence|entreprise|societe|raison|enseigne|nom/.test(h)) return "Agence"
  return IGNORER
}
function devinerArtisan(h: string): string {
  if (/mail|courriel/.test(h)) return "E-mail"
  if (/tel|phone|portable|mobile|gsm/.test(h)) return "Téléphone"
  if (/metier|activite|corps|specialite|categorie/.test(h)) return "Métier"
  if (/source|origine|provenance|canal/.test(h)) return "Source"
  if (/zone|ville|departement|secteur|region|^cp$|code postal|adresse/.test(h)) return "Zone"
  if (/entreprise|societe|raison|enseigne|nom de l/.test(h)) return "Entreprise"
  if (/contact|nom|prenom|gerant|responsable/.test(h)) return "Contact"
  return IGNORER
}

/** La première ligne non vide : celle des titres. */
export const indexEntete = (lignes: string[][]) => lignes.findIndex((l) => l.some((c) => (c ?? "").trim()))

/** Ce que Baticom propose pour chaque colonne. */
export function devinerColonnes(entete: string[], baseId: string): string[] {
  const vus = new Set<string>()
  return entete.map((c) => {
    const proposition = (baseId === "artisans" ? devinerArtisan : devinerGestionnaire)(norm(c ?? ""))
    if (proposition === IGNORER || vus.has(proposition)) return IGNORER
    vus.add(proposition)
    return proposition
  })
}

/** Le fichier avec ses titres réécrits selon le choix. */
export function appliquerColonnes(lignes: string[][], choix: string[]): string[][] {
  const i = indexEntete(lignes)
  if (i < 0) return lignes
  return lignes.map((l, n) => (n === i ? choix.map((c) => (c === IGNORER ? "" : c)) : l))
}
