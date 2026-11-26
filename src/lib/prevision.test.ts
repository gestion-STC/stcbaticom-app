// Le prévisionnel à 6 mois : verdict, jalons mensuels jusqu'à l'échéance, leviers, phrase.
import { describe, expect, it } from "vitest"
import { COCKPIT_DEPART, lireReelStc } from "./croissance"
import { calculerPrevision, phrasePrevision, titreVerdict, type EntreesPrevision } from "./prevision"

const m = new Date(2026, 10, 26, 12, 40)
const brut = JSON.stringify({
  version: 2, calcule_le: "2026-11-26T11:00:00Z", mois: ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"], particuliers: [0, 0, 0, 0, 0, 0],
  agences: Array.from({ length: 6 }, (_, i) => ({ nom: `A${i}`, os_30: 5, os_30_60: 5, facture_30: 3000, dernier_os_le: "2026-11-25T10:00:00Z", mois: [0, 0, 0, 5000, 5000, 5000] })),
})
const entrees = (premiers: string[]): EntreesPrevision => ({
  reglage: { ...COCKPIT_DEPART, objectifMensuel: 200_000, moisPourYArriver: 6, echeance: "2027-05-11" },
  reel: lireReelStc(brut),
  premiersOsDates: premiers,
  entonnoir: { contactees: 1000, clients: 20 },
  fenetre28j: { agencesDistinctes: 400, appels: 800, joints: 80, premiersOs: 4 },
})

describe("le prévisionnel à 6 mois", () => {
  it("la cadence : la moyenne des 4 dernières semaines closes", () => {
    // Semaines closes : 26/10, 02/11, 09/11, 16/11 ; la semaine en cours (23/11) ne compte pas.
    const P = calculerPrevision(entrees(["2026-10-28", "2026-11-04", "2026-11-05", "2026-11-18", "2026-11-24", "2026-10-15"]), m)
    expect(P.cadence).toBe(1)
    expect(P.nouveaux.slice(-5)).toEqual([1, 2, 0, 1, 1])
  })
  it("six jalons, au même quantième que l'échéance, la cible en ligne droite jusqu'à l'objectif", () => {
    const P = calculerPrevision(entrees(["2026-11-04"]), m)
    expect(P.jalons.map((j) => `${j.date.getDate()}/${j.date.getMonth() + 1}`)).toEqual(["11/12", "11/1", "11/2", "11/3", "11/4", "11/5"])
    const dernier = P.jalons[P.jalons.length - 1]
    expect(dernier.caCible).toBeCloseTo(200_000, 0)
    expect(dernier.ca).toBeCloseTo(P.prevu.caPrevu, 6)
    expect(dernier.activesCible).toBe(P.plan.clientsNecessaires)
    for (let i = 1; i < P.jalons.length; i++) expect(P.jalons[i].ca).toBeGreaterThanOrEqual(P.jalons[i - 1].ca)
  })
  it("les leviers : il faut / on fait, appels et joints aux taux des 28 derniers jours", () => {
    const P = calculerPrevision(entrees(["2026-11-04"]), m)
    expect(P.leviers.map((l) => l.libelle)).toEqual(["Nouveaux clients (premiers OS)", "Agences appelées", "Appels sortants", "Gestionnaires joints"])
    const appels = P.leviers[2]
    expect(appels.onFait).toBe(200) // 800 appels / 4 semaines
    expect(appels.ilFaut).toBe(Math.ceil(P.clientsSemaine * 200)) // 1 premier OS pour 200 appels
    expect(P.appelsNecessaires).toBe(appels.ilFaut)
  })
  it("en retard : le verdict dit de combien, et la phrase le lit", () => {
    const P = calculerPrevision(entrees(["2026-11-04"]), m)
    expect(P.global).toBe("retard")
    expect(P.retardPct).toBe(Math.round((1 - P.cadence / P.clientsSemaine) * 100))
    expect(titreVerdict(P)).toBe(`En retard de ${P.retardPct}\u00a0%`)
    expect(phrasePrevision(P)).toMatch(/^À notre cadence \(0,25 nouveau client \/ semaine\), on sera à .* € \/ mois en mai 2027/)
  })
  it("sans passerelle STC : le calcul tient debout (agences clientes de la base, CA d'une agence réglé)", () => {
    const P = calculerPrevision({ ...entrees([]), reel: null }, m)
    expect(P.clientsActuels).toBe(20)
    expect(P.plan.caParClient).toBe(COCKPIT_DEPART.caParClient)
    expect(P.atteint).toBeNull() // pas de nouveau client : jamais
  })
})
