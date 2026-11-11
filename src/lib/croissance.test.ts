// Le dashboard Croissance (Mahdi, 11/11/2026) : la cadence, les entonnoirs, la réserve.
import { describe, expect, it } from "vitest"
import { entonnoirDemarchage, entonnoirRecrutement, lundisRecents, moisCompare, parSemaine, semainesRestantes, tauxPassage } from "./croissance"

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
