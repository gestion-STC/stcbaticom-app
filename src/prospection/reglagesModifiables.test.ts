// Les réglages qui étaient en dur, rendus modifiables (Mahdi, 11/11/2026 : « tous ces paramètres-là, en modifiable »).
import sql from "../../supabase/maj-2026-11-11-pause-absent-reglable.sql?raw"
import { describe, expect, it } from "vitest"
import { AB_DEPART, verdictAB, type MesureVariante } from "./abTest"
import { aRappeler } from "./avis"
import { SIGNATURE_PROSPECTION, conseilsEnvoi, corpsAvecMentions, doitArreter } from "./instantlyOutils"

const v = (nom: string, envoyes: number, repondants: number): MesureVariante => ({ varianteId: nom, nom, envoyes, leads: 0, repondants, cliqueurs: 0, ouvreurs: 0 })

describe("les réglages modifiables", () => {
  it("l'arrêt automatique suit le réglage de la campagne", () => {
    expect(doitArreter(40, 2)).toBe(true) // 5 % > 3 %
    expect(doitArreter(40, 2, { tauxPct: 6, apresEnvois: 30 })).toBe(false)
    expect(doitArreter(40, 2, { tauxPct: 3, apresEnvois: 50 })).toBe(false)
  })
  it("la signature et le texte des liens", () => {
    expect(corpsAvecMentions("Bonjour")).toContain("78280 Guyancourt")
    const m = corpsAvecMentions("Voir https://exemple.fr", undefined, false, { signature: "Mahdi\nSTC Bâtiment · 78280", libelleLien: "Découvrir" })
    expect(m).toContain("Mahdi<br/>STC Bâtiment")
    expect(m).toContain(">Découvrir</a>")
    expect(m).not.toContain(SIGNATURE_PROSPECTION.split("\n")[0] + "<br/>")
    expect(corpsAvecMentions("Voir https://exemple.fr", undefined, false, { signature: "  " })).toContain("Guyancourt")
  })
  it("le volume conseillé par boîte", () => {
    expect(conseilsEnvoi([{ depuis: "2026-11-01T00:00:00Z" }], 40, "2026-11-20T00:00:00Z", { mailsParBoite: 50, joursChauffe: 14 })).toEqual([])
    expect(conseilsEnvoi([{ depuis: "2026-11-15T00:00:00Z" }], 10, "2026-11-20T00:00:00Z", { mailsParBoite: 30, joursChauffe: 3 })).toEqual([])
  })
  it("le test A/B : jamais de gagnant sous 100 envois par variante, même réglé plus bas", () => {
    expect(verdictAB([v("A", 60, 30), v("B", 60, 2)], { ...AB_DEPART, minEnvois: 20 }).gagnant).toBeNull()
    expect(verdictAB([v("A", 150, 40), v("B", 150, 5)], AB_DEPART).gagnant).toBe("A")
    expect(verdictAB([v("A", 150, 8), v("B", 150, 0)], { ...AB_DEPART, critere: "reponses", minResultats: 20 }).gagnant).toBeNull()
  })
  it("la note qui déclenche un rappel", () => {
    expect(aRappeler(4)).toBe(false)
    expect(aRappeler(4, 4)).toBe(true)
  })
  it("la pause d'un absent sans date se lit dans la campagne, 7 jours par défaut", () => {
    expect(sql).toContain("'{garde,pauseAbsentJours}'")
    expect(sql).toContain(", 7), 1), 60)")
    expect(sql).toContain("MAUVAIS PROJET")
  })
})
