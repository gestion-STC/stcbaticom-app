import { describe, expect, it } from "vitest"
import type { Secteur } from "./modele"
import { codeValide, grouperParZone, libelleZone, prochainOrdre, trierSecteurs, zoneDepuisCode } from "./secteursOutils"

const s = (code: string, zone: string, ordre: number, libelle = code): Secteur => ({ code, libelle, zone, ordre })

describe("la zone déduite du code postal", () => {
  it("75 → Paris, sinon les deux premiers chiffres", () => {
    expect(zoneDepuisCode("75005")).toBe("Paris")
    expect(zoneDepuisCode(" 92100 ")).toBe("92")
    expect(zoneDepuisCode("77100")).toBe("77")
  })
  it("nomme les zones connues et dit « Département » pour les autres", () => {
    expect(libelleZone("Paris")).toBe("Paris")
    expect(libelleZone("95")).toBe("Val-d'Oise (95)")
    expect(libelleZone("77")).toBe("Département 77")
  })
  it("n'accepte qu'un code à 5 chiffres", () => {
    expect(codeValide("75005")).toBe(true)
    expect(codeValide("7500")).toBe(false)
    expect(codeValide("Paris 5")).toBe(false)
  })
})

describe("le tri et le groupage", () => {
  const liste = [s("78300", "78", 200), s("92100", "92", 100), s("75002", "Paris", 2), s("77100", "77", 900), s("75001", "Paris", 1), s("92000", "92", 102), s("93100", "93", 130)]
  it("trie Paris, 92, 93, 94, 95, 78, puis les autres départements, et dans la zone par ordre", () => {
    expect(trierSecteurs(liste).map((x) => x.code)).toEqual(["75001", "75002", "92100", "92000", "93100", "78300", "77100"])
  })
  it("groupe par zone dans le même ordre", () => {
    const g = grouperParZone(liste)
    expect(g.map((x) => x.zone)).toEqual(["Paris", "92", "93", "78", "77"])
    expect(g[1].secteurs.map((x) => x.code)).toEqual(["92100", "92000"])
    expect(g[0].libelle).toBe("Paris")
  })
  it("place un nouveau secteur après le dernier de sa zone, ou à la base de la zone vide", () => {
    expect(prochainOrdre("92", liste)).toBe(103)
    expect(prochainOrdre("95", liste)).toBe(150)
    expect(prochainOrdre("60", liste)).toBe(900)
  })
})
