// Le dashboard Croissance (Mahdi, 11/11/2026) : la cadence, les entonnoirs, la réserve.
import { describe, expect, it } from "vitest"
import { COCKPIT_DEPART, entonnoirDemarchage, entonnoirRecrutement, lireReelStc, lundisRecents, moisCompare, parSemaine, planCroissance, semainesRestantes, tauxPassage, trajectoire } from "./croissance"

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

describe("le cockpit sur les vrais chiffres de STC Bâtiment", () => {
  const brut = JSON.stringify({
    calcule_le: "2026-11-11T15:00:00Z", fenetre_jours: 90, agences_actives: 2,
    mois: [{ mois: "2026-08", ca_agences: 3_000, ca_particuliers: 9_000 }, { mois: "2026-09", ca_agences: 3_000, ca_particuliers: 9_000 }, { mois: "2026-10", ca_agences: 3_000, ca_particuliers: 9_000 }],
    agences: [{ nom: "A", os_90j: 10, dernier_os_le: "2026-11-10", ca_3_mois: 6_000 }, { nom: "B", os_90j: 2, dernier_os_le: "2026-10-01", ca_3_mois: 0 }],
  })
  it("lit les moyennes : chiffre d'affaires réel, part des particuliers, chiffre d'affaires d'une agence active", () => {
    const r = lireReelStc(brut)!
    expect(r.agencesActives).toBe(2)
    expect(r.caMensuel).toBe(12_000)
    expect(r.caParticuliersMensuel).toBe(9_000)
    expect(r.caParAgence).toBe(1_000) // 6 000 € en 3 mois, 2 agences actives
    expect(lireReelStc(null)).toBeNull()
    expect(lireReelStc("{pas du json")).toBeNull()
  })
  it("les agences portent l'objectif moins les particuliers ; le chiffre d'affaires estimé est le réel", () => {
    const r = lireReelStc(brut)!
    const p = planCroissance({ ...COCKPIT_DEPART, objectifMensuel: 109_000, caParClient: 4_000 }, { clientsActuels: 2, artisansActifs: 0, tauxClient: null, tauxArtisan: null, clientsParSemaine: 0, artisansParSemaine: 0, agencesAppeleesParSemaine: 0 }, r)
    expect(p.caParClient).toBe(1_000)
    expect(p.clientsNecessaires).toBe(100) // (109 000 − 9 000) ÷ 1 000
    expect(p.caEstime).toBe(12_000)
  })
})
