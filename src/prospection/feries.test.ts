// Aucun envoi un jour férié (Mahdi, 11/11/2026).
import { describe, expect, it } from "vitest"
import { dansLaPlage, estFerie } from "./moteur"
import type { Campagne } from "./modele"

describe("jours fériés", () => {
  it("les dates fixes", () => {
    for (const j of ["2026-01-01", "2026-05-01", "2026-05-08", "2026-07-14", "2026-08-15", "2026-11-01", "2026-11-11", "2026-12-25"]) expect(estFerie(j)).toBe(true)
  })
  it("les dates qui suivent Pâques (5 avril 2026, 28 mars 2027)", () => {
    expect(estFerie("2026-04-06")).toBe(true) // lundi de Pâques
    expect(estFerie("2026-05-14")).toBe(true) // Ascension
    expect(estFerie("2026-05-25")).toBe(true) // lundi de Pentecôte
    expect(estFerie("2027-03-29")).toBe(true)
    expect(estFerie("2027-05-06")).toBe(true)
  })
  it("un jour ordinaire n'est pas férié", () => {
    expect(estFerie("2026-11-12")).toBe(false)
    expect(estFerie("2026-04-07")).toBe(false)
  })
  it("le 11 novembre à 10 h, un mercredi, la campagne n'envoie pas ; le 12 si", () => {
    const c = { rythme: { jours: [1, 2, 3, 4, 5], heureMin: 9, heureMax: 18 } } as unknown as Campagne
    expect(dansLaPlage(c, new Date("2026-11-11T09:00:00Z"))).toBe(false)
    expect(dansLaPlage(c, new Date("2026-11-12T09:00:00Z"))).toBe(true)
  })
})
