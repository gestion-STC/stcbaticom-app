import { commercial } from "../data"
import type { Email } from "../emails"
import { decouperAdresses } from "./adressesEmail"
import type { Destinataire } from "./destinataire"
import { lienSuivi, remplirLiens } from "./liensSuivisDb"
import { supabase, supabaseConfigure } from "./supabase"

// L'envoi passe par la fonction serveur « envoyer-email » (relais Resend), qui détient
// la clé secrète. Le logiciel est « prêt à envoyer » dès que Supabase est configuré ;
// si le relais ou la clé Resend manquent, l'erreur est remontée clairement à l'envoi.
export const emailConfigure = supabaseConfigure

// Remplace les variables par les vraies données du destinataire (l'agence, son contact).
// `prenomCommercial` : le prénom du compte connecté (Mahdi, 07/10/2026) ; sans lui,
// le profil par défaut (mode démo).
export function remplir(texte: string, p: Destinataire, prenomCommercial: string = commercial.prenom): string {
  return texte
    .split("{{entreprise}}").join(p.entreprise || "")
    .split("{{contact}}").join(p.contact || "")
    .split("{{telephone}}").join(p.telephone || "")
    .split("{{email}}").join(p.email || "")
    .split("{{arrondissement}}").join(p.arrondissement || "")
    .split("{{commercial}}").join(prenomCommercial)
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
  d: Destinataire,
  signature: string,
  prenomCommercial?: string,
): { objet: string; corpsHtml: string } {
  // Nettoyage uniquement sur l'objet et le corps (PAS la signature, dont le HTML
  // contient des espaces avant « : » qu'on doit préserver).
  const objet = nettoyerTexte(remplir(modele.objet, d, prenomCommercial))
  let corpsHtml = nettoyerTexte(remplir(modele.corps, d, prenomCommercial)).replace(/\n/g, "<br>")
  if (signature) corpsHtml += "<br><br>" + remplir(signature, d, prenomCommercial)
  if (modele.pieces && modele.pieces.length) {
    corpsHtml +=
      "<br><br>Pièces jointes :<br>" +
      modele.pieces
        .map((pj) => `• <a href="${pj.url}">${pj.nom}</a>`)
        .join("<br>")
  }
  // Police Montserrat pour le rendu du mail (avec repli Arial : la plupart des
  // messageries ne chargent pas les polices web, on garde donc une police sûre).
  return { objet, corpsHtml: enveloppeMontserrat(corpsHtml) }
}

// Enveloppe le corps HTML dans une police Montserrat (repli Arial/sans-serif).
export function enveloppeMontserrat(html: string): string {
  return (
    `<div style="font-family:'Montserrat',Arial,Helvetica,sans-serif;` +
    `font-size:14px;line-height:1.6;color:#1e293b">${html}</div>`
  )
}

// Envoie l'email (via le relais serveur Resend) puis le journalise.
export async function envoyerEmail(
  d: Destinataire,
  modele: Email,
  signature: string,
  prenomCommercial?: string,
  destinataires?: string[],
  copie: { cc?: string[]; cci?: string[] } = {},
): Promise<void> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  // PLUSIEURS DESTINATAIRES (08/10/2026) : la liste donnée par l'écran, sinon
  // le champ e-mail de la fiche (qui peut en contenir plusieurs). Cc et Cci (09/10).
  const to = destinataires && destinataires.length ? destinataires : decouperAdresses(d.email || "")
  if (to.length === 0) throw new Error("Cette agence n'a pas d'adresse e-mail.")
  const compose = composer(modele, d, signature, prenomCommercial)
  // Les liens suivis (11/10/2026) : {{lien_creer_compte}}, {{lien_site}} deviennent des liens propres à
  // l'agence ; quand elle clique, sa fiche le sait (fonction evenements-site).
  const objet = await remplirLiens(compose.objet, d.agenceId, "texte")
  let corpsHtml = await remplirLiens(compose.corpsHtml, d.agenceId, "html")
  // Les pièces jointes (plaquette…) aussi : le clic devient « Plaquette ouverte » sur la fiche.
  if (d.agenceId) for (const pj of modele.pieces ?? []) {
    if (!pj.url) continue
    try { corpsHtml = corpsHtml.split('href="' + pj.url + '"').join('href="' + (await lienSuivi(d.agenceId, "plaquette", pj.url)) + '"') } catch { /* lien brut */ }
  }

  const { data, error } = await supabase.functions.invoke("envoyer-email", {
    body: { to, subject: objet, html: corpsHtml, agence_id: d.agenceId, ...(copie.cc?.length ? { cc: copie.cc } : {}), ...(copie.cci?.length ? { bcc: copie.cci } : {}) },
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

  // Le mail sur la FICHE (Mahdi, 13/10 : « j'ai envoyé un mail à cette dame et il n'y a rien ») :
  // le serveur range le message sur l'agence envoyée (agence_id) ; on le vérifie ici.
  // La fiche ouverte est la vérité (13/10) : on rattache toujours, même si le serveur avait deviné une autre agence.
  // Si la ligne du journal manque (pas d'id Resend, journal raté), le front l'écrit lui-même : jamais un mail absent de la fiche.
  const resendId = (data as { id?: string } | null)?.id ?? ""
  if (!d.agenceId) return
  let rattaches = 0
  if (resendId) {
    const { data: lignes, error: e } = await supabase.from("messages").update({ agence_id: d.agenceId }).eq("message_id", resendId).select("id")
    if (e) throw new Error(`E-mail parti, mais pas rangé sur la fiche : ${e.message}`)
    rattaches = lignes?.length ?? 0
  }
  if (rattaches === 0) {
    const { error: e } = await supabase.from("messages").insert({
      sens: "sortant", espace: "demarchage", de: "contact@crm.stcbatiment.fr", a: libelleDestinataires(to, copie), objet, corps_html: corpsHtml,
      message_id: resendId || null, lu: true, agence_id: d.agenceId,
    })
    if (e) throw new Error(`E-mail parti, mais pas rangé sur la fiche : ${e.message}`)
  }
}

// Le champ « a » du journal, écrit comme le serveur : « x, y · cc : z · cci : w » (sans doublon d'une liste à l'autre).
export function libelleDestinataires(to: string[], copie: { cc?: string[]; cci?: string[] } = {}): string {
  const adresse = (s: string) => { const m = s.trim().match(/<([^>]+)>/); return (m ? m[1] : s).toLowerCase().trim() }
  const norm = (l: string[] = []) => l.map(adresse).filter((x) => x.includes("@"))
  const tous = norm(to)
  const cc = norm(copie.cc).filter((x) => !tous.includes(x))
  const cci = norm(copie.cci).filter((x) => !tous.includes(x) && !cc.includes(x))
  return tous.join(", ") + (cc.length ? " · cc : " + cc.join(", ") : "") + (cci.length ? " · cci : " + cci.join(", ") : "")
}
