// LES EXCLUSIONS D'UNE CAMPAGNE, UNE SEULE RÈGLE (25/11/2026) : le moteur (campagnes-moteur, contactsBloques) les applique,
// l'écran (audience.ts) les montre avec les mêmes fonctions. Le moteur fait foi. Copie exacte :
// src/prospection/exclusions.ts ↔ supabase/functions/_shared/campagnes/exclusions.ts, vérifiée par un test. Fichier PUR.
import type { Contact } from "./modele.ts"

const JOUR = 86_400_000
/** Le titre de la note posée sur la fiche d'une agence quand un mail parti par Resend rebondit. */
export const REBOND_AGENCE = "E-mail rebondi (adresse injoignable)"
export const EXCLUSIONS_CONNUES = ["Déjà client", "Désinscrit", "Adresse en erreur", "Pas intéressé"]

/** « Déjà client » retiré des exclusions : la campagne touche aussi les clients (un gagné redevient libre pour elle).
 *  Sans liste d'exclusions (campagne jamais réglée), rien ne change : les clients restent exclus. */
export function avecDejaClients<T extends Pick<Contact, "statut">>(contacts: T[], exclusions: string[] | undefined): T[] {
  return exclusions && !exclusions.includes("Déjà client") ? contacts.map((k) => (k.statut === "gagne" ? { ...k, statut: "libre" as const } : k)) : contacts
}

/** « Pas intéressé » : exclu jusqu'au délai « Le recontacter après » (en mois ; 0 : jamais repris). `le` : quand il l'a dit (inconnu : exclu). */
export function pasInteresseExclu(le: string | null, relanceMois: number, maintenant: Date): boolean {
  if (relanceMois <= 0 || !le) return true
  return new Date(le).getTime() > maintenant.getTime() - relanceMois * 30 * JOUR
}

/** Une exclusion ajoutée à la main (« Endormie », « Orpi »…) : la valeur d'un champ du contact. Rend l'exclusion trouvée, sinon null. */
export function exclusionLibre(champs: Record<string, string>, exclusions: string[]): string | null {
  const libres = exclusions.filter((x) => !EXCLUSIONS_CONNUES.includes(x)).filter((x) => x.trim())
  return libres.find((l) => Object.values(champs).some((v) => String(v ?? "").split(" / ").some((x) => x.trim().toLowerCase() === l.trim().toLowerCase()))) ?? null
}
