import { describe, it, expect } from "vitest"
import { normaliserTel, cleDoublon, filtrerSansDoublons } from "./dedup"

describe("normaliserTel", () => {
  it("ne garde que les chiffres", () => {
    expect(normaliserTel("01 23 45 67 89")).toBe("0123456789")
    expect(normaliserTel("+33 1 23 45 67 89")).toBe("33123456789")
    expect(normaliserTel("")).toBe("")
  })
})

describe("cleDoublon", () => {
  it("combine téléphone (chiffres) + agence en minuscules", () => {
    expect(cleDoublon({ telephone: "01 23 45 67 89", entreprise: "Agence X" })).toBe(
      "0123456789|agence x",
    )
  })

  it("renvoie vide sans téléphone (jamais considéré comme doublon)", () => {
    expect(cleDoublon({ telephone: "", entreprise: "Agence X" })).toBe("")
  })
})

describe("filtrerSansDoublons", () => {
  it("écarte le vrai doublon (même n° + même agence)", () => {
    const existants = [{ telephone: "0123456789", entreprise: "Agence X" }]
    const nouveaux = [{ telephone: "01 23 45 67 89", entreprise: "agence x", nom: "dup" }]
    expect(filtrerSansDoublons(existants, nouveaux)).toEqual([])
  })

  it("garde deux gestionnaires différents partageant le standard de l'agence", () => {
    const existants = [{ telephone: "0123456789", entreprise: "Agence X" }]
    // Même n° mais AGENCE différente → gardé
    const nouveaux = [{ telephone: "0123456789", entreprise: "Agence Y", nom: "b" }]
    expect(filtrerSansDoublons(existants, nouveaux)).toHaveLength(1)
  })

  it("garde une ligne sans téléphone même si l'agence existe déjà", () => {
    const existants = [{ telephone: "0123456789", entreprise: "Agence X" }]
    const nouveaux = [{ telephone: "", entreprise: "Agence X", nom: "sansTel" }]
    expect(filtrerSansDoublons(existants, nouveaux)).toHaveLength(1)
  })

  it("dédoublonne aussi À L'INTÉRIEUR du lot importé", () => {
    const nouveaux = [
      { telephone: "0123456789", entreprise: "Agence X", nom: "1" },
      { telephone: "01 23 45 67 89", entreprise: "Agence X", nom: "2" },
    ]
    const res = filtrerSansDoublons([], nouveaux)
    expect(res).toHaveLength(1)
    expect(res[0].nom).toBe("1")
  })
})
