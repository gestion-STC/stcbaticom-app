import { describe, it, expect } from "vitest"
import { trouverMomentOS, analyserParcours, moyenneParcours } from "./parcoursSignature"
import type { Evenement } from "./historiqueDb"

const OBJECTIFS = ["Client signé"]

// Parcours calqué sur un cas réel : 1er appel → Intéressé, échanges par mail,
// puis 2e appel → Client signé.
const parcoursReel: Evenement[] = [
  { type: "appel", date: "2026-07-21T16:37:00Z", sens: "sortant", libelle: "Appel sortant — Décroché", detail: "état → Intéressé" },
  { type: "email", date: "2026-07-21T16:41:00Z", sens: "sortant", libelle: "Email envoyé — Mme Nguyen" },
  { type: "email", date: "2026-07-24T16:58:00Z", sens: "sortant", libelle: "Email envoyé — ordre de service" },
  { type: "email", date: "2026-07-25T15:54:00Z", sens: "sortant", libelle: "Email envoyé — acces nguyen" },
  { type: "email", date: "2026-07-25T20:49:00Z", sens: "entrant", libelle: "Email reçu" },
  { type: "email", date: "2026-08-04T16:08:00Z", sens: "entrant", libelle: "Email reçu" },
  { type: "appel", date: "2026-08-04T16:39:00Z", sens: "sortant", libelle: "Appel sortant — Décroché", detail: "état → Client signé" },
  { type: "email", date: "2026-08-06T09:00:00Z", sens: "entrant", libelle: "Email reçu" },
]

describe("trouverMomentOS", () => {
  it("date l'OS sur l'appel qui a fait basculer l'etat", () => {
    expect(trouverMomentOS(parcoursReel, OBJECTIFS)).toBe("2026-08-04T16:39:00Z")
  })

  it("retient le PREMIER passage quand l'etat objectif revient plusieurs fois", () => {
    const ev: Evenement[] = [
      { type: "appel", date: "2026-09-01T10:00:00Z", sens: "sortant", libelle: "a", detail: "état → Client signé" },
      { type: "appel", date: "2026-06-01T10:00:00Z", sens: "sortant", libelle: "b", detail: "état → Client signé" },
    ]
    expect(trouverMomentOS(ev, OBJECTIFS)).toBe("2026-06-01T10:00:00Z")
  })

  it("rend null si aucun appel n'a marque le passage", () => {
    const ev: Evenement[] = [
      { type: "email", date: "2026-07-01T10:00:00Z", sens: "sortant", libelle: "Email envoyé" },
    ]
    expect(trouverMomentOS(ev, OBJECTIFS)).toBeNull()
  })

  it("ne confond pas un autre etat avec l'objectif", () => {
    const ev: Evenement[] = [
      { type: "appel", date: "2026-07-01T10:00:00Z", sens: "sortant", libelle: "a", detail: "état → Intéressé" },
    ]
    expect(trouverMomentOS(ev, OBJECTIFS)).toBeNull()
  })
})

describe("analyserParcours", () => {
  it("coupe l'historique a l'OS et compte ce qui a precede", () => {
    const p = analyserParcours(parcoursReel, OBJECTIFS)
    expect(p.dateOS).toBe("2026-08-04T16:39:00Z")
    expect(p.comptes.appelsSortants).toBe(2)
    expect(p.comptes.emailsEnvoyes).toBe(3)
    expect(p.comptes.emailsRecus).toBe(2)
    // l'email du 6 aout est POSTERIEUR a l'OS : hors analyse
    expect(p.nbApres).toBe(1)
  })

  it("compte le delai du 1er contact a l'OS", () => {
    // 21 juillet 16:37 -> 4 aout 16:39 = 14 jours
    expect(analyserParcours(parcoursReel, OBJECTIFS).delaiJours).toBe(14)
  })

  it("rend les actions de la plus ancienne a la plus recente", () => {
    const p = analyserParcours(parcoursReel, OBJECTIFS)
    expect(p.avant[0].date).toBe("2026-07-21T16:37:00Z")
    expect(p.avant[p.avant.length - 1].date).toBe("2026-08-04T16:39:00Z")
  })

  it("retrie meme si l'historique arrive du plus recent au plus ancien", () => {
    const inverse = [...parcoursReel].reverse()
    expect(analyserParcours(inverse, OBJECTIFS).dateOS).toBe("2026-08-04T16:39:00Z")
    expect(analyserParcours(inverse, OBJECTIFS).comptes.emailsEnvoyes).toBe(3)
  })

  it("sans marqueur, rend tout l'historique sans pretendre dater l'OS", () => {
    const ev: Evenement[] = [
      { type: "email", date: "2026-07-01T10:00:00Z", sens: "sortant", libelle: "Email envoyé" },
    ]
    const p = analyserParcours(ev, OBJECTIFS)
    expect(p.dateOS).toBeNull()
    expect(p.delaiJours).toBeNull()
    expect(p.avant).toHaveLength(1)
  })

  it("une date saisie a la main prime sur la deduction par l'appel", () => {
    // l'OS est arrive par mail le 25 juillet, avant l'appel du 4 aout
    const p = analyserParcours(parcoursReel, OBJECTIFS, "2026-07-25T23:59:59.999Z")
    expect(p.dateOS).toBe("2026-07-25T23:59:59.999Z")
    expect(p.comptes.appelsSortants).toBe(1) // seul celui du 21 juillet precede
    expect(p.comptes.emailsEnvoyes).toBe(3)
    expect(p.comptes.emailsRecus).toBe(1)
    expect(p.nbApres).toBe(3)
  })

  it("date saisie : le parcours reste datable meme sans appel marqueur", () => {
    const ev: Evenement[] = [
      { type: "email", date: "2026-07-01T10:00:00Z", sens: "sortant", libelle: "Email envoyé" },
      { type: "email", date: "2026-07-10T10:00:00Z", sens: "entrant", libelle: "Email reçu" },
    ]
    const p = analyserParcours(ev, OBJECTIFS, "2026-07-10T23:59:59.999Z")
    expect(p.dateOS).toBe("2026-07-10T23:59:59.999Z")
    expect(p.delaiJours).toBe(10)
    expect(p.comptes.emailsEnvoyes).toBe(1)
    expect(p.comptes.emailsRecus).toBe(1)
  })

  it("ignore les evenements sans date", () => {
    const ev = [...parcoursReel, { type: "email", date: "", sens: "sortant", libelle: "x" } as Evenement]
    expect(analyserParcours(ev, OBJECTIFS).comptes.emailsEnvoyes).toBe(3)
  })
})

describe("moyenneParcours", () => {
  it("moyenne uniquement les parcours dates", () => {
    const date = analyserParcours(parcoursReel, OBJECTIFS)
    const sansMarqueur = analyserParcours(
      [{ type: "email", date: "2026-07-01T10:00:00Z", sens: "sortant", libelle: "x" }],
      OBJECTIFS,
    )
    const m = moyenneParcours([date, sansMarqueur])
    expect(m.nb).toBe(1) // le parcours non date est exclu
    expect(m.appels).toBe(2)
    expect(m.emails).toBe(5)
    expect(m.jours).toBe(14)
  })

  it("rend des valeurs vides quand aucun gestionnaire n'est signe", () => {
    expect(moyenneParcours([])).toEqual({ nb: 0, appels: null, emails: null, jours: null })
  })
})
