import { describe, it, expect } from "vitest"
import { tauxGlobal, volumeADemarcher, dispoAContacter, TAUX_DEFAUT, MARGE } from "./recrutementCalc"
import type { SousTraitant } from "../recrutement"

const base = (o: Partial<SousTraitant>): SousTraitant => ({
  entreprise: "", contact: "", email: "", telephone: "", metier: "", zone: "",
  statut: "a_contacter", etapeCourante: 0, nbClics: 0, ...o,
})
const iso = (joursAvant: number) => new Date(Date.now() - joursAvant * 86_400_000).toISOString()

describe("recrutementCalc", () => {
  it("retombe sur le taux par défaut quand trop peu de dépôts", () => {
    const liste = Array.from({ length: 100 }, () => base({ demarreLe: iso(10) }))
    liste[0] = base({ demarreLe: iso(10), deposeLe: iso(5), statut: "depose" }) // 1 dépôt seulement
    const t = tauxGlobal(liste)
    expect(t.fiable).toBe(false)
    expect(t.taux).toBe(TAUX_DEFAUT)
  })

  it("utilise le taux observé quand assez de dépôts", () => {
    // 400 contactés, 20 dépôts = 5 %
    const liste: SousTraitant[] = []
    for (let i = 0; i < 400; i++) liste.push(base({ demarreLe: iso(20) }))
    for (let i = 0; i < 20; i++) liste[i] = base({ demarreLe: iso(20), deposeLe: iso(10), statut: "depose" })
    const t = tauxGlobal(liste)
    expect(t.fiable).toBe(true)
    expect(t.taux).toBeCloseTo(0.05, 5)
  })

  it("ignore les contacts hors fenêtre (60 j)", () => {
    const liste = [base({ demarreLe: iso(90) }), base({ demarreLe: iso(10) })]
    expect(tauxGlobal(liste).contactes).toBe(1)
  })

  it("calcule le volume avec la marge", () => {
    // 5 recrues à 5 % = 100, +25 % = 125
    expect(volumeADemarcher(5, 0.05)).toBe(Math.ceil((5 / 0.05) * (1 + MARGE)))
    expect(volumeADemarcher(5, 0.05)).toBe(125)
    expect(volumeADemarcher(0, 0.05)).toBe(0)
    expect(volumeADemarcher(5, 0)).toBe(0)
  })

  it("compte les dispo d'un corps (multi-corps inclus), à contacter et joignables", () => {
    const liste = [
      base({ metier: "Plomberie / sanitaire", statut: "a_contacter", telephone: "0600000000" }),
      base({ metier: "Plomberie / sanitaire / Chauffage / VMC / ventilation", statut: "a_contacter", email: "a@b.fr" }), // multi-corps → compte
      base({ metier: "Plomberie / sanitaire", statut: "depose", telephone: "0600000000" }), // déjà déposé → exclu
      base({ metier: "Plomberie / sanitaire", statut: "a_contacter" }), // ni email ni tel → exclu
      base({ metier: "Électricité", statut: "a_contacter", telephone: "0600000000" }), // autre corps
    ]
    expect(dispoAContacter(liste, "Plomberie / sanitaire")).toBe(2)
    expect(dispoAContacter(liste, "Chauffage / VMC / ventilation")).toBe(1) // via le multi-corps
    expect(dispoAContacter(liste, "Électricité")).toBe(1)
    expect(dispoAContacter(liste, "")).toBe(0)
  })
})
