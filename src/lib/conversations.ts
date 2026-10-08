// Les CONVERSATIONS de la boîte de réception, façon Gmail (08/10/2026).
//
// Mahdi : « une boîte de réception, ça ne doit pas être différent de Gmail ».
// Gmail range les messages par conversation : un même correspondant ET un même
// objet (les « Re: », « Tr: » en moins). C'est ce que fait ce fichier, en pur,
// à partir des messages déjà chargés. Rien ici ne touche la base.
import { adresseCorrespondant, nomCorrespondant, type MessageDeBase } from "./messagesUtils"

export type MessageConv = MessageDeBase & {
  sousTraitantId?: string | null
  corpsText?: string
  piecesJointes?: unknown[]
}

export type Conversation<M extends MessageConv> = {
  cle: string // correspondant + objet normalisé
  adresse: string // adresse e-mail du correspondant
  nom: string // nom affichable du correspondant
  prospectId: string | null
  sousTraitantId: string | null
  objet: string // l'objet du dernier message
  messages: M[] // du plus ancien au plus récent
  dernier: M
  nonLus: number // messages reçus non lus
  aRecu: boolean // au moins un message reçu
  aEnvoye: boolean // au moins un message envoyé
  piecesJointes: number
}

// Les dossiers du rail de gauche.
export type Dossier = "reception" | "nonlus" | "envoyes" | "tous"

// « Re: Re: Devis » et « TR: Devis » sont la même conversation que « Devis ».
const PREFIXES = /^\s*((re|tr|fw|fwd|rep|rép|réf)\s*:\s*)+/i
export function objetNormalise(objet: string): string {
  const o = (objet || "").replace(PREFIXES, "").replace(/\s+/g, " ").trim().toLowerCase()
  return o || "(sans objet)"
}

// Regroupe les messages en conversations, de la plus récente à la plus ancienne.
export function grouperEnConversations<M extends MessageConv>(messages: M[]): Conversation<M>[] {
  const convs = new Map<string, Conversation<M>>()
  for (const m of messages) {
    const adresse = adresseCorrespondant(m)
    const contact = m.prospectId || m.sousTraitantId || adresse || "(inconnu)"
    const cle = `${contact}|${objetNormalise(m.objet)}`
    let c = convs.get(cle)
    if (!c) {
      c = {
        cle,
        adresse,
        nom: "",
        prospectId: m.prospectId,
        sousTraitantId: m.sousTraitantId ?? null,
        objet: m.objet,
        messages: [],
        dernier: m,
        nonLus: 0,
        aRecu: false,
        aEnvoye: false,
        piecesJointes: 0,
      }
      convs.set(cle, c)
    }
    c.messages.push(m)
    if (!c.prospectId && m.prospectId) c.prospectId = m.prospectId
    if (!c.sousTraitantId && m.sousTraitantId) c.sousTraitantId = m.sousTraitantId
    if (!c.adresse && adresse) c.adresse = adresse
    if (m.sens === "entrant") {
      c.aRecu = true
      if (!m.lu) c.nonLus++
      // Le nom le plus parlant : celui fourni par un message reçu (« Jean <j@x.fr> »).
      const n = nomCorrespondant(m.de)
      if (n && n !== adresse) c.nom = n
    } else {
      c.aEnvoye = true
    }
    c.piecesJointes += Array.isArray(m.piecesJointes) ? m.piecesJointes.length : 0
  }
  for (const c of convs.values()) {
    c.messages.sort((a, b) => (a.date < b.date ? -1 : 1))
    c.dernier = c.messages[c.messages.length - 1]
    c.objet = c.dernier.objet || c.messages.find((m) => m.objet)?.objet || ""
    if (!c.nom) c.nom = c.adresse
  }
  return [...convs.values()].sort((a, b) => (a.dernier.date < b.dernier.date ? 1 : -1))
}

// Le dossier, puis la recherche (nom, adresse, objet, contenu).
export function filtrerConversations<M extends MessageConv>(
  convs: Conversation<M>[],
  dossier: Dossier,
  recherche = "",
): Conversation<M>[] {
  const parDossier = convs.filter((c) =>
    dossier === "tous" ? true : dossier === "reception" ? c.aRecu : dossier === "nonlus" ? c.nonLus > 0 : c.aEnvoye,
  )
  const q = recherche.trim().toLowerCase()
  if (!q) return parDossier
  return parDossier.filter((c) =>
    [c.nom, c.adresse, c.objet, ...c.messages.map((m) => m.objet), ...c.messages.map((m) => m.corpsText || "")].some(
      (v) => (v || "").toLowerCase().includes(q),
    ),
  )
}

// Le chiffre à côté de « Boîte de réception » : le nombre de conversations non lues.
export function compterNonLues<M extends MessageConv>(convs: Conversation<M>[]): number {
  return convs.filter((c) => c.nonLus > 0).length
}

// « 1–50 sur 230 », comme en haut à droite de Gmail.
export function paginer<T>(liste: T[], page: number, parPage = 50) {
  const total = liste.length
  const pages = Math.max(1, Math.ceil(total / parPage))
  const p = Math.min(Math.max(1, page), pages)
  const debut = (p - 1) * parPage
  return {
    tranche: liste.slice(debut, debut + parPage),
    debut: total ? debut + 1 : 0,
    fin: Math.min(debut + parPage, total),
    total,
    page: p,
    pages,
  }
}

// L'étiquette posée à côté de l'objet d'une conversation ouverte.
export function etiquetteDe<M extends MessageConv>(c: Conversation<M>): "Boîte de réception" | "Envoyés" {
  return c.aRecu ? "Boîte de réception" : "Envoyés"
}
