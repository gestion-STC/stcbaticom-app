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
  | "leads_tous"
  | "avis"
  | "fichiers"
  | "dashboard_st"
  | "leads_st"
  | "sessions_st"
  | "agenda_st"
  | "messages_st"
  | "qualification_st"
  | "campagnes"
  | "leads"
  | "sessions"
  | "agences"
  | "agenda"
  | "analyse"
  | "messages"
  | "apporteurs"
  | "st_machine"
  | "st_base"
  | "st_sequences"
  | "st_reglages"
  | "parametrage"

export type EntreeMenu = { id: PageId; titre: string; espace: Espace | null; /** Réservé aux administrateurs. */ admin?: boolean }
export type GroupeMenu = { titre: string; entrees: EntreeMenu[] }

// PAR SERVICE (Mahdi, 10/11/2026) : la partie Campagnes gère les deux ; Gestionnaires et Sous-traitants sont deux
// services, prêts à rejoindre les rubriques du logiciel STC Bâtiment. La rubrique dit de quel service il s'agit.
export const MENU: GroupeMenu[] = [
  {
    titre: "Campagnes",
    entrees: [
      { id: "campagnes", titre: "Campagnes", espace: null, admin: true },
      { id: "leads_tous", titre: "Tous les leads", espace: null, admin: true },
      { id: "avis", titre: "Avis", espace: null, admin: true },
      { id: "fichiers", titre: "Fichiers", espace: null, admin: true },
    ],
  },
  {
    titre: "Gestionnaires",
    entrees: [
      { id: "aujourdhui", titre: "Dashboard", espace: "demarchage" },
      { id: "leads", titre: "Leads reçus", espace: "demarchage" },
      { id: "sessions", titre: "Session de call", espace: "demarchage" },
      { id: "agenda", titre: "Agenda", espace: "demarchage" },
      { id: "messages", titre: "Boîte de réception", espace: "demarchage" },
      { id: "agences", titre: "Agences", espace: "demarchage" },
      { id: "apporteurs", titre: "Apporteurs d'affaires", espace: "demarchage" },
      { id: "analyse", titre: "Analyse IA", espace: "demarchage" },
    ],
  },
  {
    titre: "Sous-traitants",
    entrees: [
      { id: "dashboard_st", titre: "Dashboard", espace: "recrutement", admin: true },
      { id: "leads_st", titre: "Leads reçus", espace: "recrutement" },
      { id: "sessions_st", titre: "Session de call", espace: "recrutement" },
      { id: "agenda_st", titre: "Agenda", espace: "recrutement" },
      { id: "messages_st", titre: "Boîte de réception", espace: "recrutement" },
      { id: "st_base", titre: "Artisans", espace: "recrutement" },
      { id: "qualification_st", titre: "Qualification", espace: "recrutement" },
    ],
  },
]

// Les pages hors menu, ouvertes depuis une autre page (l'ancienne machine des artisans et ses réglages).
const HORS_MENU: { id: PageId; espace: Espace | null }[] = [
  { id: "parametrage", espace: null },
  { id: "st_machine", espace: "recrutement" },
  { id: "st_sequences", espace: "recrutement" },
  { id: "st_reglages", espace: "recrutement" },
]

const visible = (e: { espace: Espace | null; admin?: boolean }, espaces: Espace[], admin: boolean) => (e.espace === null || espaces.includes(e.espace)) && (!e.admin || admin)

/** Le menu d'un compte : les pages de ses bases, les groupes vides retirés. */
export function menuPour(espaces: Espace[], admin = true): GroupeMenu[] {
  return MENU.map((g) => ({ ...g, entrees: g.entrees.filter((e) => visible(e, espaces, admin)) })).filter((g) => g.entrees.length)
}

/** La page d'arrivée d'un compte : la première de son menu. */
export const premierePage = (espaces: Espace[], admin = true): PageId => menuPour(espaces, admin)[0]?.entrees[0]?.id ?? "parametrage"

/** Le compte a-t-il le droit d'ouvrir cette page ? */
export function pageAutorisee(page: PageId, espaces: Espace[], admin = true): boolean {
  const e = [...MENU.flatMap((g) => g.entrees), ...HORS_MENU].find((x) => x.id === page)
  return Boolean(e && visible(e, espaces, admin))
}
