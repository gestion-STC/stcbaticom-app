import { describe, it, expect } from "vitest"
import { extraireNom, statutDepuisCouleur, parseCsv } from "./importProspects"

// --- Nettoyage des noms de gestionnaires ---------------------------------
describe("extraireNom", () => {
  it("extrait le nom après « Nom: » et coupe à « Mail: »", () => {
    expect(extraireNom("Nom: Mme Dupont Mail: x@y.fr")).toBe("Mme Dupont")
  })

  it("coupe la description qui suit le nom (gestionnaire, locative…)", () => {
    expect(extraireNom("Mme dupont gestionnaire locative")).toBe("Mme Dupont")
  })

  it("capitalise un nom simple sans civilité", () => {
    expect(extraireNom("jean martin")).toBe("Jean Martin")
  })

  it("renvoie vide quand il n'y a qu'une description (pas de vrai nom)", () => {
    expect(extraireNom("gestionnaire locative")).toBe("")
  })

  it("renvoie vide sur une entrée vide", () => {
    expect(extraireNom("")).toBe("")
  })
})

// --- Couleur de fond du Sheet → état -------------------------------------
describe("statutDepuisCouleur", () => {
  it("blanc → Nouveau prospect", () => {
    expect(statutDepuisCouleur("FFFFFFFF")).toBe("Nouveau prospect")
  })

  it("vert (vif ou pastel) → Client signé", () => {
    expect(statutDepuisCouleur("FF00B050")).toBe("Client signé") // vert vif
    expect(statutDepuisCouleur("FFB6D7A8")).toBe("Client signé") // vert pastel
  })

  it("bleu et cyan → À rappeler (déjà contacté dans le Sheet)", () => {
    expect(statutDepuisCouleur("FF0000FF")).toBe("À rappeler") // bleu
    expect(statutDepuisCouleur("FF00FFFF")).toBe("À rappeler") // cyan
    expect(statutDepuisCouleur("FFCFE2F3")).toBe("À rappeler") // bleu pastel
  })

  it("gris / absence de couleur / transparent → Nouveau prospect", () => {
    expect(statutDepuisCouleur("FF808080")).toBe("Nouveau prospect") // gris
    expect(statutDepuisCouleur(undefined)).toBe("Nouveau prospect") // aucune
    expect(statutDepuisCouleur("00FF0000")).toBe("Nouveau prospect") // transparent (alpha 00)
  })
})

// --- Lecture d'un CSV (séparateur, guillemets) ---------------------------
describe("parseCsv", () => {
  it("détecte le point-virgule comme séparateur", () => {
    expect(parseCsv("a;b;c\nd;e;f")).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ])
  })

  it("détecte la virgule quand elle domine", () => {
    expect(parseCsv("a,b,c")).toEqual([["a", "b", "c"]])
  })

  it("respecte un séparateur à l'intérieur de guillemets", () => {
    expect(parseCsv('"nom;prenom";x')).toEqual([["nom;prenom", "x"]])
  })

  it("gère les guillemets échappés (\"\")", () => {
    expect(parseCsv('"a""b";c')).toEqual([['a"b', "c"]])
  })

  it("ignore le BOM en tête de fichier", () => {
    expect(parseCsv("﻿a;b")).toEqual([["a", "b"]])
  })
})
