// LA PASSERELLE DES AVIS (Mahdi, 11/11/2026) : qui, parmi ce que STC Bâtiment renvoie, peut recevoir une demande d'avis.
// Fichier PUR, testé par vitest.

export type LigneAvisStc = { ref: string; public: "locataires" | "sous_traitants_actifs"; nom: string; personne: string; email: string; telephone: string; fin_le: string | null; detail: string }
/** La synchro ramène les chantiers finis depuis moins d'un an, dès la fin ; le délai se règle dans chaque campagne d'avis. */
export const FENETRE_JOURS = 365
const JOUR = 86_400_000

export function aSolliciter(lignes: LigneAvisStc[], maintenant: Date): LigneAvisStc[] {
  return lignes.filter((l) => {
    if (!l.email.trim() && (!l.telephone.trim() || numeroFactice(l.telephone))) return false
    if (l.public === "sous_traitants_actifs") return true
    if (!l.fin_le) return false
    const age = (maintenant.getTime() - new Date(l.fin_le).getTime()) / JOUR
    return age >= 0 && age <= FENETRE_JOURS
  })
}

/** Un numéro factice (0000000000, 0600000000…) : jamais un vrai locataire. Filet de sécurité, STC Bâtiment trie déjà (16/11/2026). */
export const numeroFactice = (tel: string) => /0{8}$/.test(tel.replace(/\D/g, ""))

/** La ligne à garder dans avis_contacts. Une désinscription déjà notée ici n'est jamais effacée par la synchro. */
export function versAvisContact(l: LigneAvisStc, maintenant: Date) {
  return { ref_stc: l.ref, public: l.public, nom: l.nom.trim(), personne: l.personne.trim(), email: l.email.trim().toLowerCase(), mobile: numeroFactice(l.telephone) ? "" : l.telephone.trim(), source: "stc_batiment", fin_le: l.fin_le, maj_le: maintenant.toISOString() }
}

/**
 * Les contacts venus de STC Bâtiment qu'il ne renvoie plus (liste corrigée, chantier sorti) : à retirer (16/11/2026).
 * Jamais quand STC Bâtiment ne renvoie rien (panne), jamais un contact déjà entré dans une campagne, jamais un désinscrit
 * (27/11/2026 : sa ligne garde la désinscription, s'il revient il n'est pas recontacté).
 */
export function aRetirer(existants: { id: string; ref_stc: string | null; desinscrit?: boolean | null }[], refsRecues: string[], dansUneCampagne: Set<string>): string[] {
  if (!refsRecues.length) return []
  const recues = new Set(refsRecues)
  return existants.filter((e) => e.ref_stc && !e.desinscrit && !recues.has(e.ref_stc) && !dansUneCampagne.has(e.id)).map((e) => e.id)
}
