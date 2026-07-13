import { describe, it, expect } from "vitest"
import { secteursDisponibles, memeSecteur } from "./secteurs"

describe("secteursDisponibles", () => {
  it("dédoublonne, ignore les vides, et trie (numérique + alpha)", () => {
    const prospects = [
      { arrondissement: "75015" },
      { arrondissement: "75002" },
      { arrondissement: "Lyon" },
      { arrondissement: "75015" }, // doublon
      { arrondissement: "  " }, // vide
      { arrondissement: "" },
      {}, // sans champ
    ]
    expect(secteursDisponibles(prospects)).toEqual(["75002", "75015", "Lyon"])
  })

  it("liste vide si aucun secteur", () => {
    expect(secteursDisponibles([{}, { arrondissement: "" }])).toEqual([])
  })
})

describe("memeSecteur", () => {
  it("secteur vide = tous", () => {
    expect(memeSecteur({ arrondissement: "75015" }, "")).toBe(true)
    expect(memeSecteur({}, "")).toBe(true)
  })
  it("compare exactement (en ignorant les espaces autour)", () => {
    expect(memeSecteur({ arrondissement: " 75015 " }, "75015")).toBe(true)
    expect(memeSecteur({ arrondissement: "75002" }, "75015")).toBe(false)
    expect(memeSecteur({}, "75015")).toBe(false)
  })
})
