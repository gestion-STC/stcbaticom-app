import { describe, expect, it } from "vitest"
import { attenteCourte, attenteLisible, couleurAttente, minutesDepuis } from "./leadsOutils"

describe("l'attente d'un lead", () => {
  const maintenant = new Date("2026-11-06T15:00:00Z")
  it("se compte en minutes, jamais négative", () => {
    expect(minutesDepuis("2026-11-06T14:48:00Z", maintenant)).toBe(12)
    expect(minutesDepuis("2026-11-06T15:05:00Z", maintenant)).toBe(0)
    expect(minutesDepuis("n'importe quoi", maintenant)).toBe(0)
  })
  it("se lit en clair", () => {
    expect(attenteLisible(0)).toBe("à l'instant")
    expect(attenteLisible(12)).toBe("il y a 12 min")
    expect(attenteLisible(125)).toBe("il y a 2 h 05")
    expect(attenteLisible(3 * 24 * 60 + 5)).toBe("il y a 3 j")
    expect(attenteCourte(48)).toBe("48 min")
    expect(attenteCourte(135)).toBe("2 h")
  })
  it("vert jusqu'à 30 min, orange jusqu'à 1 h, rouge après", () => {
    expect(couleurAttente(30)).toBe("text-ok")
    expect(couleurAttente(31)).toBe("text-attention")
    expect(couleurAttente(60)).toBe("text-attention")
    expect(couleurAttente(61)).toBe("text-alerte")
  })
})
