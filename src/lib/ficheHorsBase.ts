// ════════════════════════════════════════════════════════════════════════════
// UN DOSSIER DÉPOSÉ PAR UN ARTISAN QUI N'EST PAS DANS LA BASE (12/10/2026)
//
// Mahdi : « il y a un dossier sous-traitant qui ne vient pas de notre base de
// données, et le logiciel bloque parce qu'il veut absolument qu'on le relie à
// quelque chose. J'aimerais pouvoir dire que c'est un sous-traitant hors
// logiciel, sans avoir besoin de le rattacher, pour envoyer les contrats et le
// lien de création de compte. »
//
// Tout le circuit qui suit le dépôt (contrats DocuSign, lien d'accès, dossier
// complet) s'appuie sur une FICHE artisan. Plutôt que de dédoubler ce circuit,
// le bouton « Sous-traitant hors base » fabrique la fiche à partir du dossier :
// le reste fonctionne sans rien changer. La fiche porte la source
// « Hors base (dossier déposé) » : elle se reconnaît, et n'entre dans aucune
// séquence (statut « déposé » dès sa création).
// ════════════════════════════════════════════════════════════════════════════
import type { DossierST, SousTraitant } from "../recrutement"

export const SOURCE_HORS_BASE = "Hors base (dossier déposé)"

/** La valeur d'une ligne du formulaire déposé, par son libellé (casse et accents ignorés). */
function valeur(dossier: DossierST, ...libelles: string[]): string {
  const norme = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
  const voulus = libelles.map(norme)
  for (const s of dossier.donnees?.sections ?? []) {
    for (const l of s.lignes ?? []) {
      if (voulus.includes(norme(l.label))) {
        const v = (l.valeur ?? "").trim()
        if (v && v !== "—" && v !== "-") return v
      }
    }
  }
  return ""
}

/** Le code postal d'une adresse (« 9 rue X 06300 Nice » → « 06300 Nice »), pour la zone. */
function zoneDe(adresse: string): string {
  const m = adresse.match(/\b(\d{5})\b\s*(.*)$/)
  return m ? `${m[1]} ${m[2]}`.trim() : ""
}

/** La fiche à créer pour un dossier déposé par un artisan absent de la base. */
export function ficheDepuisDossier(dossier: DossierST): Partial<SousTraitant> {
  const adresse = valeur(dossier, "Adresse")
  return {
    entreprise: (dossier.raisonSociale || valeur(dossier, "Raison sociale")).trim(),
    contact: valeur(dossier, "Dirigeant"),
    email: (dossier.email || valeur(dossier, "E-mail", "Email")).trim().toLowerCase(),
    telephone: valeur(dossier, "Téléphone", "Telephone").replace(/\s+/g, ""),
    metier: valeur(dossier, "Corps d'état maîtrisés", "Corps d’état maîtrisés"),
    zone: zoneDe(adresse),
    source: SOURCE_HORS_BASE,
    statut: "depose",
    statutMotif: "dossier déposé hors base, fiche créée depuis le dossier",
    deposeLe: dossier.creeLe,
    dossierId: dossier.id,
    etapeCourante: 0,
    nbClics: 0,
    nbEnvoisOk: 0,
    nbEnvoisErreur: 0,
  }
}
