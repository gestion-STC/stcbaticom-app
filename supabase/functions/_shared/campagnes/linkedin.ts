// LINKEDIN DANS LES CAMPAGNES (Mahdi, 11/11/2026) : ce qui se calcule sans rien appeler. Copie exacte côté serveur
// (_shared/campagnes/linkedin.ts), vérifiée par un test. Fichier PUR.
// Le compte LinkedIn (celui d'Horlann) est branché par Unipile ; le moteur y envoie invitations et messages.

/** Ce que fait une étape LinkedIn : une tâche pour le commercial, ou une action automatique par le compte branché. */
export type ModeLinkedIn = "tache" | "invitation" | "message"
export const LIBELLE_MODE: Record<ModeLinkedIn, string> = {
  tache: "Tâche pour le commercial",
  invitation: "Invitation automatique, avec une note",
  message: "Message automatique (s'il a accepté)",
}
/** La note d'une invitation : 300 caractères au plus (LinkedIn). */
export const NOTE_MAX = 300

/** Les réglages LinkedIn, pour toutes les campagnes : un compte LinkedIn se protège, pas une campagne. */
export type ReglageLinkedIn = { parJour: number; parSemaine: number; heureMin: number; heureMax: number }
export const LINKEDIN_DEPART: ReglageLinkedIn = { parJour: 20, parSemaine: 80, heureMin: 9, heureMax: 18 }
/** Au plus 2 actions LinkedIn par passage du moteur (toutes les 10 minutes) : les envois s'étalent dans la journée. */
export const LINKEDIN_PAR_PASSAGE = 2

/** Un compte LinkedIn branché. */
export type CompteLinkedIn = { id: string; nom: string; branche_le: string; statut?: string }

/**
 * L'identifiant d'un profil, depuis ce qu'on a dans la fiche : une adresse de profil (linkedin.com/in/…), une adresse
 * Sales Navigator (linkedin.com/sales/lead/ACw…, ou /sales/people/ACw…), ou l'identifiant seul. Vide si on ne sait pas lire.
 */
export function identifiantLinkedIn(brut: string): string {
  const s = (brut ?? "").trim()
  if (!s) return ""
  const sales = s.match(/linkedin\.com\/sales\/(?:lead|people)\/([A-Za-z0-9_-]+)/i)
  if (sales) return sales[1]
  const profil = s.match(/linkedin\.com\/in\/([^/?#\s]+)/i)
  if (profil) { try { return decodeURIComponent(profil[1]) } catch { return profil[1] } }
  return /^[A-Za-z0-9_%.-]{3,100}$/.test(s) && !s.includes(".com") ? s : ""
}

/** L'adresse propre d'un profil, pour la fiche et la boîte de réception. */
export const adresseLinkedIn = (id: string) => (id && !/^ACw/.test(id) ? `https://www.linkedin.com/in/${id}` : id ? `https://www.linkedin.com/sales/lead/${id}` : "")

/** La note d'une invitation : jamais coupée au milieu d'un mot, jamais plus de 300 caractères. */
export function noteInvitation(texte: string): string {
  const t = texte.replace(/\s+\n/g, "\n").trim()
  if (t.length <= NOTE_MAX) return t
  const coupe = t.slice(0, NOTE_MAX - 1)
  const i = coupe.lastIndexOf(" ")
  return (i > NOTE_MAX * 0.6 ? coupe.slice(0, i) : coupe).replace(/[\s,;:]+$/, "") + "…"
}

/** Peut-on agir maintenant ? Les plafonds du compte et ses heures. Le motif dit pourquoi on attend. */
export function peutAgirLinkedIn(r: ReglageLinkedIn, faitsAujourdhui: number, faitsSemaine: number, heureParis: number): { ok: boolean; motif: string } {
  if (heureParis < r.heureMin || heureParis >= r.heureMax) return { ok: false, motif: "hors des heures LinkedIn" }
  if (faitsAujourdhui >= r.parJour) return { ok: false, motif: "plafond LinkedIn du jour atteint" }
  if (faitsSemaine >= r.parSemaine) return { ok: false, motif: "plafond LinkedIn de la semaine atteint" }
  return { ok: true, motif: "" }
}

/** Les réponses d'Unipile qui veulent dire « on réessaiera plus tard » (plafond LinkedIn, trop de demandes). */
export const estAttenteLinkedIn = (statut: number, type: string) => statut === 429 || /cannot_resend_yet|limit_exceeded|connection_limit_reached|too_many_requests|no_client_session|network_down|service_unavailable|request_timeout/.test(type)
/** Celles qui veulent dire « inutile, on passe » (déjà en relation, invitation refusée, profil introuvable). */
export const estSautLinkedIn = (type: string) => /already_connected|already_invited_recently|cannot_invite_attendee|invalid_recipient|resource_not_found|invalid_resource_identifier/.test(type)
