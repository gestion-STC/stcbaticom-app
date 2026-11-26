import { supabase } from "./supabase"
import { grouperEnConversations } from "./conversations"
import { adresseCorrespondant } from "./messagesUtils"

export type SensMessage = "entrant" | "sortant"
// DEUX ESPACES (08/10/2026) : la boîte du démarchage et celle du recrutement
// sont deux boîtes. Chaque message appartient à l'une des deux.
export type Espace = "demarchage" | "recrutement"

// Pièce jointe d'un e-mail reçu (fichier archivé dans le bucket privé « mails-recus »).
// `nonGardee` (26/11/2026) : la pièce n'a pas pu être gardée (trop lourde, refusée…) ; pas de fichier, la raison.
export type PieceRecue = { nom: string; chemin: string; taille: number; type: string; nonGardee?: string }

export type Message = {
  id: string
  sens: SensMessage
  espace: Espace
  sousTraitantId: string | null
  de: string
  a: string
  objet: string
  corpsText: string
  corpsHtml: string
  messageId: string | null
  inReplyTo: string | null
  agenceId: string | null
  /** Le propriétaire du mail au démarchage (11/11/2026) : le compte du commercial ; null = adresse générale. */
  compteId?: string | null
  lu: boolean
  date: string
  piecesJointes: PieceRecue[]
  /** Le tri de l'IA, pour une réponse à une campagne. */
  tri?: string | null
  /** Ce que l'IA a lu en plus : la date de retour d'un absent, le bon contact. */
  triDetail?: { retour?: string; contact_nom?: string; contact_email?: string; contact_telephone?: string } | null
  /** Un envoi rebondi (26/11/2026) : quand et pourquoi il n'a pas été remis. */
  nonRemisLe?: string | null
  nonRemisMotif?: string | null
}

type Ligne = {
  non_remis_le?: string | null
  non_remis_motif?: string | null
  tri?: string | null
  tri_detail?: Message["triDetail"]
  id: string
  sens: SensMessage
  espace: Espace | null
  sous_traitant_id: string | null
  de: string
  a: string
  objet: string
  corps_text: string
  corps_html: string
  message_id: string | null
  in_reply_to: string | null
  agence_id: string | null
  compte_id?: string | null
  lu: boolean
  created_at: string
  pieces_jointes: PieceRecue[] | null
}

function vers(l: Ligne): Message {
  return {
    id: l.id,
    sens: l.sens,
    espace: l.espace ?? "demarchage",
    sousTraitantId: l.sous_traitant_id,
    de: l.de,
    a: l.a,
    objet: l.objet,
    corpsText: l.corps_text,
    tri: l.tri ?? null,
    triDetail: l.tri_detail ?? null,
    corpsHtml: l.corps_html,
    messageId: l.message_id,
    inReplyTo: l.in_reply_to,
    agenceId: l.agence_id,
    compteId: l.compte_id ?? null,
    lu: l.lu,
    date: l.created_at,
    piecesJointes: Array.isArray(l.pieces_jointes) ? l.pieces_jointes : [],
    nonRemisLe: l.non_remis_le ?? null,
    nonRemisMotif: l.non_remis_motif ?? null,
  }
}

const COLONNES_BASE =
  "id, sens, espace, sous_traitant_id, de, a, objet, corps_text, corps_html, message_id, in_reply_to, agence_id, compte_id, lu, created_at, pieces_jointes, tri, tri_detail"
// Les colonnes du rebond (26/11/2026) : tant que le SQL du lot 2 n'est pas passé, la boîte se lit sans elles.
let avecRemise = true
const colonnes = () => (avecRemise ? COLONNES_BASE + ", non_remis_le, non_remis_motif" : COLONNES_BASE)

type Reponse = { data: unknown[] | null; error: { message: string } | null }
type Requete = { range: (de: number, a: number) => PromiseLike<Reponse> }
const PAQUET = 1000

/** Lit TOUTES les lignes d'une requête, par paquets de 1 000 (la limite du serveur), jusqu'à `max`. */
async function lirePages(fabrique: (cols: string) => Requete, max = Number.POSITIVE_INFINITY): Promise<Ligne[]> {
  const out: Ligne[] = []
  for (let debut = 0; debut < max; debut += PAQUET) {
    const fin = Math.min(debut + PAQUET, max) - 1
    let r = await fabrique(colonnes()).range(debut, fin)
    if (r.error && avecRemise && /non_remis/.test(r.error.message)) {
      avecRemise = false
      r = await fabrique(colonnes()).range(debut, fin)
    }
    if (r.error) throw new Error(r.error.message)
    const lignes = (r.data ?? []) as Ligne[]
    out.push(...lignes)
    if (lignes.length < fin - debut + 1) break
  }
  return out
}

function base(espace: Espace | undefined, cols: string) {
  if (!supabase) throw new Error("Supabase non configuré")
  const q = supabase.from("messages").select(cols)
  return espace ? q.eq("espace", espace) : q
}
const parDate = <Q extends { order: (c: string, o: { ascending: boolean }) => Q }>(q: Q) => q.order("created_at", { ascending: false }).order("id", { ascending: false })

/** Les conversations sont rangées par agence, artisan ou adresse : de quoi relire tous leurs messages. */
export type ClesConversations = { agences: string[]; artisans: string[]; adresses: string[] }
export function clesDe(messages: Pick<Message, "agenceId" | "sousTraitantId" | "sens" | "de" | "a">[]): ClesConversations {
  const agences = new Set<string>(), artisans = new Set<string>(), adresses = new Set<string>()
  for (const m of messages) {
    if (m.agenceId) agences.add(m.agenceId)
    if (m.sousTraitantId) artisans.add(m.sousTraitantId)
    const adr = adresseCorrespondant(m)
    if (adr.includes("@")) adresses.add(adr)
  }
  return { agences: [...agences], artisans: [...artisans], adresses: [...adresses] }
}

/** Une adresse qu'on peut poser telle quelle dans un filtre du serveur (ni guillemet, ni virgule, ni parenthèse). */
const adresseSure = (x: string) => /^[^\s"',()\\*%]+@[^\s"',()\\*%]+$/.test(x)
const paquets = <T,>(l: T[], n = 100) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n))

/** Tous les messages de ces conversations (les deux sens), sans plafond. */
export async function chargerLies(espace: Espace | undefined, cles: ClesConversations): Promise<Message[]> {
  const lots: Promise<Ligne[]>[] = []
  for (const p of paquets(cles.agences)) lots.push(lirePages((c) => parDate(base(espace, c).in("agence_id", p))))
  for (const p of paquets(cles.artisans)) lots.push(lirePages((c) => parDate(base(espace, c).in("sous_traitant_id", p))))
  // Un envoi à plusieurs ou avec copie (« a@x, b@y · cc : … ») est retrouvé par sa première adresse (26/11/2026, D70).
  for (const p of paquets(cles.adresses.filter(adresseSure), 30)) {
    const filtre = [`a.in.(${p.map((x) => `"${x}"`).join(",")})`, ...p.flatMap((x) => [`a.like."${x}, *"`, `a.like."${x} · *"`])].join(",")
    lots.push(lirePages((c) => parDate(base(espace, c).eq("sens", "sortant").or(filtre))))
  }
  const vus = new Map<string, Ligne>()
  for (const l of (await Promise.all(lots)).flat()) vus.set(l.id, l)
  return [...vus.values()].map(vers)
}

/** Fusionne des listes de messages (sans doublon), du plus récent au plus ancien. */
export function fusionner(...listes: Message[][]): Message[] {
  const vus = new Map<string, Message>()
  for (const l of listes) for (const m of l) vus.set(m.id, m)
  return [...vus.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** Combien de messages récents la boîte lit d'abord ; « Plus anciens » en lit autant à chaque fois. */
export const TRANCHE_RECENTS = 500

/**
 * LA BOÎTE, SANS PLAFOND QUI CACHE (26/11/2026). Avant : les 500 derniers messages, plus les non-lus. Au recrutement,
 * 4 470 envois automatiques prenaient toute la place : les réponses d'artisans déjà lues étaient invisibles, et la
 * recherche ne portait que sur ces 500. Maintenant :
 *   · TOUS les messages reçus, et tous les messages de leurs conversations (Réception est donc toujours complète) ;
 *   · les `recents` derniers messages (Envoyés, Tous), et « Plus anciens » pour remonter sans limite.
 */
export async function chargerBoite(espace: Espace | undefined, recents = TRANCHE_RECENTS): Promise<{ messages: Message[]; encore: boolean }> {
  const [recus, derniers] = await Promise.all([
    lirePages((c) => parDate(base(espace, c).eq("sens", "entrant"))),
    lirePages((c) => parDate(base(espace, c)), recents + 1),
  ])
  const encore = derniers.length > recents
  const lies = await chargerLies(espace, clesDe(recus.map(vers)))
  return { messages: fusionner(recus.map(vers), derniers.slice(0, recents).map(vers), lies), encore }
}

/** La recherche, côté serveur, dans TOUS les messages de la boîte (nom, adresse, objet, texte, mise en page). */
export async function rechercherMessages(espace: Espace | undefined, recherche: string, max = 300): Promise<Message[]> {
  const mot = recherche.trim().replace(/[,()"\\*%_]/g, " ").replace(/\s+/g, " ").trim()
  if (mot.length < 2) return []
  const motif = `"*${mot}*"`
  const trouves = await lirePages((c) => parDate(base(espace, c).or(["objet", "de", "a", "corps_text", "corps_html"].map((k) => `${k}.ilike.${motif}`).join(","))), max)
  return trouves.map(vers)
}

/** Ancienne lecture (les 500 derniers + les non-lus), gardée pour qui l'appellerait encore. */
export async function chargerMessages(espace?: Espace): Promise<Message[]> {
  return (await chargerBoite(espace)).messages
}

/** Les derniers messages, plus les non-lus plus anciens qu'ils n'incluent pas, du plus récent au plus ancien. */
export function fusionnerAvecNonLus<T extends { id: string; created_at: string }>(derniers: T[], nonLus: T[]): T[] {
  const vus = new Set(derniers.map((m) => m.id))
  const manquants = nonLus.filter((m) => !vus.has(m.id))
  if (!manquants.length) return derniers
  return [...derniers, ...manquants].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
}

/** Prévient la barre latérale qu'un message vient d'être lu ou remis non lu : la pastille se recompte tout de suite. */
export const EVENEMENT_LUS = "baticom:messages-lus"
function prevenirPastille() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENEMENT_LUS))
}

// La pastille de la barre latérale : le nombre de CONVERSATIONS non lues (26/11/2026), la même unité que le titre de la
// boîte (« 3 non lues ») ; avant, elle comptait les messages et les deux chiffres ne se ressemblaient pas.
// Une lecture ratée (réseau, session expirée) LÈVE une erreur (26/11/2026, D100) : la barre latérale garde son chiffre et
// le signale, au lieu d'afficher 0 comme si tout était lu. `compterNonLus` garde l'ancien comportement (0) pour ses
// autres appelants.
export async function lireNonLus(espace?: Espace): Promise<number> {
  if (!supabase) return 0
  let q = supabase.from("messages").select("id, sens, de, a, objet, agence_id, sous_traitant_id, lu, created_at").eq("sens", "entrant").eq("lu", false).limit(5000)
  if (espace) q = q.eq("espace", espace)
  const { data, error } = await q
  if (error) throw new Error(`Compter non lus : ${error.message}`)
  type L = { id: string; sens: SensMessage; de: string; a: string; objet: string; agence_id: string | null; sous_traitant_id: string | null; lu: boolean; created_at: string }
  return compterConversationsNonLues(((data ?? []) as L[]).map((l) => ({ id: l.id, sens: l.sens, de: l.de, a: l.a, objet: l.objet, agenceId: l.agence_id, sousTraitantId: l.sous_traitant_id, lu: l.lu, date: l.created_at })))
}

export async function compterNonLus(espace?: Espace): Promise<number> {
  try {
    return await lireNonLus(espace)
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    return 0
  }
}

/** Des messages reçus non lus → le nombre de conversations qu'ils touchent (le même regroupement que la boîte). */
export function compterConversationsNonLues(nonLus: Parameters<typeof grouperEnConversations>[0]): number {
  return grouperEnConversations(nonLus).filter((c) => c.nonLus > 0).length
}

// Marque une liste de messages comme lus (ouverture d'un fil de discussion).
/** Le commercial tranche une réponse : lead (on rouvre ou on crée le lead) ou dead (l'agence passe en « Pas intéressé »). */
export async function deciderReponse(id: string, decision: "lead" | "dead"): Promise<void> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  const { error } = await supabase.rpc("cmp_decider_reponse", { p_message: id, p_decision: decision })
  if (error) throw new Error(error.message)
}

export async function marquerLus(ids: string[]): Promise<void> {
  if (!supabase || ids.length === 0) return
  const { error } = await supabase.from("messages").update({ lu: true }).in("id", ids)
  prevenirPastille()
  if (error) throw new Error(`Marquer comme lu : ${error.message}`)
}

// Marque une liste de messages comme NON lus (option « marquer comme non lu »).
export async function marquerNonLus(ids: string[]): Promise<void> {
  if (!supabase || ids.length === 0) return
  const { error } = await supabase.from("messages").update({ lu: false }).in("id", ids)
  prevenirPastille()
  if (error) throw new Error(`Marquer comme non lu : ${error.message}`)
}

// Lien de téléchargement temporaire (5 min) d'une pièce jointe reçue.
// Le bucket est privé : seul un utilisateur connecté peut générer ce lien.
// Une pièce ENVOYÉE (05/11/2026) garde l'adresse publique de son fichier : on l'ouvre telle quelle.
// Une pièce TRANSFÉRÉE avant le 26/11/2026 garde un lien d'une heure, expiré : on en refait un depuis son chemin.
export async function lienPieceJointe(chemin: string): Promise<string> {
  const prive = cheminPrive(chemin)
  if (prive === null) return chemin
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase.storage.from("mails-recus").createSignedUrl(prive, 300)
  if (error || !data?.signedUrl) throw new Error(error?.message || "Lien indisponible")
  return data.signedUrl
}

/** Le chemin dans le stockage privé des mails reçus, ou null pour une adresse publique (à ouvrir telle quelle). */
export function cheminPrive(chemin: string): string | null {
  const signe = chemin.match(/\/storage\/v1\/object\/sign\/mails-recus\/([^?#]+)/)
  if (signe) { try { return decodeURIComponent(signe[1]) } catch { return signe[1] } }
  return chemin.startsWith("https://") ? null : chemin
}

/** Les pièces d'un message reçu, prêtes à repartir avec un transfert (17/11/2026) : un lien valable 1 heure, que le
 *  service d'envoi télécharge au moment de l'envoi. Une pièce déjà publique garde son adresse. */
export async function piecesPourTransfert(pieces: PieceRecue[]): Promise<Array<{ nom: string; url: string; taille: number; chemin: string }>> {
  if (!supabase || !pieces.length) return []
  const sb = supabase
  return Promise.all(pieces.filter((p) => !p.nonGardee && p.chemin).map(async (p) => {
    const prive = cheminPrive(p.chemin)
    if (prive === null) return { nom: p.nom, url: p.chemin, taille: p.taille, chemin: p.chemin }
    const { data, error } = await sb.storage.from("mails-recus").createSignedUrl(prive, 3600)
    if (error || !data?.signedUrl) throw new Error(`pièce « ${p.nom} » illisible : ${error?.message ?? "lien indisponible"}`)
    return { nom: p.nom, url: data.signedUrl, taille: p.taille, chemin: p.chemin }
  }))
}

// « Bon contact cité » (26/11/2026, D74) : le contact est-il déjà sur la fiche de l'agence ? Même adresse, ou même nom
// (civilité, accents et casse ignorés). Pur, testé.
const sansAccent = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
const nomSeul = (s: string) => sansAccent(s).replace(/^(m\.?|mme|madame|monsieur|mr|mlle|mademoiselle)\s+/, "")
export function contactDejaPresent(cite: { contact_nom?: string; contact_email?: string }, fiche: Array<{ prenom: string; nom: string; email: string }>): boolean {
  const email = (cite.contact_email ?? "").trim().toLowerCase()
  const nom = nomSeul(cite.contact_nom ?? "")
  return fiche.some((c) =>
    (email !== "" && (c.email ?? "").trim().toLowerCase() === email) ||
    (nom !== "" && [`${c.prenom} ${c.nom}`, `${c.nom} ${c.prenom}`, c.nom].some((n) => nomSeul(n) === nom)))
}
/** Les contacts d'une agence (prénom, nom, adresse), pour savoir si un contact cité y est déjà. */
export async function contactsDeLAgence(agenceId: string): Promise<Array<{ prenom: string; nom: string; email: string }>> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  const { data, error } = await supabase.from("contacts").select("prenom, nom, email").eq("agence_id", agenceId)
  if (error) throw new Error(error.message)
  return (data ?? []) as Array<{ prenom: string; nom: string; email: string }>
}

/** Répond à un prospect depuis la boîte Instantly qui a reçu son message (jamais par Resend). */
export async function repondreParInstantly(r: { message: string; objet: string; corps: string; signatureHtml?: string }): Promise<void> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  const { data, error } = await supabase.functions.invoke("instantly-repondre", { body: { message: r.message, objet: r.objet, corps: r.corps, ...(r.signatureHtml ? { signature_html: r.signatureHtml } : {}) } })
  if (error) throw new Error("La réponse n'a pas pu partir par la boîte de prospection.")
  if (data?.error) throw new Error(String(data.error))
}

// Répond à un message via le relais serveur (contrat « moteur » de envoyer-email :
// composition côté serveur, fil de discussion conservé grâce à in_reply_to). Le
// relais journalise lui-même le message sortant. `signatureHtml` / `commercial`
// (07/10/2026) : la signature STC Bâtiment et le prénom du compte connecté ;
// sans eux, le serveur garde la signature des paramètres. `espace` (08/10) :
// une réponse du recrutement part de l'adresse du recrutement.
export async function repondreMessage(r: {
  /** Une ou plusieurs adresses (26/11/2026 : le champ À est modifiable, Cc et Cci aussi). */
  to: string | string[]
  cc?: string[]
  cci?: string[]
  /** Les vrais Message-ID du fil (ceux des mails reçus), pour que la réponse reste dans la conversation. */
  references?: string[]
  /** Un transfert : le message choisi, repris avec sa mise en page sous la signature. */
  citation?: { de: string; a: string; date: string; objet: string; html: string; texte: string }
  objet: string
  corps: string
  inReplyTo?: string | null
  agenceId?: string | null
  /** L'artisan de la conversation (recrutement) : la réponse est rangée sur sa fiche (26/11/2026, D70). */
  sousTraitantId?: string | null
  signatureHtml?: string
  commercial?: string
  espace?: Espace
  /** Les pièces jointes ajoutées à la main (05/11/2026) : elles partent en vraies pièces jointes. */
  pieces?: Array<{ nom: string; url: string; taille: number }>
}): Promise<void> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  const { data, error } = await supabase.functions.invoke("envoyer-email", {
    body: {
      ...(r.pieces?.length ? { pieces: r.pieces } : {}),
      to: r.to,
      ...(r.cc?.length ? { cc: r.cc } : {}),
      ...(r.cci?.length ? { bcc: r.cci } : {}),
      ...(r.references?.length ? { references: r.references } : {}),
      ...(r.citation ? { citation: r.citation } : {}),
      objet: r.objet,
      corps: r.corps,
      ...(r.inReplyTo ? { in_reply_to: r.inReplyTo } : {}),
      ...(r.agenceId ? { agence_id: r.agenceId } : {}),
      ...(r.sousTraitantId ? { sous_traitant_id: r.sousTraitantId } : {}),
      ...(r.signatureHtml ? { signature_html: r.signatureHtml } : {}),
      ...(r.commercial ? { commercial: r.commercial } : {}),
      ...(r.espace ? { espace: r.espace } : {}),
    },
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
}
