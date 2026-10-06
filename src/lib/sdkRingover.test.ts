import { describe, it, expect, beforeEach } from "vitest"
import {
  versE164,
  brancherTelephone,
  debrancherTelephone,
  telephonePret,
  composerDepuisLogiciel,
  surEvenementAppel,
  diffuserEvenementAppel,
} from "./sdkRingover"

beforeEach(() => debrancherTelephone())

describe("versE164", () => {
  it("convertit un numero francais classique", () => {
    expect(versE164("07 83 09 23 47")).toBe("+33783092347")
    expect(versE164("0143291511")).toBe("+33143291511")
  })

  it("accepte un numero deja international", () => {
    expect(versE164("+33 7 83 09 23 47")).toBe("+33783092347")
    expect(versE164("0033783092347")).toBe("+33783092347")
    expect(versE164("33783092347")).toBe("+33783092347")
  })

  it("complete un numero national sans 0 initial", () => {
    expect(versE164("783092347")).toBe("+33783092347")
  })

  it("refuse un numero inexploitable", () => {
    expect(versE164("")).toBe("")
    expect(versE164("12345")).toBe("")
    expect(versE164("abc")).toBe("")
  })
})

describe("branchement du telephone", () => {
  it("se declare indisponible tant qu'il n'est pas branche", () => {
    expect(telephonePret()).toBe(false)
    expect(composerDepuisLogiciel("0783092347")).toBe(false)
  })

  it("compose au format international et ouvre le panneau", () => {
    let recu = ""
    let affiche = false
    brancherTelephone((n) => {
      recu = n
      return true
    }, () => {
      affiche = true
    })
    expect(composerDepuisLogiciel("07 83 09 23 47")).toBe(true)
    expect(recu).toBe("+33783092347")
    expect(affiche).toBe(true)
  })

  it("transmet le numero d'emission, lui aussi au format international", () => {
    let depuis: string | null | undefined
    brancherTelephone((_n, f) => {
      depuis = f
      return true
    }, () => {})
    composerDepuisLogiciel("0783092347", "33 1 89 70 86 23")
    expect(depuis).toBe("+33189708623")
  })

  it("refuse un numero inexploitable sans appeler le telephone", () => {
    let appele = false
    brancherTelephone(() => {
      appele = true
      return true
    }, () => {})
    expect(composerDepuisLogiciel("123")).toBe(false)
    expect(appele).toBe(false)
  })

  it("n'ouvre pas le panneau si le telephone a refuse l'appel", () => {
    let affiche = false
    brancherTelephone(() => false, () => {
      affiche = true
    })
    expect(composerDepuisLogiciel("0783092347")).toBe(false)
    expect(affiche).toBe(false)
  })
})

describe("evenements d'appel", () => {
  it("previent les abonnes", () => {
    const vus: string[] = []
    surEvenementAppel((e) => vus.push(e.type))
    diffuserEvenementAppel({ type: "decroche", callId: "1", direction: "out" })
    diffuserEvenementAppel({ type: "raccroche", callId: "1", direction: "out" })
    expect(vus).toEqual(["decroche", "raccroche"])
  })

  it("le desabonnement coupe bien la reception", () => {
    const vus: string[] = []
    const stop = surEvenementAppel((e) => vus.push(e.type))
    stop()
    diffuserEvenementAppel({ type: "decroche", callId: "1", direction: "out" })
    expect(vus).toEqual([])
  })
})
