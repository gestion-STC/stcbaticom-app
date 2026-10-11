// ════════════════════════════════════════════════════════════════════════════
// L'ATTRIBUTION DE LA BASE (Mahdi, 11/10/2026) : chaque agence a UN propriétaire
// (agences.commercial_id, le compte Baticom qui la démarche). Dans sa session,
// un téléprospecteur ne voit que SA base ; un admin choisit la base qu'il
// regarde. Les statistiques, elles, restent sur la base générale.
//
// Les règles sont ici, pures et testées ; la base applique le filtre (db.ts).
// ════════════════════════════════════════════════════════════════════════════

/** Ce que la base doit filtrer : les agences d'un compte, les non attribuées, ou tout. */
export type Proprietaire = { compteId: string } | "non_attribuees" | "tous"

/** Le choix affiché dans la session (« Ma base », « Base de X », « Non attribuées », « Toute la base »). */
export type ChoixBase = "moi" | "non_attribuees" | "tous" | `compte:${string}`

/** Réglage (table parametres) : qui voit les agences non attribuées — « admins » (défaut) ou « tous ». */
export const CLE_NON_ATTRIBUEES = "attribution_non_attribuees"
/** Le dernier choix de base, mémorisé sur le poste. */
export const CLE_CHOIX_LOCAL = "session.base"

export const nonAttribueesPourTous = (valeur: string | null | undefined): boolean => valeur === "tous"

/** Un choix lu (poste, URL…) ramené à ce que la personne a le droit de voir. */
export function normaliserChoix(brut: string | null | undefined, admin: boolean, libre: boolean): ChoixBase {
  const c = (brut || "moi") as ChoixBase
  if (c === "moi") return c
  if (c === "non_attribuees") return admin || libre ? c : "moi"
  if (!admin) return "moi"
  if (c === "tous" || c.startsWith("compte:")) return c
  return "moi"
}

/** Le filtre à appliquer. Sans compte connecté (mode démo), pas de filtre. */
export function proprietaireDepuisChoix(choix: string | null | undefined, moiId: string, admin: boolean, libre: boolean): Proprietaire {
  if (!moiId) return "tous"
  const c = normaliserChoix(choix, admin, libre)
  if (c === "moi") return { compteId: moiId }
  if (c === "non_attribuees") return "non_attribuees"
  if (c === "tous") return "tous"
  return { compteId: c.slice("compte:".length) }
}

/** Les choix proposés dans le sélecteur de la session. Un téléprospecteur sans option n'a pas de sélecteur. */
export function optionsBase(admin: boolean, libre: boolean, comptes: { id: string; nom: string }[], moiId: string): { value: ChoixBase; label: string }[] {
  const out: { value: ChoixBase; label: string }[] = [{ value: "moi", label: "Ma base" }]
  if (admin) for (const c of comptes) if (c.id !== moiId) out.push({ value: `compte:${c.id}`, label: `Base de ${c.nom}` })
  if (admin || libre) out.push({ value: "non_attribuees", label: "Non attribuées" })
  if (admin) out.push({ value: "tous", label: "Toute la base" })
  return out
}

/** Le même filtre, sous la forme attendue par chargerAgences (« aucun » = non attribuée). */
export const filtreCommercial = (p: Proprietaire): string | undefined => (p === "tous" ? undefined : p === "non_attribuees" ? "aucun" : p.compteId)

/** Le nom du propriétaire d'une agence, pour les listes. */
export function nomProprietaire(commercialId: string | null, comptes: { id: string; nom: string }[], moiId: string): string {
  if (!commercialId) return ""
  if (commercialId === moiId) return "Moi"
  return comptes.find((c) => c.id === commercialId)?.nom ?? "Un autre compte"
}
