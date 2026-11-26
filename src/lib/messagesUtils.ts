// Petites fonctions pures pour la boîte de réception (testées dans messagesUtils.test.ts).

// Extrait l'adresse email d'un champ « De » : « Jean Dupont <jean@ex.fr> » → « jean@ex.fr ».
export function extraireAdresse(brut: string): string {
  const s = (brut || "").trim()
  const m = s.match(/<([^>]+)>/)
  return (m ? m[1] : s).toLowerCase().trim()
}

// Nom à afficher pour un correspondant : le nom s'il est présent, sinon l'adresse.
// « Jean Dupont <jean@ex.fr> » → « Jean Dupont » ; « jean@ex.fr » → « jean@ex.fr ».
export function nomCorrespondant(brut: string): string {
  const s = (brut || "").trim()
  const m = s.match(/^\s*"?([^"<]+?)"?\s*</)
  const nom = m ? m[1].trim() : ""
  return nom || extraireAdresse(s)
}

// Objet d'une réponse : préfixe « Re: » une seule fois (« Re: Re: … » interdit).
export function objetReponse(objet: string): string {
  const o = (objet || "").trim()
  return /^re\s*:/i.test(o) ? o : "Re: " + (o || "(sans objet)")
}

// Aperçu d'un corps de message pour la liste (façon Gmail) : texte brut, sur une
// seule ligne (retours à la ligne → espaces), tronqué proprement.
export function apercuTexte(texte: string, max = 120): string {
  const s = (texte || "").replace(/\s+/g, " ").trim()
  return s.length > max ? s.slice(0, max).trimEnd() + "…" : s
}

// Objet d'un transfert : préfixe « Tr: » une seule fois (« Tr: » ou « Fwd: » déjà là → inchangé).
export function objetTransfert(objet: string): string {
  const o = (objet || "").trim()
  return /^(tr|fwd?)\s*:/i.test(o) ? o : "Tr: " + (o || "(sans objet)")
}

// ── Fils de discussion ─────────────────────────────────────────────────────
// Le message vu par les conversations (lib/conversations) : rattaché à son agence quand elle
// est connue, sinon à l'adresse e-mail.

export type MessageDeBase = {
  id: string
  sens: "entrant" | "sortant"
  de: string
  a: string
  objet: string
  agenceId: string | null
  lu: boolean
  date: string
}

// L'adresse du correspondant (l'autre partie que nous) selon le sens du message.
export function adresseCorrespondant(m: MessageDeBase): string {
  return extraireAdresse(m.sens === "entrant" ? m.de : m.a)
}

// Date lisible en français : aujourd'hui → « 14:32 », sinon « 9 juil. » (+ année si différente).
export function dateCourte(iso: string, maintenant: Date = new Date()): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const memeJour =
    d.getDate() === maintenant.getDate() &&
    d.getMonth() === maintenant.getMonth() &&
    d.getFullYear() === maintenant.getFullYear()
  if (memeJour) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === maintenant.getFullYear()
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" }
  return d.toLocaleDateString("fr-FR", opts)
}

// ── Répondre, transférer (26/11/2026, lot 2) ───────────────────────────────

const ADRESSES = /[^\s<>,;:"'()[\]]+@[^\s<>,;:"'()[\]]+\.[a-z]{2,}/gi
const adressesDans = (t: string) => [...new Set((t.match(ADRESSES) ?? []).map((x) => x.toLowerCase()))]

/** Le champ « à » enregistré d'un envoi, « a@x, b@y · cc : c@z · cci : d@w », découpé en À et Cc (la Cci ne se répète pas). */
export function destinatairesDe(a: string): { to: string[]; cc: string[] } {
  const [tete, ...suite] = String(a || "").split(/\s·\s/)
  const cc = suite.filter((p) => /^\s*cc\s*:/i.test(p)).flatMap((p) => adressesDans(p.replace(/^\s*cc\s*:/i, "")))
  const to = adressesDans(tete)
  return { to, cc: cc.filter((x) => !to.includes(x)) }
}

type MessageDuFilMin = MessageDeBase & { messageId?: string | null }

/**
 * À qui répondre : l'expéditeur du message choisi s'il est reçu, sinon celui du dernier message REÇU ; une
 * conversation sans réponse (nos seuls envois) : les destinataires du dernier envoi, découpés proprement.
 * Avant : l'adresse du dernier message, le nôtre compris (9 conversations mêlaient deux correspondants).
 */
export function destinatairesReponse(messages: MessageDuFilMin[], choisi?: MessageDuFilMin | null): { to: string[]; cc: string[] } {
  const recu = choisi?.sens === "entrant" ? choisi : [...messages].reverse().find((m) => m.sens === "entrant")
  if (recu) {
    const de = extraireAdresse(recu.de)
    return { to: de.includes("@") ? [de] : [], cc: [] }
  }
  const envoi = choisi ?? messages[messages.length - 1]
  return envoi ? destinatairesDe(envoi.a) : { to: [], cc: [] }
}

/** Le message à transférer : celui sur lequel on a cliqué, sinon le dernier reçu, sinon le dernier. */
export function messageATransferer<M extends MessageDeBase>(messages: M[], choisi?: M | null): M | null {
  return choisi ?? [...messages].reverse().find((m) => m.sens === "entrant") ?? messages[messages.length - 1] ?? null
}

const vraiId = (id: string | null | undefined) => (id && /^<?[^\s<>@]+@[^\s<>@]+>?$/.test(id.trim()) ? id.trim().replace(/^<|>$/g, "") : null)

/**
 * Le fil d'une réponse : le Message-ID du message reçu auquel on répond (le choisi, sinon le dernier reçu) et tous
 * ceux des messages reçus avant lui. Un identifiant de NOS envois (Resend, sans « @ ») n'en est jamais : une relance
 * après notre propre réponse sortait du fil (26/11/2026).
 */
export function filDeReponse(messages: MessageDuFilMin[], choisi?: MessageDuFilMin | null): { inReplyTo: string | null; references: string[] } {
  const jusqua = choisi ? messages.indexOf(choisi) : messages.length - 1
  const avant = messages.slice(0, jusqua < 0 ? messages.length : jusqua + 1)
  const ids = avant.filter((m) => m.sens === "entrant").map((m) => vraiId(m.messageId)).filter((x): x is string => !!x)
  return { inReplyTo: ids[ids.length - 1] ?? null, references: [...new Set(ids)].slice(-20) }
}
