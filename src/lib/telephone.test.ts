import { describe, it, expect } from "vitest"
import { numeroValide, chiffresTel, formaterTelephone, cleComparaison } from "./telephone"

describe("numeroValide", () => {
  it("accepte un numéro français à 10 chiffres", () => {
    expect(numeroValide("01 84 25 80 81")).toBe(true)
    expect(numeroValide("0698801870")).toBe(true)
  })

  it("accepte un format international (+33…)", () => {
    expect(numeroValide("+33 1 84 25 80 81")).toBe(true)
  })

  it("refuse un numéro incomplet (trop court)", () => {
    expect(numeroValide("01 84 25")).toBe(false)
    expect(numeroValide("12345")).toBe(false)
  })

  it("refuse un vide", () => {
    expect(numeroValide("")).toBe(false)
    expect(numeroValide("   ")).toBe(false)
  })

  it("refuse une chaîne trop longue / aberrante", () => {
    expect(numeroValide("1234567890123456789")).toBe(false)
  })
})

describe("chiffresTel", () => {
  it("ne garde que les chiffres", () => {
    expect(chiffresTel("+33 (1) 84-25.80.81")).toBe("33184258081")
  })
})

describe("cleComparaison", () => {
  it("reconnaît le même numéro quel que soit le format (appel entrant Ringover)", () => {
    // Ringover envoie l'appelant en « 33783092347 », le prospect est stocké en « 07 83 09 23 47 ».
    expect(cleComparaison("33783092347")).toBe(cleComparaison("07 83 09 23 47"))
    expect(cleComparaison("+33 7 83 09 23 47")).toBe(cleComparaison("0783092347"))
    expect(cleComparaison("0033783092347")).toBe(cleComparaison("07 83 09 23 47"))
  })

  it("distingue deux numéros différents", () => {
    expect(cleComparaison("0783092347")).not.toBe(cleComparaison("0698801870"))
  })
})

describe("formaterTelephone", () => {
  it("espace un numéro français par groupes de 2", () => {
    expect(formaterTelephone("0769811215")).toBe("07 69 81 12 15")
  })

  it("nettoie un numéro déjà espacé ou avec ponctuation", () => {
    expect(formaterTelephone("07.69.81-12 15")).toBe("07 69 81 12 15")
  })

  it("ramène un +33 international en 0… lisible", () => {
    expect(formaterTelephone("+33769811215")).toBe("07 69 81 12 15")
  })

  it("gère le préfixe 0033…", () => {
    expect(formaterTelephone("0033769811215")).toBe("07 69 81 12 15")
  })

  it("gère le double préfixe +33 0X… (erreur de saisie courante)", () => {
    expect(formaterTelephone("+33 07 69 81 12 15")).toBe("07 69 81 12 15")
  })

  it("formate au fur et à mesure de la saisie (partiel)", () => {
    expect(formaterTelephone("07698")).toBe("07 69 8")
  })

  it("vide → vide", () => {
    expect(formaterTelephone("")).toBe("")
  })
})
