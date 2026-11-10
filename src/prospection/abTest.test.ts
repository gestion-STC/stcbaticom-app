// Le test A/B complet (Mahdi, 11/11/2026).
import ecran from "./abTest.ts?raw"
import serveur from "../../supabase/functions/_shared/campagnes/abTest.ts?raw"
import { describe, expect, it } from "vitest"
import { AB_DEPART, verdictAB, type MesureVariante } from "./abTest"

const v = (nom: string, envoyes: number, leads: number, repondants = leads, cliqueurs = 0): MesureVariante => ({ varianteId: nom, nom, envoyes, leads, repondants, cliqueurs, ouvreurs: 0 })
const propre = (s: string) => s.replace(/\r\n/g, "\n")

describe("le verdict d'un test A/B", () => {
  it("pas de gagnant tant qu'une variante n'a pas assez d'envois", () => {
    const r = verdictAB([v("A", 150, 12), v("B", 60, 1)])
    expect(r.gagnant).toBeNull()
    expect(r.message).toContain("il manque 40 envois à la variante B")
  })
  it("un écart net désigne le gagnant", () => {
    const r = verdictAB([v("A", 200, 20), v("B", 200, 4)])
    expect(r.gagnant).toBe("A")
    expect(r.critere).toBe("leads")
    expect(r.message).toContain("A gagne")
  })
  it("un écart dû au hasard ne désigne personne", () => {
    const r = verdictAB([v("A", 200, 12), v("B", 200, 9)])
    expect(r.gagnant).toBeNull()
    expect(r.message).toContain("Écart trop faible")
  })
  it("automatique : peu de leads, on juge sur les réponses, puis sur les clics", () => {
    expect(verdictAB([v("A", 200, 2, 20), v("B", 200, 1, 3)]).critere).toBe("reponses")
    expect(verdictAB([v("A", 200, 1, 2, 40), v("B", 200, 0, 1, 10)]).critere).toBe("clics")
  })
  it("le critère choisi est respecté", () => {
    expect(verdictAB([v("A", 200, 20, 1, 1), v("B", 200, 4, 30, 1)], { ...AB_DEPART, critere: "reponses" }).gagnant).toBe("B")
  })
  it("même fichier à l'écran et sur le serveur", () => {
    expect(propre(serveur)).toBe(propre(ecran))
  })
})
