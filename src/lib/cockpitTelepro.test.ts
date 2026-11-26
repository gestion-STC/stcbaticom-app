// Le cockpit de la téléprospection : périodes, comparaisons à jours égaux, stats par commercial, cadence, à appeler.
import { describe, expect, it } from "vitest"
import { agencesQuiBougent, attenduMois, bornes, cadence, joursDuMois, leadsPeriode, lundisRecents, moyenneJour, repartirAAppeler, semaineJours, stats, statsParCompte } from "./cockpitTelepro"

const m = new Date(2026, 10, 26, 12, 40) // jeudi 26/11/2026 12:40
const a = (j: number, h: number, compteId: string, resultat = "", issue = "", agenceId = `ag-${j}-${h}`, mo = 10) => ({ date: new Date(2026, mo, j, h).toISOString(), compteId, resultat, issue, agenceId })

describe("les périodes et les comparaisons à jours égaux", () => {
  it("la semaine contre la semaine dernière jusqu'à la même heure", () => {
    const b = bornes("semaine", m)
    expect(b.de).toEqual(new Date(2026, 10, 23))
    expect(b.avantDe).toEqual(new Date(2026, 10, 16))
    expect(b.avantA.getTime()).toBe(m.getTime() - 7 * 86_400_000 + 1)
  })
  it("le mois contre le mois d'avant du 1er au même quantième, à la même heure", () => {
    const b = bornes("mois", m)
    expect(b.de).toEqual(new Date(2026, 10, 1))
    expect(b.avantDe).toEqual(new Date(2026, 9, 1))
    expect(b.avantA.getTime()).toBe(new Date(2026, 9, 26, 12, 40).getTime() + 1)
    // Le 31 mars : on compare au 28 février.
    expect(bornes("mois", new Date(2027, 2, 31, 9)).avantA.getDate()).toBe(28)
  })
  it("le mois dernier entier et l'année", () => {
    expect(bornes("moisDernier", m)).toMatchObject({ de: new Date(2026, 9, 1), a: new Date(2026, 10, 1) })
    expect(bornes("annee", m).de).toEqual(new Date(2026, 0, 1))
  })
})

describe("les chiffres d'une période", () => {
  const appels = [
    a(26, 9, "x", "joint", "interesse", "A"), a(26, 10, "x", "joint", "rdv", "A"), // la même agence : 1 intéressée
    a(26, 11, "y", "joint", "interesse", "B"), a(26, 14, "y", "pas_de_reponse"), // 14 h : après « maintenant », pas encore compté
    a(25, 10, "x", "pas_de_reponse"), a(19, 11, "x", "joint", "", "C"), a(19, 13, "x", "joint"), // le 19 à 13 h : après la même heure
  ]
  const os = [{ agenceId: "A", date: "2026-11-26", commercialId: "x" }, { agenceId: "Z", date: "2026-11-18", commercialId: null }]
  it("appels sortants, joints, agences DISTINCTES intéressées, RDV, premiers OS", () => {
    const b = bornes("jour", m)
    expect(stats(appels, os, b.de, b.a)).toEqual({ appels: 3, joints: 3, interesses: 2, rdv: 1, premiersOs: 1 })
  })
  it("la semaine d'avant s'arrête à la même heure", () => {
    const b = bornes("semaine", m)
    expect(stats(appels, [], b.avantDe, b.avantA).appels).toBe(1)
  })
  it("par commercial : ses appels et les premiers OS de ses agences", () => {
    const b = bornes("mois", m)
    const p = statsParCompte(appels, os, ["x", "y"], b.de, b.a)
    expect(p.x).toMatchObject({ appels: 5, premiersOs: 1 })
    expect(p.y).toMatchObject({ appels: 1, interesses: 1, premiersOs: 0 })
    expect(stats(appels, os, b.de, b.a).premiersOs).toBe(2) // l'équipe compte aussi l'agence sans commercial
  })
})

describe("cadence, jours, semaine", () => {
  const appels = [a(26, 9, "x", "joint"), a(24, 9, "x"), a(17, 9, "x", "joint"), a(2, 9, "x"), a(1, 9, "x")] // le 1er novembre est un dimanche
  it("8 semaines, du lundi", () => {
    const l = lundisRecents(m, 8)
    expect(l[7]).toEqual(new Date(2026, 10, 23))
    expect(cadence(appels, l, m).appels.slice(-2)).toEqual([1, 2])
  })
  it("les jours du mois : ouvrés, plus les week-ends où l'on a appelé", () => {
    const j = joursDuMois(appels, m)
    expect(j[0].jour).toEqual(new Date(2026, 10, 1)) // dimanche avec un appel
    expect(j.some((x) => x.jour.getDate() === 7)).toBe(false) // samedi sans appel
  })
  it("la semaine du lundi au vendredi, les jours à venir à null", () => {
    const s = semaineJours(appels, m)
    expect(s.map((x) => x.appels)).toEqual([0, 1, 0, 1, null])
    expect(s[3].enCours).toBe(true)
  })
  it("la moyenne par jour ouvré avec appels, aujourd'hui exclu", () => {
    expect(moyenneJour(appels, m)).toEqual({ appels: 1, joints: 0, jours: 3 }) // le 2, le 17, le 24 : 1 joint sur 3 jours
  })
})

describe("à appeler aujourd'hui : des agences distinctes", () => {
  it("une agence en lead ET en rappel compte une fois, dans son groupe le plus urgent", () => {
    const r = repartirAAppeler(["A", "B"], ["B", "C"], ["A", "C", "D", "D"])
    expect(r).toEqual({ leads: ["A", "B"], campagne: ["C"], rappels: ["D"], total: 4 })
  })
})

describe("divers", () => {
  it("les agences qui bougent : plaquette et mail ouvert, rien d'autre", () => {
    const l = agencesQuiBougent([
      { date: "2026-11-23T09:00", titre: "Plaquette ouverte", agenceId: "A", agenceNom: "A", etape: "client" },
      { date: "2026-11-24T09:00", titre: "E-mail ouvert", agenceId: "A", agenceNom: "A", etape: "client" },
      { date: "2026-11-25T09:00", titre: "Désinscrit des mails de prospection", agenceId: "B", agenceNom: "B", etape: "" },
    ])
    expect(l).toEqual([{ agenceId: "A", agenceNom: "A", etape: "client", plaquette: 1, mail: 1, dernier: "2026-11-24T09:00" }])
  })
  it("les leads d'une période : hors robots", () => {
    const l = [{ statut: "a_traiter", resultat: "", creeLe: "2026-11-10T10:00", etapeAgence: "" }, { statut: "traite", resultat: "robot", creeLe: "2026-11-11T10:00", etapeAgence: "" }, { statut: "traite", resultat: "rdv", creeLe: "2026-11-12T10:00", etapeAgence: "client" }]
    expect(leadsPeriode(l, new Date(2026, 10, 1), m)).toEqual({ recus: 2, aTraiter: 1, traites: 1, clients: 1 })
  })
  it("l'objectif du mois au prorata des jours : 8 par mois, 7 attendus le 26/11", () => {
    const x = attenduMois(8, m)
    expect(x.attendu).toBe(7)
    expect(x.projection(3)).toBe(3)
  })
})
