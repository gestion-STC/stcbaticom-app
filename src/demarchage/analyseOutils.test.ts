import { describe, expect, it } from "vitest"
import type { AppelIa } from "./appelsIa"
import {
  MIN_APPELS, abouti, bilanGlobal, cleLibelle, dureeLisible, ecartLisible, heureDeParis, pourcent,
  statsArguments, statsObjections, statsParCommercial, statsParHeure,
} from "./analyseOutils"

let n = 0
function appel(p: Partial<AppelIa> & { args?: [string, "positive" | "neutre" | "negative"][]; objs?: [string, boolean, string?][] }): AppelIa {
  n += 1
  return {
    id: `a${n}`, activiteId: `x${n}`, agenceId: "ag", agenceNom: "Agence", contactId: null, compteId: "c", compteNom: p.compteNom ?? "Mahdi",
    resultat: "joint", issue: p.issue ?? "", statut: p.statut ?? "pret", dureeS: p.dureeS ?? 120, transcription: "", resume: "", interet: p.interet ?? "moyen",
    analyse: {
      decideurJoint: true, prochaineEtape: "",
      arguments: (p.args ?? []).map(([libelle, reaction]) => ({ libelle, reaction, extrait: `« ${libelle} »` })),
      objections: (p.objs ?? []).map(([libelle, levee, reponse]) => ({ libelle, levee, reponse: reponse ?? "", extrait: `« ${libelle} »` })),
      pointsForts: [], aAmeliorer: [],
    },
    mailPertinent: true, mailObjet: "", mailCorps: "", mailEnvoyeLe: null, mailEcarteLe: null, erreur: "", creeLe: p.creeLe ?? "2026-10-24T08:30:00Z",
  }
}

describe("analyse des appels", () => {
  it("un appel abouti = Intéressé ou RDV, choisi par le commercial", () => {
    expect(abouti({ issue: "interesse" })).toBe(true)
    expect(abouti({ issue: "rdv" })).toBe(true)
    expect(abouti({ issue: "a_rappeler" })).toBe(false)
    expect(abouti({ issue: "" })).toBe(false)
  })

  it("le bilan ne compte que les appels analysés", () => {
    const b = bilanGlobal([appel({ issue: "interesse", dureeS: 100, interet: "fort" }), appel({ dureeS: 200 }), appel({ statut: "en_attente" })])
    expect(b).toEqual({ appels: 2, aboutis: 1, taux: 0.5, dureeMoyenneS: 150, interetFort: 1 })
  })

  it("deux écritures du même argument comptent ensemble ; un argument répété dans un appel compte une fois", () => {
    expect(cleLibelle("Réactivité 48 h")).toBe(cleLibelle("reactivite 48h"))
    const r = statsArguments([
      appel({ issue: "rdv", args: [["Réactivité 48 h", "positive"], ["reactivite 48h", "positive"]] }),
      appel({ args: [["Réactivité 48 h", "neutre"]] }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ libelle: "Réactivité 48 h", appels: 2, aboutis: 1, taux: 0.5, positives: 2, fiable: false })
  })

  it("l'écart au taux moyen de la période, et les arguments fiables d'abord", () => {
    const liste: AppelIa[] = []
    for (let i = 0; i < MIN_APPELS; i++) liste.push(appel({ issue: i < 4 ? "interesse" : "", args: [["Artisans vérifiés", "positive"]] }))
    for (let i = 0; i < 5; i++) liste.push(appel({ args: [["Prix bas", "negative"]] }))
    liste.push(appel({ issue: "rdv", args: [["Suivi photo", "positive"]] }))
    const r = statsArguments(liste)
    expect(r.map((l) => l.libelle)).toEqual(["Artisans vérifiés", "Prix bas", "Suivi photo"])
    expect(r[0].taux).toBeCloseTo(0.8)
    expect(r[0].ecart).toBeCloseTo(0.8 - 5 / 11)
    expect(r[2].fiable).toBe(false)
  })

  it("objections : fréquence, levées, et la réponse d'un appel abouti est celle qu'on retient", () => {
    const r = statsObjections([
      appel({ objs: [["Déjà un prestataire", true, "On intervient en complément"]] }),
      appel({ issue: "interesse", objs: [["Déjà un prestataire", true, "Essayez-nous sur une urgence"]] }),
      appel({ objs: [["Déjà un prestataire", false]] }),
    ])
    expect(r[0]).toMatchObject({ libelle: "Déjà un prestataire", appels: 3, levees: 2, aboutis: 1, meilleureReponse: "Essayez-nous sur une urgence" })
    expect(r[0].tauxLevee).toBeCloseTo(2 / 3)
  })

  it("par commercial et par heure de Paris", () => {
    const liste = [
      appel({ compteNom: "Horlann", issue: "rdv", creeLe: "2026-10-24T07:10:00Z", args: [["A", "positive"], ["B", "neutre"]] }),
      appel({ compteNom: "Horlann", creeLe: "2026-10-24T07:50:00Z" }),
      appel({ compteNom: "Mahdi", creeLe: "2026-10-24T12:05:00Z" }),
    ]
    expect(statsParCommercial(liste)).toEqual([
      { nom: "Horlann", appels: 2, aboutis: 1, taux: 0.5, dureeMoyenneS: 120, argumentsParAppel: 1 },
      { nom: "Mahdi", appels: 1, aboutis: 0, taux: 0, dureeMoyenneS: 120, argumentsParAppel: 0 },
    ])
    expect(heureDeParis("2026-10-24T07:10:00Z")).toBe(9)
    expect(statsParHeure(liste)).toEqual([
      { heure: 9, appels: 2, aboutis: 1, taux: 0.5 },
      { heure: 14, appels: 1, aboutis: 0, taux: 0 },
    ])
  })

  it("les libellés lisibles", () => {
    expect(dureeLisible(95)).toBe("1 min 35 s")
    expect(dureeLisible(40)).toBe("40 s")
    expect(dureeLisible(null)).toBe("—")
    expect(pourcent(0.426)).toBe("43 %")
    expect(pourcent(null)).toBe("—")
    expect(ecartLisible(0.12)).toBe("+12 pts")
    expect(ecartLisible(-0.08)).toBe("−8 pts")
  })
})
