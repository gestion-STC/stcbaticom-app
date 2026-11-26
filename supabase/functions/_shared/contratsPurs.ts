// Contrats et lien d'accès : les outils PURS (sans réseau ni Deno), testés depuis le dépôt (src/lib/lot8Recrutement.test.ts).
// Lot 8, 27/11/2026.

type Signer = { recipientId?: string; status?: string; signedDateTime?: string }
export type EnveloppeStatut = { status: string; completedDateTime?: string; recipients?: { signers?: Signer[] } }

/** Le statut d'un contrat d'après l'enveloppe lue chez DocuSign ; la date de signature est celle de DocuSign (D83). */
export function statutDepuisEnveloppe(e: EnveloppeStatut, maintenant: string): { statut: string; signeArtisanLe: string | null; signeLe: string | null } {
  const artisan = e.recipients?.signers?.find((s) => s.recipientId === "1")
  const signeArtisanLe = artisan?.status === "completed" ? artisan.signedDateTime ?? maintenant : null
  const s = (e.status || "").toLowerCase()
  if (s === "completed") return { statut: "signe", signeArtisanLe, signeLe: e.completedDateTime || maintenant }
  if (s === "declined") return { statut: "refuse", signeArtisanLe, signeLe: null }
  if (s === "voided") return { statut: "annule", signeArtisanLe, signeLe: null }
  if (signeArtisanLe) return { statut: "signe_artisan", signeArtisanLe, signeLe: null }
  if (s === "delivered") return { statut: "livre", signeArtisanLe: null, signeLe: null }
  return { statut: "envoye", signeArtisanLe: null, signeLe: null }
}

export type ReponseLien = { ok: true; destinataire: string; url: string; dejaOuvert?: false } | { ok: true; dejaOuvert: true; destinataire: string; ouvertLe: string } | { ok: false; erreur: string }

/**
 * Ce que dit la réponse de STC Bâtiment (lot 8, 27/11/2026) :
 *  · `deja_ouvert` : l'adresse a déjà son compte STC Bâtiment → aucun lien, la fiche passe « accès ouvert » (D78) ;
 *  · `envoye === false` : le lien est posé mais le mail n'est PAS parti → c'est un échec, pas un « ok » (D79).
 */
export function lireReponseAcces(httpOk: boolean, statut: number, j: { ok?: boolean; url?: string; destinataire?: string; envoye?: boolean; deja_ouvert?: boolean; ouvert_le?: string; error?: string }, email: string, maintenant: string): ReponseLien {
  if (!httpOk || !j.ok) return { ok: false, erreur: `STC Bâtiment répond ${statut} : ${j.error || "?"}` }
  if (j.deja_ouvert) return { ok: true, dejaOuvert: true, destinataire: j.destinataire || email, ouvertLe: j.ouvert_le || maintenant }
  if (j.envoye === false) return { ok: false, erreur: `STC Bâtiment a préparé le lien, mais le mail à ${j.destinataire || email} n'est pas parti. Réessaie plus tard.` }
  return { ok: true, destinataire: j.destinataire || email, url: j.url || "" }
}
