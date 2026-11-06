// LA CARTE DU MENU (Mahdi, 06/11/2026 : « comme sur STC Bâtiment ») : un rail de rubriques
// à gauche (Développement, Recrutement ; Réglages en bas) et, à côté, le menu de la rubrique
// ouverte, rangé en groupes. Remplace la gélule « Démarchage | Recrutement ST ».
// Fichier PUR (aucun React) : carteMenu.test.ts le lit.
import type { Espace } from "./messagesDb"

// Les pages du logiciel. Rangées ICI (et pas dans Sidebar.tsx) pour que le menu et sa carte
// ne s'importent pas l'un l'autre (boucle refusée par la CI, 06/11/2026).
export type PageId =
  | "aujourdhui"
  | "sessions"
  | "agences"
  | "agenda"
  | "analyse"
  | "messages"
  | "apporteurs"
  | "st_machine"
  | "st_session"
  | "st_base"
  | "st_sequences"
  | "st_suivi"
  | "st_boite"
  | "st_dossiers"
  | "st_reglages"
  | "parametrage"

export type EntreeMenu = { id: PageId; titre: string }
export type GroupeMenu = { titre: string; entrees: EntreeMenu[] }
export type RubriqueMenu = { espace: Espace; titre: string; groupes: GroupeMenu[] }

export const RUBRIQUES: RubriqueMenu[] = [
  {
    espace: "demarchage",
    titre: "Développement",
    groupes: [
      { titre: "", entrees: [{ id: "aujourdhui", titre: "Aujourd'hui" }] },
      {
        titre: "Travailler",
        entrees: [
          { id: "sessions", titre: "Sessions de call" },
          { id: "agences", titre: "Agences" },
          { id: "agenda", titre: "Agenda" },
          { id: "messages", titre: "Boîte de réception" },
        ],
      },
      { titre: "Analyser", entrees: [{ id: "analyse", titre: "Analyse IA" }] },
      { titre: "Archives", entrees: [{ id: "apporteurs", titre: "Apporteurs d'affaires" }] },
    ],
  },
  {
    espace: "recrutement",
    titre: "Recrutement",
    groupes: [
      {
        titre: "",
        entrees: [
          { id: "st_machine", titre: "Machine" },
          { id: "st_suivi", titre: "Suivi" },
        ],
      },
      {
        titre: "Travailler",
        entrees: [
          { id: "st_session", titre: "Session de call" },
          { id: "st_base", titre: "Base d'artisans" },
          { id: "st_dossiers", titre: "Dossiers déposés" },
          { id: "st_boite", titre: "Boîte de réception" },
        ],
      },
      {
        titre: "Régler",
        entrees: [
          { id: "st_sequences", titre: "Séquences" },
          { id: "st_reglages", titre: "Réglages de la machine" },
        ],
      },
    ],
  },
]

export const entreesDe = (r: RubriqueMenu): EntreeMenu[] => r.groupes.flatMap((g) => g.entrees)
export const rubriqueDe = (espace: Espace): RubriqueMenu => RUBRIQUES.find((r) => r.espace === espace) ?? RUBRIQUES[0]
/** La page ouverte par un clic sur la rubrique : sa première entrée. */
export const premierePage = (r: RubriqueMenu): PageId => entreesDe(r)[0].id
