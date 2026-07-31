import { describe, it, expect } from "vitest"
import { lireParLots, PAS_LECTURE } from "./pagination"

// Simule une table de `total` lignes derrière la limite de 1000 de Supabase.
function fausseTable(total: number) {
  const appels: [number, number][] = []
  const lignes = Array.from({ length: total }, (_, i) => ({ id: i }))
  const charger = async (debut: number, fin: number) => {
    appels.push([debut, fin])
    return { data: lignes.slice(debut, fin + 1), error: null }
  }
  return { charger, appels }
}

describe("lireParLots (contourne la limite de 1000 lignes)", () => {
  it("récupère TOUTES les lignes au-delà de 1000", async () => {
    const { charger } = fausseTable(2500)
    const tout = await lireParLots(charger)
    expect(tout).toHaveLength(2500)
    expect(tout[0]).toEqual({ id: 0 })
    expect(tout[2499]).toEqual({ id: 2499 })
  })

  it("ne perd ni ne duplique aucune ligne", async () => {
    const { charger } = fausseTable(2500)
    const tout = (await lireParLots(charger)) as { id: number }[]
    expect(new Set(tout.map((l) => l.id)).size).toBe(2500)
  })

  it("s'arrête dès le premier lot quand la table est petite", async () => {
    const { charger, appels } = fausseTable(42)
    expect(await lireParLots(charger)).toHaveLength(42)
    expect(appels).toHaveLength(1) // pas de requête inutile
  })

  it("gère une table vide", async () => {
    const { charger, appels } = fausseTable(0)
    expect(await lireParLots(charger)).toEqual([])
    expect(appels).toHaveLength(1)
  })

  // Cas limite classique : un multiple exact de la taille de lot. Il faut une
  // requête de plus pour constater qu'il n'y a plus rien.
  it("gère un nombre de lignes multiple exact de la taille de lot", async () => {
    const { charger, appels } = fausseTable(PAS_LECTURE * 2)
    expect(await lireParLots(charger)).toHaveLength(PAS_LECTURE * 2)
    expect(appels).toHaveLength(3)
  })

  it("demande les bonnes bornes (incluses)", async () => {
    const { charger, appels } = fausseTable(1500)
    await lireParLots(charger)
    expect(appels[0]).toEqual([0, 999])
    expect(appels[1]).toEqual([1000, 1999])
  })

  it("remonte l'erreur au lieu de renvoyer des données partielles", async () => {
    const charger = async (debut: number) =>
      debut === 0
        ? { data: Array.from({ length: PAS_LECTURE }, (_, i) => ({ id: i })), error: null }
        : { data: null, error: { message: "coupure réseau" } }
    await expect(lireParLots(charger)).rejects.toThrow("coupure réseau")
  })
})
