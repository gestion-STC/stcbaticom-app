import { describe, it, expect } from "vitest"
import { rangDepuisOrdre, palette, clesCouleurs, couleursPrises, type Statut } from "./statuts"

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

describe("rangDepuisOrdre (le classement du Paramétrage fait foi)", () => {
  // Ordre choisi par l'utilisateur via les flèches ↑↓.
  const ordonnes = [
    { ...etat("1", "Client signé", "green"), ordre: 1 },
    { ...etat("2", "RDV pris", "orange"), ordre: 2 },
    { ...etat("3", "Perdu", "red"), ordre: 3 },
  ]

  it("respecte l'ordre choisi par l'utilisateur", () => {
    const rang = rangDepuisOrdre(ordonnes)
    expect(rang("Client signé")).toBeLessThan(rang("RDV pris"))
    expect(rang("RDV pris")).toBeLessThan(rang("Perdu"))
  })

  it("suit l'utilisateur quand il inverse l'ordre", () => {
    const inverse = [
      { ...etat("3", "Perdu", "red"), ordre: 1 },
      { ...etat("1", "Client signé", "green"), ordre: 2 },
    ]
    const rang = rangDepuisOrdre(inverse)
    expect(rang("Perdu")).toBeLessThan(rang("Client signé"))
  })

  it("classe d'après la position, pas la valeur brute (trous après réorganisation)", () => {
    const avecTrous = [
      { ...etat("1", "Premier OS reçu", "teal"), ordre: 7 },
      { ...etat("2", "En attente", "amber"), ordre: 42 },
    ]
    const rang = rangDepuisOrdre(avecTrous)
    expect(rang("Premier OS reçu")).toBe(0)
    expect(rang("En attente")).toBe(1)
  })

  it("relègue en fin de liste un état inconnu (ancienne donnée)", () => {
    const rang = rangDepuisOrdre(ordonnes)
    expect(rang("État supprimé")).toBeGreaterThan(rang("Perdu"))
  })

  it("ne plante pas quand aucun état n'est chargé", () => {
    expect(() => rangDepuisOrdre([])("Peu importe")).not.toThrow()
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
