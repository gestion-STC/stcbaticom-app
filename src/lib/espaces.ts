// DEUX ESPACES (Mahdi, 08/10/2026) : le démarchage commercial et le recrutement
// des sous-traitants. Une page appartient à l'un des deux ; Réglages et Comptes
// sont hors espace (la barre latérale garde alors l'espace d'où l'on vient).
import type { PageId } from "../components/Sidebar"
import type { Espace } from "./messagesDb"

export const PAGES_RECRUTEMENT: PageId[] = ["st_machine", "st_base", "st_sequences", "st_suivi", "st_boite", "st_dossiers"]
export const PAGES_HORS_ESPACE: PageId[] = ["parametrage", "comptes"]

export const espaceDe = (page: PageId): Espace => (PAGES_RECRUTEMENT.includes(page) ? "recrutement" : "demarchage")
export const horsEspace = (page: PageId): boolean => PAGES_HORS_ESPACE.includes(page)
