import { describe, expect, it } from "vitest"
import { RUBRIQUES, entreesDe, premierePage, rubriqueDe } from "./carteMenu"
import { espaceDe } from "./espaces"

// Le menu en rubriques (06/11/2026) : on a rangé, rien retiré.
describe("carte du menu", () => {
  const toutes = RUBRIQUES.flatMap(entreesDe).map((e) => e.id)
  it("chaque page est dans le menu une seule fois", () => {
    expect(new Set(toutes).size).toBe(toutes.length)
    expect(toutes.sort()).toEqual(["agences", "agenda", "analyse", "apporteurs", "aujourdhui", "messages", "sessions", "st_base", "st_boite", "st_dossiers", "st_machine", "st_reglages", "st_sequences", "st_session", "st_suivi"])
  })
  it("chaque page est rangée dans la rubrique de son espace", () => {
    for (const r of RUBRIQUES) for (const e of entreesDe(r)) expect(espaceDe(e.id)).toBe(r.espace)
  })
  it("un clic sur une rubrique ouvre sa première page", () => {
    expect(premierePage(rubriqueDe("demarchage"))).toBe("aujourdhui")
    expect(premierePage(rubriqueDe("recrutement"))).toBe("st_machine")
  })
})
