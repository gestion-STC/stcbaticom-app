import { describe, expect, it } from "vitest"
import { MOI, TOUS, compteDuChoix, filtrerParPersonne, libelleChoix } from "./filtrePersonne"

const m = (id: string, espace: string, compteId: string | null) => ({ id, espace, compteId })
const liste = [m("1", "demarchage", "moi"), m("2", "demarchage", "autre"), m("3", "demarchage", null), m("4", "recrutement", null)]

describe("le filtre Moi · Tout le monde · un commercial", () => {
  it("nomme le choix", () => {
    expect(libelleChoix(MOI, [])).toBe("Moi")
    expect(libelleChoix(TOUS, [])).toBe("Tout le monde")
    expect(libelleChoix("c1", [{ id: "c1", nom: "Jean Test" }])).toBe("Jean Test")
  })
  it("retient le bon compte", () => {
    expect(compteDuChoix(MOI, "moi")).toBe("moi")
    expect(compteDuChoix(TOUS, "moi")).toBeNull()
    expect(compteDuChoix("autre", "moi")).toBe("autre")
  })
  it("Tout le monde garde tout ; un compte garde ses mails du démarchage et tout le recrutement", () => {
    expect(filtrerParPersonne(liste, null).map((x) => x.id)).toEqual(["1", "2", "3", "4"])
    expect(filtrerParPersonne(liste, "moi").map((x) => x.id)).toEqual(["1", "4"])
    expect(filtrerParPersonne(liste, "autre").map((x) => x.id)).toEqual(["2", "4"])
  })
})
