import { describe, it, expect } from "vitest"
import { aTraiter, campagnes, compterAujourdhui, erreursParCause, etatDesPassages, joursAvantEpuisement, seriesParJour, tunnel, pourcent } from "./statsMachine"
import type { ClicST, DossierST, EnvoiST, SousTraitant } from "../recrutement"

const J = 86_400_000
const NOW = new Date(2026, 9, 9, 14, 0, 0).getTime() // 9 oct. 2026 14:00 (heure locale)
const iso = (msAvant: number) => new Date(NOW - msAvant).toISOString()

const fiche = (p: Partial<SousTraitant>): SousTraitant => ({
  entreprise: "X", contact: "", email: "x@x.fr", telephone: "0612345678", metier: "Électricité", zone: "", statut: "en_sequence",
  etapeCourante: 0, nbClics: 0, nbEnvoisOk: 0, nbEnvoisErreur: 0, ...p,
})
const envoi = (p: Partial<EnvoiST>): EnvoiST => ({
  id: "e", sousTraitantId: "s", etapeId: "t", canal: "email", envoyeLe: iso(0), statut: "envoye", erreur: "", cause: "", tentative: 1, ...p,
})

describe("compterAujourdhui", () => {
  it("compte les envois du jour civil, par canal, les erreurs et les rejeux", () => {
    const envois = [
      envoi({ canal: "email" }), envoi({ canal: "sms" }), envoi({ statut: "erreur", rejouerApres: iso(-60_000) }),
      envoi({ tentative: 2 }), envoi({ envoyeLe: iso(2 * J) }), // hier : hors compte
    ]
    expect(compterAujourdhui(envois, NOW)).toEqual({ mails: 2, sms: 1, erreurs: 1, rejoues: 1, enAttenteDeRejeu: 1 })
  })
})

describe("seriesParJour", () => {
  it("renvoie un point par jour, du plus ancien au plus récent, avec les zéros", () => {
    const envois = [envoi({}), envoi({ envoyeLe: iso(J), canal: "sms" }), envoi({ envoyeLe: iso(J), statut: "erreur" })]
    const clics: ClicST[] = [{ id: "c", sousTraitantId: "s", cliqueLe: iso(0), destination: "candidature" }, { id: "c2", sousTraitantId: "s", cliqueLe: iso(0), destination: "stop" }]
    const fiches = [fiche({ deposeLe: iso(0), demarreLe: iso(2 * J) })]
    const s = seriesParJour(envois, clics, fiches, 3, NOW)
    expect(s.map((p) => p.jour)).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"])
    expect(s[2]).toMatchObject({ mails: 1, clics: 1, depots: 1 }) // le clic « stop » n'est pas un clic d'intérêt
    expect(s[1]).toMatchObject({ sms: 1, erreurs: 1 })
    expect(s[0]).toMatchObject({ demarres: 1 })
  })
})

describe("erreursParCause", () => {
  it("regroupe par cause, trie par volume, compte ce qui attend un rejeu et ce qui est abandonné", () => {
    const envois = [
      envoi({ statut: "erreur", cause: "limite de débit (plateforme)", rejouerApres: iso(0) }),
      envoi({ statut: "erreur", cause: "limite de débit (plateforme)", rejouerApres: null, envoyeLe: iso(J) }),
      envoi({ statut: "abandonne", cause: "Ringover : SMS trop rapprochés" }),
      envoi({ statut: "erreur", cause: "limite de débit (plateforme)", envoyeLe: iso(40 * J) }), // hors fenêtre
    ]
    const r = erreursParCause(envois, NOW - 30 * J)
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ cause: "limite de débit (plateforme)", n: 2, enAttente: 1, abandonnees: 0 })
    expect(r[1]).toMatchObject({ cause: "Ringover : SMS trop rapprochés", n: 1, abandonnees: 1 })
  })
})

describe("tunnel", () => {
  const fiches = [
    fiche({ demarreLe: iso(J), nbEnvoisOk: 2, candidatureClicLe: iso(0), deposeLe: iso(0), statut: "depose" }),
    fiche({ demarreLe: iso(J), nbEnvoisOk: 1 }),
    fiche({ demarreLe: iso(J), nbEnvoisOk: 0 }), // démarrée, jamais jointe
    fiche({ demarreLe: iso(100 * J), nbEnvoisOk: 1, metier: "Peinture" }), // hors fenêtre 30 j
    fiche({ statut: "a_contacter" }),
  ]
  it("ne compte que les démarrés de la fenêtre, joints = au moins un envoi réussi", () => {
    expect(tunnel(fiches, 30, "", NOW)).toEqual({ demarres: 3, joints: 2, cliques: 1, deposes: 1 })
  })
  it("sans fenêtre, tout l'historique ; avec un corps, seulement ce corps", () => {
    expect(tunnel(fiches, 0, "", NOW).demarres).toBe(4)
    expect(tunnel(fiches, 0, "Peinture", NOW)).toEqual({ demarres: 1, joints: 1, cliques: 0, deposes: 0 })
  })
  it("pourcent arrondit et ne divise jamais par zéro", () => {
    expect(pourcent(1, 3)).toBe(33)
    expect(pourcent(1, 0)).toBe(0)
  })
})

describe("campagnes", () => {
  it("une ligne par objectif : en séquence, démarrés 7 j, taux et fiches disponibles", () => {
    const fiches = [
      fiche({ demarreLe: iso(J), nbEnvoisOk: 1, deposeLe: iso(0), statut: "depose" }),
      fiche({ demarreLe: iso(2 * J), nbEnvoisOk: 1 }),
      fiche({ statut: "a_contacter" }),
      fiche({ statut: "a_contacter", emailInvalide: true }),
      fiche({ statut: "a_contacter", metier: "Peinture / Électricité" }), // multi-corps : compte dans les deux
    ]
    const [elec] = campagnes(fiches, [{ metier: "Électricité", objectifHebdo: 2, actif: true }], 30, NOW)
    expect(elec).toMatchObject({ libelle: "Électricité", voulu: 2, enSequence: 1, demarres7j: 2, joints: 2, depots: 1, dispo: 2 })
    expect(elec.taux).toBeCloseTo(0.5)
  })
})

describe("joursAvantEpuisement", () => {
  it("au rythme des 7 derniers jours ; null si rien ne démarre", () => {
    const fiches = [fiche({ demarreLe: iso(J) }), fiche({ demarreLe: iso(2 * J) }), ...Array.from({ length: 10 }, () => fiche({ statut: "a_contacter" }))]
    expect(joursAvantEpuisement(fiches, NOW)).toBe(35) // 10 restants ÷ (2 / 7 j)
    expect(joursAvantEpuisement([fiche({ statut: "a_contacter" })], NOW)).toBeNull()
  })
})

describe("aTraiter", () => {
  it("les intéressés sans dépôt, du plus récent au plus ancien ; les dossiers sans fiche ; les désinscrits de la semaine", () => {
    const fiches = [
      fiche({ id: "a", candidatureClicLe: iso(J) }),
      fiche({ id: "b", candidatureClicLe: iso(0) }),
      fiche({ id: "c", candidatureClicLe: iso(0), deposeLe: iso(0), statut: "depose" }),
      fiche({ id: "d", statut: "desinscrit", desinscritLe: iso(2 * J) }),
      fiche({ id: "e", statut: "desinscrit", desinscritLe: iso(20 * J) }),
    ]
    const dossiers: DossierST[] = [
      { id: "d1", creeLe: iso(0), raisonSociale: "A", email: "", donnees: {}, fichiers: [], emailEnvoye: true, sousTraitantId: null },
      { id: "d2", creeLe: iso(0), raisonSociale: "B", email: "", donnees: {}, fichiers: [], emailEnvoye: true, sousTraitantId: "x", traiteLe: iso(0) },
    ]
    const r = aTraiter(fiches, [envoi({ statut: "erreur", rejouerApres: iso(0) })], dossiers, 3, NOW)
    expect(r.interesses.map((f) => f.id)).toEqual(["b", "a"])
    expect(r.reponses).toBe(3)
    expect(r.erreursEnAttente).toBe(1)
    expect(r.dossiersSansFiche.map((d) => d.id)).toEqual(["d1"])
    expect(r.dossiersATraiter.map((d) => d.id)).toEqual(["d1"])
    expect(r.desinscrits7j.map((f) => f.id)).toEqual(["d"])
  })
})

describe("etatDesPassages", () => {
  it("le dernier passage, s'il tourne encore, et le prochain à 15 min", () => {
    const r = etatDesPassages([{ id: "p", debut: iso(4 * 60_000), fin: iso(3 * 60_000), bilan: { envois: 12 }, erreur: "" }], 15, NOW)
    expect(r.enCours).toBe(false)
    expect(Math.round(r.depuisMs! / 60_000)).toBe(4)
    expect(Math.round(r.prochainDansMs! / 60_000)).toBe(11)
    expect(etatDesPassages([], 15, NOW).dernier).toBeNull()
  })
})
