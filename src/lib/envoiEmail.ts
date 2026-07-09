import type { Prospect } from "../data"
import { commercial } from "../data"
import type { Email } from "../emails"
import { logEmailEnvoye } from "./emailsEnvoyesDb"
import { supabase, supabaseConfigure } from "./supabase"

// L'envoi passe par la fonction serveur « envoyer-email » (relais Resend), qui détient
// la clé secrète. Le logiciel est « prêt à envoyer » dès que Supabase est configuré ;
// si le relais ou la clé Resend manquent, l'erreur est remontée clairement à l'envoi.
export const emailConfigure = supabaseConfigure

// Remplace les variables par les vraies données du prospect.
export function remplir(texte: string, p: Prospect): string {
  return texte
    .split("{{entreprise}}").join(p.entreprise || "")
    .split("{{contact}}").join(p.contact || "")
    .split("{{telephone}}").join(p.telephone || "")
    .split("{{email}}").join(p.email || "")
    .split("{{arrondissement}}").join(p.arrondissement || "")
    .split("{{commercial}}").join(commercial.prenom)
}

// Nettoie les artefacts d'une variable vide : « Bonjour {{contact}}, » sans nom
// devient « Bonjour, » (et non « Bonjour , »). À n'appliquer qu'au texte (pas à la signature HTML).
function nettoyerTexte(t: string): string {
  return t
    .split("\n")
    .map((l) =>
      l
        .replace(/[ \t]+,/g, ",") // espace avant une virgule (nom manquant)
        .replace(/[ \t]{2,}/g, " ") // espaces multiples → un seul
        .replace(/[ \t]+$/g, ""), // espaces en fin de ligne
    )
    .join("\n")
}

// Construit l'objet + le corps HTML (corps + signature + liens des pièces jointes).
export function composer(
  modele: Email,
  prospect: Prospect,
  signature: string,
): { objet: string; corpsHtml: string } {
  // Nettoyage uniquement sur l'objet et le corps (PAS la signature, dont le HTML
  // contient des espaces avant « : » qu'on doit préserver).
  const objet = nettoyerTexte(remplir(modele.objet, prospect))
  let corpsHtml = nettoyerTexte(remplir(modele.corps, prospect)).replace(/\n/g, "<br>")
  if (signature) corpsHtml += "<br><br>" + remplir(signature, prospect)
  if (modele.pieces && modele.pieces.length) {
    corpsHtml +=
      "<br><br>Pièces jointes :<br>" +
      modele.pieces
        .map((pj) => `• <a href="${pj.url}">${pj.nom}</a>`)
        .join("<br>")
  }
  return { objet, corpsHtml }
}

// Envoie l'email (via le relais serveur Resend) puis le journalise.
export async function envoyerEmail(
  prospect: Prospect,
  modele: Email,
  signature: string,
): Promise<void> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  if (!prospect.email) throw new Error("Ce prospect n'a pas d'adresse email.")
  const { objet, corpsHtml } = composer(modele, prospect, signature)

  const { data, error } = await supabase.functions.invoke("envoyer-email", {
    body: { to: prospect.email, subject: objet, html: corpsHtml },
  })
  if (error) {
    // Récupère le VRAI message renvoyé par la fonction (souvent dans error.context).
    let msg = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json()
        if (body?.error) msg = body.error + (body.detail ? " — " + body.detail : "")
      }
    } catch {
      /* on garde le message générique */
    }
    throw new Error(msg)
  }
  if (data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error)
  }

  if (prospect.id)
    await logEmailEnvoye({ prospectId: prospect.id, modeleNom: modele.nom, objet })
}
