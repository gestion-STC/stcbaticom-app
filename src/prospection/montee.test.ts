import { describe, expect, it } from "vitest"
import { MONTEE_DEFAUT, aAppelerSurOuverture, boitesSaines, envoisDuJour } from "./montee"
import ecran from "./montee.ts?raw"
import serveur from "../../supabase/functions/_shared/campagnes/montee.ts?raw"

const n = (s: string) => s.replace(/\r\n/g, "\n")
const j = (d: number) => new Date(Date.UTC(2026, 10, 1 + d, 12))

describe("montée en charge", () => {
  it("le serveur a la même copie que l'écran", () => expect(n(serveur)).toBe(n(ecran)))
  it("monte par paliers jusqu'à la cible", () => {
    const debut = j(0).toISOString()
    expect(envoisDuJour(MONTEE_DEFAUT, 30, debut, j(0), true)).toBe(10)
    expect(envoisDuJour(MONTEE_DEFAUT, 30, debut, j(3), true)).toBe(15)
    expect(envoisDuJour(MONTEE_DEFAUT, 30, debut, j(30), true)).toBe(30)
  })
  it("redescend d'un palier si les boîtes souffrent", () => expect(envoisDuJour(MONTEE_DEFAUT, 30, j(0).toISOString(), j(6), false)).toBe(15))
  it("ne juge pas sur un petit nombre d'envois", () => {
    expect(boitesSaines(10, 5)).toBe(true)
    expect(boitesSaines(100, 2)).toBe(false)
  })
})

describe("alerte d'ouverture", () => {
  const a = { actif: true, fois: 2, jours: 7 }
  const ouvert = (contactId: string, d: number) => ({ contactId, type: "ouvert", le: j(d).toISOString() })
  it("signale après assez d'ouvertures récentes", () => expect(aAppelerSurOuverture(a, [{ contactId: "k", statut: "en_cours" }], [ouvert("k", 5), ouvert("k", 6)], new Set(), j(7))).toEqual(["k"]))
  it("oublie les ouvertures trop anciennes", () => expect(aAppelerSurOuverture(a, [{ contactId: "k", statut: "en_cours" }], [ouvert("k", 0), ouvert("k", 6)], new Set(), j(10))).toEqual([]))
  it("ne signale pas deux fois, ni quelqu'un qui a répondu", () => {
    expect(aAppelerSurOuverture(a, [{ contactId: "k", statut: "en_cours" }], [ouvert("k", 5), ouvert("k", 6)], new Set(["k"]), j(7))).toEqual([])
    expect(aAppelerSurOuverture(a, [{ contactId: "k", statut: "en_cours" }], [ouvert("k", 5), ouvert("k", 6), { contactId: "k", type: "reponse", le: j(6).toISOString() }], new Set(), j(7))).toEqual([])
  })
})
