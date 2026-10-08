import { describe, it, expect } from "vitest"
import type { SousTraitant } from "../recrutement"
import { FILTRES_VIDES, compterParStatut, filtrerFiches, sourcesDistinctes } from "./baseFiltres"

const fiche = (p: Partial<SousTraitant>): SousTraitant => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  entreprise: "", contact: "", email: "", telephone: "", metier: "", zone: "", source: "",
  statut: "a_contacter", etapeCourante: 0, nbClics: 0, nbEnvoisOk: 0, nbEnvoisErreur: 0,
  ...p,
})

const base: SousTraitant[] = [
  fiche({ id: "1", entreprise: "Plomberie Martin", contact: "Jean Martin", email: "jean@martin.fr", telephone: "06 12 34 56 78", metier: "Plomberie / sanitaire", zone: "Lyon", source: "Pages Jaunes", statut: "a_contacter" }),
  fiche({ id: "2", entreprise: "Élec Dupont", contact: "Marie Dupont", email: "contact@elec.fr", telephone: "+33 6 98 76 54 32", metier: "Électricité / Plomberie / sanitaire", zone: "Villeurbanne", source: "Google Maps", statut: "en_sequence", nbEnvoisErreur: 1 }),
  fiche({ id: "3", entreprise: "Peintures Royer", contact: "Luc Royer", email: "luc@royer.fr", telephone: "0611111111", metier: "Peinture", zone: "Paris", source: "pages jaunes", statut: "depose", derniereErreur: "boîte pleine" }),
  fiche({ id: "4", entreprise: "Sols Benoit", contact: "", email: "sols@benoit.fr", telephone: "", metier: "Revêtements de sols et carrelage", zone: "Lyon", source: "", statut: "injoignable", emailInvalide: true }),
]

describe("filtrerFiches — recherche texte", () => {
  it("sans filtre, rend tout", () => {
    expect(filtrerFiches(base, FILTRES_VIDES)).toHaveLength(4)
  })

  it("cherche dans l'entreprise, le contact, l'e-mail, le téléphone et la zone", () => {
    const ids = (recherche: string) => filtrerFiches(base, { ...FILTRES_VIDES, recherche }).map((f) => f.id)
    expect(ids("martin")).toEqual(["1"])
    expect(ids("Marie")).toEqual(["2"])
    expect(ids("royer.fr")).toEqual(["3"])
    expect(ids("lyon")).toEqual(["1", "4"])
  })

  it("ignore la casse et les accents", () => {
    expect(filtrerFiches(base, { ...FILTRES_VIDES, recherche: "ELEC" }).map((f) => f.id)).toEqual(["2"])
    expect(filtrerFiches(base, { ...FILTRES_VIDES, recherche: "élec" }).map((f) => f.id)).toEqual(["2"])
  })

  it("ne cherche pas dans le métier ni la source (ils ont leur sélecteur)", () => {
    expect(filtrerFiches(base, { ...FILTRES_VIDES, recherche: "Peinture" })).toHaveLength(1) // « Peintures Royer », par l'entreprise
    expect(filtrerFiches(base, { ...FILTRES_VIDES, recherche: "Google" })).toHaveLength(0)
  })

  it("retrouve un numéro quelle que soit son écriture", () => {
    expect(filtrerFiches(base, { ...FILTRES_VIDES, recherche: "06 98 76" }).map((f) => f.id)).toEqual(["2"])
    expect(filtrerFiches(base, { ...FILTRES_VIDES, recherche: "+33 6 12 34" }).map((f) => f.id)).toEqual(["1"])
    expect(filtrerFiches(base, { ...FILTRES_VIDES, recherche: "0612345678" }).map((f) => f.id)).toEqual(["1"])
  })
})

describe("filtrerFiches — statut, corps, source, cases", () => {
  it("filtre par statut", () => {
    expect(filtrerFiches(base, { ...FILTRES_VIDES, statut: "en_sequence" }).map((f) => f.id)).toEqual(["2"])
    expect(filtrerFiches(base, { ...FILTRES_VIDES, statut: "exclu" })).toHaveLength(0)
  })

  it("filtre par corps de métier, un artisan multi-corps compte dans chacun", () => {
    expect(filtrerFiches(base, { ...FILTRES_VIDES, corps: "Plomberie / sanitaire" }).map((f) => f.id)).toEqual(["1", "2"])
    expect(filtrerFiches(base, { ...FILTRES_VIDES, corps: "Électricité" }).map((f) => f.id)).toEqual(["2"])
  })

  it("filtre par source, sans tenir compte de la casse", () => {
    expect(filtrerFiches(base, { ...FILTRES_VIDES, source: "Pages Jaunes" }).map((f) => f.id)).toEqual(["1", "3"])
  })

  it("« avec une erreur d'envoi » : un envoi en erreur OU une dernière erreur", () => {
    expect(filtrerFiches(base, { ...FILTRES_VIDES, avecErreur: true }).map((f) => f.id)).toEqual(["2", "3"])
  })

  it("« e-mail invalide »", () => {
    expect(filtrerFiches(base, { ...FILTRES_VIDES, emailInvalide: true }).map((f) => f.id)).toEqual(["4"])
  })

  it("les filtres se cumulent", () => {
    expect(filtrerFiches(base, { ...FILTRES_VIDES, recherche: "lyon", corps: "Plomberie / sanitaire" }).map((f) => f.id)).toEqual(["1"])
    expect(filtrerFiches(base, { ...FILTRES_VIDES, statut: "depose", avecErreur: true }).map((f) => f.id)).toEqual(["3"])
    expect(filtrerFiches(base, { ...FILTRES_VIDES, statut: "depose", emailInvalide: true })).toHaveLength(0)
  })
})

describe("compterParStatut et sourcesDistinctes", () => {
  it("compte chaque statut et le total", () => {
    const n = compterParStatut(base)
    expect(n.tous).toBe(4)
    expect(n.a_contacter).toBe(1)
    expect(n.en_sequence).toBe(1)
    expect(n.depose).toBe(1)
    expect(n.injoignable).toBe(1)
    expect(n.termine).toBe(0)
    expect(n.desinscrit).toBe(0)
    expect(n.exclu).toBe(0)
  })

  it("liste les sources, triées, sans vide ; deux casses restent deux sources", () => {
    expect(sourcesDistinctes(base)).toEqual(["Google Maps", "pages jaunes", "Pages Jaunes"])
  })
})
