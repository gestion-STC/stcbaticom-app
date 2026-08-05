import { describe, it, expect } from "vitest"
import {
  parserOsGestionnaires,
  serialiserOsGestionnaires,
  ajouterOsGestionnaire,
  retirerOsGestionnaire,
  finDeJournee,
} from "./osGestionnaires"

describe("finDeJournee", () => {
  it("etend une date du jour a la fin de ce jour", () => {
    // sinon un appel du 4 aout a 16:39 passerait pour posterieur a l'OS du 4 aout
    expect(finDeJournee("2026-08-04")).toBe("2026-08-04T23:59:59.999Z")
    expect("2026-08-04T16:39:00Z" <= finDeJournee("2026-08-04")).toBe(true)
  })

  it("laisse intacte une date qui porte deja une heure", () => {
    expect(finDeJournee("2026-08-04T10:00:00Z")).toBe("2026-08-04T10:00:00Z")
  })

  it("tolere une valeur vide", () => {
    expect(finDeJournee("")).toBe("")
  })
})

describe("parserOsGestionnaires", () => {
  it("lit une liste valide", () => {
    const brut = '[{"prospectId":"a","date":"2026-08-04"}]'
    expect(parserOsGestionnaires(brut)).toEqual([{ prospectId: "a", date: "2026-08-04" }])
  })

  it("rend une liste vide sur du vide, du JSON casse ou autre chose qu'un tableau", () => {
    expect(parserOsGestionnaires(null)).toEqual([])
    expect(parserOsGestionnaires("")).toEqual([])
    expect(parserOsGestionnaires("pas du json")).toEqual([])
    expect(parserOsGestionnaires('{"a":1}')).toEqual([])
  })

  it("ignore les entrees sans identifiant et dedoublonne", () => {
    const brut = '[{"prospectId":"a","date":"2026-08-04"},{"date":"x"},{"prospectId":"a","date":"2026-09-01"}]'
    expect(parserOsGestionnaires(brut)).toEqual([{ prospectId: "a", date: "2026-08-04" }])
  })

  it("fait l'aller-retour avec la serialisation", () => {
    const liste = [{ prospectId: "a", date: "2026-08-04" }]
    expect(parserOsGestionnaires(serialiserOsGestionnaires(liste))).toEqual(liste)
  })
})

describe("ajouterOsGestionnaire", () => {
  it("ajoute un nouveau gestionnaire", () => {
    expect(ajouterOsGestionnaire([], "a", "2026-08-04")).toEqual([
      { prospectId: "a", date: "2026-08-04" },
    ])
  })

  it("garde la date la PLUS ANCIENNE si on le ressaisit", () => {
    const liste = [{ prospectId: "a", date: "2026-08-04" }]
    // un 2e OS plus tard ne doit pas ecraser le PREMIER
    expect(ajouterOsGestionnaire(liste, "a", "2026-09-10")).toEqual([
      { prospectId: "a", date: "2026-08-04" },
    ])
  })

  it("corrige la date si on ressaisit une date anterieure", () => {
    const liste = [{ prospectId: "a", date: "2026-08-04" }]
    expect(ajouterOsGestionnaire(liste, "a", "2026-07-01")).toEqual([
      { prospectId: "a", date: "2026-07-01" },
    ])
  })

  it("refuse une saisie incomplete", () => {
    expect(ajouterOsGestionnaire([], "", "2026-08-04")).toEqual([])
    expect(ajouterOsGestionnaire([], "a", "")).toEqual([])
  })
})

describe("retirerOsGestionnaire", () => {
  it("retire le bon gestionnaire et laisse les autres", () => {
    const liste = [
      { prospectId: "a", date: "2026-08-04" },
      { prospectId: "b", date: "2026-08-05" },
    ]
    expect(retirerOsGestionnaire(liste, "a")).toEqual([{ prospectId: "b", date: "2026-08-05" }])
  })

  it("ne casse rien si l'identifiant est inconnu", () => {
    const liste = [{ prospectId: "a", date: "2026-08-04" }]
    expect(retirerOsGestionnaire(liste, "zzz")).toEqual(liste)
  })
})
