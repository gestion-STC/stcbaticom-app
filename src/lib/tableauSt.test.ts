// Sous-traitants › Dashboard : clics hors robots, premiers contacts, mois à jours égaux, origine par l'e-mail, corps, zones.
import { describe, expect, it } from "vitest"
import type { ClicST, EnvoiST, SousTraitant } from "../recrutement"
import type { LigneSt } from "./cockpitStc"
import { clicsHorsRobots, moisAuJour, origineParEmail, parCorps, parMois, parSecteur, parSemaines, premiersContacts, stDuCorps, zoneRangee } from "./tableauSt"

const m = new Date(2026, 10, 26, 12, 40)
const clic = (s: string, t: string, destination: ClicST["destination"] = "candidature"): ClicST => ({ id: s + t, sousTraitantId: s, cliqueLe: t, destination })
const fiche = (o: Partial<SousTraitant>): SousTraitant => ({ entreprise: "X", contact: "", email: "", telephone: "0600000000", metier: "", zone: "", statut: "a_contacter", etapeCourante: 0, nbClics: 0, nbEnvoisOk: 0, nbEnvoisErreur: 0, ...o })

describe("les clics hors robots", () => {
  it("une rafale (moins de 2 s entre deux clics) est un robot ; un artisan qui n'a que des rafales ne compte pas", () => {
    const r = clicsHorsRobots([
      clic("a", "2026-10-12T09:00:00.000Z"), clic("a", "2026-10-12T09:00:01.000Z"), // rafale
      clic("b", "2026-10-12T09:00:00.000Z"), clic("b", "2026-10-12T09:00:00.500Z"), clic("b", "2026-10-13T10:00:00.000Z"), // rafale puis un vrai clic
      clic("c", "2026-10-14T10:00:00.000Z", "stop"), // désinscription : pas un clic
      clic("d", "2026-10-15T10:00:00.000Z"),
    ])
    expect([...r.premier.keys()].sort()).toEqual(["b", "d"])
    expect(r.premier.get("b")).toBe("2026-10-13T10:00:00.000Z")
    expect(r.robotsSeuls).toBe(1)
    expect(r.rafale).toEqual({ clics: 4, artisans: 2 })
  })
})

describe("les dates du recrutement", () => {
  it("le premier contact = le premier envoi réussi", () => {
    const e = (s: string, t: string, statut: EnvoiST["statut"]) => ({ id: s + t, sousTraitantId: s, etapeId: "", canal: "email" as const, envoyeLe: t, statut, erreur: "", cause: "", tentative: 1 })
    const p = premiersContacts([e("a", "2026-10-13T09:00:00Z", "envoye"), e("a", "2026-10-12T09:00:00Z", "erreur"), e("a", "2026-10-12T10:00:00Z", "envoye"), e("b", "2026-10-12T09:00:00Z", "saute")])
    expect(Object.fromEntries(p)).toEqual({ a: "2026-10-12T10:00:00Z" })
  })
  it("ce mois contre le mois d'avant, à jours égaux", () => {
    const d = [new Date(2026, 10, 3).toISOString(), new Date(2026, 9, 3).toISOString(), new Date(2026, 9, 26, 12).toISOString(), new Date(2026, 9, 26, 13).toISOString(), new Date(2026, 9, 28).toISOString()]
    expect(moisAuJour(d, m)).toEqual({ mois: 1, avant: 2 })
  })
  it("par mois depuis juillet, et par semaine", () => {
    const p = parMois([new Date(2026, 7, 5).toISOString(), new Date(2026, 10, 1).toISOString()], "2026-07", m)
    expect(p.mois).toEqual(["2026-07", "2026-08", "2026-09", "2026-10", "2026-11"])
    expect(p.n).toEqual([0, 1, 0, 0, 1])
    expect(parSemaines([new Date(2026, 10, 24).toISOString(), new Date(2026, 10, 17).toISOString()], [new Date(2026, 10, 16), new Date(2026, 10, 23)], m)).toEqual([1, 1])
  })
})

describe("le lien avec STC Bâtiment par l'e-mail", () => {
  it("machine : l'e-mail d'une fiche ou d'un dossier rattaché ; site, hors base : un dossier sans fiche", () => {
    const o = origineParEmail([{ email: "Ing.Design78@yahoo.com " }], [{ email: "sms@bat.fr", sousTraitantId: null }, { email: "erbi@x.fr", sousTraitantId: "f1" }])
    expect(o("ing.design78@yahoo.com")).toBe("machine")
    expect(o("erbi@x.fr")).toBe("machine")
    expect(o("SMS@bat.fr")).toBe("hors base")
    expect(o("autre@x.fr")).toBeNull()
    expect(o("")).toBeNull()
  })
})

describe("par corps, par zone, par secteur", () => {
  const actif = (nom: string, metier: string, secteurs: string[] = []): LigneSt => ({ nom, email: "", statut: "actif", compteActif: true, metier, secteurs, missions30: 1, missions30Avant: 0, montant30: 0, derniere: null, premiere: null, total: 1, paye30: 0, paye30Avant: 0 })
  it("la spécialité libre de STC rattachée aux corps", () => {
    expect(stDuCorps("Plomberie/Carrelage", "Plomberie / sanitaire")).toBe(true)
    expect(stDuCorps("Plomberie/Carrelage", "Revêtements de sols et carrelage")).toBe(true)
    expect(stDuCorps("Électricité", "Électricité")).toBe(true)
    expect(stDuCorps("TCE", "Peinture")).toBe(false)
  })
  it("le besoin, la base, ce qu'il reste à contacter, les actifs STC", () => {
    const fiches = [fiche({ id: "1", metier: "Électricité", email: "a@x.fr" }), fiche({ id: "2", metier: "Électricité / Plomberie / sanitaire", statut: "en_sequence" }), fiche({ id: "3", metier: "Peinture", statut: "depose", deposeLe: "2026-10-12" })]
    const c = parCorps(fiches, [{ metier: "Électricité", objectifHebdo: 1, actif: true }, { metier: "Peinture", objectifHebdo: 2, actif: false }], new Map([["2", "x"]]), new Map(), [actif("ERBI", "Electricité")])
    const elec = c.find((x) => x.corps === "Électricité")!
    expect(elec).toMatchObject({ objectif: 1, base: 2, reste: 1, contactes: 1, cliques: 0, deposes: 0, actifsStc: 1 })
    expect(c.find((x) => x.corps === "Peinture")).toMatchObject({ objectif: 0, deposes: 1 })
  })
  it("les zones rangées, les secteurs (un artisan compte dans chacun)", () => {
    expect([zoneRangee("Grande couronne (78)"), zoneRangee("Paris 11e"), zoneRangee(""), zoneRangee("Petite couronne")]).toEqual(["Grande couronne", "Paris", "Autre ou vide", "Petite couronne"])
    const s = parSecteur([actif("A", "", ["B1 Ouest", "B2 Nord-Est"]), actif("B", "", ["B1 Ouest"]), actif("C", "")])
    expect(s).toEqual([{ secteur: "B1 Ouest", actifs: 2, noms: "A, B" }, { secteur: "B2 Nord-Est", actifs: 1, noms: "A" }, { secteur: "Pas de secteur", actifs: 1, noms: "C" }])
  })
})
