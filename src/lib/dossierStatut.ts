// L'état d'un dossier déposé (Mahdi, 11/10) : nouveau → vu → traité → contrats envoyés → contrats signés →
// partenaire (accès ouvert). L'archive garde tout ; l'état dit où en est chacun.
import type { DossierST, SousTraitant } from "../recrutement"

const CONTRATS_EN_COURS = ["envoye", "livre", "signe_artisan"]
export type EtatDossier = { role: "fait" | "actif" | "info"; texte: string }
export function statutDossier(d: Pick<DossierST, "vuLe" | "traiteLe" | "completLe">, fiche?: Pick<SousTraitant, "accesOuvertLe" | "contratStatut">): EtatDossier {
  if (fiche?.accesOuvertLe) return { role: "fait", texte: "partenaire" }
  if (d.completLe) return { role: "fait", texte: "contrats signés" }
  if (fiche && CONTRATS_EN_COURS.includes(fiche.contratStatut ?? "")) return { role: "actif", texte: "contrats envoyés" }
  if (d.traiteLe) return { role: "fait", texte: "traité" }
  return d.vuLe ? { role: "actif", texte: "vu" } : { role: "info", texte: "nouveau" }
}
