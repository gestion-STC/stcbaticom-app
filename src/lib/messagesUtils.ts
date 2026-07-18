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
// Un fil = tous les échanges avec un même correspondant (rattachés au prospect
// quand il est connu, sinon à l'adresse e-mail).

export type MessageDeBase = {
  id: string
  sens: "entrant" | "sortant"
  de: string
  a: string
  objet: string
  prospectId: string | null
  lu: boolean
  date: string
}

export type Fil<M extends MessageDeBase> = {
  cle: string // prospectId ou adresse du correspondant
  adresse: string // adresse e-mail du correspondant
  nom: string // nom affichable du correspondant
  prospectId: string | null
  messages: M[] // du plus ancien au plus récent
  nonLus: number // entrants non lus
  dernier: M // message le plus récent (pour la liste)
}

// L'adresse du correspondant (l'autre partie que nous) selon le sens du message.
export function adresseCorrespondant(m: MessageDeBase): string {
  return extraireAdresse(m.sens === "entrant" ? m.de : m.a)
}

// Regroupe les messages en fils, triés du fil le plus récent au plus ancien.
export function grouperEnFils<M extends MessageDeBase>(messages: M[]): Fil<M>[] {
  const fils = new Map<string, Fil<M>>()
  for (const m of messages) {
    const adresse = adresseCorrespondant(m)
    const cle = m.prospectId || adresse || "(inconnu)"
    let fil = fils.get(cle)
    if (!fil) {
      fil = { cle, adresse, nom: "", prospectId: m.prospectId, messages: [], nonLus: 0, dernier: m }
      fils.set(cle, fil)
    }
    fil.messages.push(m)
    if (!fil.prospectId && m.prospectId) fil.prospectId = m.prospectId
    if (m.sens === "entrant" && !m.lu) fil.nonLus++
    // Le nom le plus parlant : celui fourni par un message entrant (« Jean <j@x.fr> »).
    if (m.sens === "entrant") {
      const n = nomCorrespondant(m.de)
      if (n && n !== adresse) fil.nom = n
    }
  }
  for (const fil of fils.values()) {
    fil.messages.sort((a, b) => (a.date < b.date ? -1 : 1))
    fil.dernier = fil.messages[fil.messages.length - 1]
    if (!fil.nom) fil.nom = fil.adresse
  }
  return [...fils.values()].sort((a, b) => (a.dernier.date < b.dernier.date ? 1 : -1))
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
