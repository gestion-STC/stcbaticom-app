import { describe, expect, it } from "vitest"
import { mesureCampagne, type PositionCampagne } from "./mesureCampagne"
import type { ConfigCampagne } from "./configCampagne"
import type { Envoi, Evenement, Inscription } from "./modele"

const cfg = { qualification: { leadA: "b", gagneA: "d", etapes: [{ id: "a", nom: "Intérêt" }, { id: "b", nom: "Joint" }, { id: "c", nom: "Compte" }, { id: "d", nom: "Client" }, { id: "e", nom: "Après" }] } } as unknown as ConfigCampagne
const insc = (id: string) => ({ id, campagneId: "x", contactId: id }) as Inscription
const envoi = (contactId: string, canal: string, statut = "envoye") => ({ campagneId: "x", contactId, canal, statut }) as Envoi
const ev = (contactId: string, type: string) => ({ campagneId: "x", contactId, type }) as Evenement
const pos = (contactId: string, atteintes: string[], estLead = false, etape = "nouveaux"): PositionCampagne => ({ campagneId: "x", contactId, atteintes, estLead, etape })

describe("mesureCampagne : leads et gagnés repris du Suivi (décision 8)", () => {
  // « 4 » avait atteint « Joint » AVANT d'entrer : il n'est pas lead de cette campagne au Suivi, il ne compte pas.
  const positions = [pos("1", ["a"]), pos("2", ["a", "b"], true), pos("3", ["a", "b", "c", "d"], true, "gagnes"), pos("4", ["a", "b", "c"], true)]
  const suivi = { leads: 3, gagnes: 1, contactsLeads: ["1", "2", "3"] }
  const m = mesureCampagne(cfg, "x", 0.5, [insc("1"), insc("2"), insc("3"), insc("4")], [envoi("1", "mail"), envoi("2", "sms"), envoi("2", "sms"), envoi("3", "mail", "erreur")], [ev("1", "ouvert"), ev("1", "ouvert"), ev("2", "clic")], positions, 0, false, suivi)

  it("l'entonnoir : leads et gagnés du Suivi, étapes intermédiaires parmi les leads de la campagne", () => {
    expect(m.lignes.map((l) => [l.libelle, l.n])).toEqual([["Contacts dans la campagne", 4], ["Touchés", 2], ["Ouvert", 1], ["Cliqué", 1], ["Leads", 3], ["Joint", 2], ["Compte", 1], ["Gagnés", 1]])
    expect(m.lignes.find((l) => l.badge === "LEAD")?.libelle).toBe("Leads")
    expect(m.lignes.find((l) => l.badge === "GAGNÉ")?.libelle).toBe("Gagnés")
    expect(m.lignes.some((l) => l.libelle === "Après")).toBe(false)
  })
  it("calcule les coûts sur les SMS partis et les leads du Suivi", () => {
    expect([m.sms, m.coutSms, m.leads, m.gagnes, m.coutParLead, m.coutParGagne]).toEqual([2, 1, 3, 1, 0.33, 1])
  })
  it("sans étape gagnée (artisans) : la dernière étape est le gagné du Suivi", () => {
    const art = { qualification: { leadA: "b", gagneA: "", etapes: [{ id: "a", nom: "Intérêt" }, { id: "b", nom: "Dossier déposé" }] } } as unknown as ConfigCampagne
    const r = mesureCampagne(art, "x", 0, [], [], [], [], 0, false, { leads: 69, gagnes: 12, contactsLeads: [] })
    expect(r.lignes.slice(4).map((l) => [l.libelle, l.n])).toEqual([["Leads", 69], ["Gagnés", 12]])
  })
  it("ne divise pas par zéro", () => {
    const vide = mesureCampagne(cfg, "x", 0.5, [], [], [], [], 0, false, { leads: 0, gagnes: 0, contactsLeads: [] })
    expect([vide.coutParLead, vide.coutParGagne, vide.lignes[1].part]).toEqual([null, null, null])
  })
})
