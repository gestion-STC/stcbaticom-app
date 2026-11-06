import { describe, expect, it } from "vitest"
import { bilanLeads, bilanProspection, delaiLisible, ecart, evolution, ilYa, joursDeRetard, joursOuvres, joursOuvresRecents, meilleureHeure, parcoursDepuis, rangsEntre, regrouperSignaux, rythmeObjectif, serieParJour, sommeJours, tauxJointParHeure, tauxPassage, victoiresDepuis, type AppelLu } from "./tableauOutils"

const appel = (o: Partial<AppelLu>): AppelLu => ({ id: Math.random().toString(36), date: "2026-11-06T09:30:00Z", compteId: "h", compteNom: "Horlann Maunier", resultat: "pas_de_reponse", issue: "", agenceId: "a", agenceNom: "Foncia", ...o })

describe("le parcours", () => {
  it("compte les appels, les décrochés (joint + standard), les joints, les issues", () => {
    const p = parcoursDepuis([appel({ resultat: "joint", issue: "rdv" }), appel({ resultat: "joint", issue: "interesse" }), appel({ resultat: "standard" }), appel({}), appel({ resultat: "lance" })], 2)
    expect(p).toEqual({ appels: 5, decroches: 3, joints: 2, interesses: 1, rdv: 1, premiersOs: 2 })
  })
  it("le taux de passage, en %, sans base : null", () => {
    expect(tauxPassage(78, 214)).toBe(36)
    expect(tauxPassage(3, 0)).toBeNull()
  })
})

describe("quand joindre un gestionnaire", () => {
  it("le taux de joints par heure de Paris, seulement les heures assez fournies", () => {
    // 10 h à Paris = 9 h UTC en novembre
    const a10 = [...Array(10)].map((_, i) => appel({ date: "2026-11-03T09:10:00Z", resultat: i < 3 ? "joint" : "standard" }))
    const a14 = [...Array(12)].map((_, i) => appel({ date: "2026-11-03T13:10:00Z", resultat: i < 1 ? "joint" : "pas_de_reponse" }))
    const a17 = [...Array(4)].map(() => appel({ date: "2026-11-03T16:10:00Z", resultat: "joint" }))
    const l = tauxJointParHeure([...a10, ...a14, ...a17, appel({ resultat: "lance", date: "2026-11-03T09:10:00Z" })])
    expect(l).toEqual([{ heure: 10, appels: 10, joints: 3, taux: 30 }, { heure: 14, appels: 12, joints: 1, taux: 8 }])
    expect(meilleureHeure(l)?.heure).toBe(10)
    expect(meilleureHeure([])).toBeNull()
  })
})

describe("le rythme de l'objectif du mois", () => {
  it("les jours ouvrés, du lundi au vendredi", () => {
    expect(joursOuvres(new Date(2026, 10, 1), new Date(2026, 11, 1))).toBe(21) // novembre 2026
  })
  it("attendu au prorata, projection, jours restants", () => {
    const r = rythmeObjectif(3, 8, new Date(2026, 10, 1), new Date(2026, 11, 1), new Date(2026, 10, 6, 15))
    expect(r.attendu).toBe(2) // 5 jours ouvrés écoulés sur 21 → 1,9
    expect(r.projection).toBe(13) // 3 × 21 / 5
    expect(r.restants).toBe(16)
  })
})

describe("les victoires du jour", () => {
  it("RDV, intéressés, apporteurs et premiers OS, la plus récente d'abord", () => {
    const v = victoiresDepuis([
      appel({ id: "1", issue: "rdv", agenceNom: "Foncia 15", date: "2026-11-06T09:00:00Z" }),
      appel({ id: "2", issue: "interesse", agenceNom: "Century 21", compteNom: "Mahdi Souissi", date: "2026-11-06T10:00:00Z" }),
      appel({ id: "3", resultat: "apporteur", agenceNom: "Cabinet X", date: "2026-11-06T08:00:00Z" }),
      appel({ id: "4", resultat: "joint" }),
    ], [{ agenceId: "d", nom: "Domo Gestion", date: "2026-11-06T11:00:00Z", commercialNom: "" }])
    expect(v.map((x) => `${x.qui} · ${x.quoi}`)).toEqual(["L'équipe · Premier OS reçu de Domo Gestion", "Mahdi · Century 21 intéressée", "Horlann · RDV pris avec Foncia 15", "Horlann · Apporteur d'affaires trouvé : Cabinet X"])
  })
})

describe("les petits libellés", () => {
  const m = new Date(2026, 10, 6, 15, 0)
  it("il y a…", () => {
    expect(ilYa(new Date(2026, 10, 6, 14, 48).toISOString(), m)).toBe("il y a 12 min")
    expect(ilYa(new Date(2026, 10, 6, 12, 50).toISOString(), m)).toBe("il y a 2 h")
    expect(ilYa(new Date(2026, 10, 5, 18, 0).toISOString(), m)).toBe("hier")
    expect(ilYa(new Date(2026, 10, 4, 9, 0).toISOString(), m)).toBe("le 04/11")
  })
  it("écart et évolution", () => {
    expect(ecart(567, 512)).toBe("+55")
    expect(ecart(4, 5)).toBe("−1")
    expect(ecart(2, 2)).toBe("=")
    expect(evolution(123, 104)).toBe("+18 %")
    expect(evolution(3, 0)).toBeNull()
  })
})

describe("ma base de prospection et ma base de leads", () => {
  it("prospection : par étape, travaillées, clients, taux de signature", () => {
    const b = bilanProspection([{ etape: "a_prospecter" }, { etape: "a_prospecter" }, { etape: "interesse" }, { etape: "pas_interesse" }, { etape: "client" }, { etape: "endormie" }])
    expect(b).toMatchObject({ total: 6, travaillees: 4, clients: 1, tauxSignature: 25 })
    expect(b.parEtape.a_prospecter).toBe(2)
    expect(bilanProspection([]).tauxSignature).toBeNull()
  })
  it("leads : reçus, à traiter, traités, retombés, RDV, clients, délai moyen", () => {
    const l = (statut: "a_traiter" | "traite" | "retombe", resultat = "", etapeAgence = "a_prospecter", min = 30) => ({ statut, resultat, creeLe: "2026-11-06T09:00:00Z", traiteLe: statut === "a_traiter" ? null : new Date(Date.parse("2026-11-06T09:00:00Z") + min * 60_000).toISOString(), etapeAgence, commercialId: null })
    const b = bilanLeads([l("a_traiter"), l("traite", "rdv", "rdv_planifie", 20), l("traite", "joint", "client", 40), l("retombe", "injoignable", "a_prospecter", 999)])
    expect(b).toMatchObject({ recus: 4, aTraiter: 1, traites: 2, retombes: 1, rdv: 1, clients: 1, tauxRdv: 25, tauxClient: 25, delaiMoyenMin: 30 })
    expect(delaiLisible(30)).toBe("30 min")
    expect(delaiLisible(125)).toBe("2 h 05")
    expect(delaiLisible(null)).toBe("—")
  })
})

describe("le style courtier", () => {
  it("les jours ouvrés récents, du plus ancien au plus récent", () => {
    const j = joursOuvresRecents(new Date(2026, 10, 6, 15), 6)
    expect(j.map((d) => d.getDate())).toEqual([30, 2, 3, 4, 5, 6])
  })
  it("la série par jour, filtrée par commercial", () => {
    const jours = [new Date(2026, 10, 5), new Date(2026, 10, 6)]
    const s = serieParJour([appel({ date: new Date(2026, 10, 6, 10).toISOString(), resultat: "joint", issue: "rdv" }), appel({ date: new Date(2026, 10, 6, 11).toISOString(), resultat: "apporteur" }), appel({ date: new Date(2026, 10, 5, 11).toISOString(), compteId: "m" }), appel({ date: new Date(2026, 9, 1).toISOString() })], jours, (a) => a.compteId === "h")
    expect(s).toEqual([{ appels: 0, decroches: 0, joints: 0, interesses: 0, rdv: 0, apporteurs: 0 }, { appels: 2, decroches: 1, joints: 1, interesses: 0, rdv: 1, apporteurs: 1 }])
    expect(sommeJours(s, [0, 1]).appels).toBe(2)
    expect(rangsEntre(jours, new Date(2026, 10, 6), new Date(2026, 10, 7))).toEqual([1])
  })
  it("les signaux regroupés par agence, la plus active d'abord", () => {
    const g = regrouperSignaux([
      { date: "2026-11-05T14:00:00Z", titre: "Plaquette ouverte", agenceId: "v", agenceNom: "La Villa 92", commercialId: "h" },
      { date: "2026-11-05T14:41:00Z", titre: "Plaquette ouverte", agenceId: "v", agenceNom: "La Villa 92", commercialId: "h" },
      { date: "2026-11-04T10:00:00Z", titre: "E-mail ouvert", agenceId: "v", agenceNom: "La Villa 92", commercialId: "h" },
      { date: "2026-11-05T15:11:00Z", titre: "Page « Créer un compte » ouverte", agenceId: "p", agenceNom: "Paris Autrement", commercialId: "h" },
    ])
    expect(g.map((x) => [x.agenceNom, x.n, x.detail, x.dernier])).toEqual([["La Villa 92", 3, "plaquette ×2 · mail ouvert", "2026-11-05T14:41:00Z"], ["Paris Autrement", 1, "« Créer un compte »", "2026-11-05T15:11:00Z"]])
  })
  it("le retard en jours", () => {
    expect(joursDeRetard(new Date(2026, 9, 28, 10).toISOString(), new Date(2026, 10, 6, 15))).toBe(9)
    expect(joursDeRetard(new Date(2026, 10, 6, 10).toISOString(), new Date(2026, 10, 6, 15))).toBe(0)
    expect(joursDeRetard(null, new Date())).toBe(0)
  })
})
