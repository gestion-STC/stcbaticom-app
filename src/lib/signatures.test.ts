import { describe, it, expect } from "vitest"
import {
  ajouterSignature, analyserSignatures, cleSignatures, motifRefusSignature, retirerSignature, serialiserSignatures, signataireRetenu, signatairesDe,
} from "./signatures"

describe("plusieurs signatures par compte (19/10/2026)", () => {
  it("lit la liste rangée, et ne tombe jamais sur une valeur abîmée", () => {
    expect(analyserSignatures(null)).toEqual([])
    expect(analyserSignatures("")).toEqual([])
    expect(analyserSignatures("pas du json")).toEqual([])
    expect(analyserSignatures('{"a":1}')).toEqual([])
    expect(analyserSignatures('["Alexandre Parade", "  ", 3, "alexandre  parade", "Nadia B"]')).toEqual(["Alexandre Parade", "Nadia B"])
    expect(serialiserSignatures(["Alexandre Parade"])).toBe('["Alexandre Parade"]')
    expect(cleSignatures("b3a3")).toBe("signatures_b3a3")
  })

  it("refuse le vide, le nom du compte, un doublon ; accepte le reste", () => {
    const autres = ["Alexandre Parade"]
    expect(motifRefusSignature(autres, "   ", "Mahdi Souissi")).toBe("Écris un nom.")
    expect(motifRefusSignature(autres, "mahdi souissi", "Mahdi Souissi")).toBe("C'est déjà le nom de ton compte.")
    expect(motifRefusSignature(autres, "ALEXANDRE PARADE", "Mahdi Souissi")).toBe("Cette signature existe déjà.")
    expect(motifRefusSignature(autres, "x".repeat(81), "Mahdi Souissi")).toBe("Ce nom est trop long.")
    expect(motifRefusSignature(autres, "Nadia B", "Mahdi Souissi")).toBeNull()
    expect(ajouterSignature(autres, "  Nadia   B ")).toEqual(["Alexandre Parade", "Nadia B"])
    expect(retirerSignature(["Alexandre Parade", "Nadia B"], "alexandre parade")).toEqual(["Nadia B"])
  })

  it("le compte signe d'abord ; le dernier choix est repris s'il existe encore", () => {
    const noms = signatairesDe("Mahdi Souissi", ["Alexandre Parade", "mahdi souissi"])
    expect(noms).toEqual(["Mahdi Souissi", "Alexandre Parade"])
    expect(signataireRetenu(noms, null)).toBe("Mahdi Souissi")
    expect(signataireRetenu(noms, "alexandre parade")).toBe("Alexandre Parade")
    expect(signataireRetenu(noms, "Quelqu'un parti")).toBe("Mahdi Souissi")
    expect(signataireRetenu([], "x")).toBe("")
  })
})
