import { describe, expect, it } from "vitest"
import { MENU, menuPour, pageAutorisee, premierePage } from "./carteMenu"
import { aMoi, espacesVisibles, LES_DEUX } from "./perimetre"

// Le menu unique (07/11/2026) : on a rangé, rien retiré ; chacun ne voit que ses bases.
describe("carte du menu", () => {
  const ids = (g: typeof MENU) => g.flatMap((x) => x.entrees).map((e) => e.id)
  it("chaque page est dans le menu une seule fois", () => {
    const toutes = ids(MENU)
    expect(new Set(toutes).size).toBe(toutes.length)
    expect([...toutes].sort()).toEqual(["agences", "agenda", "analyse", "apporteurs", "aujourdhui", "campagnes", "messages", "sessions", "st_base", "st_dossiers"])
  })
  it("un administrateur voit tout", () => {
    expect(ids(menuPour(LES_DEUX))).toEqual(ids(MENU))
  })
  it("un commercial ne voit rien des artisans", () => {
    const m = ids(menuPour(["demarchage"]))
    expect(m).toEqual(["aujourdhui", "campagnes", "sessions", "messages", "agenda", "agences", "apporteurs", "analyse"])
    expect(pageAutorisee("st_base", ["demarchage"])).toBe(false)
    expect(pageAutorisee("st_machine", ["demarchage"])).toBe(false)
  })
  it("un recruteur ne voit rien des agences, et arrive sur les campagnes", () => {
    expect(ids(menuPour(["recrutement"]))).toEqual(["campagnes", "sessions", "messages", "st_dossiers", "st_base"])
    expect(premierePage(["recrutement"])).toBe("campagnes")
    expect(pageAutorisee("agences", ["recrutement"])).toBe(false)
    expect(pageAutorisee("parametrage", ["recrutement"])).toBe(true)
  })
  it("le périmètre suit le rôle puis la fonction", () => {
    expect(espacesVisibles("admin", "recrutement")).toEqual(LES_DEUX)
    expect(espacesVisibles(null, undefined)).toEqual(LES_DEUX)
    expect(espacesVisibles("telepro", "commercial")).toEqual(["demarchage"])
    expect(espacesVisibles("telepro", "recrutement")).toEqual(["recrutement"])
    expect(espacesVisibles("telepro", undefined)).toEqual(LES_DEUX)
    expect(espacesVisibles("telepro", "direction")).toEqual(LES_DEUX)
  })
  it("un téléprospecteur ne voit que ses tâches et RDV, un administrateur tout", () => {
    const t = { compteId: "a", agenceCommercialId: "b" }
    expect(aMoi(t, "a", false)).toBe(true)
    expect(aMoi(t, "b", false)).toBe(true)
    expect(aMoi(t, "c", false)).toBe(false)
    expect(aMoi(t, "c", true)).toBe(true)
    expect(aMoi({ compteId: null, agenceCommercialId: null }, "", false)).toBe(false)
  })
})
