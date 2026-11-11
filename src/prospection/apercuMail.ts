// L'aperçu d'un mail tel qu'il arrive (Mahdi, 09/11/2026) : la même mise en forme que l'envoi, avec des valeurs d'exemple.
// Fichier PUR.
import { corpsAvecMentions, remplirVariables, type Mentions } from "./instantlyOutils"

const LIEN_EXEMPLE = "https://www.stcbatiment.fr"
const EXEMPLES: Record<string, string> = { contact: "Claire Martin", prenom: "Claire", entreprise: "Agence Exemple", agence: "Agence Exemple", secteur: "Paris 12e", enseigne: "", metier: "Peinture", zone: "Paris", accroche_ia: "[La phrase écrite par l'IA pour cette fiche.]" }

export type ValeursEssai = Record<string, string>

export function remplirExemples(s: string, v?: ValeursEssai): string {
  return remplirVariables(s, v ?? EXEMPLES).replace(/\{\{([a-z_]+)\}\}/g, (tout, cle: string) => (cle.startsWith("lien_") ? LIEN_EXEMPLE : tout))
}

/** Le mail d'exemple. `bouton` : le libellé du lien vers la page ou le formulaire du créatif, s'il y en a un. */
export function apercuMail(objet: string, corps: string, bouton = "", prospection = true, v?: ValeursEssai, m: Mentions = {}): { objet: string; html: string; document: string } {
  const texte = remplirExemples(corps, v) + (bouton && !/<\/body>/i.test(corps) ? `\n\n[${bouton}](${LIEN_EXEMPLE})` : "")
  const html = corpsAvecMentions(texte, corps.includes("{{lien_desinscription}}") ? undefined : LIEN_EXEMPLE, prospection, m)
  return { objet: remplirExemples(objet, v), html, document: `<!doctype html><html><body style="margin:12px;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1e293b">${html}</body></html>` }
}

/** Un essai envoyé à soi-même : le vrai rendu, avec une vraie fiche, et des liens qui n'agissent sur personne. */
export function essaiMail(objet: string, corps: string, marque: string, bouton: string, prospection: boolean, v?: ValeursEssai, mentions: Mentions = {}): { objet: string; html: string } {
  const m = apercuMail(objet, corps, bouton, prospection, v, mentions)
  return { objet: `${marque}${m.objet}`, html: m.html }
}
export const essaiSms = (corps: string, marque: string, v?: ValeursEssai) => `${marque}${remplirExemples(corps, v)}`

/** La balise d'une image ajoutée à un mail : elle ne dépasse jamais la largeur du message. */
export const baliseImage = (url: string, lien = "") => { const img = `<img src="${url}" alt="" width="600" style="max-width:100%;height:auto;border:0">`; return lien ? `<a href="${lien}">${img}</a>` : img }

/** Les conseils sur un mail : jamais un blocage. */
export function conseilsMail(objet: string, corps: string, premier: boolean): string[] {
  const out: string[] = []
  const mots = objet.trim().split(/\s+/).filter(Boolean).length
  if (objet.trim() && (mots > 7 || objet.length > 50)) out.push("Objet long : 2 à 7 mots passent mieux.")
  if (/!{2,}/.test(objet + corps) || /\b[A-ZÉÈ]{6,}\b/.test(objet)) out.push("Évite les majuscules et les points d'exclamation répétés.")
  if (/\b(gratuit|urgent|promotion|offre exceptionnelle|garanti|100 ?%)\b/i.test(objet + " " + corps)) out.push("Certains mots font penser à du spam (gratuit, urgent, garanti…).")
  const liens = (corps.match(/\{\{lien_(?!desinscription)[a-z_]+\}\}|https?:\/\/[^\s)<"]+/g) ?? []).length
  if (premier && liens > 1) out.push("Premier mail : un seul lien, c'est mieux pour arriver en boîte de réception.")
  if (premier && /<img\b/i.test(corps)) out.push("Premier mail : évite les images.")
  const longueur = corps.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length
  if (longueur > 130) out.push(`Mail long (${longueur} mots) : moins de 120 mots se lisent mieux.`)
  return out
}
