import { describe, expect, it } from "vitest"
import { REGLES_DEPART, blocageEssai, formationValide, tirerQuestions } from "./formationST"
import { BANQUE_DEPART } from "./banqueDepart"
import ecran from "./formationST.ts?raw"
import serveur from "../../supabase/functions/_shared/formationST.ts?raw"

const n = (s: string) => s.replace(/\r\n/g, "\n")
const banque = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, theme: `t${i % 3}`, actif: true }))
const r = { ...REGLES_DEPART, questions: 6 }

describe("formation des sous-traitants", () => {
  it("le serveur a la même copie que l'écran", () => expect(n(serveur)).toBe(n(ecran)))
  it("tire d'abord des questions jamais vues", () => {
    const vues = banque.slice(0, 6).map((q) => q.id)
    expect(tirerQuestions(banque, vues, r).every((q) => !vues.includes(q.id))).toBe(true)
  })
  it("complète avec des questions déjà vues s'il n'en reste plus assez", () => {
    const vues = banque.slice(0, 10).map((q) => q.id), t = tirerQuestions(banque, vues, r)
    expect(t).toHaveLength(6)
    expect(new Set(t.map((q) => q.id)).size).toBe(6)
  })
  it("couvre tous les thèmes", () => expect(new Set(tirerQuestions(banque, [], r).map((q) => q.theme)).size).toBe(3))
  it("ignore une question désactivée", () => expect(tirerQuestions([{ id: "a", theme: "t", actif: false }, { id: "b", theme: "t", actif: true }], [], r).map((q) => q.id)).toEqual(["b"]))
  it("limite les essais et impose l'attente", () => {
    const now = new Date("2026-11-10T12:00:00Z")
    expect(blocageEssai(r, { essais: 3, termineLe: null, etat: "a_refaire" }, now)).toContain("tous tes essais")
    expect(blocageEssai(r, { essais: 1, termineLe: "2026-11-10T10:00:00Z", etat: "a_refaire" }, now)).toContain("22 h")
    expect(blocageEssai(r, { essais: 1, termineLe: "2026-11-09T10:00:00Z", etat: "a_refaire" }, now)).toBe("")
  })
  it("ne bloque l'acceptation que si la règle est active", () => {
    expect(formationValide(REGLES_DEPART, null)).toBe(true)
    const stricte = { ...REGLES_DEPART, bloque: true }
    expect(formationValide(stricte, null)).toBe(false)
    expect(formationValide(stricte, { etat: "reussi", derogationLe: null })).toBe(true)
    expect(formationValide(stricte, { etat: "a_refaire", derogationLe: "2026-11-10" })).toBe(true)
  })
  it("a une banque de départ complète et sans doublon", () => {
    expect(BANQUE_DEPART.length).toBeGreaterThanOrEqual(100)
    expect(new Set(BANQUE_DEPART.map((q) => q.texte)).size).toBe(BANQUE_DEPART.length)
    expect(BANQUE_DEPART.every((q) => q.bonne && q.fausses.length >= 2 && !q.fausses.includes(q.bonne))).toBe(true)
  })
})
