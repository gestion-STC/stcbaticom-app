// Le dossier d'un artisan hors base devient une fiche (12/10/2026), et la boîte
// affiche toujours ses non-lus, même anciens.
import { describe, it, expect } from "vitest"
import { ficheDepuisDossier, SOURCE_HORS_BASE } from "./ficheHorsBase"
import { fusionnerAvecNonLus } from "./messagesDb"
import type { DossierST } from "../recrutement"

const dossier: DossierST = {
  id: "d1", creeLe: "2026-09-16T11:07:12Z", raisonSociale: "SMS bat ", email: "Med.SmsBat@gmail.com",
  fichiers: [], emailEnvoye: true,
  donnees: { sections: [
    { titre: "Volet 1", lignes: [
      { label: "Dirigeant", valeur: "Mahmoud SAADAOUI" },
      { label: "Adresse", valeur: "9 RUE LEON JOUHAUX  06300 Nice" },
      { label: "Téléphone", valeur: "06 84 56 57 39" },
    ] },
    { titre: "Volet 3", lignes: [
      { label: "Corps d'état maîtrisés", valeur: "Plâtrerie / cloisons, Isolation" },
      { label: "Qualibat", valeur: "—" },
    ] },
  ] },
}

describe("un dossier hors base devient une fiche", () => {
  it("reprend l'entreprise, le dirigeant, l'e-mail, le téléphone, le métier et la zone", () => {
    expect(ficheDepuisDossier(dossier)).toMatchObject({
      entreprise: "SMS bat", contact: "Mahmoud SAADAOUI", email: "med.smsbat@gmail.com",
      telephone: "0684565739", metier: "Plâtrerie / cloisons, Isolation", zone: "06300 Nice",
    })
  })
  it("naît « déposé », se reconnaît à sa source, et n'entre dans aucune séquence", () => {
    const f = ficheDepuisDossier(dossier)
    expect(f.statut).toBe("depose")
    expect(f.source).toBe(SOURCE_HORS_BASE)
    expect(f.deposeLe).toBe(dossier.creeLe)
    expect(f.dossierId).toBe("d1")
    expect(f.sequenceId).toBeUndefined()
  })
  it("une case vide ou « — » ne remplit rien", () => {
    const vide = ficheDepuisDossier({ ...dossier, donnees: { sections: [{ titre: "x", lignes: [{ label: "Dirigeant", valeur: "—" }] }] } })
    expect(vide.contact).toBe("")
    expect(vide.zone).toBe("")
  })
})

describe("la boîte affiche toujours ses non-lus, même anciens", () => {
  const m = (id: string, created_at: string) => ({ id, created_at })
  it("ajoute un non-lu absent des 500 derniers, à sa place dans le temps", () => {
    const derniers = [m("c", "2026-10-12"), m("b", "2026-10-11")]
    const nonLus = [m("b", "2026-10-11"), m("vieux", "2026-08-05")]
    expect(fusionnerAvecNonLus(derniers, nonLus).map((x) => x.id)).toEqual(["c", "b", "vieux"])
  })
  it("ne double rien quand le non-lu est déjà dans la liste", () => {
    const derniers = [m("c", "2026-10-12")]
    expect(fusionnerAvecNonLus(derniers, [m("c", "2026-10-12")])).toBe(derniers)
  })
})
