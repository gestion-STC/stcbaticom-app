import { describe, expect, it } from "vitest"
import { SECTIONS_ST, TOUTES_QUESTIONS, avancement, blocageDecision, echecs, erreurQuestionnaire, manques, moyenneAvis, nettoyerQuestionnaire, prerempli, visible, type ReponsesST, type SectionST } from "./qualificationST"

const complet = (): ReponsesST => Object.fromEntries(TOUTES_QUESTIONS.filter((q) => q.requis).map((q) => [q.id, q.type === "oui_non" ? "Oui" : q.type === "echelle" ? "4" : q.type === "cases" ? ["75 Paris"] : q.options?.[0] ?? "x"]))

describe("qualification sous-traitant", () => {
  it("a les huit parties du formulaire et des identifiants uniques", () => {
    expect(SECTIONS_ST).toHaveLength(8)
    expect(new Set(TOUTES_QUESTIONS.map((q) => q.id)).size).toBe(TOUTES_QUESTIONS.length)
  })
  it("un seul Non éliminatoire suffit à bloquer l'acceptation", () => {
    const r = { ...complet(), kbis: "Non" }
    expect(echecs(r)).toEqual(["Kbis de moins de 3 mois"])
    expect(blocageDecision("Accepté", r)).toMatch(/éliminatoire/)
  })
  it("accepte un dossier complet", () => {
    expect(manques(complet())).toEqual([])
    expect(blocageDecision("Accepté", complet())).toBe("")
  })
  it("compte ce qui manque pour accepter", () => {
    const r = complet(); delete r.siren
    expect(blocageDecision("Accepté", r)).toBe("Il reste 1 question obligatoire.")
  })
  it("un refus demande un motif, pas le formulaire complet", () => {
    expect(blocageDecision("Refusé", {})).toMatch(/motif/)
    expect(blocageDecision("Refusé", { motif: "Pas de décennale" })).toBe("")
  })
  it("laisse mettre en attente à tout moment", () => expect(blocageDecision("En attente", {})).toBe(""))
  it("n'affiche une question conditionnelle que si elle s'applique", () => {
    const q = TOUTES_QUESTIONS.find((x) => x.id === "litiges_detail")!
    expect(visible(q, { litiges: "Non" })).toBe(false)
    expect(visible(q, { litiges: "Oui" })).toBe(true)
  })
  it("calcule la moyenne de l'avis seulement quand les quatre notes sont là", () => {
    expect(moyenneAvis({ serieux: "5", communication: "4" })).toBeNull()
    expect(moyenneAvis({ serieux: "5", communication: "4", capacite: "3", prix: "4" })).toBe(4)
  })
  it("pré-remplit ce qu'on connaît déjà sans inventer", () => {
    expect(prerempli({ entreprise: "ABC", contact: "", telephone: "06", metier: null }, "Horlann")).toEqual({ raison_sociale: "ABC", telephone: "06", qualifie_par: "Horlann" })
  })
  it("mesure l'avancement sur les questions obligatoires", () => {
    const a = avancement(prerempli({ entreprise: "ABC" }, "X"))
    expect(a.fait).toBe(2)
    expect(a.total).toBeGreaterThan(30)
  })
  it("calcule sur un questionnaire modifié", () => {
    const s: SectionST[] = [{ id: "eliminatoires", titre: "E", questions: [{ id: "n1", libelle: "Nouveau critère", type: "oui_non", requis: true }] }, { id: "avis", titre: "A", questions: [{ id: "n2", libelle: "Note", type: "echelle", requis: true }, { id: "motif", libelle: "Motif", type: "long" }] }]
    expect(echecs({ n1: "Non" }, s)).toEqual(["Nouveau critère"])
    expect(moyenneAvis({ n2: "3" }, s)).toBe(3)
    expect(blocageDecision("Accepté", { n1: "Oui", n2: "3" }, s)).toBe("")
    expect(avancement({ n1: "Oui" }, s)).toEqual({ fait: 1, total: 2 })
  })
  it("enregistre un questionnaire propre", () => {
    const propre = nettoyerQuestionnaire([{ id: "eliminatoires", titre: " E ", questions: [{ id: "a", libelle: " Vrai ", type: "texte" }, { id: "b", libelle: "  ", type: "texte" }] }, { id: "x", titre: "X", questions: [{ id: "c", libelle: "C", type: "choix", options: [" Un ", ""] }] }])
    expect(propre[0]).toEqual({ id: "eliminatoires", titre: "E", questions: [{ id: "a", libelle: "Vrai", type: "oui_non", options: undefined }] })
    expect(propre[1].questions[0].options).toEqual(["Un"])
  })
  it("refuse un choix sans réponse et une partie sans titre", () => {
    expect(erreurQuestionnaire([{ id: "x", titre: "X", questions: [{ id: "c", libelle: "C", type: "choix", options: [] }] }])).toMatch(/aucune réponse/)
    expect(erreurQuestionnaire([{ id: "x", titre: "", questions: [] }])).toMatch(/titre/)
  })
})
