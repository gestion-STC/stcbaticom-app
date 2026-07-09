import { describe, it, expect } from "vitest"
import { rangEtat, palette } from "./statuts"

describe("rangEtat (classement du meilleur au pire)", () => {
  it("Client signé passe avant RDV pris, avant Nouveau, avant Perdu", () => {
    expect(rangEtat("Client signé")).toBeLessThan(rangEtat("RDV pris"))
    expect(rangEtat("RDV pris")).toBeLessThan(rangEtat("Nouveau prospect"))
    expect(rangEtat("Nouveau prospect")).toBeLessThan(rangEtat("Perdu"))
  })

  it("un état inconnu est relégué en fin de liste", () => {
    expect(rangEtat("État bidon")).toBeGreaterThan(rangEtat("Perdu"))
  })
})

describe("palette (accès sûr anti-crash)", () => {
  it("une couleur inconnue retombe sur le gris (slate) au lieu de planter", () => {
    expect(palette["couleur_inexistante"]).toBe(palette.slate)
  })
})
