// L'agenda façon Google Agenda (Mahdi, 11/11/2026) : la place des événements.
import { describe, expect, it } from "vitest"
import { HAUTEUR_HEURE, bornesVue, hauteurMaintenant, joursDuMois, placeVerticale, placerJournee } from "./agendaGrille"

const d = (h: number, m = 0) => new Date(2026, 10, 12, h, m)

describe("la grille de l'agenda", () => {
  it("un événement se place à son heure, et se lit même très court", () => {
    expect(placeVerticale(d(9, 30), 45)).toEqual({ top: 2.5 * HAUTEUR_HEURE, hauteur: 0.75 * HAUTEUR_HEURE - 2 })
    expect(placeVerticale(d(10), 5).hauteur).toBe(22)
    expect(placeVerticale(d(5), 30).top).toBe(0)
  })
  it("deux événements qui se chevauchent se partagent la largeur ; un troisième à part reprend toute la place", () => {
    const p = placerJournee([{ id: "a", debut: d(9), dureeMin: 60 }, { id: "b", debut: d(9, 30), dureeMin: 30 }, { id: "c", debut: d(14), dureeMin: 30 }])
    expect(p.get("a")).toMatchObject({ gauche: 0, largeur: 50 })
    expect(p.get("b")).toMatchObject({ gauche: 50, largeur: 50 })
    expect(p.get("c")).toMatchObject({ gauche: 0, largeur: 100 })
  })
  it("le mois commence un lundi et montre six semaines", () => {
    const j = joursDuMois(new Date(2026, 10, 11))
    expect(j).toHaveLength(42)
    expect(j[0].getDay()).toBe(1)
    expect(j[0].getDate()).toBe(26) // lundi 26 octobre
  })
  it("la semaine va du lundi au lundi suivant", () => {
    const b = bornesVue("semaine", new Date(2026, 10, 11, 15))
    expect(b.de).toEqual(new Date(2026, 10, 9))
    expect(b.a).toEqual(new Date(2026, 10, 16))
  })
  it("la ligne « maintenant » n'apparaît que dans les heures affichées", () => {
    expect(hauteurMaintenant(d(13, 30))).toBe(6.5 * HAUTEUR_HEURE)
    expect(hauteurMaintenant(d(23))).toBeNull()
  })
})
