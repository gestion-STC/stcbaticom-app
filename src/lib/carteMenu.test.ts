import { describe, expect, it } from "vitest"
import { MENU, menuPour, pageAutorisee, premierePage } from "./carteMenu"
import { aMoi, espacesVisibles, LES_DEUX } from "./perimetre"

// Le menu unique (07/11/2026) : on a rangé, rien retiré ; chacun ne voit que ses bases.
describe("carte du menu", () => {
  const ids = (g: typeof MENU) => g.flatMap((x) => x.entrees).map((e) => e.id)
  it("chaque page est dans le menu une seule fois", () => {
    const toutes = ids(MENU)
    expect(new Set(toutes).size).toBe(toutes.length)
    expect(MENU.map((g) => g.titre)).toEqual(["Campagnes", "Gestionnaires", "Sous-traitants"])
  })
  it("un administrateur voit tout", () => {
    expect(ids(menuPour(LES_DEUX))).toEqual(ids(MENU))
  })
  it("un commercial ne voit que son service, sans les campagnes", () => {
    expect(ids(menuPour(["demarchage"], false))).toEqual(["aujourdhui", "leads", "sessions", "agenda", "messages", "agences", "apporteurs", "analyse"])
    expect(pageAutorisee("st_base", ["demarchage"], false)).toBe(false)
    expect(pageAutorisee("campagnes", ["demarchage"], false)).toBe(false)
    expect(pageAutorisee("st_machine", ["demarchage"], false)).toBe(false)
  })
  it("un recruteur ne voit que son service, et arrive sur ses leads", () => {
    expect(ids(menuPour(["recrutement"], false))).toEqual(["leads_st", "sessions_st", "agenda_st", "messages_st", "st_base", "qualification_st"])
    expect(premierePage(["recrutement"], false)).toBe("leads_st")
    expect(pageAutorisee("agences", ["recrutement"], false)).toBe(false)
    expect(pageAutorisee("parametrage", ["recrutement"], false)).toBe(true)
  })
  it("un administrateur a les campagnes et tous les leads", () => {
    expect(pageAutorisee("campagnes", ["demarchage", "recrutement"], true)).toBe(true)
    expect(ids(menuPour(["demarchage", "recrutement"], true))).toContain("leads_tous")
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
