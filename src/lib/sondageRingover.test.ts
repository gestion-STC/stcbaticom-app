import { describe, expect, it } from "vitest"
import { CLE_SONDEUR, delaiApresEchecs, prendreLaMain } from "./sondageRingover"

function stockage(): Pick<Storage, "getItem" | "setItem"> {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}

describe("un seul sondeur Ringover par poste (27/11/2026)", () => {
  it("le premier onglet prend la main, le second attend ; la main revient au second si le premier se tait 12 s", () => {
    const s = stockage()
    expect(prendreLaMain(s, "a", 0)).toBe(true)
    expect(prendreLaMain(s, "b", 5_000)).toBe(false)
    expect(prendreLaMain(s, "a", 5_000)).toBe(true)
    expect(prendreLaMain(s, "b", 17_001)).toBe(true)
    expect(JSON.parse(s.getItem(CLE_SONDEUR)!).id).toBe("b")
  })
  it("stockage illisible : on sonde quand même", () => {
    expect(prendreLaMain({ getItem: () => { throw new Error("bloqué") }, setItem: () => undefined }, "a", 0)).toBe(true)
  })
  it("après une erreur de Ringover, on espace : 10 s, 20 s, 40 s… plafonné à 2 min", () => {
    expect([0, 1, 2, 3, 5, 9].map(delaiApresEchecs)).toEqual([0, 10_000, 20_000, 40_000, 120_000, 120_000])
  })
})
