// LA CARTE DU MENU. Un seul menu pour tout le logiciel (Mahdi, 07/11/2026 : « unifie-moi tout ça,
// et tu ne mets pas de sélecteur en haut, il est moche ») : plus de rubriques Développement /
// Recrutement. Les pages sont rangées par ce qu'on y fait (Prospecter, Suivre, Contacts, Analyser) ;
// chaque page dit à quelle base elle appartient (null : aux deux, avec un choix de base dans la page).
// Le menu d'un compte = les pages de ses bases (voir perimetre.ts).
// Fichier PUR (aucun React) : carteMenu.test.ts le lit.
import type { Espace } from "./messagesDb"

// Les pages du logiciel. Rangées ICI (et pas dans Sidebar.tsx) pour que le menu et sa carte
// ne s'importent pas l'un l'autre (boucle refusée par la CI, 06/11/2026).
export type PageId =
  | "aujourdhui"
  | "campagnes"
  | "sessions"
  | "agences"
  | "agenda"
  | "analyse"
  | "messages"
  | "apporteurs"
  | "st_machine"
  | "st_base"
  | "st_sequences"
  | "st_suivi"
  | "st_dossiers"
  | "st_reglages"
  | "parametrage"

export type EntreeMenu = { id: PageId; titre: string; espace: Espace | null }
export type GroupeMenu = { titre: string; entrees: EntreeMenu[] }

export const MENU: GroupeMenu[] = [
  { titre: "", entrees: [{ id: "aujourdhui", titre: "Dashboard", espace: "demarchage" }] },
  {
    titre: "Prospecter",
    entrees: [
      { id: "campagnes", titre: "Campagnes", espace: null },
      { id: "sessions", titre: "Session de call", espace: null },
    ],
  },
  {
    titre: "Suivre",
    entrees: [
      { id: "messages", titre: "Boîte de réception", espace: null },
      { id: "agenda", titre: "Agenda", espace: "demarchage" },
      { id: "st_dossiers", titre: "Dossiers déposés", espace: "recrutement" },
    ],
  },
  {
    titre: "Contacts",
    entrees: [
      { id: "agences", titre: "Agences", espace: "demarchage" },
      { id: "st_base", titre: "Artisans", espace: "recrutement" },
      { id: "apporteurs", titre: "Apporteurs d'affaires", espace: "demarchage" },
    ],
  },
  {
    titre: "Analyser",
    entrees: [
      { id: "analyse", titre: "Analyse IA", espace: "demarchage" },
    ],
  },
]

// Les pages hors menu, ouvertes depuis une autre page (l'ancienne machine des artisans et ses réglages).
const HORS_MENU: { id: PageId; espace: Espace | null }[] = [
  { id: "parametrage", espace: null },
  { id: "st_machine", espace: "recrutement" },
  { id: "st_sequences", espace: "recrutement" },
  { id: "st_reglages", espace: "recrutement" },
  // Sorti du menu le 09/11/2026 (Mahdi : « toutes les stats sont sur la campagne ») ; reste ouvrable depuis la machine.
  { id: "st_suivi", espace: "recrutement" },
]

const visible = (espace: Espace | null, espaces: Espace[]) => espace === null || espaces.includes(espace)

/** Le menu d'un compte : les pages de ses bases, les groupes vides retirés. */
export function menuPour(espaces: Espace[]): GroupeMenu[] {
  return MENU.map((g) => ({ ...g, entrees: g.entrees.filter((e) => visible(e.espace, espaces)) })).filter((g) => g.entrees.length)
}

/** La page d'arrivée d'un compte : la première de son menu. */
export const premierePage = (espaces: Espace[]): PageId => menuPour(espaces)[0]?.entrees[0]?.id ?? "parametrage"

/** Le compte a-t-il le droit d'ouvrir cette page ? */
export function pageAutorisee(page: PageId, espaces: Espace[]): boolean {
  const e = [...MENU.flatMap((g) => g.entrees), ...HORS_MENU].find((x) => x.id === page)
  return Boolean(e && visible(e.espace, espaces))
}
