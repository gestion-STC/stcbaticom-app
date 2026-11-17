import { describe, expect, it } from "vitest"
import { lignesJournal } from "./journalMoteur"

const v = JSON.stringify([
  { le: "2026-11-19T07:10:00.000Z", campagnes: [{ id: "c", creneau: "ouvert", entrees: 6, envois: 6, reportes: { "plafond de 25 envois par passage": 2 }, erreurs: { "boîte refusée": 1 } }] },
  { le: "2026-11-19T06:00:00.000Z", campagnes: [{ id: "c", creneau: "fermé" }] },
  { le: "2026-11-19T05:50:00.000Z", erreur: "délai dépassé" },
  { le: "2026-11-19T05:40:00.000Z", campagnes: [{ id: "autre" }] },
])

describe("journal du moteur", () => {
  it("dit en clair ce qui s'est passé pour la campagne", () => {
    const l = lignesJournal(v, "c")
    expect(l).toHaveLength(3)
    expect(l[0]).toMatchObject({ heure: "08:10", niveau: "erreur", important: true })
    expect(l[0].texte).toBe("6 envois, 6 nouvelles entrées · Reportés : 2 × plafond de 25 envois par passage · Erreurs : boîte refusée")
    expect(l[1]).toMatchObject({ texte: "Hors créneau d'envoi : rien à faire.", important: false })
    expect(l[2]).toMatchObject({ niveau: "erreur", texte: "Passage en erreur : délai dépassé" })
  })
  it("ne casse pas sur une valeur illisible", () => {
    expect(lignesJournal("{", "c")).toEqual([])
  })
})
