import { describe, expect, it } from "vitest"
import { messageErreurConnexion } from "./auth"

describe("messageErreurConnexion", () => {
  it("traduit les identifiants invalides", () => {
    expect(messageErreurConnexion("Invalid login credentials")).toBe(
      "E-mail ou mot de passe incorrect.",
    )
  })
  it("traduit la limite de tentatives", () => {
    expect(messageErreurConnexion("Request rate limit reached")).toContain("Trop de tentatives")
  })
  it("traduit les erreurs réseau", () => {
    expect(messageErreurConnexion("Failed to fetch")).toContain("connexion internet")
  })
  it("garde le message inconnu tel quel", () => {
    expect(messageErreurConnexion("Erreur bizarre")).toBe("Erreur bizarre")
  })
  it("gère le message vide", () => {
    expect(messageErreurConnexion("")).toBe("Connexion impossible.")
  })
})
