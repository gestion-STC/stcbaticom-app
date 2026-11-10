// Le tri de la Qualification (Mahdi, 11/11/2026) : on ne propose que ce qui a un effet.
import { describe, expect, it } from "vitest"
import { EVENEMENTS, evenementsProposes, qualificationDeDepart, typesEtapeProposes, type ConfigCampagne } from "./configCampagne"

const cfg = (sms = false, video = false): ConfigCampagne => ({ v: 1, creatifs: video ? [{ id: "k", type: "mail", nom: "M", variantes: [], video: true, versId: "", remplirPar: "prospect", questions: [] }] : [], actions: sms ? [{ id: "a", type: "sms" }] : [], zones: [], qualification: qualificationDeDepart("agences"), garde: { ecartCampagnes: 14, exclusions: [], plafondMail: 20, plafondSms: 0 } })

describe("ce que propose la Qualification", () => {
  it("une campagne d'agences : ni « A répondu » (bloc des réponses), ni la page « Créer un compte » (lien principal)", () => {
    const l = evenementsProposes(cfg(), "agences", false)
    expect(l).not.toContain("A répondu au mail")
    expect(l).not.toContain("A ouvert la page « Créer un compte »")
    expect(l).toContain("A cliqué le lien principal")
  })
  it("le SMS et la vidéo seulement quand la campagne en a", () => {
    expect(evenementsProposes(cfg(), "agences", false)).not.toContain("A cliqué le SMS")
    expect(evenementsProposes(cfg(true, true), "agences", false)).toEqual(expect.arrayContaining(["A cliqué le SMS", "A regardé la vidéo"]))
  })
  it("la traçabilité des gestionnaires garde ses règles d'avant", () => {
    expect(evenementsProposes(cfg(true, true), "agences", true)).toEqual(EVENEMENTS)
  })
  it("les types d'étape : sans « Test de l'application », ceux des sous-traitants pour eux seuls", () => {
    expect(typesEtapeProposes("agences")).not.toContain("Test de l'application")
    expect(typesEtapeProposes("agences")).not.toContain("Contrats signés")
    expect(typesEtapeProposes("artisans")).toContain("Contrats signés")
    expect(typesEtapeProposes("artisans")).not.toContain("1er ordre de service")
  })
})
