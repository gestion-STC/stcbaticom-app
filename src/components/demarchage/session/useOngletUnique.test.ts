import { describe, expect, it } from "vitest"
import { recevoirMessage } from "./useOngletUnique"

const moi = (actif: boolean) => ({ id: "moi", actif })

describe("deux onglets : seule une session en cours bloque l'autre (27/11/2026)", () => {
  it("un autre onglet qui démarre sa session est compté ; s'il est actif lui aussi, cet onglet lui répond une fois", () => {
    const r = recevoirMessage(new Set(), { type: "actif", id: "b" }, moi(true))
    expect([...r.actifs]).toEqual(["b"])
    expect(r.repondre).toBe(true)
    expect(recevoirMessage(new Set(), { type: "actif", id: "b", reponse: true }, moi(true)).repondre).toBe(false)
    expect(recevoirMessage(new Set(), { type: "actif", id: "b" }, moi(false)).repondre).toBe(false)
  })
  it("trois onglets actifs : l'un s'arrête, l'autre bloque toujours", () => {
    const r = recevoirMessage(new Set(["b", "c"]), { type: "inactif", id: "b" }, moi(false))
    expect([...r.actifs]).toEqual(["c"])
  })
  it("un onglet ouvert (boîte mail) ne s'annonce pas : rien n'est bloqué ; il demande qui est actif", () => {
    expect(recevoirMessage(new Set(), { type: "qui", id: "b" }, moi(true))).toEqual({ actifs: new Set(), repondre: true })
    expect(recevoirMessage(new Set(), { type: "qui", id: "b" }, moi(false)).repondre).toBe(false)
  })
  it("ses propres messages et les messages de l'ancienne version sont ignorés", () => {
    expect(recevoirMessage(new Set(), { type: "actif", id: "moi" }, moi(true)).actifs.size).toBe(0)
    expect(recevoirMessage(new Set(), "presence", moi(true)).actifs.size).toBe(0)
  })
})
