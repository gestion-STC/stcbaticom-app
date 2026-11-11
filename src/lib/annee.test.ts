import { describe, expect, it } from "vitest"
import { compter, depuisLeDebut, fortEtFaible, periodes, versCsv } from "./annee"

const maintenant = new Date(2026, 10, 11, 12) // mercredi 11 novembre 2026

describe("l'année : les périodes", () => {
  it("12 derniers mois : de décembre dernier à novembre, novembre en cours", () => {
    const p = periodes(maintenant, "mois", "12mois")
    expect(p).toHaveLength(12)
    expect(p[0].cle).toBe("2025-12")
    expect(p[11].cle).toBe("2026-11")
    expect(p.filter((x) => x.enCours).map((x) => x.cle)).toEqual(["2026-11"])
  })
  it("depuis janvier : 11 mois", () => {
    expect(periodes(maintenant, "mois", "annee")).toHaveLength(11)
  })
  it("par semaine : 52 semaines du lundi, la dernière en cours", () => {
    const p = periodes(maintenant, "semaine", "12mois")
    expect(p).toHaveLength(52)
    expect(p[51].debut).toEqual(new Date(2026, 10, 9))
    expect(p[51].enCours).toBe(true)
  })
})

describe("l'année : compter, le fort et le faible", () => {
  const p = periodes(maintenant, "mois", "annee")
  it("range chaque date dans son mois et ignore le reste", () => {
    const n = compter([new Date(2026, 0, 3).toISOString(), new Date(2026, 0, 30).toISOString(), new Date(2026, 4, 2).toISOString(), new Date(2025, 11, 31).toISOString(), null, "n'importe quoi"], p)
    expect(n[0]).toBe(2)
    expect(n[4]).toBe(1)
    expect(n.reduce((a, b) => a + b, 0)).toBe(3)
  })
  it("le moment fort et le faible ne regardent pas le mois en cours", () => {
    const v = [5, 9, 3, 7, 7, 7, 7, 7, 7, 7, 0] // novembre (en cours) à 0 ne compte pas comme faible
    expect(fortEtFaible(v, p)).toMatchObject({ fort: 1, faible: 2 })
    expect(fortEtFaible(v.map(() => 4), p)).toMatchObject({ fort: null, faible: null })
  })
  it("les périodes sans donnée ne sont ni faibles ni dans la moyenne", () => {
    const v = [null, null, null, 10, 20, 30, null, null, null, null, null]
    expect(fortEtFaible(v, p)).toEqual({ fort: 5, faible: 3, moyenne: 20 })
    expect(depuisLeDebut([0, 0, 4, 0, 2])).toEqual([null, null, 4, 0, 2])
    expect(depuisLeDebut([0, 0])).toEqual([null, null])
  })
  it("exporte en CSV lisible par Excel", () => {
    const csv = versCsv(p.slice(0, 2), [{ nom: "Appels", v: [10, 12] }, { nom: "Chiffre d'affaires", v: [1500.5, null] }])
    expect(csv.split("\n")).toEqual(["Période;Appels;Chiffre d'affaires", "janv. 2026;10;1500,5", "févr. 2026;12;"])
  })
})
