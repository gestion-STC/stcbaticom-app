// ════════════════════════════════════════════════════════════════════════════
// LE FIL D'UN MAIL ENVOYÉ (26/11/2026, lot 2 « boîte mail ») — pur, sans réseau, testé (src/lib/filMail.test.ts).
//
// · listeAdresses : une adresse enregistrée peut être une liste (« a@x, b@y », « h2i@… · cc : … ») ;
//   on en tire chaque adresse, proprement (avant : envoi refusé).
// · enteteDeFil : seul un VRAI Message-ID (il contient « @ » : celui d'un mail reçu) va dans In-Reply-To /
//   References. L'identifiant que Resend nous rend n'en est pas un : le poser cassait le fil.
// · citationTransfert : le message transféré, avec sa mise en page nettoyée (aucun script, aucun formulaire).
// · cheminDuJournal : une pièce d'un mail reçu repart par un lien d'une heure ; le journal garde son CHEMIN
//   de stockage, le lien est refait à l'ouverture.
// ════════════════════════════════════════════════════════════════════════════

const UNE_ADRESSE = /[^\s<>,;:"'()[\]]+@[^\s<>,;:"'()[\]]+\.[a-z]{2,}/gi

/** Toutes les adresses d'un champ (texte ou liste), en minuscules, sans doublon, dans l'ordre. */
export function listeAdresses(brut: unknown): string[] {
  const textes = (Array.isArray(brut) ? brut : [brut]).map((x) => String(x ?? ""))
  const out: string[] = []
  for (const t of textes) for (const m of t.match(UNE_ADRESSE) ?? []) {
    const a = m.toLowerCase().replace(/\.+$/, "")
    if (!out.includes(a)) out.push(a)
  }
  return out
}

/** Les en-têtes du fil, ou null : uniquement de vrais Message-ID (« <…@…> »). */
export function enteteDeFil(inReplyTo: unknown, references?: unknown): Record<string, string> | null {
  const ids = (v: unknown) => String(v ?? "").split(/[\s,]+/).map((x) => x.replace(/^<|>$/g, "").trim()).filter((x) => /^[^\s<>@]+@[^\s<>@]+$/.test(x))
  const repondA = ids(inReplyTo)[0] ?? null
  const chaine = [...new Set([...ids(Array.isArray(references) ? references.join(" ") : references), ...(repondA ? [repondA] : [])])].slice(-20)
  const cible = repondA ?? chaine[chaine.length - 1] ?? null
  if (!cible) return null
  return { "In-Reply-To": `<${cible}>`, References: chaine.map((x) => `<${x}>`).join(" ") }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Le HTML d'un mail reçu, nettoyé pour repartir : le corps seulement, sans script, cadre, formulaire ni gestionnaire. */
export function htmlNettoye(html: string): string {
  let h = String(html ?? "")
  const corps = h.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  if (corps) h = corps[1]
  h = h
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|iframe|object|embed|form|title|noscript)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(script|iframe|object|embed|form|input|button|select|textarea|meta|link|base|html|head|body|frame|frameset)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|action)\s*=\s*("|')\s*(javascript|vbscript|data:text\/html)[^"']*\2/gi, '$1="#"')
  return h.trim()
}

export type Citation = { de?: unknown; a?: unknown; date?: unknown; objet?: unknown; html?: unknown; texte?: unknown }

/** Le bloc « Message transféré » : en HTML (mise en page d'origine) et en texte. null sans contenu — sauf
 *  `avecPieces` (26/11/2026, D73) : un mail reçu sans texte, avec seulement une pièce jointe, se transfère quand même
 *  (l'en-tête De / Date / Objet suit, les pièces partent jointes). */
export function citationTransfert(c: unknown, avecPieces = false): { html: string; texte: string } | null {
  if (!c || typeof c !== "object") return null
  const x = c as Citation
  const s = (v: unknown) => String(v ?? "").trim()
  const htmlOrigine = htmlNettoye(s(x.html))
  const texteOrigine = s(x.texte)
  if (!htmlOrigine && !texteOrigine && !avecPieces) return null
  const date = s(x.date) ? new Date(s(x.date)) : null
  const quand = date && !isNaN(date.getTime()) ? date.toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : ""
  const lignes: [string, string][] = [["De", s(x.de)], ["Date", quand], ["Objet", s(x.objet)], ["À", s(x.a)]].filter(([, v]) => v) as [string, string][]
  const entete = lignes.map(([k, v]) => `${k} : ${esc(v)}`).join("<br>")
  const contenu = htmlOrigine || (texteOrigine ? `<div style="white-space:pre-wrap">${esc(texteOrigine)}</div>` : "")
  const html = `<br><div style="font-family:Arial,sans-serif;font-size:13px;color:#444">---------- Message transféré ----------<br>${entete}</div><br><div>${contenu}</div>`
  const texteDuHtml = htmlOrigine.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|h\d|li)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim()
  const texte = `\n\n---------- Message transféré ----------\n${lignes.map(([k, v]) => `${k} : ${v}`).join("\n")}\n\n${texteOrigine || texteDuHtml}`
  return { html, texte }
}

/** Le « chemin » d'une pièce envoyée dans le journal : le chemin privé d'une pièce reçue, sinon l'adresse publique. */
export function cheminDuJournal(url: string): string {
  const m = String(url ?? "").match(/\/storage\/v1\/object\/sign\/mails-recus\/([^?#]+)/)
  if (!m) return url
  try { return decodeURIComponent(m[1]) } catch { return m[1] }
}

/** Le nom de STOCKAGE d'une pièce reçue (recevoir-email, comme STC Bâtiment) : le stockage refuse les accents et
 *  l'apostrophe typographique (« Barème 2026 VIAREN.pdf » était perdu sans prévenir). Lettres simples, chiffres,
 *  point, tiret ; le nom d'origine reste celui qu'on affiche. */
export function nomDeStockage(n: string): string {
  const s = String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^[_.]+/, "")
  const point = s.lastIndexOf(".")
  const ext = point > 0 ? s.slice(point).slice(0, 10) : ""
  return ((point > 0 ? s.slice(0, point) : s).slice(0, 100) || "fichier") + ext
}

/** Le texte lisible d'un mail en HTML seul (26/11/2026, D72) : sans en-tête, style ni script, balises retirées,
 *  entités courantes décodées. Sert à lire une demande d'arrêt écrite dans un mail sans version texte. */
export function texteDuHtml(html: string): string {
  return String(html ?? "")
    .replace(/<(head|style|script|title|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|h\d|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&eacute;/gi, "é").replace(/&egrave;/gi, "è").replace(/&agrave;/gi, "à").replace(/&ccedil;/gi, "ç").replace(/&ecirc;/gi, "ê")
    .replace(/[ \t\r]+/g, " ").replace(/\s*\n\s*/g, "\n").trim()
}

/** Une demande de validation d'un anti-spam (« prouvez que vous êtes humain ») : notre mail attend chez le
 *  destinataire (26/11/2026, D75). Ni une réponse, ni un lead, ni une demande d'arrêt. */
const DOMAINES_ANTI_SPAM = ["mailinblack.com"]
export function estDefiAntiSpam(expediteur: string): boolean {
  const a = String(expediteur ?? "").toLowerCase().trim()
  const domaine = a.slice(a.lastIndexOf("@") + 1)
  return a.includes("@") && DOMAINES_ANTI_SPAM.some((d) => domaine === d || domaine.endsWith(`.${d}`))
}
