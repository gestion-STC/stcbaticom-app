// Le dashboard Croissance (Mahdi, 11/11/2026) : la cadence, les entonnoirs, la réserve.
import { describe, expect, it } from "vitest"
import { calculerDirect, COCKPIT_DEPART, entonnoirDemarchage, entonnoirRecrutement, lireReelStc, lundisRecents, moisCompare, parSemaine, planCroissance, previsionCroissance, semainesRestantes, tauxPassage, trajectoire } from "./croissance"

const maintenant = new Date(2026, 10, 11, 12)

describe("la croissance", () => {
  it("douze semaines, du lundi, la plus ancienne d'abord", () => {
    const l = lundisRecents(maintenant)
    expect(l).toHaveLength(12)
    expect(l[11]).toEqual(new Date(2026, 10, 9))
    expect(l[0]).toEqual(new Date(2026, 7, 24))
  })
  it("compte par semaine et par mois", () => {
    const l = lundisRecents(maintenant, 2)
    expect(parSemaine([new Date(2026, 10, 3).toISOString(), new Date(2026, 10, 10).toISOString(), new Date(2026, 10, 11).toISOString(), null, new Date(2025, 0, 1).toISOString()], l)).toEqual([1, 2])
    expect(moisCompare([new Date(2026, 10, 2).toISOString(), new Date(2026, 9, 30).toISOString(), new Date(2026, 8, 1).toISOString()], maintenant)).toEqual({ mois: 1, avant: 1 })
  })
  it("l'entonnoir du démarchage : un client compte à toutes les marches", () => {
    const e = entonnoirDemarchage([
      { etape: "a_prospecter", tentatives: 0, joint_fois: 0, premier_os_le: null },
      { etape: "gestionnaire_joint", tentatives: 2, joint_fois: 1, premier_os_le: null },
      { etape: "client", tentatives: 0, joint_fois: 0, premier_os_le: "2026-11-02" },
    ])
    expect(e.map((m) => m.valeur)).toEqual([3, 2, 2, 1, 1, 1])
  })
  it("l'entonnoir du recrutement", () => {
    const base = { nb_envois_ok: 0, nb_appels: 0, nb_joints: 0, nb_clics: 0, suivi: null, depose_le: null, contrat_statut: null, contrat_signe_le: null, acces_ouvert_le: null }
    const e = entonnoirRecrutement([{ ...base, statut: "a_contacter" }, { ...base, statut: "en_sequence", nb_envois_ok: 2, nb_clics: 1 }, { ...base, statut: "depose", acces_ouvert_le: "2026-11-05" }])
    expect(e.map((m) => m.valeur)).toEqual([3, 2, 2, 1, 1, 1])
    for (let i = 1; i < e.length; i++) expect(e[i].valeur).toBeLessThanOrEqual(e[i - 1].valeur)
  })
  it("la réserve et les taux", () => {
    expect(semainesRestantes(1996, 150)).toBe(14)
    expect(semainesRestantes(10, 0)).toBeNull()
    expect(tauxPassage(200, 50)).toBe(0.25)
    expect(tauxPassage(0, 1)).toBeNull()
  })
})

describe("le cockpit de la croissance", () => {
  it("de 200 000 € par mois à ce qu'il faut sortir chaque semaine", () => {
    const p = planCroissance({ ...COCKPIT_DEPART, objectifMensuel: 200_000, moisPourYArriver: 12, caParClient: 4_000, caParArtisan: 10_000 }, { clientsActuels: 48, artisansActifs: 20, tauxClient: 48 / 622, tauxArtisan: 0.1, clientsParSemaine: 0.5, artisansParSemaine: 0.5, agencesAppeleesParSemaine: 150 })
    expect(p.clientsNecessaires).toBe(50)
    expect(p.artisansNecessaires).toBe(20)
    expect(p.leviers[0].ilFaut).toBe(0.04) // 2 clients manquants en 52 semaines
    expect(p.leviers[0].trajectoire).toBe("bonne")
    expect(p.caEstime).toBe(192_000)
  })
  it("en retard quand le rythme est sous 70 % de ce qu'il faut", () => {
    expect(trajectoire(5, 10)).toBe("retard")
    expect(trajectoire(8, 10)).toBe("juste")
    expect(trajectoire(10, 10)).toBe("bonne")
    expect(trajectoire(null, 10)).toBe("inconnue")
    const p = planCroissance({ ...COCKPIT_DEPART, objectifMensuel: 300_000, moisPourYArriver: 6 }, { clientsActuels: 10, artisansActifs: 5, tauxClient: 0.05, tauxArtisan: 0.1, clientsParSemaine: 0.5, artisansParSemaine: 0.2, agencesAppeleesParSemaine: 100 })
    expect(p.clientsNecessaires).toBe(75)
    expect(p.leviers[1].ilFaut).toBe(Math.ceil((65 / (6 * 52 / 12)) / 0.05))
    expect(p.global).toBe("retard")
    expect(p.premiersOsParMois).toBe(Math.ceil((65 / (6 * 52 / 12)) * (52 / 12)))
  })
})

describe("le prévisionnel : où on arrive à l'échéance, au rythme actuel", () => {
  const r = { ...COCKPIT_DEPART, objectifMensuel: 100_000, moisPourYArriver: 6 } // 26 semaines
  it("le chiffre d'affaires d'aujourd'hui, plus les clients gagnés au rythme actuel", () => {
    const p = previsionCroissance(r, { clientsActuels: 10, artisansActifs: 4, clientsParSemaine: 0.5, artisansParSemaine: 0.25 }, { caEstime: 40_000, caParClient: 2_000 })
    expect(p.clientsPrevus).toBe(23) // 10 + 0,5 × 26
    expect(p.artisansPrevus).toBe(11) // 4 + 0,25 × 26 = 10,5
    expect(p.caPrevu).toBe(66_000) // 40 000 + 13 clients × 2 000
    expect(p.pctObjectif).toBe(66)
    expect(p.manque).toBe(34_000)
    expect(p.semainesPourObjectif).toBe(60) // 60 000 € à gagner, 1 000 € de plus par semaine
  })
  it("sans nouveau client, on reste où on est et l'objectif n'est jamais atteint", () => {
    const p = previsionCroissance(r, { clientsActuels: 10, artisansActifs: 4, clientsParSemaine: 0, artisansParSemaine: 0 }, { caEstime: 40_000, caParClient: 2_000 })
    expect(p.caPrevu).toBe(40_000)
    expect(p.semainesPourObjectif).toBeNull()
  })
  it("objectif déjà atteint : rien ne manque", () => {
    const p = previsionCroissance(r, { clientsActuels: 10, artisansActifs: 4, clientsParSemaine: 1, artisansParSemaine: 0 }, { caEstime: 120_000, caParClient: 2_000 })
    expect(p.manque).toBe(0)
    expect(p.semainesPourObjectif).toBe(0)
  })
})

describe("les agences actives et ce qu'elles rapportent (algorithme validé par Mahdi)", () => {
  const ag = (nom: string, os_30: number, os_30_60: number, facture_30: number, mois: number[]) => ({ nom, os_30, os_30_60, facture_30, dernier_os_le: null, mois })
  // Des chiffres fictifs, de la forme des vrais (noms anonymes).
  const brut = JSON.stringify({ version: 2, calcule_le: "2026-11-11T15:00:00Z", mois: ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"], particuliers: [7_000, 8_000, 24_000, 20_000, 20_000, 15_000], agences: [
    ag("Agence A", 34, 9, 6_906, [1_819, 2_392, 1_650, 3_147, 2_604, 5_091]),
    ag("Agence B", 17, 15, 1_958, [2_053, 862, 876, 1_252, 3_307, 2_352]),
    ag("Agence C", 15, 6, 1_648, [0, 0, 0, 0, 0, 1_064]),
    ag("Agence D", 9, 7, 4_153, [9_647, 8_375, 6_875, 1_559, 1_334, 5_341]),
    ag("Agence E", 5, 0, 0, [0, 0, 0, 242, 0, 0]),
    ag("Agence F", 3, 2, 2_444, [3_830, 6_219, 13_335, 1_528, 7_205, 1_624]),
    ag("Agence G", 3, 8, 2_072, [0, 0, 0, 170, 1_999, 73]),
    ag("Agence H", 2, 2, 1_091, [0, 0, 0, 0, 1_251, 260]),
    ag("Agence I", 1, 3, 918, [2_344, 1_873, 1_996, 2_073, 372, 463]),
    ag("Agence J", 0, 1, 724, [255, 0, 0, 0, 0, 0]),
  ] })
  it("compte les actives : au moins 1 000 € et 2 OS sur 30 jours, et pas en chute", () => {
    const r = lireReelStc(brut)!
    expect(r.agences.filter((a) => a.active).map((a) => a.nom)).toEqual(["Agence A", "Agence B", "Agence C", "Agence D", "Agence F", "Agence H"])
    expect(r.agences.find((a) => a.nom === "Agence G")!.raison).toBe("en chute : 3 OS contre 8 le mois d'avant")
    expect(r.agences.find((a) => a.nom === "Agence I")!.raison).toMatch(/moins de 1.000 € facturés/)
    expect(r.agencesActives).toBe(6)
  })
  it("ce que rapporte une agence active : seulement les mois où elle tourne, même si elle n'est plus active", () => {
    const r = lireReelStc(brut)!
    const i = r.agences.find((a) => a.nom === "Agence I")!
    expect(i.moisActifs).toBe(4) // mai à août ; septembre et octobre ne comptent pas
    expect(Math.round(i.moyenneQuandElleTourne!)).toBe(2_072)
    const tourne = [1_819, 2_392, 1_650, 3_147, 2_604, 5_091, 2_053, 1_252, 3_307, 2_352, 1_064, 9_647, 8_375, 6_875, 1_559, 1_334, 5_341, 3_830, 6_219, 13_335, 1_528, 7_205, 1_624, 1_999, 1_251, 2_344, 1_873, 1_996, 2_073]
    expect(r.moisActifs).toBe(tourne.length)
    expect(r.caParAgence).toBeCloseTo(tourne.reduce((a, b) => a + b, 0) / tourne.length, 6)
  })
  it("les seuils se règlent", () => {
    expect(lireReelStc(brut, { factureMin: 1_000, osMin: 2, chutePct: 0 })!.agencesActives).toBe(7) // sans la chute, l agence G revient
    expect(lireReelStc(brut, { factureMin: 2_000, osMin: 2, chutePct: 50 })!.agencesActives).toBe(3)
  })
  it("ignore l'ancien format et les données illisibles", () => {
    expect(lireReelStc(JSON.stringify({ agences_actives: 16, mois: [{ mois: "2026-08" }] }))).toBeNull()
    expect(lireReelStc(null)).toBeNull()
    expect(lireReelStc("{pas du json")).toBeNull()
  })
  it("les agences portent l'objectif moins les particuliers ; le chiffre d'affaires est le réel", () => {
    const r = lireReelStc(brut)!
    const p = planCroissance({ ...COCKPIT_DEPART, objectifMensuel: 200_000 }, { clientsActuels: r.agencesActives, artisansActifs: 0, tauxClient: null, tauxArtisan: null, clientsParSemaine: 0, artisansParSemaine: 0, agencesAppeleesParSemaine: 0 }, r)
    expect(p.caParClient).toBe(r.caParAgence)
    expect(p.clientsNecessaires).toBe(Math.ceil((200_000 - r.caParticuliersMensuel) / r.caParAgence))
    expect(p.caEstime).toBe(r.caMensuel)
  })
})

describe("en direct : les appels du jour et de la semaine", () => {
  const maintenant = new Date(2026, 10, 11, 16, 30) // un mercredi
  const a = (j: number, h: number, compte: string, resultat: string, issue = "") => ({ date: new Date(2026, 10, j, h, 5).toISOString(), compte_id: compte, compte_nom: compte.toUpperCase(), resultat, issue })
  it("compte aujourd'hui, la semaine depuis lundi, heure par heure et par personne", () => {
    const d = calculerDirect({
      appels: [a(11, 9, "x", "joint", "interesse"), a(11, 9, "x", "pas_de_reponse"), a(11, 14, "y", "joint", "pas_interesse"), a(10, 10, "x", "joint", "rdv"), a(9, 10, "y", "standard"), a(8, 10, "y", "joint")],
      appelsSt: [{ date: new Date(2026, 10, 11, 15, 0).toISOString(), compte_id: "y", compte_nom: "Y", resultat: "joint" }],
      rdv: [{ cree_le: new Date(2026, 10, 10, 10, 6).toISOString(), compte_id: "x", compte_nom: "X" }],
    }, maintenant)
    expect(d.jour).toEqual({ appels: 3, joints: 2, interesses: 1, rdv: 0, artisans: 1 })
    expect(d.semaine).toEqual({ appels: 5, joints: 3, interesses: 2, rdv: 1, artisans: 1 }) // le samedi 8 n'est pas dans la semaine
    expect(d.parHeure.find((h) => h.heure === 9)!.appels).toBe(2)
    expect(d.parHeure.find((h) => h.heure === 15)!.appels).toBe(1)
    expect(d.parPersonne.map((p) => [p.nom, p.jour.appels, p.semaine.appels])).toEqual([["X", 2, 3], ["Y", 1, 2]])
  })
})
