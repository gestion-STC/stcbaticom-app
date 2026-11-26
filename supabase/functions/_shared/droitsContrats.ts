// QUI PEUT FAIRE QUOI DANS docusign-envoyer (lot 8, 27/11/2026). Fichier PUR, testé depuis le dépôt.
// La règle : ce que l'écran n'offre pas à un rôle, le serveur le refuse.
//   · Réglages › Recrutement › Contrats DocuSign (brancher les retours) : administrateurs seulement ;
//   · envoyer les contrats, relire une enveloppe, envoyer le lien d'accès, lire les modèles du pack (fenêtre
//     « Envoyer les contrats ») : fiche artisan et dossiers déposés, offerts aux membres qui ont la base Artisans —
//     administrateur, ou téléprospecteur dont la fonction est « recrutement » (ou pas encore posée, ou direction :
//     les deux bases, comme src/lib/perimetre.ts).
// Un compte sans rôle d'équipe n'a droit à rien.

export const ACTIONS_ADMIN = ["installer_connect"]

export function droitContrats(role: string, fonction: string | undefined, action: string): { ok: true } | { ok: false; statut: number; erreur: string } {
  if (role !== "admin" && role !== "telepro") return { ok: false, statut: 403, erreur: "Réservé à l'équipe." }
  if (ACTIONS_ADMIN.includes(action)) return role === "admin" ? { ok: true } : { ok: false, statut: 403, erreur: "Réservé aux administrateurs." }
  if (role === "telepro" && fonction === "commercial") return { ok: false, statut: 403, erreur: "Les contrats des artisans ne font pas partie de votre périmètre." }
  return { ok: true }
}
