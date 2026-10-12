import { afterEach, describe, expect, it } from "vitest"
import { RELANCE_JOURS, reglerRelanceJours, relanceJours } from "./modele"

// Le délai de relance des intéressés est réglable (Mahdi, 12/10/2026) ; hors réglage valable, 7 jours.
describe("relance des intéressés", () => {
  afterEach(() => reglerRelanceJours(RELANCE_JOURS))
  it("vaut 7 jours par défaut", () => { expect(relanceJours()).toBe(7) })
  it("prend le réglage (15 jours, un mois)", () => {
    reglerRelanceJours(15); expect(relanceJours()).toBe(15)
    reglerRelanceJours(30); expect(relanceJours()).toBe(30)
  })
  it("retombe sur 7 si le réglage est vide ou absurde", () => {
    reglerRelanceJours(0); expect(relanceJours()).toBe(7)
    reglerRelanceJours(Number.NaN); expect(relanceJours()).toBe(7)
    reglerRelanceJours(400); expect(relanceJours()).toBe(7)
  })
})
