// Une réponse au mail : lead ou dead (Mahdi, 11/11/2026). La même règle par défaut vit en base (cmp_action_reponse).
import sql from "../../supabase/maj-2026-11-11-reponses-lead-dead.sql?raw"
import { describe, expect, it } from "vitest"
import { REPONSES_REGLABLES, actionReponse } from "./configCampagne"

describe("réponses au mail", () => {
  it("par défaut : intéressé = lead, pas intéressé = dead, absent = rien, le reste = lead", () => {
    expect(actionReponse({}, "interesse")).toBe("lead")
    expect(actionReponse({}, "pas_interesse")).toBe("dead")
    expect(actionReponse({}, "absent")).toBe("rien")
    expect(actionReponse({}, "mauvaise_personne")).toBe("lead")
    expect(actionReponse({}, "autre")).toBe("lead")
  })
  it("le réglage de la campagne l'emporte, sauf pour une absence", () => {
    expect(actionReponse({ reponses: { mauvaise_personne: "rien", pas_interesse: "lead" } }, "mauvaise_personne")).toBe("rien")
    expect(actionReponse({ reponses: { pas_interesse: "lead" } }, "pas_interesse")).toBe("lead")
    expect(actionReponse({ reponses: { absent: "lead" } }, "absent")).toBe("rien")
  })
  it("la base applique les mêmes défauts", () => {
    expect(sql).toContain("case p_tri when 'pas_interesse' then 'dead' else 'lead' end")
    expect(sql).toContain("when p_tri = 'absent' then 'rien'")
    expect(REPONSES_REGLABLES.filter((r) => r.defaut === "dead").map((r) => r.tri)).toEqual(["pas_interesse"])
  })
})
