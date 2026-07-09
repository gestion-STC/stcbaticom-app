import { supabase } from "./supabase"

export type SensMessage = "entrant" | "sortant"

// Pièce jointe d'un e-mail reçu (fichier archivé dans le bucket privé « mails-recus »).
export type PieceRecue = { nom: string; chemin: string; taille: number; type: string }

export type Message = {
  id: string
  sens: SensMessage
  de: string
  a: string
  objet: string
  corpsText: string
  corpsHtml: string
  messageId: string | null
  inReplyTo: string | null
  prospectId: string | null
  lu: boolean
  date: string
  piecesJointes: PieceRecue[]
}

type Ligne = {
  id: string
  sens: SensMessage
  de: string
  a: string
  objet: string
  corps_text: string
  corps_html: string
  message_id: string | null
  in_reply_to: string | null
  prospect_id: string | null
  lu: boolean
  created_at: string
  pieces_jointes: PieceRecue[] | null
}

function vers(l: Ligne): Message {
  return {
    id: l.id,
    sens: l.sens,
    de: l.de,
    a: l.a,
    objet: l.objet,
    corpsText: l.corps_text,
    corpsHtml: l.corps_html,
    messageId: l.message_id,
    inReplyTo: l.in_reply_to,
    prospectId: l.prospect_id,
    lu: l.lu,
    date: l.created_at,
    piecesJointes: Array.isArray(l.pieces_jointes) ? l.pieces_jointes : [],
  }
}

export async function chargerMessages(): Promise<Message[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, sens, de, a, objet, corps_text, corps_html, message_id, in_reply_to, prospect_id, lu, created_at, pieces_jointes",
    )
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return (data as Ligne[]).map(vers)
}

// Nombre de messages reçus non lus (pour la pastille de la barre latérale).
export async function compterNonLus(): Promise<number> {
  if (!supabase) return 0
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("sens", "entrant")
    .eq("lu", false)
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
// composition côté serveur — signature ajoutée automatiquement, fil de discussion
// conservé grâce à in_reply_to). Le relais journalise lui-même le message sortant.
export async function repondreMessage(r: {
  to: string
  objet: string
  corps: string
  inReplyTo?: string | null
  prospectId?: string | null
}): Promise<void> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  const { data, error } = await supabase.functions.invoke("envoyer-email", {
    body: {
      to: r.to,
      objet: r.objet,
      corps: r.corps,
      ...(r.inReplyTo ? { in_reply_to: r.inReplyTo } : {}),
      ...(r.prospectId ? { prospect_id: r.prospectId } : {}),
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
