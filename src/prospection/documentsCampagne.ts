// Les documents dans les campagnes (lot 3, 17/11/2026). Un PDF de la bibliothèque s'insère dans un mail comme un lien :
// [Notre plaquette]({{document:<fichier>}}). À l'envoi, le moteur en fait un lien suivi propre à chaque agence
// (evenements-site note « Plaquette ouverte · nom »). Plus besoin de code pour ajouter une plaquette.
// Fichier PUR.
import type { PieceJointe } from "../emails"

/** Les PDF ajoutés depuis l'écran des campagnes (« Ajouter un PDF… »), en plus des pièces des modèles de mail. */
export const CLE_DOCUMENTS = "documents_bibliotheque"

/** Les anciennes variables, toujours comprises par le moteur (campagnes-moteur, PLAQUETTES). */
export const DOCUMENTS_NOMMES: Record<string, string> = {
  "{{lien_plaquette}}": "801aeb9d-311d-48a8-ba02-97c96754dfa2.pdf",
  "{{lien_plaquette_plateforme}}": "43fb4102-ec01-4710-ba3b-317bf4ace8c4.pdf",
  "{{lien_kbis}}": "aba7ff82-c739-4f18-a0b6-d65279ac5f28.pdf",
  "{{lien_assurance}}": "5b129b47-c76a-4dda-a96a-19516ef7608b.pdf",
}

const RE_DOCUMENT = /\{\{document:([A-Za-z0-9._-]+)\}\}/g
export const variableDocument = (chemin: string) => `{{document:${chemin}}}`
export const nomLisible = (nom: string) => nom.replace(/\.pdf$/i, "").replace(/\s*\(\d+\)\s*$/, "").trim()
/** Le lien à insérer dans le texte : le nom du document, cliquable. */
export const lienDocument = (doc: Pick<PieceJointe, "nom" | "chemin">) => `[${nomLisible(doc.nom)}](${variableDocument(doc.chemin)})`

/** Les documents cités par un texte (leur fichier). */
export function documentsCites(texte: string): string[] {
  return [...new Set([...texte.matchAll(RE_DOCUMENT)].map((m) => m[1]))]
}

/** Pour l'aperçu et l'essai : chaque document devient son adresse publique (rien n'est noté). */
export function remplacerDocuments(s: string, baseFichiers: string): string {
  let out = s.replace(RE_DOCUMENT, (_t, chemin: string) => `${baseFichiers}${chemin}`)
  for (const [variable, chemin] of Object.entries(DOCUMENTS_NOMMES)) out = out.split(variable).join(`${baseFichiers}${chemin}`)
  return out
}

/** Les liens que le moteur sait remplir. Un autre {{lien_…}} partirait tel quel chez l'agence. */
export const LIENS_CONNUS = ["lien", "lien_principal", "lien_creer_compte", "lien_site", "lien_desinscription", "lien_formulaire", "lien_page", "lien_avis", "lien_candidature", "lien_bareme", "lien_plaquette", "lien_plaquette_plateforme", "lien_kbis", "lien_assurance"]

/** Ce qui partirait tel quel : un lien mal écrit, ou un document qui n'est plus dans la bibliothèque. */
export function variablesInconnues(texte: string, documents?: Pick<PieceJointe, "chemin">[]): string[] {
  const out: string[] = []
  for (const m of texte.matchAll(/\{\{(lien[a-z_]*)\}\}/g)) if (!LIENS_CONNUS.includes(m[1])) out.push(m[0])
  for (const m of texte.matchAll(/\{\{\s*document\s*:?\s*([^}]*)\}\}/g)) if (!/^[A-Za-z0-9._-]+$/.test(m[1]) || (documents && !documents.some((d) => d.chemin === m[1]))) out.push(m[0])
  return [...new Set(out)]
}

/** La valeur enregistrée, relue sans jamais casser l'écran. */
export function lireDocumentsAjoutes(valeur: string | null | undefined): PieceJointe[] {
  try {
    const l = JSON.parse(valeur || "[]")
    return Array.isArray(l) ? l.filter((p): p is PieceJointe => Boolean(p?.chemin && p?.url && p?.nom)) : []
  } catch { return [] }
}

/** La bibliothèque des campagnes : les pièces des modèles, puis les PDF ajoutés, sans doublon de fichier. */
export function fusionnerDocuments(...listes: PieceJointe[][]): PieceJointe[] {
  const vus = new Map<string, PieceJointe>()
  for (const l of listes) for (const p of l) if (p.chemin && !vus.has(p.chemin)) vus.set(p.chemin, p)
  return [...vus.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
}
