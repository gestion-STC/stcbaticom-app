import { describe, expect, it } from "vitest"
import { tacheCampagnePourMoi } from "./perimetre"

describe("tacheCampagnePourMoi", () => {
  const agence = { baseId: "agences", proprietaireId: "moi" }
  it("un administrateur voit tout", () => expect(tacheCampagnePourMoi({ baseId: "agences", proprietaireId: "autre" }, "x", true, [])).toBe(true))
  it("un commercial voit ses agences, pas celles des autres", () => {
    expect(tacheCampagnePourMoi(agence, "moi", false, ["demarchage"])).toBe(true)
    expect(tacheCampagnePourMoi(agence, "autre", false, ["demarchage"])).toBe(false)
  })
  it("une agence non attribuée ne va pas à un commercial", () => expect(tacheCampagnePourMoi({ baseId: "agences", proprietaireId: null }, "moi", false, ["demarchage"])).toBe(false))
  it("les artisans vont à ceux qui ont cette base", () => {
    expect(tacheCampagnePourMoi({ baseId: "artisans", proprietaireId: null }, "moi", false, ["recrutement"])).toBe(true)
    expect(tacheCampagnePourMoi({ baseId: "artisans", proprietaireId: null }, "moi", false, ["demarchage"])).toBe(false)
  })
})
