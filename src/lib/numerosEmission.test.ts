import { describe, it, expect } from "vitest"
import {
  normaliser,
  estDansLaReserve,
  parserNumeros,
  numerosDuCompte,
} from "./numerosEmission"

const A = "+33 1 84 80 77 86"
const B = "+33 1 84 80 61 28"

describe("parserNumeros (ancien + nouveau format + pause)", () => {
  it("lit l'ANCIEN format (tableau de chaînes) → tous actifs", () => {
    expect(parserNumeros('["+33 1 84 80 61 28","0769811215"]')).toEqual([
      { numero: "+33 1 84 80 61 28", pause: false },
      { numero: "0769811215", pause: false },
    ])
  })

  it("lit le NOUVEAU format (objets avec pause)", () => {
    expect(
      parserNumeros('[{"numero":"01 11 11 11 11","pause":true},{"numero":"02 22 22 22 22"}]'),
    ).toEqual([
      { numero: "01 11 11 11 11", pause: true },
      { numero: "02 22 22 22 22", pause: false },
    ])
  })

  it("dédoublonne sur les chiffres et ignore le vide / le JSON invalide", () => {
    expect(parserNumeros('["01 84","0184",""]')).toEqual([{ numero: "01 84", pause: false }])
    expect(parserNumeros("pas du json")).toEqual([])
    expect(parserNumeros(null)).toEqual([])
  })
})

describe("normaliser / estDansLaReserve", () => {
  it("compare sur les chiffres (ignore espaces et +)", () => {
    expect(normaliser(A)).toBe("33184807786")
    expect(estDansLaReserve("0184807786", [A, B])).toBe(false) // chiffres différents (33… vs 0…)
    expect(estDansLaReserve(A, [A, B])).toBe(true)
  })
})

describe("un numéro, une personne (13/10)", () => {
  const liste = [
    { numero: "+33 1 84 80 61 28", pause: false, compteId: "mahdi" },
    { numero: "33 1 89 70 86 23", pause: false, compteId: "horlann" },
  ]
  it("chacun n'appelle qu'avec ses numéros ; ceux du collègue sont à part", () => {
    expect(numerosDuCompte(liste, "mahdi")).toEqual({ miens: ["+33 1 84 80 61 28"], autres: ["33 1 89 70 86 23"], parCompte: true })
  })
  it("sans propriétaire nulle part : toute la réserve, comme avant", () => {
    expect(numerosDuCompte([{ numero: "01 00 00 00 01", pause: false }], "mahdi")).toEqual({ miens: ["01 00 00 00 01"], autres: [], parCompte: false })
  })
  it("le propriétaire survit à l'enregistrement", () => {
    expect(parserNumeros(JSON.stringify(liste))).toEqual(liste)
  })
})
