// Contrats DocuSign — la partie pure (11/10/2026) : préremplir les champs d'un
// modèle avec ce qu'on sait du sous-traitant (le dossier déposé, la fiche).
// Testé dans contratsOutils.test.ts.
import type { DossierST, SousTraitant } from "../recrutement"

export type RoleModele = { roleName: string; routingOrder: number; champs: string[]; requis: string[] }
export type ModeleDocusign = { templateId: string; nom: string; roles: RoleModele[] }

export const normaliser = (s: string): string =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()

/** Ce qu'on sait : les lignes du dossier (label → valeur) et la fiche. */
export type Connu = { lignes: { label: string; valeur: string }[]; fiche?: SousTraitant | null; dossier?: DossierST | null }
export function connuDepuis(dossier?: DossierST | null, fiche?: SousTraitant | null): Connu {
  const lignes = (dossier?.donnees?.sections ?? []).flatMap((s) => s.lignes ?? []).filter((l) => l.valeur && l.valeur !== "—")
  return { lignes, fiche: fiche ?? null, dossier: dossier ?? null }
}

// Les synonymes : un champ de modèle (tabLabel) → les libellés du dossier ou les champs de la fiche.
const SYNONYMES: { cles: string[]; dossier: string[]; fiche?: (f: SousTraitant) => string; dossierDirect?: (d: DossierST) => string }[] = [
  { cles: ["raison sociale", "societe", "entreprise", "nom entreprise", "denomination", "nom commercial"], dossier: ["raison sociale"], fiche: (f) => f.entreprise, dossierDirect: (d) => d.raisonSociale },
  { cles: ["siret", "siren", "n siret", "numero siret"], dossier: ["siret"] },
  { cles: ["forme juridique", "statut juridique", "forme"], dossier: ["forme juridique"] },
  { cles: ["dirigeant", "representant", "representant legal", "gerant", "president", "nom dirigeant", "signataire", "nom", "nom prenom", "contact"], dossier: ["dirigeant"], fiche: (f) => f.contact },
  { cles: ["adresse", "adresse siege", "siege social", "siege", "adresse postale"], dossier: ["adresse"] },
  { cles: ["telephone", "tel", "mobile", "portable", "numero de telephone"], dossier: ["telephone"], fiche: (f) => f.telephone },
  { cles: ["email", "e mail", "mail", "courriel", "adresse email"], dossier: ["e mail", "email"], fiche: (f) => f.email, dossierDirect: (d) => d.email },
  { cles: ["metier", "corps d etat", "activite", "specialite", "corps de metier"], dossier: ["corps d etat maitrises"], fiche: (f) => f.metier },
  { cles: ["zone", "secteur", "departement"], dossier: [], fiche: (f) => f.zone },
  { cles: ["date de creation", "creation"], dossier: ["date de creation"] },
  { cles: ["effectif", "effectifs", "nombre de salaries"], dossier: ["effectif"] },
  { cles: ["decennale compagnie", "assureur decennale", "compagnie decennale", "decennale"], dossier: ["decennale compagnie"] },
  { cles: ["decennale police", "n police decennale", "police decennale", "numero police decennale"], dossier: ["decennale n police"] },
  { cles: ["decennale validite", "decennale valable jusqu au", "echeance decennale"], dossier: ["decennale valable jusqu au"] },
  { cles: ["rc pro compagnie", "assureur rc", "rc pro"], dossier: ["rc pro compagnie"] },
  { cles: ["rc pro police", "n police rc", "police rc pro"], dossier: ["rc pro n police"] },
  { cles: ["rc pro validite", "rc pro valable jusqu au"], dossier: ["rc pro valable jusqu au"] },
  { cles: ["ville", "commune"], dossier: ["adresse"], dossierDirect: undefined },
  { cles: ["code postal", "cp"], dossier: ["adresse"] },
]

const ligneDossier = (c: Connu, libelle: string): string => {
  const n = normaliser(libelle)
  const l = c.lignes.find((x) => normaliser(x.label) === n) ?? c.lignes.find((x) => normaliser(x.label).includes(n))
  return l?.valeur?.trim() ?? ""
}

/** La valeur proposée pour un champ de modèle, ou "" si on ne sait pas. */
export function valeurProposee(tabLabel: string, c: Connu): string {
  const n = normaliser(tabLabel)
  if (n === "date" || n === "date du jour" || n === "fait le" || n === "le") return new Date().toLocaleDateString("fr-FR")
  // 1) un libellé du dossier qui porte exactement le même nom
  const direct = ligneDossier(c, tabLabel)
  if (direct) return n.includes("ville") || n === "cp" || n.includes("code postal") ? extraire(n, direct) : direct
  // 2) les synonymes
  const syn = SYNONYMES.find((s) => s.cles.includes(n)) ?? SYNONYMES.find((s) => s.cles.some((k) => k.length >= 4 && n.includes(k)))
  if (!syn) return ""
  for (const d of syn.dossier) { const v = ligneDossier(c, d); if (v) return n.includes("ville") || n === "cp" || n.includes("code postal") ? extraire(n, v) : v }
  if (syn.dossierDirect && c.dossier) { const v = syn.dossierDirect(c.dossier); if (v) return v }
  if (syn.fiche && c.fiche) { const v = syn.fiche(c.fiche); if (v) return v }
  return ""
}
/** Ville ou code postal tirés d'une adresse « 2 Avenue Gandhi 95490 VAUREAL ». */
function extraire(champ: string, adresse: string): string {
  const m = adresse.match(/\b(\d{5})\s+(.+)$/)
  if (!m) return champ.includes("ville") ? "" : ""
  return champ.includes("ville") ? m[2].trim() : m[1]
}

/** Les champs à remplir pour l'artisan, tous modèles du pack confondus (sans doublon, ordre d'apparition). */
export function champsArtisan(pack: ModeleDocusign[]): { label: string; requis: boolean }[] {
  const out: { label: string; requis: boolean }[] = []
  for (const m of pack) {
    const artisan = roleArtisan(m.roles)
    if (!artisan) continue
    for (const ch of artisan.champs) {
      const deja = out.find((x) => x.label === ch)
      const requis = artisan.requis.includes(ch)
      if (deja) deja.requis = deja.requis || requis
      else out.push({ label: ch, requis })
    }
  }
  return out
}
/** Même règle que le serveur : le rôle artisan par son nom, sinon le premier à signer. */
export function roleArtisan(roles: RoleModele[]): RoleModele | null {
  const estStc = (r: RoleModele) => /stc|donneur|client|ma[iî]tre|soci[eé]t[eé] ?principale/i.test(r.roleName)
  const estArtisan = (r: RoleModele) => /artisan|sous.?trait|prestataire|entreprise|fournisseur|signataire/i.test(r.roleName)
  const tries = [...roles].sort((a, b) => a.routingOrder - b.routingOrder)
  const stc = tries.find(estStc) ?? null
  return tries.find((r) => r !== stc && estArtisan(r)) ?? tries.find((r) => r !== stc) ?? null
}
/** Un libellé lisible pour un tabLabel technique : « raison_sociale » → « Raison sociale ». */
export const libelleChamp = (tabLabel: string): string => {
  const t = tabLabel.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  return t ? t[0].toUpperCase() + t.slice(1) : tabLabel
}
