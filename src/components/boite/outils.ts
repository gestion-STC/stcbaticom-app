// Les petites lectures de la boîte de réception, dessinée comme celle de STC Bâtiment (11/11/2026).
// Rien ici ne touche la base : on lit les messages déjà chargés.
import type { Message } from "../../lib/messagesDb"
import { messageDeProspection, messageLinkedIn, type Conversation } from "../../lib/conversations"
import { LIBELLE_TRI } from "../../prospection/ia"

/** Les initiales d'un correspondant, pour son rond (STC : OSMessagesTabV2). */
export function initiales(nom: string): string {
  return nom.replace(/<[^>]*>/g, "").split(/[\s.@_-]+/).filter(Boolean).slice(0, 2)
    .map((m) => m[0].toUpperCase()).join("") || "·"
}

/** « aujourd'hui », « hier », « il y a N j » : la ligne sous la date (STC). */
export function ancienneteCourte(iso: string | null | undefined): string {
  if (!iso) return ""
  const jours = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (jours <= 0) return "aujourd'hui"
  if (jours === 1) return "hier"
  return `il y a ${jours} j`
}

/** La date d'un message dans le fil : « 11 nov. 14:30 », comme STC. */
export function dateDuFil(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
}

/** D'où vient la conversation : la deuxième colonne de la liste. */
export function sourceDe(c: Conversation<Message>): string {
  if (messageLinkedIn(c.messages)) return "LinkedIn"
  if (messageDeProspection(c.messages)) return "Campagne"
  if (c.sousTraitantId) return "Sous-traitant"
  if (c.agenceId) return "Agence"
  return "E-mail"
}

/** La décision de l'IA (ou la nôtre) sur la dernière réponse triée : un point de couleur et un mot. */
export function etiquetteTri(m: Pick<Message, "tri" | "triDetail"> | null | undefined): { libelle: string; couleur: string } | null {
  if (!m?.tri) return null
  if (m.tri === "interesse") return { libelle: "Lead", couleur: "#1F8A4C" }
  if (m.tri === "pas_interesse") return { libelle: "Dead", couleur: "#8E8E93" }
  if (m.tri === TRI_ANTI_SPAM) return { libelle: "Anti-spam de l'agence", couleur: "#C27C0E" }
  if (m.tri === "absent") {
    const retour = m.triDetail?.retour
    return { libelle: retour ? `Absent jusqu'au ${new Date(retour + "T12:00:00").toLocaleDateString("fr-FR")}` : LIBELLE_TRI.absent, couleur: "#C27C0E" }
  }
  return { libelle: LIBELLE_TRI[m.tri] ?? m.tri, couleur: "#2F6FE0" }
}

/** Le dernier message trié d'une conversation (c'est lui qui porte l'étiquette de la ligne). */
export function dernierTrie(c: Conversation<Message>): Message | null {
  return [...c.messages].reverse().find((x) => x.tri) ?? null
}

/** Les réponses triées « intéressé » qu'aucune fiche agence n'a recueillies (25/11/2026) : sans agence, elles
 *  ne créent ni lead ni suite de campagne. La boîte les signale pour qu'on les rattache à la main. */
export function interessesSansAgence(convs: Conversation<Message>[]): Conversation<Message>[] {
  return convs.filter((c) => !c.agenceId && c.messages.some((m) => m.sens === "entrant" && m.espace === "demarchage" && m.tri === "interesse" && !m.agenceId))
}

/** Une demande de validation d'un anti-spam (Mailinblack…) : notre mail attend chez l'agence (26/11/2026, D75). Le tri
 *  est posé par recevoir-email ; il n'est ni une réponse, ni un lead. */
export const TRI_ANTI_SPAM = "anti_spam"
export const estAntiSpam = (m: Pick<Message, "sens" | "tri">) => m.sens === "entrant" && m.tri === TRI_ANTI_SPAM

/** Les conversations où un anti-spam attend qu'on clique sur son lien (message encore non lu). */
export function antiSpamEnAttente(convs: Conversation<Message>[]): Conversation<Message>[] {
  return convs.filter((c) => c.messages.some((m) => estAntiSpam(m) && !m.lu))
}
