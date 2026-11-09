// L'aperçu d'un mail tel qu'il arrive (Mahdi, 09/11/2026) : la même mise en forme que l'envoi, avec des valeurs d'exemple.
// Fichier PUR.
import { corpsAvecMentions } from "./instantlyOutils"

const LIEN_EXEMPLE = "https://www.stcbatiment.fr"
const EXEMPLES: Record<string, string> = { contact: "Claire Martin", entreprise: "Agence Exemple", metier: "Peinture" }

export function remplirExemples(s: string): string {
  return s.replace(/\{\{([a-z_]+)\}\}/g, (tout, cle: string) => EXEMPLES[cle] ?? (cle.startsWith("lien_") ? LIEN_EXEMPLE : tout))
}

/** Le mail d'exemple. `bouton` : le libellé du lien vers la page ou le formulaire du créatif, s'il y en a un. */
export function apercuMail(objet: string, corps: string, bouton = ""): { objet: string; document: string } {
  const texte = remplirExemples(corps) + (bouton && !/<\/body>/i.test(corps) ? `\n\n${bouton} : ${LIEN_EXEMPLE}` : "")
  const html = corpsAvecMentions(texte, corps.includes("{{lien_desinscription}}") ? undefined : LIEN_EXEMPLE)
  return { objet: remplirExemples(objet), document: `<!doctype html><html><body style="margin:12px;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1e293b">${html}</body></html>` }
}

/** La balise d'une image ajoutée à un mail : elle ne dépasse jamais la largeur du message. */
export const baliseImage = (url: string) => `<img src="${url}" alt="" width="600" style="max-width:100%;height:auto">`
