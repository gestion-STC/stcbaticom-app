import { describe, expect, it } from "vitest"
import { filtreCommercial, nomProprietaire, normaliserChoix, optionsBase, proprietaireDepuisChoix } from "./attribution"

const MOI = "11111111-1111-1111-1111-111111111111"
const HORLANN = "22222222-2222-2222-2222-222222222222"
const COMPTES = [{ id: MOI, nom: "Mahdi" }, { id: HORLANN, nom: "Horlann" }]

describe("attribution de la base", () => {
  it("un téléprospecteur ne voit que sa base, quoi qu'il demande", () => {
    expect(proprietaireDepuisChoix("tous", MOI, false, false)).toEqual({ compteId: MOI })
    expect(proprietaireDepuisChoix(`compte:${HORLANN}`, MOI, false, false)).toEqual({ compteId: MOI })
    expect(proprietaireDepuisChoix("non_attribuees", MOI, false, false)).toEqual({ compteId: MOI })
    expect(optionsBase(false, false, COMPTES, MOI)).toEqual([{ value: "moi", label: "Ma base" }])
  })
  it("si le réglage l'autorise, un téléprospecteur peut se servir dans les non attribuées", () => {
    expect(proprietaireDepuisChoix("non_attribuees", MOI, false, true)).toBe("non_attribuees")
    expect(optionsBase(false, true, COMPTES, MOI).map((o) => o.value)).toEqual(["moi", "non_attribuees"])
  })
  it("un admin choisit : ma base, celle d'un autre, les non attribuées, tout", () => {
    expect(proprietaireDepuisChoix("moi", MOI, true, false)).toEqual({ compteId: MOI })
    expect(proprietaireDepuisChoix(`compte:${HORLANN}`, MOI, true, false)).toEqual({ compteId: HORLANN })
    expect(proprietaireDepuisChoix("non_attribuees", MOI, true, false)).toBe("non_attribuees")
    expect(proprietaireDepuisChoix("tous", MOI, true, false)).toBe("tous")
    expect(optionsBase(true, false, COMPTES, MOI).map((o) => o.label)).toEqual(["Ma base", "Base de Horlann", "Non attribuées", "Toute la base"])
  })
  it("par défaut, et pour un choix inconnu : ma base", () => {
    expect(normaliserChoix(null, true, false)).toBe("moi")
    expect(normaliserChoix("n'importe quoi", true, false)).toBe("moi")
    expect(normaliserChoix("", false, false)).toBe("moi")
  })
  it("sans compte connecté (démo), aucun filtre", () => {
    expect(proprietaireDepuisChoix("moi", "", false, false)).toBe("tous")
  })
  it("traduit le filtre pour la liste des agences", () => {
    expect(filtreCommercial("tous")).toBeUndefined()
    expect(filtreCommercial("non_attribuees")).toBe("aucun")
    expect(filtreCommercial({ compteId: MOI })).toBe(MOI)
  })
  it("nomme le propriétaire", () => {
    expect(nomProprietaire(null, COMPTES, MOI)).toBe("")
    expect(nomProprietaire(MOI, COMPTES, MOI)).toBe("Moi")
    expect(nomProprietaire(HORLANN, COMPTES, MOI)).toBe("Horlann")
    expect(nomProprietaire("inconnu", COMPTES, MOI)).toBe("Un autre compte")
  })
})
