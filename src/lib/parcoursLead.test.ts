import { describe, expect, it } from "vitest"
import { AUCUN_FAIT, niveauDe, positionDans, type Faits } from "./parcoursLead"
import { qualificationDeDepart, type Qualification } from "../prospection/configCampagne"

const f = (p: Partial<Faits>): Faits => ({ ...AUCUN_FAIT, ...p })
const aucun = new Set<string>()
const st = qualificationDeDepart("artisans")
const auTelephone: Qualification = { ...st, leadA: "p-tel" }
const agences = qualificationDeDepart("agences", "tracabilite")

describe("la campagne décide de ce qu'est un lead (09/11/2026)", () => {
  it("sous-traitants qualifiée : un clic n'est PAS un lead, le dossier déposé en est un", () => {
    expect(positionDans(st, f({ interet: true }), aucun, false).estLead).toBe(false)
    const p = positionDans(st, f({ interet: true, dossier: true }), aucun, false)
    expect(p.estLead).toBe(true)
    expect(p.etape).toBe("nouveaux")
  })
  it("le même artisan devient lead plus tôt si la campagne le décide", () => {
    expect(positionDans(auTelephone, f({ interet: true, jointInteresse: true }), aucun, false).estLead).toBe(true)
    expect(positionDans(auTelephone, f({ interet: true }), aucun, false).estLead).toBe(false)
  })
  it("au-delà du lead : qualifié ; à l'étape gagnée : gagné", () => {
    expect(positionDans(st, f({ dossier: true, contratsEnvoyes: true }), aucun, false).etape).toBe("qualifies")
    expect(positionDans(st, f({ dossier: true, contratsSignes: true, compteOuvert: true }), aucun, false).etape).toBe("gagnes")
  })
  it("une étape validée à la main compte, sans fait", () => {
    const p = positionDans(st, f({ dossier: true }), new Set(["p-test"]), false)
    expect(p.etape).toBe("qualifies")
    expect(p.courante).toBe("p-test")
  })
  it("contacté, ou perdu ; gagné passe avant perdu", () => {
    expect(positionDans(st, f({ dossier: true }), aucun, true).etape).toBe("contactes")
    expect(positionDans(st, f({ dossier: true, perdu: true }), aucun, false).etape).toBe("perdus")
    expect(positionDans(st, f({ dossier: true, perdu: true, compteOuvert: true }), aucun, false).etape).toBe("gagnes")
  })
  it("les agences d'aujourd'hui : l'intérêt fait le lead, le 1er ordre de service fait le gagné", () => {
    expect(positionDans(agences, f({ interet: true }), aucun, false).estLead).toBe(true)
    expect(positionDans(agences, f({ interet: true, jointInteresse: true }), aucun, false).etape).toBe("qualifies")
    expect(positionDans(agences, f({ interet: true, premierOs: true }), aucun, false).etape).toBe("gagnes")
  })
  it("sans étape de lead, personne n'est un lead", () => {
    expect(positionDans({ ...st, leadA: "supprimee" }, f({ dossier: true, interet: true }), aucun, false).estLead).toBe(false)
  })
  it("la qualité : la première règle vraie", () => {
    const n = (niveau: string, source: "etape" | "toujours" | "question", etapeId = "") => ({ id: niveau, niveau, source, questionId: "", operateur: "", valeur: "", etapeId })
    const q: Qualification = { ...st, qualites: [n("A", "question"), n("B", "etape", "p-dossier"), n("C", "toujours")] }
    expect(niveauDe(q, ["p-dossier"])).toBe("B")
    expect(niveauDe(q, [])).toBe("C")
    expect(niveauDe({ ...st, qualites: [] }, [])).toBe("")
  })
})
