// Les liens suivis (11/10/2026) : un lien propre à l'agence dans nos e-mails de
// prospection. Quand l'agence clique, la fonction `evenements-site` note le
// clic sur sa fiche puis la renvoie vers la vraie page (créer un compte,
// plaquette…). Le commercial voit ainsi ce que l'agence a fait depuis le mail.
import { supabase } from "./supabase"

export type CibleLien = "creer_compte" | "plaquette" | "site"
const PORTE = `${import.meta.env.VITE_SUPABASE_URL || ""}/functions/v1/evenements-site`

/** Les variables de lien acceptées dans un modèle d'e-mail, et la cible de chacune. */
export const VARIABLES_LIENS: { variable: string; cible: CibleLien; url: string; aide: string }[] = [
  { variable: "{{lien_creer_compte}}", cible: "creer_compte", url: "", aide: "la page « Créer un compte » de STC Bâtiment, suivie" },
  { variable: "{{lien_site}}", cible: "site", url: "https://www.stcbatiment.fr", aide: "le site stcbatiment.fr, suivi" },
]

const jetonNeuf = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 40)

/** L'adresse suivie d'une cible (et d'une adresse finale) pour une agence : réutilise le lien existant, sinon le crée. */
export async function lienSuivi(agenceId: string, cible: CibleLien, url = "", contactId: string | null = null): Promise<string> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  const { data } = await supabase.from("liens_suivis").select("jeton").eq("agence_id", agenceId).eq("cible", cible).eq("url", url).order("cree_le", { ascending: false }).limit(1).maybeSingle()
  let jeton = (data as { jeton: string } | null)?.jeton
  if (!jeton) {
    jeton = jetonNeuf()
    const { error } = await supabase.from("liens_suivis").insert({ jeton, agence_id: agenceId, contact_id: contactId, cible, url })
    if (error) throw new Error(error.message)
  }
  return `${PORTE}?l=${jeton}`
}

const LIBELLES: Record<CibleLien, string> = { creer_compte: "Créer mon compte STC Bâtiment", plaquette: "Voir la plaquette", site: "stcbatiment.fr" }

/**
 * Remplace les variables de lien d'un texte par des liens suivis pour cette agence
 * (sans agence : les adresses brutes). En HTML, le lien devient cliquable avec un libellé.
 */
export async function remplirLiens(texte: string, agenceId: string | null | undefined, format: "html" | "texte" = "html", contactId: string | null = null): Promise<string> {
  let out = texte
  for (const v of VARIABLES_LIENS) {
    if (!out.includes(v.variable)) continue
    let url = v.url || "https://www.stcbatiment.com/creer-mon-compte"
    if (agenceId) { try { url = await lienSuivi(agenceId, v.cible, v.url, contactId) } catch { /* la table n'est peut-être pas posée : lien brut */ } }
    out = out.split(v.variable).join(format === "html" ? `<a href="${url}">${LIBELLES[v.cible]}</a>` : url)
  }
  return out
}
