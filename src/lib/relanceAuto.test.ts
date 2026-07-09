import { describe, it, expect } from "vitest"
import { relanceAutoEntreeEtat } from "./relanceAuto"
import type { Statut } from "../statuts"

const base = { couleur: "blue", ordre: 1, estObjectif: false, categorie: "" as const } as const
function etat(libelle: string, relanceJours: number | null): Statut {
  return { libelle, relanceJours, ...base }
}
const REF = new Date(2026, 6, 10) // 10/07/2026 (mois 0-indexé)

describe("relanceAutoEntreeEtat", () => {
  const statuts = [etat("À rappeler", 3), etat("Client signé", null), etat("Relance", 7)]

  it("pose une relance à J+X quand l'état a un délai", () => {
    expect(relanceAutoEntreeEtat("À rappeler", statuts, "—", REF)).toBe("13/07/2026")
    expect(relanceAutoEntreeEtat("Relance", statuts, "—", REF)).toBe("17/07/2026")
  })

  it("ne pose rien si l'état n'a pas de délai", () => {
    expect(relanceAutoEntreeEtat("Client signé", statuts, "—", REF)).toBeNull()
  })

  it("ne pose rien pour un état inconnu", () => {
    expect(relanceAutoEntreeEtat("Inexistant", statuts, "—", REF)).toBeNull()
  })

  it("n'écrase PAS une relance future déjà prévue", () => {
    expect(relanceAutoEntreeEtat("À rappeler", statuts, "20/07/2026", REF)).toBeNull()
    // …mais remplace une relance passée (périmée)
    expect(relanceAutoEntreeEtat("À rappeler", statuts, "01/01/2026", REF)).toBe("13/07/2026")
  })

  it("gère le passage d'un mois à l'autre", () => {
    expect(relanceAutoEntreeEtat("Relance", statuts, "—", new Date(2026, 6, 28))).toBe("04/08/2026")
  })
})
