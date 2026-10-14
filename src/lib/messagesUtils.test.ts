import { describe, expect, it } from "vitest"
import {
  apercuTexte,
  dateCourte,
  extraireAdresse,
  nomCorrespondant,
  objetReponse,
  objetTransfert,
} from "./messagesUtils"

describe("extraireAdresse", () => {
  it("extrait l'adresse entre chevrons", () => {
    expect(extraireAdresse("Jean Dupont <Jean@Ex.fr>")).toBe("jean@ex.fr")
  })
  it("renvoie l'adresse brute s'il n'y a pas de chevrons", () => {
    expect(extraireAdresse("  JEAN@ex.fr ")).toBe("jean@ex.fr")
  })
  it("supporte le vide", () => {
    expect(extraireAdresse("")).toBe("")
  })
})

describe("nomCorrespondant", () => {
  it("renvoie le nom quand il est présent", () => {
    expect(nomCorrespondant("Jean Dupont <jean@ex.fr>")).toBe("Jean Dupont")
  })
  it("gère les guillemets autour du nom", () => {
    expect(nomCorrespondant('"STC Bâtiment" <contact@crm.stcbatiment.fr>')).toBe("STC Bâtiment")
  })
  it("retombe sur l'adresse sans nom", () => {
    expect(nomCorrespondant("jean@ex.fr")).toBe("jean@ex.fr")
  })
})

describe("objetReponse", () => {
  it("préfixe Re: une seule fois", () => {
    expect(objetReponse("Devis peinture")).toBe("Re: Devis peinture")
    expect(objetReponse("Re: Devis peinture")).toBe("Re: Devis peinture")
    expect(objetReponse("RE : Devis")).toBe("RE : Devis")
  })
  it("gère l'objet vide", () => {
    expect(objetReponse("")).toBe("Re: (sans objet)")
  })
})

describe("objetTransfert", () => {
  it("préfixe Tr: une seule fois", () => {
    expect(objetTransfert("Devis peinture")).toBe("Tr: Devis peinture")
    expect(objetTransfert("Tr: Devis")).toBe("Tr: Devis")
    expect(objetTransfert("Fwd: Devis")).toBe("Fwd: Devis")
  })
  it("gère l'objet vide", () => {
    expect(objetTransfert("")).toBe("Tr: (sans objet)")
  })
})

describe("apercuTexte", () => {
  it("met le texte sur une seule ligne", () => {
    expect(apercuTexte("Bonjour,\n\nvoici le devis.")).toBe("Bonjour, voici le devis.")
  })
  it("tronque avec une ellipse au-delà du maximum", () => {
    expect(apercuTexte("abcdefghij", 5)).toBe("abcde…")
  })
  it("supporte le vide", () => {
    expect(apercuTexte("")).toBe("")
  })
})

describe("dateCourte", () => {
  const ref = new Date("2026-07-09T16:00:00")
  it("affiche l'heure pour un message du jour", () => {
    expect(dateCourte("2026-07-09T14:32:00", ref)).toMatch(/14[:h]32/)
  })
  it("affiche jour + mois pour la même année", () => {
    const r = dateCourte("2026-03-05T10:00:00", ref)
    expect(r).toContain("5")
    expect(r).not.toContain("2026")
  })
  it("ajoute l'année si différente", () => {
    expect(dateCourte("2025-03-05T10:00:00", ref)).toContain("2025")
  })
  it("renvoie vide pour une date invalide", () => {
    expect(dateCourte("n'importe quoi", ref)).toBe("")
  })
})
