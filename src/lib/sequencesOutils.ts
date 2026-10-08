// ════════════════════════════════════════════════════════════════════════════
// OUTILS DES SÉQUENCES — des fonctions pures, sans la base, donc testées.
//
// Le compteur de SMS, les contrôles d'une étape avant qu'elle parte, l'exemple
// rempli pour l'aperçu et l'envoi de test, et la MÊME détection HTML que le
// moteur (supabase/functions/sequenceur-st) : l'écran doit juger un contenu
// exactement comme le moteur le traitera.
// ════════════════════════════════════════════════════════════════════════════
import type { EtapeST, LiensST, SousTraitant } from "../recrutement"
import { porteDesinscription, remplirST } from "../recrutement"

// ── L'artisan d'exemple et les liens d'exemple ───────────────────────────────
/** L'artisan fictif qui remplit les aperçus et les envois de test. */
export const ARTISAN_EXEMPLE: Partial<SousTraitant> = {
  contact: "Karim Benali",
  entreprise: "Benali Rénovation",
  metier: "Électricité",
}

/** Les liens d'un envoi de test : de vraies pages pour candidater et lire le
 *  barème, et une adresse qui ne mène nulle part pour la désinscription (un
 *  test ne doit jamais pouvoir désinscrire quelqu'un). */
export const LIENS_EXEMPLE: LiensST = {
  candidature: "https://www.stcbatiment.fr/sous-traitants",
  bareme: "https://www.stcbatiment.fr/sous-traitants/bareme",
  stop: "https://exemple.invalid/stop",
}

/** Les liens à la TAILLE RÉELLE de ceux que la machine envoie
 *  (…/functions/v1/lien-st?t=<32 caractères>&d=…) : c'est sur eux qu'on compte
 *  les caractères d'un SMS, sinon le compteur ment de 80 caractères par lien. */
const JETON_EXEMPLE = "0123456789abcdef0123456789abcdef"
const BASE_LIEN = "https://ifvrmsiwlwppinfdmeao.supabase.co/functions/v1/lien-st?t="
export const LIENS_TAILLE_REELLE: LiensST = {
  candidature: `${BASE_LIEN}${JETON_EXEMPLE}&d=candidature`,
  bareme: `${BASE_LIEN}${JETON_EXEMPLE}&d=bareme`,
  stop: `${BASE_LIEN}${JETON_EXEMPLE}&d=stop`,
}

/** Le contenu d'une étape rempli avec l'artisan d'exemple. */
export function exempleRemplissage(etape: Pick<EtapeST, "contenu">, liens: string | LiensST = LIENS_EXEMPLE): string {
  return remplirST(etape.contenu, ARTISAN_EXEMPLE, liens)
}

/** L'objet d'une étape rempli avec l'artisan d'exemple. */
export function exempleObjet(etape: Pick<EtapeST, "objet">, liens: string | LiensST = LIENS_EXEMPLE): string {
  return remplirST(etape.objet, ARTISAN_EXEMPLE, liens)
}

// ── Le compteur de SMS ───────────────────────────────────────────────────────
// Un SMS s'écrit dans l'alphabet GSM-7 : 160 caractères. Dès qu'UN caractère
// n'y est pas, TOUT le message passe en UCS-2 : 70 caractères par SMS, donc
// deux fois plus de segments reçus (et payés). On compte prudemment : hors des
// caractères ASCII imprimables, on suppose l'UCS-2. La table GSM-7 connaît
// bien é, è ou à, mais ni ç, ni œ, ni les guillemets typographiques, et les
// passerelles ne garantissent pas les accents : c'est pourquoi les SMS de STC
// s'écrivent sans accent, exprès — le compteur le rappelle plutôt qu'il ne
// l'excuse.
const GSM7_EXTENSION = new Set(["^", "{", "}", "\\", "[", "~", "]", "|"]) // comptés double
const LIMITE_GSM7 = 160
const LIMITE_UCS2 = 70
// Au-delà d'un segment, chaque morceau porte un en-tête de concaténation :
// il reste 153 (GSM-7) ou 67 (UCS-2) caractères utiles par morceau.
const UTILE_CONCAT_GSM7 = 153
const UTILE_CONCAT_UCS2 = 67

export type CompteSms = { longueur: number; segments: number; limiteSegment: number; ucs2: boolean }

const estAsciiImprimable = (c: string) => {
  const code = c.codePointAt(0) ?? 0
  return code === 10 || code === 13 || (code >= 32 && code <= 126)
}

export function segmentsSms(texte: string): CompteSms {
  const ucs2 = [...texte].some((c) => !estAsciiImprimable(c))
  let longueur = 0
  if (ucs2) {
    longueur = texte.length // unités UTF-16 : un emoji en vaut deux, comme sur le réseau
  } else {
    for (const c of texte) longueur += GSM7_EXTENSION.has(c) ? 2 : 1
  }
  const limiteSegment = ucs2 ? LIMITE_UCS2 : LIMITE_GSM7
  const utile = ucs2 ? UTILE_CONCAT_UCS2 : UTILE_CONCAT_GSM7
  const segments = longueur === 0 ? 0 : longueur <= limiteSegment ? 1 : Math.ceil(longueur / utile)
  return { longueur, segments, limiteSegment, ucs2 }
}

/** Le compteur en une phrase : « 142 caractères · 1 SMS ». */
export function libelleSms(c: CompteSms): string {
  const car = `${c.longueur} caractère${c.longueur > 1 ? "s" : ""}`
  const seg = `${c.segments} SMS`
  return c.ucs2 ? `${car} · ${seg} (accent ou symbole : ${c.limiteSegment} caractères par SMS)` : `${car} · ${seg}`
}

// ── La détection HTML, celle du moteur ──────────────────────────────────────
/** Même test que sequenceur-st : un e-mail « HTML » part tel quel, sinon le
 *  texte est mis en page par texteVersHtml. */
export const estHtml = (contenu: string) => /<(html|body|table|div|p|a|img|tr|td)\b/i.test(contenu)

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Le texte d'un e-mail en HTML simple — copie de celle du moteur, pour que
 *  l'aperçu et l'envoi de test montrent ce que l'artisan recevra. */
export function texteVersHtml(texte: string, liens: string[]): string {
  let html = echapper(texte)
  for (const l of liens) html = html.replaceAll(echapper(l), `<a href="${l}">${l}</a>`)
  return `<div style="font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#1e293b">${html.replace(/\n/g, "<br>")}</div>`
}

/** Le HTML tel qu'il partira : le contenu s'il est déjà en HTML, sinon le
 *  texte mis en page avec ses liens cliquables. */
export function htmlPourEnvoi(contenuRempli: string, liens: LiensST): string {
  return estHtml(contenuRempli) ? contenuRempli : texteVersHtml(contenuRempli, [liens.candidature, liens.bareme, liens.stop])
}

/** Le texte brut d'un contenu (balises et styles retirés), pour un aperçu. */
export function apercuTexte(contenu: string): string {
  return contenu
    .replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
}

// ── Les contrôles d'une étape ────────────────────────────────────────────────
export type Avertissement = { niveau: "bloquant" | "attention"; texte: string }

/**
 * Ce qui empêche une étape de partir (bloquant) ou mérite un regard (attention).
 * Règle de la maison depuis le 08/10/2026 : CHAQUE e-mail et CHAQUE SMS porte
 * {{lien_desinscription}} — c'est lui qui rend la désinscription automatique.
 */
export function verifierEtape(etape: EtapeST): Avertissement[] {
  const a: Avertissement[] = []
  const contenu = etape.contenu ?? ""
  const vide = contenu.trim() === ""
  const sms = etape.canal === "sms"

  if (vide) a.push({ niveau: "bloquant", texte: "Le contenu est vide : rien ne partirait." })
  if (!sms && (etape.objet ?? "").trim() === "") a.push({ niveau: "bloquant", texte: "Cet e-mail n'a pas d'objet." })
  if (!vide && !porteDesinscription(contenu)) {
    a.push({ niveau: "bloquant", texte: "Le lien de désinscription manque : chaque e-mail et chaque SMS doit porter {{lien_desinscription}}, c'est lui qui rend la désinscription automatique." })
  }

  if (sms) {
    // On compte le SMS tel qu'il partira : liens à la taille réelle, variables remplies.
    const c = segmentsSms(exempleRemplissage(etape, LIENS_TAILLE_REELLE))
    if (c.segments > 1) {
      a.push({ niveau: "attention", texte: `Ce SMS fait ${c.segments} segments (${c.longueur} caractères${c.ucs2 ? ", avec accent ou symbole : 70 par SMS" : ""}) : il sera facturé ${c.segments} fois et peut arriver en morceaux.` })
    }
    // Le mot STOP en capitales, celui des « STOP au 36xxx » : « Stop : <lien> » reste permis.
    if (/\bSTOP\b/.test(contenu)) {
      a.push({ niveau: "attention", texte: "« STOP » promet une réponse par SMS, or l'offre Ringover ne reçoit pas les SMS : rien n'arriverait. Préférez le lien {{lien_desinscription}}." })
    }
  } else if (!vide && !contenu.includes("{{lien_candidature}}") && !contenu.includes("{{lien}}")) {
    a.push({ niveau: "attention", texte: "Cet e-mail n'a aucun lien vers le dépôt de dossier ({{lien_candidature}}) : l'artisan ne pourra pas candidater d'un clic." })
  }
  return a
}

export const aUnBloquant = (avertissements: Avertissement[]) => avertissements.some((x) => x.niveau === "bloquant")
