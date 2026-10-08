import { describe, expect, it } from "vitest"
import { adressesInvalides, decouperAdresses, joindreAdresses } from "./adressesEmail"

describe("decouperAdresses", () => {
  it("accepte la virgule, le point-virgule, l'espace et le retour à la ligne", () => {
    expect(decouperAdresses("a@x.fr, b@y.fr;c@z.fr d@w.fr\ne@v.fr")).toEqual(["a@x.fr", "b@y.fr", "c@z.fr", "d@w.fr", "e@v.fr"])
  })
  it("lit la fiche Century 21 telle que saisie (deux adresses séparées par un espace)", () => {
    expect(decouperAdresses("lutece.gestion1@century21.fr lutece.gestion2@century21.fr")).toEqual([
      "lutece.gestion1@century21.fr",
      "lutece.gestion2@century21.fr",
    ])
  })
  it("garde l'adresse d'un « Nom <adresse> », en minuscules, sans doublon", () => {
    expect(decouperAdresses("Jean <Jean@Ex.fr>, jean@ex.fr")).toEqual(["jean@ex.fr"])
  })
  it("supporte le vide", () => {
    expect(decouperAdresses("")).toEqual([])
    expect(decouperAdresses("   ")).toEqual([])
  })
})

describe("adressesInvalides", () => {
  it("repère ce qui n'est pas une adresse", () => {
    expect(adressesInvalides(["a@x.fr", "pasune", "b@y"])).toEqual(["pasune", "b@y"])
  })
})

describe("joindreAdresses", () => {
  it("remet le champ au propre", () => {
    expect(joindreAdresses(["a@x.fr", "b@y.fr"])).toBe("a@x.fr, b@y.fr")
  })
})
