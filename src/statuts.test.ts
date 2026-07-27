import { describe, it, expect } from "vitest"
import { rangEtat, palette, clesCouleurs } from "./statuts"

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

describe("palette (choix de couleurs pour les états)", () => {
  it("offre largement de quoi couvrir tous les états de l'utilisateur", () => {
    expect(clesCouleurs.length).toBeGreaterThanOrEqual(20)
  })

  it("chaque couleur a une pastille, une teinte et un nom lisible", () => {
    for (const c of clesCouleurs) {
      expect(palette[c].pill, `pill manquant pour ${c}`).toMatch(/^bg-\S+ text-\S+$/)
      expect(palette[c].dot, `teinte invalide pour ${c}`).toMatch(/^#[0-9a-f]{6}$/i)
      expect(palette[c].label.trim(), `nom manquant pour ${c}`).not.toBe("")
    }
  })

  it("aucun doublon : ni deux fois la même teinte, ni deux fois le même nom", () => {
    const teintes = clesCouleurs.map((c) => palette[c].dot.toLowerCase())
    const noms = clesCouleurs.map((c) => palette[c].label)
    expect(new Set(teintes).size).toBe(teintes.length)
    expect(new Set(noms).size).toBe(noms.length)
  })

  it("n'utilise pas les classes bg-blue-*/text-blue-* (détournées en violet par le thème STC)", () => {
    for (const c of clesCouleurs) {
      expect(palette[c].pill, `${c} utilise du blue-* remappé`).not.toMatch(/\b(bg|text)-blue-/)
    }
  })
})
