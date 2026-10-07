import { describe, expect, it } from "vitest"
import { signatureStc, prenomDe, ADRESSE_CRM, FIXE_STC } from "./signatureStc"
import { composer, remplir } from "./envoiEmail"
import type { Prospect } from "../data"

// La signature des mails envoyés depuis le CRM est celle de STC Bâtiment, au
// nom du compte connecté (Mahdi, 07/10/2026). Ces tests lisent le HTML produit.

describe("signatureStc", () => {
  const s = signatureStc({ nom: "Mahdi Souissi" })

  it("porte le nom du compte connecté, pas un nom écrit en dur", () => {
    expect(s).toContain("Mahdi Souissi")
    expect(s).not.toContain("Horlann")
  })
  it("porte le logo complet, la fonction, le fixe, l’adresse du CRM, le site et l’adresse postale", () => {
    expect(s).toContain("stc-logo-email.png")
    expect(s).toContain("Gestion")
    expect(s).toContain(FIXE_STC)
    expect(s).toContain("tel:+33184806128")
    expect(s).toContain(`mailto:${ADRESSE_CRM}`)
    expect(s).toContain("stcbatiment.fr")
    expect(s).toContain("Guyancourt")
  })
  it("aucun mobile par défaut : un seul lien d’appel, celui du fixe", () => {
    expect(s).not.toContain("SMS / WhatsApp")
    expect(s.match(/href="tel:/g)?.length).toBe(1)
  })
  it("le mobile de la personne apparaît seulement s’il est donné, cliquable", () => {
    const avec = signatureStc({ nom: "Horlann Maunier", mobile: "06.11.22.33.44" })
    expect(avec).toContain("06 11 22 33 44")
    expect(avec).toContain("tel:+33611223344")
    expect(avec).toContain("SMS / WhatsApp")
  })
  it("sans nom, c’est « L'équipe STC »", () => {
    expect(signatureStc({ nom: "  " })).toContain("L'équipe STC")
  })
  it("une autre adresse peut être affichée si on la donne", () => {
    expect(signatureStc({ nom: "X", email: "autre@stcbatiment.fr" })).toContain("mailto:autre@stcbatiment.fr")
  })
})

describe("prenomDe", () => {
  it("prend le premier mot", () => {
    expect(prenomDe("Mahdi Souissi")).toBe("Mahdi")
    expect(prenomDe("  Horlann  Maunier ")).toBe("Horlann")
    expect(prenomDe("contact")).toBe("contact")
    expect(prenomDe("")).toBe("")
  })
})

describe("{{commercial}} suit le compte connecté", () => {
  const prospect = { entreprise: "Agence Test", contact: "Mme Durand", email: "a@b.fr" } as Prospect

  it("remplir() utilise le prénom donné", () => {
    expect(remplir("Je suis {{commercial}} de STC", prospect, "Mahdi")).toBe("Je suis Mahdi de STC")
  })
  it("composer() met le prénom dans le corps et la signature STC à la fin", () => {
    const { corpsHtml } = composer(
      { nom: "m", objet: "Suite à notre échange", corps: "Bonjour {{contact}},\n{{commercial}}", ordre: 0, pieces: [] },
      prospect,
      signatureStc({ nom: "Mahdi Souissi" }),
      "Mahdi",
    )
    expect(corpsHtml).toContain("Bonjour Mme Durand,")
    expect(corpsHtml).toContain("<br>Mahdi")
    expect(corpsHtml).toContain("Mahdi Souissi")
    expect(corpsHtml).toContain("stc-logo-email.png")
  })
})
