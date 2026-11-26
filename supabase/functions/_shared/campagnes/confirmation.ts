// Une relance attend que le mail d'avant soit PARTI (26/11/2026). Instantly accepte un contact (« confié ») bien avant
// d'envoyer ; abonnement coupé, il ne l'envoie jamais. Le 23/11, 30 agences ont été notées « envoyé » sans mail parti,
// et leur relance (« Re: … ») était prévue le 30/11 : elle serait partie comme une réponse à un mail jamais reçu.
// La règle : avant toute étape qui envoie, le dernier mail confié de l'inscription doit avoir sa confirmation
// « délivré » (email_sent d'Instantly, ou relance partie dans le fil). Sinon l'étape attend, sans limite de temps : un
// délai « au bout de X jours sans erreur, on suppose parti » enverrait justement ces relances-là.
export type EnvoiPasse = { id: string; etape_id: string; canal: string; statut: string; test: boolean; le: string }

/** Vrai si l'étape `etapeAEnvoyer` doit attendre : le dernier mail confié (hors cette étape) n'a aucune confirmation. */
export function relanceRetenue(envois: EnvoiPasse[], delivres: Set<string>, etapeAEnvoyer: string): boolean {
  const mails = envois.filter((e) => e.statut === "envoye" && !e.test && (e.canal === "mail" || e.canal === "newsletter") && e.etape_id !== etapeAEnvoyer)
  if (!mails.length) return false
  const dernier = mails.reduce((m, e) => (e.le > m.le ? e : m))
  // Une confirmation sur n'importe quel envoi de cette étape suffit (un renvoi « non parti » confirmé plus tard compte).
  return !envois.some((e) => e.etape_id === dernier.etape_id && delivres.has(e.id))
}
