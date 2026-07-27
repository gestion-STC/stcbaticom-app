import { describe, it, expect } from "vitest"
import { candidatsDoublon, clePaire, normTexte } from "./doublonsProbables"
import { parserPaires } from "./nonDoublons"
import type { Prospect } from "../data"

const p = (id: string, champs: Partial<Prospect>): Prospect => ({
  id,
  entreprise: "",
  contact: "",
  telephone: "",
  email: "",
  adresse: "",
  arrondissement: "",
  commentaire: "",
  type: "",
  statut: "Nouveau prospect",
  priorite: "—",
  prochaineRelance: "—",
  ...champs,
})

describe("candidatsDoublon (repérage au fil de l'eau)", () => {
  it("repère une fiche avec le même e-mail (indice certain)", () => {
    const a = p("1", { email: "m.bolot@fortis.fr", entreprise: "Fortis" })
    const b = p("2", { email: "M.Bolot@Fortis.FR", entreprise: "Fortis Immobilier" })
    const [c] = candidatsDoublon(a, [a, b])
    expect(c.prospect.id).toBe("2")
    expect(c.raison).toBe("email")
    expect(c.certain).toBe(true)
  })

  it("repère le même nom dans la même agence, malgré la casse et les accents", () => {
    const a = p("1", { contact: "Mme Bolot", entreprise: "Fortis" })
    const b = p("2", { contact: "mme bolot", entreprise: "FORTIS" })
    const [c] = candidatsDoublon(a, [a, b])
    expect(c.raison).toBe("nom")
    expect(c.certain).toBe(true)
  })

  // LE piège métier : deux gestionnaires distincts derrière le même standard.
  it("signale un même numéro comme PISTE À CONFIRMER, jamais comme certitude", () => {
    const a = p("1", { contact: "Mme Bolot", telephone: "01 45 44 66 00", entreprise: "Fortis" })
    const b = p("2", { contact: "M. Durand", telephone: "0145446600", entreprise: "Fortis" })
    const [c] = candidatsDoublon(a, [a, b])
    expect(c.raison).toBe("telephone")
    expect(c.certain).toBe(false) // à confirmer : c'est peut-être le standard
  })

  it("ne se signale jamais lui-même", () => {
    const a = p("1", { email: "x@y.fr", telephone: "0102030405" })
    expect(candidatsDoublon(a, [a])).toEqual([])
  })

  it("ignore une fiche déjà tranchée « ce ne sont pas des doublons »", () => {
    const a = p("1", { telephone: "0102030405" })
    const b = p("2", { telephone: "0102030405" })
    const ecartees = new Set([clePaire("1", "2")])
    expect(candidatsDoublon(a, [a, b], ecartees)).toEqual([])
  })

  it("la décision vaut dans les deux sens (ordre des fiches indifférent)", () => {
    const a = p("1", { telephone: "0102030405" })
    const b = p("2", { telephone: "0102030405" })
    const ecartees = new Set([clePaire("2", "1")]) // enregistrée dans l'autre sens
    expect(candidatsDoublon(a, [a, b], ecartees)).toEqual([])
  })

  it("ne confond pas des fiches vides entre elles", () => {
    const a = p("1", {})
    const b = p("2", {})
    expect(candidatsDoublon(a, [a, b])).toEqual([])
  })

  it("garde l'indice le plus fort quand plusieurs correspondent", () => {
    const a = p("1", { email: "x@y.fr", telephone: "0102030405" })
    const b = p("2", { email: "x@y.fr", telephone: "0102030405" })
    const trouves = candidatsDoublon(a, [a, b])
    expect(trouves).toHaveLength(1) // une seule entrée, pas un doublon d'alerte
    expect(trouves[0].raison).toBe("email")
  })

  it("classe les indices certains avant les pistes à confirmer", () => {
    const a = p("1", { email: "x@y.fr", telephone: "0102030405" })
    const memeTel = p("2", { telephone: "0102030405" })
    const memeEmail = p("3", { email: "x@y.fr" })
    const trouves = candidatsDoublon(a, [a, memeTel, memeEmail])
    expect(trouves.map((c) => c.prospect.id)).toEqual(["3", "2"])
  })

  it("ne propose rien pour une fiche sans id (décision impossible à mémoriser)", () => {
    const sansId = { ...p("1", { email: "x@y.fr" }), id: undefined }
    expect(candidatsDoublon(sansId, [sansId, p("2", { email: "x@y.fr" })])).toEqual([])
  })
})

describe("clePaire / normTexte", () => {
  it("donne la même clé quel que soit l'ordre", () => {
    expect(clePaire("a", "b")).toBe(clePaire("b", "a"))
  })

  it("retire accents, casse et espaces superflus", () => {
    expect(normTexte("  Émilie  ")).toBe("emilie")
  })
})

describe("parserPaires (mémoire des décisions)", () => {
  it("relit ce qui a été enregistré", () => {
    expect(parserPaires('["a|b","c|d"]')).toEqual(["a|b", "c|d"])
  })

  it("repart d'une liste vide si la valeur est absente ou abîmée", () => {
    expect(parserPaires(null)).toEqual([])
    expect(parserPaires("pas du json")).toEqual([])
    expect(parserPaires('{"x":1}')).toEqual([])
  })

  it("ignore les entrées qui ne sont pas des textes", () => {
    expect(parserPaires('["a|b",null,42,""]')).toEqual(["a|b"])
  })
})
