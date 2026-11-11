// LES CAMPAGNES D'AVIS (Mahdi, 10/11/2026) : récolter des avis pour les réutiliser dans les campagnes. Elles ne créent ni
// lead ni appel, et ne passent pas par les boîtes de prospection. Copie exacte côté serveur, vérifiée par un test. Fichier PUR.

export const BASES_AVIS = ["locataires", "clients_gestionnaires", "sous_traitants_actifs"]
export const estBaseAvis = (baseId: string) => BASES_AVIS.includes(baseId)

/** Quand demander l'avis d'un locataire : réglé dans chaque campagne (Mahdi, 11/11/2026). 0 jour = dès la fin du chantier. */
export type ReglageAvis = { delaiJours: number; fenetreJours: number }
export const AVIS_DEPART: ReglageAvis = { delaiJours: 3, fenetreJours: 120 }
/** Un contact sans date de fin (ajouté à la main) est toujours prêt. */
export function pretPourAvis(finLe: string | null | undefined, r: ReglageAvis, maintenant: Date): boolean {
  if (!finLe) return true
  const age = (maintenant.getTime() - new Date(finLe).getTime()) / 86_400_000
  return age >= r.delaiJours && age <= r.fenetreJours
}

/** Une note basse remonte à l'équipe, pour rappeler la personne. */
export const aRappeler = (note: number) => note <= 3

/** Un avis cité dans une campagne : toujours avec sa date, jamais modifié. */
export function citationAvis(a: { commentaire: string; nomAffiche: string; note: number; creeLe: string }): string {
  const date = new Date(a.creeLe).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })
  return `« ${a.commentaire.trim()} » — ${a.nomAffiche.trim() || "Client STC Bâtiment"}, ${a.note}/5, avis du ${date}`
}
