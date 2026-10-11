import { describe, expect, it } from "vitest"
import type { SousTraitant } from "../recrutement"
import { effetAppel, estLead, ordonnerLeads, signaux } from "./appelsStOutils"

const st = (p: Partial<SousTraitant>): SousTraitant => ({
  id: p.id ?? "x", entreprise: "E", contact: "", email: "", telephone: "06 00 00 00 00", metier: "Plombier", zone: "", statut: "en_sequence", etapeCourante: 0, nbClics: 0, nbEnvoisOk: 0, nbEnvoisErreur: 0, ...p,
})

describe("estLead", () => {
  it("un clic sans dossier, joignable, sans suivi = lead", () => {
    expect(estLead(st({ baremeVuLe: "2026-10-01T10:00:00Z" }))).toBe(true)
    expect(estLead(st({ nbClics: 2, dernierClicLe: "2026-10-01T10:00:00Z" }))).toBe(true)
  })
  it("pas de clic, dossier déposé, désinscrit, sans numéro, faux numéro ou déjà suivi = pas un lead", () => {
    expect(estLead(st({}))).toBe(false)
    expect(estLead(st({ baremeVuLe: "2026-10-01T10:00:00Z", deposeLe: "2026-10-02T10:00:00Z" }))).toBe(false)
    expect(estLead(st({ baremeVuLe: "2026-10-01T10:00:00Z", desinscritLe: "2026-10-02T10:00:00Z" }))).toBe(false)
    expect(estLead(st({ baremeVuLe: "2026-10-01T10:00:00Z", telephone: "" }))).toBe(false)
    expect(estLead(st({ baremeVuLe: "2026-10-01T10:00:00Z", telephoneInvalide: true }))).toBe(false)
    expect(estLead(st({ baremeVuLe: "2026-10-01T10:00:00Z", suivi: "va_deposer" }))).toBe(false)
  })
})

describe("ordonnerLeads", () => {
  it("candidature cliquée d'abord (la plus récente en tête), puis barème, puis dernier clic", () => {
    const liste = [
      st({ id: "bareme", baremeVuLe: "2026-10-09T10:00:00Z" }),
      st({ id: "cand-vieux", candidatureClicLe: "2026-09-01T10:00:00Z" }),
      st({ id: "clic", nbClics: 1, dernierClicLe: "2026-10-10T10:00:00Z" }),
      st({ id: "cand-recent", candidatureClicLe: "2026-10-08T10:00:00Z" }),
    ]
    expect(ordonnerLeads(liste).map((x) => x.id)).toEqual(["cand-recent", "cand-vieux", "bareme", "clic"])
  })
})

describe("effetAppel et signaux", () => {
  it("décrit ce qui va se passer", () => {
    expect(effetAppel("joint", "pas_interesse", "pas_interesse", null)).toMatch(/séquence est arrêtée/)
    expect(effetAppel("faux_numero", "", "injoignable", null)).toMatch(/Faux numéro/)
    expect(effetAppel("pas_de_reponse", "", "", "2026-10-12T08:00:00Z")).toMatch(/Nouvel essai/)
    expect(effetAppel("joint", "va_deposer", "va_deposer", "2026-10-20T08:00:00Z")).toMatch(/relance/)
  })
  it("liste les signaux", () => {
    expect(signaux(st({ candidatureClicLe: "2026-10-08T10:00:00Z", baremeVuLe: "2026-10-07T10:00:00Z" }))).toHaveLength(2)
    expect(signaux(st({ nbClics: 3, dernierClicLe: "2026-10-08T10:00:00Z" }))[0]).toMatch(/3 clics/)
  })
})
