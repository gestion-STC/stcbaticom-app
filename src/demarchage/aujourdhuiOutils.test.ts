import { describe, expect, it } from "vitest"
import type { StatsCompte, TacheAgenda } from "./db"
import {
  composerDate,
  dansLaFenetreDeRappel,
  dansNJoursA,
  debutDeSemaine,
  debutDuJour,
  debutDuMois,
  decomposerDate,
  demainA,
  estEnRetard,
  finDeSemaine,
  finDuJour,
  finDuMois,
  grouperParHeure,
  grouperTaches,
  joursDeLaSemaine,
  libelleRelatif,
  libelleSemaine,
  lireObjectif,
  memeJour,
  progressionObjectif,
  segmentsBase,
  tauxJoints,
  totalStats,
} from "./aujourdhuiOutils"

// Vendredi 9 octobre 2026, 14 h 00 (heure locale).
const maintenant = new Date(2026, 9, 9, 14, 0, 0)
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString()

function tache(p: Partial<TacheAgenda> = {}): TacheAgenda {
  return {
    id: "t1", agenceId: "a1", contactId: null, type: "tache", date: local(2026, 10, 8, 9), echeance: local(2026, 10, 9, 10), faitLe: null, compteId: null, compteNom: "Horlann",
    titre: "Rappeler", note: "", resultat: "", issue: "", motif: "", numeroUtilise: "", dureeS: null, callId: "", sens: "sortant", rdvType: "", messageId: null, etapeDe: "", etapeVers: "", source: "fiche",
    agenceNom: "Agence Test", agenceTelephone: "01 43 00 00 00", contactNom: "Sophie Martin",
    ...p,
  }
}

describe("les bornes", () => {
  it("jour : de 0 h à 0 h le lendemain", () => {
    expect(debutDuJour(maintenant)).toEqual(new Date(2026, 9, 9))
    expect(finDuJour(maintenant)).toEqual(new Date(2026, 9, 10))
  })
  it("semaine : du lundi au lundi suivant, même un dimanche", () => {
    expect(debutDeSemaine(maintenant)).toEqual(new Date(2026, 9, 5))
    expect(finDeSemaine(maintenant)).toEqual(new Date(2026, 9, 12))
    const dimanche = new Date(2026, 9, 11, 23, 0)
    expect(debutDeSemaine(dimanche)).toEqual(new Date(2026, 9, 5))
    const lundi = new Date(2026, 9, 5, 0, 30)
    expect(debutDeSemaine(lundi)).toEqual(new Date(2026, 9, 5))
  })
  it("mois : du 1er au 1er du mois suivant, décembre compris", () => {
    expect(debutDuMois(maintenant)).toEqual(new Date(2026, 9, 1))
    expect(finDuMois(maintenant)).toEqual(new Date(2026, 10, 1))
    expect(finDuMois(new Date(2026, 11, 15))).toEqual(new Date(2027, 0, 1))
  })
  it("les sept jours de la semaine, lundi en tête", () => {
    const jours = joursDeLaSemaine(maintenant)
    expect(jours).toHaveLength(7)
    expect(jours[0]).toEqual(new Date(2026, 9, 5))
    expect(jours[6]).toEqual(new Date(2026, 9, 11))
    expect(memeJour(jours[4], maintenant)).toBe(true)
  })
  it("l'intitulé d'une semaine, à cheval sur deux mois ou non", () => {
    expect(libelleSemaine(maintenant)).toBe("5 – 11 octobre")
    expect(libelleSemaine(new Date(2026, 8, 30))).toBe("28 septembre – 4 octobre")
  })
})

describe("les dates de report", () => {
  it("demain 10 h et dans 3 jours 10 h", () => {
    expect(demainA(maintenant)).toEqual(new Date(2026, 9, 10, 10, 0))
    expect(dansNJoursA(maintenant, 3)).toEqual(new Date(2026, 9, 12, 10, 0))
    expect(dansNJoursA(new Date(2026, 9, 30, 9), 3)).toEqual(new Date(2026, 10, 2, 10, 0))
  })
  it("compose et décompose date + heure", () => {
    expect(composerDate("2026-10-12", "14:30")).toEqual(new Date(2026, 9, 12, 14, 30))
    expect(composerDate("", "14:30")).toBeNull()
    expect(composerDate("2026-10-12", "")).toBeNull()
    expect(composerDate("12/10/2026", "14:30")).toBeNull()
    expect(decomposerDate(local(2026, 10, 12, 14, 30))).toEqual({ jour: "2026-10-12", heure: "14:30" })
    expect(decomposerDate(null)).toEqual({ jour: "", heure: "" })
  })
})

describe("libelleRelatif", () => {
  it("dans l'heure : en minutes", () => {
    expect(libelleRelatif(new Date(2026, 9, 9, 14, 0, 20), maintenant)).toBe("à l'instant")
    expect(libelleRelatif(new Date(2026, 9, 9, 14, 5), maintenant)).toBe("dans 5 min")
    expect(libelleRelatif(new Date(2026, 9, 9, 13, 40), maintenant)).toBe("il y a 20 min")
  })
  it("le même jour : en heures", () => {
    expect(libelleRelatif(new Date(2026, 9, 9, 16, 0), maintenant)).toBe("dans 2 h")
    expect(libelleRelatif(new Date(2026, 9, 9, 9, 0), maintenant)).toBe("il y a 5 h")
  })
  it("hier, demain, puis en jours, puis la date", () => {
    expect(libelleRelatif(new Date(2026, 9, 8, 18, 0), maintenant)).toBe("hier")
    expect(libelleRelatif(new Date(2026, 9, 10, 9, 0), maintenant)).toBe("demain")
    expect(libelleRelatif(new Date(2026, 9, 12, 9, 0), maintenant)).toBe("dans 3 j")
    expect(libelleRelatif(new Date(2026, 9, 4, 9, 0), maintenant)).toBe("il y a 5 j")
    expect(libelleRelatif(new Date(2026, 9, 20, 9, 0), maintenant)).toMatch(/20 oct/)
  })
  it("accepte une chaîne ISO et ignore une date illisible", () => {
    expect(libelleRelatif(local(2026, 10, 9, 16), maintenant)).toBe("dans 2 h")
    expect(libelleRelatif("n'importe quoi", maintenant)).toBe("")
  })
})

describe("grouperTaches", () => {
  it("range chaque tâche à son moment, les RDV du jour à part", () => {
    const g = grouperTaches(
      [
        tache({ id: "retard", echeance: local(2026, 10, 7, 11) }),
        tache({ id: "matin", echeance: local(2026, 10, 9, 9, 30) }),
        tache({ id: "aprem", echeance: local(2026, 10, 9, 15) }),
        tache({ id: "midi", echeance: local(2026, 10, 9, 13) }),
        tache({ id: "rdv", type: "rdv", echeance: local(2026, 10, 9, 11), rdvType: "telephone" }),
        tache({ id: "rdv-ancien", type: "rdv", echeance: local(2026, 10, 8, 11) }),
        tache({ id: "futur", echeance: local(2026, 10, 10, 9) }),
        tache({ id: "sans-date", echeance: null }),
      ],
      maintenant,
    )
    expect(g.rdv.map((t) => t.id)).toEqual(["rdv"])
    expect(g.enRetard.map((t) => t.id)).toEqual(["sans-date", "retard", "rdv-ancien"])
    expect(g.ceMatin.map((t) => t.id)).toEqual(["matin"])
    expect(g.cetApresMidi.map((t) => t.id)).toEqual(["midi", "aprem"])
    expect(g.plusTard.map((t) => t.id)).toEqual(["futur"])
  })
  it("trie chaque groupe par heure", () => {
    const g = grouperTaches([tache({ id: "b", echeance: local(2026, 10, 9, 11) }), tache({ id: "a", echeance: local(2026, 10, 9, 9) })], maintenant)
    expect(g.ceMatin.map((t) => t.id)).toEqual(["a", "b"])
  })
  it("estEnRetard : pas faite et heure passée", () => {
    expect(estEnRetard(tache({ echeance: local(2026, 10, 9, 13) }), maintenant)).toBe(true)
    expect(estEnRetard(tache({ echeance: local(2026, 10, 9, 15) }), maintenant)).toBe(false)
    expect(estEnRetard(tache({ echeance: local(2026, 10, 9, 13), faitLe: local(2026, 10, 9, 13, 5) }), maintenant)).toBe(false)
    expect(estEnRetard(tache({ echeance: null }), maintenant)).toBe(false)
  })
  it("grouperParHeure : par heure pleine, dans l'ordre", () => {
    const g = grouperParHeure([tache({ id: "b", echeance: local(2026, 10, 9, 14, 30) }), tache({ id: "a", echeance: local(2026, 10, 9, 9, 15) }), tache({ id: "c", echeance: local(2026, 10, 9, 14, 0) })])
    expect(g.map((x) => x.heure)).toEqual(["09:00", "14:00"])
    expect(g[1].taches.map((t) => t.id)).toEqual(["c", "b"])
  })
})

describe("les taux et l'objectif", () => {
  const stats: StatsCompte[] = [
    { compteNom: "Horlann", appels: 40, joints: 10, interesses: 3, rdv: 1, pasInteresses: 4, dureeS: 1200 },
    { compteNom: "Mahdi", appels: 10, joints: 5, interesses: 2, rdv: 2, pasInteresses: 0, dureeS: 600 },
  ]
  it("tauxJoints : joints sur appels, 0 sans appel", () => {
    expect(tauxJoints(stats[0])).toBe(25)
    expect(tauxJoints({ appels: 0, joints: 0 })).toBe(0)
  })
  it("totalStats additionne tout", () => {
    expect(totalStats(stats)).toEqual({ compteNom: "Total", appels: 50, joints: 15, interesses: 5, rdv: 3, pasInteresses: 4, dureeS: 1800 })
  })
  it("lireObjectif : un entier > 0, sinon 0", () => {
    expect(lireObjectif("20")).toBe(20)
    expect(lireObjectif("12.6")).toBe(13)
    expect(lireObjectif("0")).toBe(0)
    expect(lireObjectif("abc")).toBe(0)
    expect(lireObjectif(null)).toBe(0)
  })
  it("progressionObjectif : plafonnée à 100, atteint ou pas", () => {
    expect(progressionObjectif(5, 20)).toEqual({ pct: 25, atteint: false, reste: 15 })
    expect(progressionObjectif(25, 20)).toEqual({ pct: 100, atteint: true, reste: 0 })
    expect(progressionObjectif(5, 0)).toEqual({ pct: 0, atteint: false, reste: 0 })
  })
})

describe("segmentsBase", () => {
  it("huit segments dans l'ordre, les parts sur le total, zéro pour les absents", () => {
    const s = segmentsBase({ a_prospecter: 60, interesse: 20, client: 10, pas_interesse: 10 })
    expect(s.map((x) => x.code)).toEqual(["a_prospecter", "gestionnaire_joint", "interesse", "rdv_planifie", "client", "pas_interesse", "endormie", "hors_cible"])
    expect(s[0]).toMatchObject({ libelle: "À prospecter", n: 60, pct: 60, fond: "bg-fond-3" })
    expect(s[2]).toMatchObject({ n: 20, pct: 20, fond: "bg-signature-doux" })
    expect(s[4]).toMatchObject({ n: 10, pct: 10, fond: "bg-ok-fond" })
    expect(s[1]).toMatchObject({ n: 0, pct: 0, fond: "bg-info-fond" })
    expect(s[6]).toMatchObject({ fond: "bg-attention-fond" })
    expect(s[7]).toMatchObject({ fond: "bg-alerte-fond" })
  })
  it("base vide : tout à zéro, sans division par zéro", () => {
    expect(segmentsBase({}).every((x) => x.n === 0 && x.pct === 0)).toBe(true)
  })
})

describe("dansLaFenetreDeRappel", () => {
  const rdv = local(2026, 10, 9, 14, 0)
  it("de 5 min avant à 20 min après", () => {
    expect(dansLaFenetreDeRappel(rdv, new Date(2026, 9, 9, 13, 54).getTime())).toBe(false)
    expect(dansLaFenetreDeRappel(rdv, new Date(2026, 9, 9, 13, 55).getTime())).toBe(true)
    expect(dansLaFenetreDeRappel(rdv, new Date(2026, 9, 9, 14, 20).getTime())).toBe(true)
    expect(dansLaFenetreDeRappel(rdv, new Date(2026, 9, 9, 14, 21).getTime())).toBe(false)
  })
  it("jamais sans échéance", () => {
    expect(dansLaFenetreDeRappel(null, maintenant.getTime())).toBe(false)
  })
})
