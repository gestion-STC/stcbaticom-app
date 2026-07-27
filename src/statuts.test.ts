import { describe, it, expect } from "vitest"
import { rangEtat, palette, clesCouleurs, couleursPrises, type Statut } from "./statuts"

// Fabrique un état minimal pour les tests.
const etat = (id: string, libelle: string, couleur: string): Statut => ({
  id,
  libelle,
  couleur: couleur as Statut["couleur"],
  ordre: 1,
  estObjectif: false,
  categorie: "",
  relanceJours: null,
})

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

describe("couleursPrises (bloquer les couleurs déjà attribuées)", () => {
  const existants = [
    etat("1", "À rappeler", "blue"),
    etat("2", "Intéressé", "violet"),
    etat("3", "Perdu", "red"),
  ]

  it("à la création, toutes les couleurs des autres états sont prises", () => {
    const prises = couleursPrises(existants, null)
    expect([...prises.keys()].sort()).toEqual(["blue", "red", "violet"])
    expect(prises.get("violet")).toBe("Intéressé") // on sait QUI la prend
    expect(prises.has("teal")).toBe(false) // une couleur neuve reste libre
  })

  it("en modification, l'état garde SA propre couleur disponible", () => {
    const prises = couleursPrises(existants, existants[1]) // on modifie « Intéressé »
    expect(prises.has("violet")).toBe(false)
    expect(prises.has("blue")).toBe(true)
  })

  it("reconnaît l'état en cours par son libellé quand il n'a pas encore d'id", () => {
    const sansId = { ...existants[1], id: undefined }
    expect(couleursPrises(existants, sansId).has("violet")).toBe(false)
  })

  it("si deux états partagent une couleur, le doublon reste signalé pendant la modification", () => {
    const avecDoublon = [...existants, etat("4", "Injoignable", "violet")]
    const prises = couleursPrises(avecDoublon, avecDoublon[1]) // on modifie « Intéressé »
    expect(prises.get("violet")).toBe("Injoignable")
  })

  it("ne bloque rien quand il n'existe encore aucun état", () => {
    expect(couleursPrises([], null).size).toBe(0)
  })
})
