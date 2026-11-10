// LA PASSERELLE DES AVIS (Mahdi, 11/11/2026) : qui, parmi ce que STC Bâtiment renvoie, peut recevoir une demande d'avis.
// Fichier PUR, testé par vitest.

export type LigneAvisStc = { ref: string; public: "locataires" | "sous_traitants_actifs"; nom: string; personne: string; email: string; telephone: string; fin_le: string | null; detail: string }
/** Un locataire est sollicité quelques jours après la fin de son chantier, et pas pour un chantier trop ancien. */
export const DELAI_APRES_FIN_JOURS = 3
export const FENETRE_JOURS = 120
const JOUR = 86_400_000

export function aSolliciter(lignes: LigneAvisStc[], maintenant: Date): LigneAvisStc[] {
  return lignes.filter((l) => {
    if (!l.email.trim() && !l.telephone.trim()) return false
    if (l.public === "sous_traitants_actifs") return true
    if (!l.fin_le) return false
    const age = (maintenant.getTime() - new Date(l.fin_le).getTime()) / JOUR
    return age >= DELAI_APRES_FIN_JOURS && age <= FENETRE_JOURS
  })
}

/** La ligne à garder dans avis_contacts. Une désinscription déjà notée ici n'est jamais effacée par la synchro. */
export function versAvisContact(l: LigneAvisStc, maintenant: Date) {
  return { ref_stc: l.ref, public: l.public, nom: l.nom.trim(), personne: l.personne.trim(), email: l.email.trim().toLowerCase(), mobile: l.telephone.trim(), source: "stc_batiment", fin_le: l.fin_le, maj_le: maintenant.toISOString() }
}
