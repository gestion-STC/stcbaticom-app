import { describe, it, expect } from "vitest"
import { calculerSante, estFicheComplete } from "./santeBase"
import { clePaire } from "./doublonsProbables"
import { TYPE_APPORTEUR, type Prospect } from "../data"

const p = (id: string, champs: Partial<Prospect>): Prospect => ({
  id,
  entreprise: "",
  contact: "",
  telephone: "",
  email: "",
  adresse: "",
  arrondissement: "",
  commentaire: "",
  type: "",
  statut: "Nouveau prospect",
  priorite: "—",
  prochaineRelance: "—",
  ...champs,
})

const complete = (id: string, extra: Partial<Prospect> = {}) =>
  p(id, {
    contact: "Mme Bolot",
    telephone: "01 45 44 66 00",
    email: `c${id}@fortis.fr`,
    adresse: "1 rue de Paris",
    ...extra,
  })

describe("estFicheComplete", () => {
  it("exige nom, téléphone, e-mail et adresse", () => {
    expect(estFicheComplete(complete("1"))).toBe(true)
    expect(estFicheComplete(complete("1", { email: "" }))).toBe(false)
    expect(estFicheComplete(complete("1", { adresse: "   " }))).toBe(false)
  })
})

describe("calculerSante (indicateur d'avancement)", () => {
  it("compte les fiches complètes et celles à compléter", () => {
    const s = calculerSante([complete("1"), p("2", { contact: "X" }), p("3", {})])
    expect(s.total).toBe(3)
    expect(s.completes).toBe(1)
    expect(s.aCompleter).toBe(2)
  })

  it("détaille ce qui manque, champ par champ", () => {
    const s = calculerSante([
      complete("1"),
      complete("2", { email: "" }),
      complete("3", { email: "", adresse: "" }),
    ])
    expect(s.sansEmail).toBe(2)
    expect(s.sansAdresse).toBe(1)
    expect(s.sansTelephone).toBe(0)
    expect(s.sansContact).toBe(0)
  })

  it("exclut les apporteurs d'affaires (on ne les démarche pas)", () => {
    const s = calculerSante([complete("1"), p("2", { type: TYPE_APPORTEUR })])
    expect(s.total).toBe(1)
  })

  it("compte une paire de doublons UNE seule fois, pas deux", () => {
    const s = calculerSante([
      complete("1", { email: "meme@x.fr" }),
      complete("2", { email: "meme@x.fr" }),
    ])
    expect(s.doublons).toBe(1)
  })

  it("ne compte plus une paire déjà tranchée « 2 personnes différentes »", () => {
    const liste = [complete("1", { email: "meme@x.fr" }), complete("2", { email: "meme@x.fr" })]
    expect(calculerSante(liste, new Set([clePaire("1", "2")])).doublons).toBe(0)
  })

  it("compte 3 paires quand trois fiches se ressemblent deux à deux", () => {
    const s = calculerSante([
      complete("1", { email: "meme@x.fr" }),
      complete("2", { email: "meme@x.fr" }),
      complete("3", { email: "meme@x.fr" }),
    ])
    expect(s.doublons).toBe(3) // 1-2, 1-3, 2-3
  })

  it("détaille sur QUEL critère chaque doublon a été repéré", () => {
    const s = calculerSante([
      complete("1", { email: "meme@x.fr" }),
      complete("2", { email: "meme@x.fr" }),
      complete("3", { telephone: "09 09 09 09 09" }),
      complete("4", { telephone: "0909090909" }),
    ])
    expect(s.doublonsEmail).toBe(1)
    expect(s.doublonsTelephone).toBe(1)
    expect(s.doublonsNom).toBe(0)
    // Le détail doit toujours retomber sur le total affiché.
    expect(s.doublonsEmail + s.doublonsNom + s.doublonsTelephone).toBe(s.doublons)
  })

  it("ne signale aucun doublon sur une base saine", () => {
    const s = calculerSante([complete("1"), complete("2", { telephone: "01 02 03 04 05" })])
    expect(s.doublons).toBe(0)
  })

  it("ne plante pas sur une base vide", () => {
    const s = calculerSante([])
    expect(s).toMatchObject({ total: 0, completes: 0, aCompleter: 0, doublons: 0 })
  })
})
