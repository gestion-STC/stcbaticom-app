import { describe, expect, it } from "vitest"
import { mesureCampagne, type PositionCampagne } from "./mesureCampagne"
import type { ConfigCampagne } from "./configCampagne"
import type { Envoi, Evenement, Inscription } from "./modele"

const cfg = { qualification: { leadA: "b", gagneA: "c", etapes: [{ id: "a", nom: "Intérêt" }, { id: "b", nom: "Joint" }, { id: "c", nom: "Client" }, { id: "d", nom: "Après" }] } } as unknown as ConfigCampagne
const insc = (id: string) => ({ id, campagneId: "x", contactId: id }) as Inscription
const envoi = (contactId: string, canal: string, statut = "envoye") => ({ campagneId: "x", contactId, canal, statut }) as Envoi
const ev = (contactId: string, type: string) => ({ campagneId: "x", contactId, type }) as Evenement
const pos = (atteintes: string[], estLead = false, etape = "nouveaux"): PositionCampagne => ({ campagneId: "x", atteintes, estLead, etape })

describe("mesureCampagne", () => {
  const m = mesureCampagne(cfg, "x", 0.5, [insc("1"), insc("2"), insc("3"), insc("4")], [envoi("1", "mail"), envoi("2", "sms"), envoi("2", "sms"), envoi("3", "mail", "erreur")], [ev("1", "ouvert"), ev("1", "ouvert"), ev("2", "clic")], [pos(["a"]), pos(["b"], true), pos(["a", "c"], true, "gagnes")])

  it("compte une étape pour ceux qui l'ont dépassée, sans s'arrêter aux étapes sautées", () => {
    expect(m.lignes.map((l) => [l.libelle, l.n])).toEqual([["Contacts dans la campagne", 4], ["Touchés", 2], ["Ouvert", 1], ["Cliqué", 1], ["Intérêt", 3], ["Joint", 2], ["Client", 1]])
  })
  it("marque l'étape du lead et celle du gagné, et s'arrête au gagné", () => {
    expect(m.lignes.find((l) => l.badge === "LEAD")?.libelle).toBe("Joint")
    expect(m.lignes.find((l) => l.badge === "GAGNÉ")?.libelle).toBe("Client")
    expect(m.lignes.some((l) => l.libelle === "Après")).toBe(false)
  })
  it("calcule les coûts sur les SMS partis", () => {
    expect([m.sms, m.coutSms, m.leads, m.gagnes, m.coutParLead, m.coutParGagne]).toEqual([2, 1, 2, 1, 0.5, 1])
  })
  it("ne divise pas par zéro", () => {
    const vide = mesureCampagne(cfg, "x", 0.5, [], [], [], [])
    expect([vide.coutParLead, vide.coutParGagne, vide.lignes[1].part]).toEqual([null, null, null])
  })
})
