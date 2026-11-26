import { describe, expect, it } from "vitest"
import { debutPremiersOs } from "./donnees"

describe("les premiers OS des dashboards (27/11/2026)", () => {
  it("lus depuis le 01/07/2026 au moins : en janvier 2027, juillet à octobre ne disparaissent plus", () => {
    expect(debutPremiersOs(new Date(2027, 0, 15)).getTime()).toBe(new Date(2026, 6, 1).getTime())
    expect(debutPremiersOs(new Date(2026, 10, 27)).getTime()).toBe(new Date(2026, 0, 1).getTime())
  })
})
