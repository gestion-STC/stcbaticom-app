import { describe, expect, it } from "vitest"
import {
  apercuTexte,
  dateCourte,
  extraireAdresse,
  grouperEnFils,
  nomCorrespondant,
  objetReponse,
  type MessageDeBase,
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

describe("grouperEnFils", () => {
  const msg = (x: Partial<MessageDeBase> & { id: string }): MessageDeBase => ({
    sens: "entrant",
    de: "jean@ex.fr",
    a: "contact@crm.stcbatiment.fr",
    objet: "Objet",
    prospectId: null,
    lu: true,
    date: "2026-07-01T10:00:00Z",
    ...x,
  })

  it("regroupe l'aller-retour avec un même correspondant dans un seul fil", () => {
    const fils = grouperEnFils([
      msg({ id: "1", sens: "entrant", de: "Jean <jean@ex.fr>", date: "2026-07-01T10:00:00Z" }),
      msg({ id: "2", sens: "sortant", de: "contact@crm.stcbatiment.fr", a: "jean@ex.fr", date: "2026-07-01T11:00:00Z" }),
    ])
    expect(fils).toHaveLength(1)
    expect(fils[0].messages.map((m) => m.id)).toEqual(["1", "2"]) // chronologique
    expect(fils[0].nom).toBe("Jean")
    expect(fils[0].adresse).toBe("jean@ex.fr")
  })

  it("rattache par prospect quand il est connu (même si l'adresse varie)", () => {
    const fils = grouperEnFils([
      msg({ id: "1", de: "a@ex.fr", prospectId: "P1" }),
      msg({ id: "2", de: "b@ex.fr", prospectId: "P1", date: "2026-07-02T10:00:00Z" }),
    ])
    expect(fils).toHaveLength(1)
    expect(fils[0].cle).toBe("P1")
  })

  it("compte les non-lus entrants et trie les fils du plus récent au plus ancien", () => {
    const fils = grouperEnFils([
      msg({ id: "1", de: "vieux@ex.fr", lu: false, date: "2026-06-01T10:00:00Z" }),
      msg({ id: "2", de: "recent@ex.fr", lu: false, date: "2026-07-05T10:00:00Z" }),
      msg({ id: "3", de: "recent@ex.fr", lu: false, date: "2026-07-05T11:00:00Z" }),
    ])
    expect(fils.map((f) => f.adresse)).toEqual(["recent@ex.fr", "vieux@ex.fr"])
    expect(fils[0].nonLus).toBe(2)
    expect(fils[0].dernier.id).toBe("3")
  })

  it("un sortant sans réponse forme un fil au nom de l'adresse", () => {
    const fils = grouperEnFils([
      msg({ id: "1", sens: "sortant", de: "contact@crm.stcbatiment.fr", a: "Nouveau <n@ex.fr>" }),
    ])
    expect(fils[0].adresse).toBe("n@ex.fr")
    expect(fils[0].nom).toBe("n@ex.fr")
    expect(fils[0].nonLus).toBe(0)
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
