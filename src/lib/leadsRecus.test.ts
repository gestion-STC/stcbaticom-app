import { describe, expect, it } from "vitest"
import { statutDossier } from "./dossierStatut"
import { campagneParContact, etapeAgence, etapeDossier, leadsVisibles, niveauAgence, sourceDe, sourcesDe, trierLeads, type LeadRecu } from "./leadsRecus"

const lead = (o: Partial<LeadRecu>): LeadRecu => ({
  id: "x", espace: "demarchage", niveau: "interet", nom: "", signal: "", detail: "", quand: "2026-11-09T10:00:00Z", etape: "nouveaux",
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
  it("l'étape d'un lead d'agence", () => {
    const n = { statut: "a_traiter", resultat: null, tentatives: 0 }
    expect(etapeAgence(n, {})).toBe("nouveaux")
    expect(etapeAgence({ ...n, tentatives: 2 }, {})).toBe("contactes")
    expect(etapeAgence({ statut: "traite", resultat: "interesse", tentatives: 1 }, {})).toBe("qualifies")
    expect(etapeAgence({ statut: "traite", resultat: "rdv", tentatives: 1 }, {})).toBe("qualifies")
    expect(etapeAgence({ statut: "traite", resultat: "a_rappeler", tentatives: 1 }, {})).toBe("contactes")
    expect(etapeAgence({ statut: "traite", resultat: "pas_interesse", tentatives: 1 }, {})).toBe("perdus")
    expect(etapeAgence({ statut: "retombe", resultat: "injoignable", tentatives: 3 }, {})).toBe("perdus")
    expect(etapeAgence(n, { etape: "client" })).toBe("gagnes")
    expect(etapeAgence({ statut: "traite", resultat: "interesse", tentatives: 1 }, { premierOs: "2026-11-01" })).toBe("gagnes")
  })
  it("l'étape d'un dossier suit son état", () => {
    expect(etapeDossier({ role: "info", texte: "nouveau" })).toBe("nouveaux")
    expect(etapeDossier({ role: "actif", texte: "vu" })).toBe("contactes")
    expect(etapeDossier({ role: "fait", texte: "traité" })).toBe("qualifies")
    expect(etapeDossier({ role: "actif", texte: "contrats envoyés" })).toBe("qualifies")
    expect(etapeDossier({ role: "fait", texte: "contrats signés" })).toBe("gagnes")
    expect(etapeDossier({ role: "fait", texte: "partenaire" })).toBe("gagnes")
  })
  it("la colonne de gauche : les campagnes d'abord, puis hors campagne, avec les nouveaux", () => {
    const k = { id: "k1", nom: "K1" }
    const s = sourcesDe([lead({ id: "a", campagne: k }), lead({ id: "b", campagne: k, etape: "perdus" }), lead({ id: "c" }), lead({ id: "d", espace: "recrutement" })])
    expect(s[0]).toEqual({ espace: "demarchage", id: "k1", nom: "K1", n: 2, nouveaux: 1 })
    expect(s.map((x) => x.id).slice(1).sort()).toEqual(["hors:demarchage", "hors:recrutement"])
    expect(sourceDe(lead({}))).toBe("hors:demarchage")
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
