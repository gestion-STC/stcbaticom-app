import { describe, it, expect } from "vitest"
import {
  normaliser,
  estDansLaReserve,
  numeroLeMoinsUtilise,
  numeroPourProspect,
  parserNumeros,
  compterAppelsParNumero,
} from "./numerosEmission"
import type { Prospect } from "../data"

function p(over: Partial<Prospect>): Prospect {
  return {
    entreprise: "",
    contact: "",
    telephone: "",
    email: "",
    adresse: "",
    arrondissement: "",
    commentaire: "",
    type: "Gestionnaire locatif",
    statut: "Nouveau prospect",
    priorite: "Moyenne",
    prochaineRelance: "—",
    ...over,
  }
}

const A = "+33 1 84 80 77 86"
const B = "+33 1 84 80 61 28"
const C = "+33 1 84 80 99 99"

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

describe("numeroLeMoinsUtilise (équilibrage)", () => {
  it("choisit le numéro le moins attribué", () => {
    const prospects = [
      p({ numeroEmission: A }),
      p({ numeroEmission: A }),
      p({ numeroEmission: B }),
    ]
    // A utilisé 2×, B 1×, C 0× → doit choisir C
    expect(numeroLeMoinsUtilise([A, B, C], prospects)).toBe(C)
  })

  it("en cas d'égalité, garde le 1er de la réserve", () => {
    expect(numeroLeMoinsUtilise([A, B], [])).toBe(A)
  })

  it("réserve vide → chaîne vide", () => {
    expect(numeroLeMoinsUtilise([], [p({})])).toBe("")
  })
})

describe("numeroPourProspect", () => {
  it("garde le numéro déjà attribué (cohérence par prospect)", () => {
    const cible = p({ numeroEmission: B })
    const r = numeroPourProspect(cible, [A, B, C], [cible])
    expect(r.numero).toBe(B)
    expect(r.aEnregistrer).toBe(false)
    expect(r.bloque).toBe(false)
  })

  it("attribue le moins utilisé si aucun numéro encore (et demande à enregistrer)", () => {
    const cible = p({ numeroEmission: "" })
    const autres = [p({ numeroEmission: A }), cible]
    const r = numeroPourProspect(cible, [A, B], autres)
    expect(r.numero).toBe(B) // A déjà pris 1×, B jamais
    expect(r.aEnregistrer).toBe(true)
    expect(r.bloque).toBe(false)
  })

  it("BLOQUE si le numéro attribué n'est plus en rotation (jamais un autre numéro en douce)", () => {
    const cible = p({ numeroEmission: "+33 1 11 11 11 11" }) // numéro mis en pause / retiré
    const r = numeroPourProspect(cible, [A, B], [cible])
    expect(r.bloque).toBe(true)
    expect(r.numero).toBe("+33 1 11 11 11 11") // on montre le numéro attendu à l'utilisateur
    expect(r.aEnregistrer).toBe(false) // et surtout on n'écrase RIEN automatiquement
  })

  it("un numéro attribué mis EN PAUSE bloque aussi (la rotation ne le contient plus)", () => {
    const cible = p({ numeroEmission: C })
    // C existe toujours dans la réserve complète, mais il est en pause → absent des ACTIFS.
    const actifs = [A, B]
    const r = numeroPourProspect(cible, actifs, [cible])
    expect(r.bloque).toBe(true)
    expect(r.numero).toBe(C)
  })
})

describe("compterAppelsParNumero (jauge d'usage quotidien)", () => {
  it("compte les appels du jour par numéro d'émission (via la fiche du prospect)", () => {
    const p1 = p({ id: "1", numeroEmission: A })
    const p2 = p({ id: "2", numeroEmission: A })
    const p3 = p({ id: "3", numeroEmission: B })
    const appels = [
      { prospectId: "1" }, // A
      { prospectId: "1" }, // A (rappelé)
      { prospectId: "2" }, // A
      { prospectId: "3" }, // B
    ]
    const compte = compterAppelsParNumero(appels, [p1, p2, p3])
    expect(compte.get(normaliser(A))).toBe(3)
    expect(compte.get(normaliser(B))).toBe(1)
  })

  it("ignore les appels de prospects sans numéro attribué ou inconnus", () => {
    const p1 = p({ id: "1", numeroEmission: "" })
    const compte = compterAppelsParNumero([{ prospectId: "1" }, { prospectId: "zz" }], [p1])
    expect(compte.size).toBe(0)
  })
})
