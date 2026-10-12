// La fonction d'un compte et le classement des commerciaux (12/10/2026).
import { describe, it, expect } from "vitest"
import { estAuClassement, lireFonctions } from "./fonctionsComptes"
import { classer, tauxConversion } from "../demarchage/aujourdhuiOutils"
import type { StatsCompte } from "../demarchage/db"

const st = (compteId: string, compteNom: string, appels: number, joints = 0, interesses = 0, rdv = 0): StatsCompte =>
  ({ compteId, compteNom, appels, joints, interesses, rdv, pasInteresses: 0, premiersOs: 0, dureeS: 0 })

describe("la fonction d'un compte", () => {
  it("ne garde que les fonctions connues, et survit à une valeur abîmée", () => {
    expect(lireFonctions('{"a":"commercial","b":"recrutement","c":"pirate"}')).toEqual({ a: "commercial", b: "recrutement" })
    expect(lireFonctions("pas du json")).toEqual({})
    expect(lireFonctions(null)).toEqual({})
  })
  it("au classement : les commerciaux, et ceux dont la fonction n'est pas encore posée", () => {
    expect(estAuClassement("commercial")).toBe(true)
    expect(estAuClassement(undefined)).toBe(true)
    expect(estAuClassement("recrutement")).toBe(false)
    expect(estAuClassement("direction")).toBe(false)
  })
})

describe("le classement des commerciaux", () => {
  const comptes = [{ id: "horlann", nom: "Horlann" }, { id: "adan", nom: "Adan" }]
  it("écarte un compte du recrutement, même s'il a passé des appels", () => {
    const lignes = classer([st("horlann", "Horlann", 10), st("adan", "Adan", 3)], comptes, new Set(["adan"]))
    expect(lignes.map((l) => l.compteNom)).toEqual(["Horlann"])
  })
  it("sans fonction posée, personne n'est caché", () => {
    expect(classer([st("horlann", "Horlann", 10)], comptes).map((l) => l.compteNom)).toEqual(["Horlann", "Adan"])
  })
  it("conversion = intéressés + RDV, sur les agences jointes", () => {
    expect(tauxConversion({ joints: 20, interesses: 3, rdv: 2 })).toBe(25)
    expect(tauxConversion({ joints: 0, interesses: 0, rdv: 0 })).toBe(0)
  })
})
