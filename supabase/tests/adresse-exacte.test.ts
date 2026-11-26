// Lot 1 (27/11/2026) : le formulaire public de dépôt de dossier rattache par l'adresse EXACTE, plus par un motif.
import { describe, expect, it } from "vitest"
import { filtreAdresseExacte } from "../functions/_shared/adresseExacte"

// Le sens d'un motif ILIKE (échappement « \ » par défaut), pour vérifier qu'il ne trouve que l'adresse elle-même.
const correspond = (motif: string, valeur: string) => {
  let re = ""
  for (let i = 0; i < motif.length; i++) {
    const c = motif[i]
    if (c === "\\" && i + 1 < motif.length) { re += motif[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); continue }
    re += c === "%" ? ".*" : c === "_" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp(`^${re}$`, "i").test(valeur)
}

describe("filtreAdresseExacte", () => {
  it("« %@gmail.com » ne trouve plus une fiche gmail au hasard", () => {
    const f = filtreAdresseExacte("%@gmail.com")
    expect(f.op).toBe("ilike")
    expect(correspond(f.valeur, "jean.dupont@gmail.com")).toBe(false)
    expect(correspond(f.valeur, "%@gmail.com")).toBe(true)
  })
  it("« _ » n'est plus un caractère quelconque", () => {
    const f = filtreAdresseExacte("jean_dupont@free.fr")
    expect(correspond(f.valeur, "jean_dupont@free.fr")).toBe(true)
    expect(correspond(f.valeur, "jeanXdupont@free.fr")).toBe(false)
  })
  it("les majuscules et les espaces autour ne comptent pas", () => {
    const f = filtreAdresseExacte("  Jean.Dupont@Gmail.com ")
    expect(f.valeur).toBe("jean.dupont@gmail.com")
    expect(correspond(f.valeur, "JEAN.DUPONT@gmail.com")).toBe(true)
  })
  it("une adresse avec « * » (joker de PostgREST) est comparée telle quelle", () => {
    expect(filtreAdresseExacte("*@gmail.com")).toEqual({ op: "eq", valeur: "*@gmail.com" })
  })
})
