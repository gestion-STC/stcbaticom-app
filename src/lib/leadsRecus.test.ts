import { describe, expect, it } from "vitest"
import { statutDossier } from "./dossierStatut"
import { campagneParContact, compterParNiveau, filtrerLeads, leadsVisibles, niveauAgence, trierLeads, type LeadRecu } from "./leadsRecus"

const lead = (o: Partial<LeadRecu>): LeadRecu => ({
  id: "x", espace: "demarchage", niveau: "interet", nom: "", signal: "", detail: "", quand: "2026-11-09T10:00:00Z", aTraiter: true,
  proprietaireId: null, contactRef: "c", campagne: null, cible: { type: "agence", id: "c" }, ...o,
})

describe("leads reçus (09/11/2026)", () => {
  it("la chaleur d'un lead d'agence suit sa source", () => {
    expect(niveauAgence("formulaire")).toBe("fiche")
    expect(niveauAgence("mail")).toBe("reponse")
    expect(niveauAgence("plaquette")).toBe("interet")
    expect(niveauAgence("page_compte")).toBe("interet")
  })
  it("les fiches remplies en tête, puis les réponses, puis l'intérêt ; le plus récent d'abord", () => {
    const l = trierLeads([
      lead({ id: "i-ancien", niveau: "interet", quand: "2026-11-01T00:00:00Z" }),
      lead({ id: "r", niveau: "reponse" }),
      lead({ id: "i-recent", niveau: "interet", quand: "2026-11-08T00:00:00Z" }),
      lead({ id: "f", niveau: "fiche", quand: "2026-10-01T00:00:00Z" }),
    ])
    expect(l.map((x) => x.id)).toEqual(["f", "r", "i-recent", "i-ancien"])
  })
  it("le filtre par base, par campagne, et à traiter / traités", () => {
    const l = [
      lead({ id: "a", campagne: { id: "k1", nom: "K1" } }),
      lead({ id: "b", espace: "recrutement" }),
      lead({ id: "c", aTraiter: false, campagne: { id: "k1", nom: "K1" } }),
    ]
    expect(filtrerLeads(l, { espace: "tout", campagne: "toutes", aTraiter: true }).map((x) => x.id)).toEqual(["a", "b"])
    expect(filtrerLeads(l, { espace: "recrutement", campagne: "toutes", aTraiter: true }).map((x) => x.id)).toEqual(["b"])
    expect(filtrerLeads(l, { espace: "tout", campagne: "k1", aTraiter: true }).map((x) => x.id)).toEqual(["a"])
    expect(filtrerLeads(l, { espace: "tout", campagne: "hors", aTraiter: true }).map((x) => x.id)).toEqual(["b"])
    expect(filtrerLeads(l, { espace: "tout", campagne: "toutes", aTraiter: false }).map((x) => x.id)).toEqual(["c"])
  })
  it("un téléprospecteur : sa base, et parmi les agences les siennes ; un admin : tout", () => {
    const l = [lead({ id: "a-moi", proprietaireId: "moi" }), lead({ id: "a-autre", proprietaireId: "autre" }), lead({ id: "art", espace: "recrutement" })]
    expect(leadsVisibles(l, ["demarchage"], "moi", false).map((x) => x.id)).toEqual(["a-moi"])
    expect(leadsVisibles(l, ["recrutement"], "moi", false).map((x) => x.id)).toEqual(["art"])
    expect(leadsVisibles(l, ["demarchage", "recrutement"], "moi", true).map((x) => x.id)).toEqual(["a-moi", "a-autre", "art"])
  })
  it("la campagne d'un contact est la dernière où il est entré", () => {
    const m = campagneParContact([
      { campagneId: "k1", contactRef: "c", entreeLe: "2026-10-01" },
      { campagneId: "k2", contactRef: "c", entreeLe: "2026-11-01" },
    ], new Map([["k1", "Un"], ["k2", "Deux"]]))
    expect(m.get("c")).toEqual({ id: "k2", nom: "Deux" })
  })
  it("compte par chaleur", () => {
    expect(compterParNiveau([lead({ niveau: "fiche" }), lead({}), lead({})])).toEqual({ fiche: 1, reponse: 0, interet: 2 })
  })
})

describe("l'état d'un dossier déposé", () => {
  const d = { vuLe: null, traiteLe: null, completLe: null }
  it("suit le chemin nouveau, vu, traité, contrats, partenaire", () => {
    expect(statutDossier(d).texte).toBe("nouveau")
    expect(statutDossier({ ...d, vuLe: "x" }).texte).toBe("vu")
    expect(statutDossier({ ...d, traiteLe: "x" }).texte).toBe("traité")
    expect(statutDossier(d, { contratStatut: "envoye", accesOuvertLe: null }).texte).toBe("contrats envoyés")
    expect(statutDossier({ ...d, completLe: "x" }).texte).toBe("contrats signés")
    expect(statutDossier({ ...d, completLe: "x" }, { contratStatut: "signe", accesOuvertLe: "x" }).texte).toBe("partenaire")
  })
})
