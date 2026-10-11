import { describe, expect, it } from "vitest"
import type { DossierST, SousTraitant } from "../recrutement"
import { champsArtisan, connuDepuis, libelleChamp, roleArtisan, valeurProposee } from "./contratsOutils"

const dossier: DossierST = {
  id: "d", creeLe: "2026-10-01T10:00:00Z", raisonSociale: "ELEC BEST ONE", email: "contact@elecbestone.com", fichiers: [], emailEnvoye: true,
  donnees: { sections: [
    { titre: "Volet 1", lignes: [{ label: "Raison sociale", valeur: "ELEC BEST ONE" }, { label: "SIRET", valeur: "98063495000011" }, { label: "Forme juridique", valeur: "SASU" }, { label: "Dirigeant", valeur: "Jeganath MANICKAVASAGAR" }, { label: "Adresse", valeur: "2 Avenue Gandhi 95490 VAUREAL" }, { label: "Téléphone", valeur: "0781662296" }, { label: "E-mail", valeur: "contact@elecbestone.com" }] },
    { titre: "Volet 2", lignes: [{ label: "Décennale — compagnie", valeur: "BPCE IARD (MAAF)" }, { label: "Décennale — n° police", valeur: "195046066Y" }, { label: "Qualibat", valeur: "—" }] },
  ] },
}
const fiche: SousTraitant = { id: "s", entreprise: "Elec Best One", contact: "J. Manickavasagar", email: "", telephone: "07 81 66 22 96", metier: "Électricien", zone: "95", statut: "depose", etapeCourante: 0, nbClics: 0, nbEnvoisOk: 0, nbEnvoisErreur: 0 }

describe("valeurProposee", () => {
  const c = connuDepuis(dossier, fiche)
  it("retrouve les champs du dossier par leur nom ou un synonyme", () => {
    expect(valeurProposee("Raison sociale", c)).toBe("ELEC BEST ONE")
    expect(valeurProposee("raison_sociale", c)).toBe("ELEC BEST ONE")
    expect(valeurProposee("SIRET", c)).toBe("98063495000011")
    expect(valeurProposee("Représentant légal", c)).toBe("Jeganath MANICKAVASAGAR")
    expect(valeurProposee("Assureur décennale", c)).toBe("BPCE IARD (MAAF)")
    expect(valeurProposee("Ville", c)).toBe("VAUREAL")
    expect(valeurProposee("Code postal", c)).toBe("95490")
  })
  it("retombe sur la fiche quand le dossier ne dit rien, et laisse vide sinon", () => {
    expect(valeurProposee("Métier", c)).toBe("Électricien")
    expect(valeurProposee("Zone", c)).toBe("95")
    expect(valeurProposee("Qualibat", c)).toBe("") // « — » = pas de valeur
    expect(valeurProposee("Numéro de TVA", c)).toBe("")
  })
  it("sans dossier, la fiche suffit pour l'essentiel", () => {
    const seul = connuDepuis(null, fiche)
    expect(valeurProposee("Entreprise", seul)).toBe("Elec Best One")
    expect(valeurProposee("Téléphone", seul)).toBe("07 81 66 22 96")
  })
})

describe("champsArtisan et roleArtisan", () => {
  const pack = [
    { templateId: "a", nom: "Contrat cadre", roles: [{ roleName: "STC", routingOrder: 2, champs: ["date"], requis: [] }, { roleName: "Sous-traitant", routingOrder: 1, champs: ["raison_sociale", "siret"], requis: ["siret"] }] },
    { templateId: "b", nom: "Charte", roles: [{ roleName: "Signataire", routingOrder: 1, champs: ["raison_sociale", "ville"], requis: ["raison_sociale"] }] },
  ]
  it("réunit les champs de l'artisan sans doublon, requis si requis quelque part", () => {
    expect(champsArtisan(pack)).toEqual([{ label: "raison_sociale", requis: true }, { label: "siret", requis: true }, { label: "ville", requis: false }])
  })
  it("reconnaît le rôle artisan par le nom, sinon le premier à signer", () => {
    expect(roleArtisan(pack[0].roles)?.roleName).toBe("Sous-traitant")
    expect(roleArtisan([{ roleName: "Partie A", routingOrder: 2, champs: [], requis: [] }, { roleName: "Partie B", routingOrder: 1, champs: [], requis: [] }])?.roleName).toBe("Partie B")
  })
  it("rend les libellés lisibles", () => {
    expect(libelleChamp("raison_sociale")).toBe("Raison sociale")
  })
})
