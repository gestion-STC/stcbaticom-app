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

/**
 * Une tâche ou un RDV d'agence est-il pour moi ? (09/11/2026) Un administrateur voit tout ; un
 * téléprospecteur voit ce qu'il a posé lui-même et ce qui touche une agence qui lui est attribuée.
 */
export function tacheCampagnePourMoi(t: { baseId: string; proprietaireId: string | null }, moiId: string, admin: boolean, espaces: Espace[]): boolean {
  if (admin) return true
  if (t.baseId === "artisans") return espaces.includes("recrutement")
  return espaces.includes("demarchage") && Boolean(moiId) && t.proprietaireId === moiId
}

export function aMoi(t: { compteId: string | null; agenceCommercialId: string | null }, moiId: string, admin: boolean): boolean {
  return admin || (Boolean(moiId) && (t.compteId === moiId || t.agenceCommercialId === moiId))
}

/** Le nom de la base d'un espace, tel qu'il s'affiche dans les choix des pages. */
export const NOM_BASE: Record<Espace, string> = { demarchage: "Agences", recrutement: "Artisans" }
