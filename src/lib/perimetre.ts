// LE PÉRIMÈTRE D'UN COMPTE (Mahdi, 07/11/2026) : « le commercial n'a rien du tout sur la partie
// sous-traitant, et inversement ; nous, administrateurs, on voit tout ».
//
// Un seul logiciel, un seul menu : ce qu'il montre dépend du compte.
// - Administrateur (ou compte d'avant les rôles) : les deux bases, et un choix de base dans chaque
//   page (Campagnes, Session de call, Boîte de réception). Pas de sélecteur en haut du menu.
// - Téléprospecteur : la base de sa FONCTION (Réglages › Équipe) : Commercial → les agences,
//   Recrutement → les artisans. Fonction pas encore posée : les deux, pour ne cacher personne.
// Fichier PUR : perimetre.test.ts le lit.
import type { Role } from "./comptes"
import type { Fonction } from "./fonctionsComptes"
import type { Espace } from "./messagesDb"

export const LES_DEUX: Espace[] = ["demarchage", "recrutement"]

export function espacesVisibles(role: Role | null, fonction: Fonction | undefined): Espace[] {
  if (role !== "telepro") return LES_DEUX
  if (fonction === "commercial") return ["demarchage"]
  if (fonction === "recrutement") return ["recrutement"]
  return LES_DEUX
}

/** Le nom de la base d'un espace, tel qu'il s'affiche dans les choix des pages. */
export const NOM_BASE: Record<Espace, string> = { demarchage: "Agences", recrutement: "Artisans" }
