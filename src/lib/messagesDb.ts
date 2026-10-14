import { supabase } from "./supabase"

export type SensMessage = "entrant" | "sortant"
// DEUX ESPACES (08/10/2026) : la boîte du démarchage et celle du recrutement
// sont deux boîtes. Chaque message appartient à l'une des deux.
export type Espace = "demarchage" | "recrutement"

// Pièce jointe d'un e-mail reçu (fichier archivé dans le bucket privé « mails-recus »).
export type PieceRecue = { nom: string; chemin: string; taille: number; type: string }

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
  lu: boolean
  date: string
  piecesJointes: PieceRecue[]
}

type Ligne = {
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
    corpsHtml: l.corps_html,
    messageId: l.message_id,
    inReplyTo: l.in_reply_to,
    agenceId: l.agence_id,
    lu: l.lu,
    date: l.created_at,
    piecesJointes: Array.isArray(l.pieces_jointes) ? l.pieces_jointes : [],
  }
}

const COLONNES =
  "id, sens, espace, sous_traitant_id, de, a, objet, corps_text, corps_html, message_id, in_reply_to, agence_id, lu, created_at, pieces_jointes"

// Sans `espace`, on lit tout (ancien comportement).
export async function chargerMessages(espace?: Espace): Promise<Message[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  let q = supabase.from("messages").select(COLONNES).order("created_at", { ascending: false }).limit(500)
  if (espace) q = q.eq("espace", espace)
  // ⚠ LES NON-LUS, QUEL QUE SOIT LEUR ÂGE (12/10/2026). La boîte ne lit que
  // les 500 derniers messages, mais la pastille compte TOUTE la base : un
  // non-lu plus ancien (une réponse automatique du 05/08, 1 333e message)
  // n'était jamais affiché, donc jamais ouvrable — et le « 1 » restait pour
  // toujours. On ajoute donc les reçus non lus manquants à la liste.
  let qNonLus = supabase.from("messages").select(COLONNES).eq("sens", "entrant").eq("lu", false)
    .order("created_at", { ascending: false }).limit(1000)
  if (espace) qNonLus = qNonLus.eq("espace", espace)
  const [{ data, error }, { data: nonLus, error: eNonLus }] = await Promise.all([q, qNonLus])
  if (error) throw new Error(error.message)
  if (eNonLus) throw new Error(eNonLus.message)
  return fusionnerAvecNonLus(data as Ligne[], nonLus as Ligne[]).map(vers)
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

// Nombre de messages reçus non lus (pour la pastille de la barre latérale), par espace.
export async function compterNonLus(espace?: Espace): Promise<number> {
  if (!supabase) return 0
  let q = supabase.from("messages").select("id", { count: "exact", head: true }).eq("sens", "entrant").eq("lu", false)
  if (espace) q = q.eq("espace", espace)
  const { count, error } = await q
  if (error) {
    console.error("Compter non lus :", error.message)
    return 0
  }
  return count ?? 0
}

// Marque une liste de messages comme lus (ouverture d'un fil de discussion).
export async function marquerLus(ids: string[]): Promise<void> {
  if (!supabase || ids.length === 0) return
  const { error } = await supabase.from("messages").update({ lu: true }).in("id", ids)
  if (error) console.error("Marquer lus :", error.message)
  prevenirPastille()
}

// Marque une liste de messages comme NON lus (option « marquer comme non lu »).
export async function marquerNonLus(ids: string[]): Promise<void> {
  if (!supabase || ids.length === 0) return
  const { error } = await supabase.from("messages").update({ lu: false }).in("id", ids)
  if (error) console.error("Marquer non lus :", error.message)
  prevenirPastille()
}

// Lien de téléchargement temporaire (5 min) d'une pièce jointe reçue.
// Le bucket est privé : seul un utilisateur connecté peut générer ce lien.
export async function lienPieceJointe(chemin: string): Promise<string> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase.storage.from("mails-recus").createSignedUrl(chemin, 300)
  if (error || !data?.signedUrl) throw new Error(error?.message || "Lien indisponible")
  return data.signedUrl
}

// Répond à un message via le relais serveur (contrat « moteur » de envoyer-email :
// composition côté serveur, fil de discussion conservé grâce à in_reply_to). Le
// relais journalise lui-même le message sortant. `signatureHtml` / `commercial`
// (07/10/2026) : la signature STC Bâtiment et le prénom du compte connecté ;
// sans eux, le serveur garde la signature des paramètres. `espace` (08/10) :
// une réponse du recrutement part de l'adresse du recrutement.
export async function repondreMessage(r: {
  to: string
  objet: string
  corps: string
  inReplyTo?: string | null
  agenceId?: string | null
  signatureHtml?: string
  commercial?: string
  espace?: Espace
}): Promise<void> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  const { data, error } = await supabase.functions.invoke("envoyer-email", {
    body: {
      to: r.to,
      objet: r.objet,
      corps: r.corps,
      ...(r.inReplyTo ? { in_reply_to: r.inReplyTo } : {}),
      ...(r.agenceId ? { agence_id: r.agenceId } : {}),
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
