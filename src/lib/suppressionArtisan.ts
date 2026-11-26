// ── SUPPRIMER DÉFINITIVEMENT UNE FICHE ARTISAN (lot 5, 26/11/2026) ──
// La suppression emporte, en base, tout ce qui dépend de la fiche (envois, clics, appels,
// qualification, contrats, formation). Une fiche qui a un contrat, un dossier déposé ou une
// formation ne se supprime plus : elle s'archive (« Ne plus contacter », ou statut « Exclu »).
// La même règle est tenue côté serveur (st_garde_suppression, supabase/maj-2026-11-26-lot5.sql).
import type { SousTraitant } from "../recrutement"

export type BilanSuppression = {
  envois: number; clics: number; appels: number; qualifications: number; contrats: number; formations: number; dossiers: number
}

/** Ce qui empêche la suppression (vide : on peut supprimer). */
export function raisonsDeGarder(st: Pick<SousTraitant, "statut" | "deposeLe" | "dossierId" | "contratStatut">, b: BilanSuppression): string[] {
  const r: string[] = []
  if (b.contrats > 0 || st.contratStatut) r.push(b.contrats > 1 ? `${b.contrats} contrats` : "un contrat")
  if (b.dossiers > 0 || st.deposeLe || st.dossierId || st.statut === "depose") r.push("un dossier déposé")
  if (b.formations > 0) r.push("une formation")
  return r
}

const pl = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`

/** Ce qui disparaîtrait avec la fiche, en clair (seulement ce qui existe). */
export function ceQuiDisparait(b: BilanSuppression): string[] {
  const l: string[] = []
  if (b.envois) l.push(pl(b.envois, "envoi (e-mail ou SMS) de son historique", "envois (e-mails et SMS) de son historique"))
  if (b.clics) l.push(pl(b.clics, "clic", "clics"))
  if (b.appels) l.push(pl(b.appels, "appel noté", "appels notés"))
  if (b.qualifications) l.push("sa qualification")
  if (b.contrats) l.push(pl(b.contrats, "contrat", "contrats"))
  if (b.formations) l.push("sa formation")
  return l
}
