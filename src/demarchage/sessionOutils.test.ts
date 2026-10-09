import { describe, expect, it } from "vitest"
import type { Activite, Agence, Contact } from "./modele"
import {
  SURVEILLANCE_INITIALE,
  TOURS_SANS_DEMARRAGE,
  choixComplet,
  compteARebours,
  constituerFile,
  dateHeureCourte,
  dateHeureLocale,
  decrireActivite,
  demainDixHeures,
  dureeAppel,
  estChampDeSaisie,
  issuePourTouche,
  jaugeDuJour,
  lignesNumeros,
  numeroEmissionPour,
  numeroLeMoinsAttribue,
  observerAppel,
  prospectDepuisAgence,
  resultatPourTouche,
  resumeEcriture,
  suggestionDepuisDetail,
  texteDernierAppel,
  versIso,
  type ChoixResultat,
} from "./sessionOutils"

function agence(p: Partial<Agence> = {}): Agence {
  return {
    id: "a1", nom: "Agence Test", enseigne: "", type: "agence", secteur: "75005", secteurLibelle: "Paris 5", adresse: "", telephone: "01 43 00 00 00", email: "", site: "",
    nbLots: 0, logoUrl: "", etape: "a_prospecter", etapeDepuis: "2026-10-01T10:00:00Z", commercialId: null, tentatives: 0, jointFois: 0, reveilLe: null, motif: "",
    premierOsLe: null, numeroEmission: "", derniereActiviteLe: null, creeLe: "2026-07-01T10:00:00Z",
    nbContacts: 0, contactPrincipal: "", contactLigne: "", prochaineEcheance: null, prochaineTache: "", nbAppels: 0, dernierAppelLe: null, dernierResultat: "",
    ...p,
  }
}
function contact(p: Partial<Contact> = {}): Contact {
  return { id: "c1", agenceId: "a1", prenom: "Sophie", nom: "Martin", role: "gestionnaire", ligneDirecte: "", mobile: "", email: "", principal: false, parti: false, note: "", creeLe: "2026-10-01T10:00:00Z", ...p }
}
function activite(p: Partial<Activite> = {}): Activite {
  return {
    id: "t1", agenceId: "a1", contactId: null, type: "appel", date: "2026-10-09T10:00:00Z", echeance: null, faitLe: null, compteId: null, compteNom: "Horlann", titre: "", note: "", resultat: "", issue: "", motif: "",
    numeroUtilise: "", dureeS: null, callId: "", sens: "sortant", rdvType: "", messageId: null, etapeDe: "", etapeVers: "", source: "session", ...p,
  }
}
const midi = new Date(2026, 9, 9, 12, 0, 0) // vendredi 9 octobre 2026, 12 h

describe("constituerFile", () => {
  const a = agence({ id: "a", nom: "A", telephone: "01 00 00 00 01" })
  const b = agence({ id: "b", nom: "B", telephone: "01 00 00 00 02" })
  const c = agence({ id: "c", nom: "C", telephone: "01 00 00 00 01" }) // même standard que A
  const d = agence({ id: "d", nom: "D", telephone: "" })

  it("garde l'ordre donné et retire les doublons de téléphone", () => {
    const f = constituerFile([b, a, c, d], { file: "a_prospecter", appeleesAujourdHui: new Set(), inclureDejaAppelees: false })
    expect(f.map((x) => x.id)).toEqual(["b", "a", "d"])
  })
  it("retire les agences appelées aujourd'hui, et celles qui partagent leur standard", () => {
    const f = constituerFile([a, b, c, d], { file: "a_prospecter", appeleesAujourdHui: new Set(["a"]), inclureDejaAppelees: false })
    expect(f.map((x) => x.id)).toEqual(["b", "d"])
  })
  it("les garde si la case est cochée, et toujours dans les rappels du jour", () => {
    expect(constituerFile([a, b], { file: "a_prospecter", appeleesAujourdHui: new Set(["a"]), inclureDejaAppelees: true }).map((x) => x.id)).toEqual(["a", "b"])
    expect(constituerFile([a, b], { file: "rappels", appeleesAujourdHui: new Set(["a"]), inclureDejaAppelees: false }).map((x) => x.id)).toEqual(["a", "b"])
  })
})

describe("numéro d'émission", () => {
  const reserve = ["01 86 00 00 01", "01 86 00 00 02"]
  it("attribue le moins utilisé, à égalité le premier de la réserve", () => {
    expect(numeroLeMoinsAttribue(reserve, [])).toBe("01 86 00 00 01")
    expect(numeroLeMoinsAttribue(reserve, [agence({ numeroEmission: "0186000001" })])).toBe("01 86 00 00 02")
    expect(numeroLeMoinsAttribue([], [])).toBe("")
  })
  it("garde le numéro attitré s'il est dans la réserve", () => {
    expect(numeroEmissionPour(agence({ numeroEmission: "0186000002" }), reserve, [])).toEqual({ numero: "0186000002", aEnregistrer: false, bloque: false })
  })
  it("bloque si le numéro attitré est sorti de la réserve : jamais un autre numéro en douce", () => {
    expect(numeroEmissionPour(agence({ numeroEmission: "01 86 00 00 09" }), reserve, [])).toEqual({ numero: "01 86 00 00 09", aEnregistrer: false, bloque: true })
  })
  it("propose le moins utilisé quand l'agence n'en a pas, et demande de l'enregistrer", () => {
    const r = numeroEmissionPour(agence(), reserve, [agence({ id: "x", numeroEmission: "0186000001" })])
    expect(r).toEqual({ numero: "01 86 00 00 02", aEnregistrer: true, bloque: false })
    expect(numeroEmissionPour(agence(), [], []).aEnregistrer).toBe(false)
  })
})

describe("jaugeDuJour", () => {
  const compteurs = new Map([["0186000001", 12]])
  it("compte sur les chiffres du numéro, avec un plafond", () => {
    const j = jaugeDuJour("01 86 00 00 01", compteurs, 100)
    expect(j.utilises).toBe(12)
    expect(j.part).toBeCloseTo(0.12)
    expect(j.depasse).toBe(false)
    expect(j.texte).toBe("12 / 100 appels aujourd'hui")
  })
  it("signale le plafond atteint, et sait qu'il n'y a pas de plafond", () => {
    expect(jaugeDuJour("0186000001", compteurs, 10)).toMatchObject({ part: 1, depasse: true })
    expect(jaugeDuJour("0186000001", compteurs, 0)).toMatchObject({ part: 0, depasse: false, texte: "12 appels aujourd'hui, pas de plafond réglé" })
    expect(jaugeDuJour("0186000002", compteurs, 100).utilises).toBe(0)
  })
})

describe("lignesNumeros", () => {
  it("met le standard d'abord, puis les lignes des contacts, et marque le numéro par défaut", () => {
    const l = lignesNumeros(agence(), [contact({ principal: true, ligneDirecte: "01 43 00 00 10", mobile: "06 00 00 00 01" }), contact({ id: "c2", nom: "Benali", parti: true, ligneDirecte: "01 43 00 00 11" })])
    expect(l.map((x) => x.numero)).toEqual(["01 43 00 00 00", "01 43 00 00 10", "06 00 00 00 01"])
    expect(l.map((x) => x.parDefaut)).toEqual([false, true, false])
    expect(l[1].contactId).toBe("c1")
    expect(l[1].detail).toContain("principal")
  })
  it("sans contact, le standard est le numéro par défaut ; un numéro incomplet est signalé", () => {
    const l = lignesNumeros(agence({ telephone: "01 43" }), [])
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ parDefaut: true, valide: false, contactId: null })
  })
  it("n'affiche pas deux fois le même numéro", () => {
    expect(lignesNumeros(agence(), [contact({ ligneDirecte: "01 43 00 00 00" })])).toHaveLength(1)
  })
})

describe("raccourcis clavier → résultat", () => {
  it("1 à 4 donnent les quatre résultats, puis les quatre issues", () => {
    expect(resultatPourTouche("1")).toBe("pas_de_reponse")
    expect(resultatPourTouche("3")).toBe("joint")
    expect(resultatPourTouche("4")).toBe("faux_numero")
    expect(resultatPourTouche("5")).toBeNull()
    expect(issuePourTouche("2")).toBe("rdv")
    expect(issuePourTouche("4")).toBe("pas_interesse")
    expect(issuePourTouche("a")).toBeNull()
  })
  it("se taisent dans un champ de saisie", () => {
    expect(estChampDeSaisie("INPUT", false)).toBe(true)
    expect(estChampDeSaisie("textarea", false)).toBe(true)
    expect(estChampDeSaisie("DIV", true)).toBe(true)
    expect(estChampDeSaisie("BUTTON", false)).toBe(false)
    expect(estChampDeSaisie(undefined, false)).toBe(false)
  })
})

describe("choixComplet", () => {
  const base = { issue: "" as const, motif: "" as const, rappelLe: null, rdvLe: null }
  it("exige un résultat, puis l'issue si joint, puis la pièce de l'issue", () => {
    expect(choixComplet({ ...base, resultat: null })).toBe(false)
    expect(choixComplet({ ...base, resultat: "pas_de_reponse" })).toBe(true)
    expect(choixComplet({ ...base, resultat: "joint" })).toBe(false)
    expect(choixComplet({ ...base, resultat: "joint", issue: "interesse" })).toBe(true)
    expect(choixComplet({ ...base, resultat: "joint", issue: "a_rappeler" })).toBe(false)
    expect(choixComplet({ ...base, resultat: "joint", issue: "a_rappeler", rappelLe: "2026-10-10T10:00:00.000Z" })).toBe(true)
    expect(choixComplet({ ...base, resultat: "joint", issue: "rdv" })).toBe(false)
    expect(choixComplet({ ...base, resultat: "joint", issue: "pas_interesse" })).toBe(false)
    expect(choixComplet({ ...base, resultat: "joint", issue: "pas_interesse", motif: "pas_de_besoin" })).toBe(true)
  })
})

describe("observerAppel (la surveillance de l'appel)", () => {
  it("raccroché = vu en ligne, puis deux tours à « non » de suite", () => {
    let s = SURVEILLANCE_INITIALE
    let r = observerAppel(s, { ok: true, actif: true })
    expect(r.verdict).toBe("continuer")
    s = r.suite
    r = observerAppel(s, { ok: true, actif: false })
    expect(r.verdict).toBe("continuer") // un seul tour à zéro : un hoquet
    r = observerAppel(r.suite, { ok: true, actif: true }) // ça reprend : compteur remis à zéro
    expect(r.suite.zeros).toBe(0)
    r = observerAppel(r.suite, { ok: true, actif: false })
    r = observerAppel(r.suite, { ok: true, actif: false })
    expect(r.verdict).toBe("raccroche")
  })
  it("pas de réponse = jamais en ligne après 7 tours", () => {
    let s = SURVEILLANCE_INITIALE
    let verdict = "continuer"
    for (let i = 0; i < TOURS_SANS_DEMARRAGE; i++) {
      const r = observerAppel(s, { ok: true, actif: false })
      s = r.suite
      verdict = r.verdict
      if (i < TOURS_SANS_DEMARRAGE - 1) expect(verdict).toBe("continuer")
    }
    expect(verdict).toBe("pas_de_reponse")
  })
  it("une vérification ratée ne compte ni pour ni contre ; huit d'affilée = indisponible", () => {
    let s = SURVEILLANCE_INITIALE
    for (let i = 0; i < 7; i++) {
      const r = observerAppel(s, { ok: false, actif: false })
      expect(r.verdict).toBe("continuer")
      s = r.suite
    }
    expect(s.sansDemarrage).toBe(0)
    expect(observerAppel(s, { ok: false, actif: false }).verdict).toBe("indisponible")
    expect(observerAppel(s, { ok: true, actif: true }).suite.echecs).toBe(0)
  })
})

describe("suggestionDepuisDetail", () => {
  it("propose faux numéro sur un échec, pas de réponse sur un répondeur", () => {
    expect(suggestionDepuisDetail("FAILED", null).resultat).toBe("faux_numero")
    expect(suggestionDepuisDetail("ANSWERED", true).resultat).toBe("faux_numero")
    expect(suggestionDepuisDetail("VOICEMAIL", false)).toMatchObject({ resultat: "pas_de_reponse" })
    expect(suggestionDepuisDetail("MISSED", false).resultat).toBe("pas_de_reponse")
    expect(suggestionDepuisDetail("ANSWERED", false).resultat).toBeNull()
  })
})

describe("durées et compte à rebours", () => {
  it("la durée est fin − début en secondes, arrondie, jamais négative", () => {
    expect(dureeAppel(1_000, 253_400)).toBe(252)
    expect(dureeAppel(1_000, 1_000)).toBe(0)
    expect(dureeAppel(5_000, 1_000)).toBe(0)
  })
  it("le compte à rebours s'arrondit vers le haut et s'arrête à 0", () => {
    expect(compteARebours(null, 0)).toBeNull()
    expect(compteARebours(10_000, 5_500)).toBe(5)
    expect(compteARebours(10_000, 12_000)).toBe(0)
  })
})

describe("dates", () => {
  it("écrit et relit une date locale pour un champ datetime-local", () => {
    expect(dateHeureLocale(new Date(2026, 9, 10, 9, 5))).toBe("2026-10-10T09:05")
    expect(demainDixHeures(midi)).toBe("2026-10-10T10:00")
    const iso = versIso("2026-10-10T10:00")
    expect(iso).not.toBeNull()
    expect(dateHeureCourte(iso)).toBe("10/10 10:00")
    expect(versIso("n'importe quoi")).toBeNull()
  })
  it("dit depuis quand l'agence n'a pas été appelée", () => {
    expect(texteDernierAppel(agence(), midi)).toBe("jamais appelée")
    expect(texteDernierAppel(agence({ dernierAppelLe: new Date(2026, 9, 9, 8, 0).toISOString() }), midi)).toBe("appelée aujourd'hui")
    expect(texteDernierAppel(agence({ dernierAppelLe: new Date(2026, 9, 8, 18, 0).toISOString() }), midi)).toBe("dernier appel hier")
    expect(texteDernierAppel(agence({ dernierAppelLe: new Date(2026, 9, 1, 18, 0).toISOString() }), midi)).toBe("dernier appel il y a 8 j")
  })
})

describe("resumeEcriture", () => {
  const choix = (p: Partial<ChoixResultat>): ChoixResultat => ({ resultat: "joint", issue: "", motif: "", contactId: null, rappelLe: null, rdvLe: null, rdvType: "telephone", ...p })
  it("résume l'étape et la tâche posées", () => {
    expect(resumeEcriture({ etape: "interesse", tacheId: "t", tentatives: 1 }, choix({ issue: "interesse" }), midi)).toBe("Étape → Intéressé · tâche Relancer le 16/10")
    expect(resumeEcriture({ etape: "a_prospecter", tacheId: null, tentatives: 3 }, choix({ resultat: "pas_de_reponse" }), midi)).toBe("Étape → À prospecter · tentative 3")
    expect(resumeEcriture({ etape: "gestionnaire_joint", tacheId: "t", tentatives: 1 }, choix({ issue: "a_rappeler", rappelLe: new Date(2026, 9, 16, 10, 0).toISOString() }), midi)).toBe("Étape → Gestionnaire joint · tâche Rappeler le 16/10 10:00")
    expect(resumeEcriture({ etape: "pas_interesse", tacheId: null, tentatives: 1 }, choix({ issue: "pas_interesse", motif: "deja_prestataire" }), midi)).toBe("Étape → Pas intéressé · motif « Déjà un prestataire »")
    expect(resumeEcriture({ etape: "hors_cible", tacheId: null, tentatives: 1 }, choix({ resultat: "faux_numero" }), midi)).toBe("Étape → Hors cible")
  })
})

describe("prospectDepuisAgence", () => {
  it("construit le Prospect attendu par le modal d'e-mail, le contact d'abord", () => {
    const a = agence({ email: "agence@ex.fr", adresse: "1 rue de Test", numeroEmission: "0186000001" })
    expect(prospectDepuisAgence(a, null)).toMatchObject({ id: "a1", entreprise: "Agence Test", contact: "", telephone: "01 43 00 00 00", email: "agence@ex.fr", adresse: "1 rue de Test", arrondissement: "Paris 5", priorite: "—", numeroEmission: "0186000001" })
    expect(prospectDepuisAgence(a, contact({ email: "sophie@ex.fr", ligneDirecte: "01 43 00 00 10" }))).toMatchObject({ contact: "Sophie Martin", email: "sophie@ex.fr", telephone: "01 43 00 00 10" })
  })
})

describe("decrireActivite", () => {
  it("décrit un appel, une tâche, un changement d'étape", () => {
    expect(decrireActivite(activite({ resultat: "joint", issue: "interesse", dureeS: 252, numeroUtilise: "0186000001" }))).toMatchObject({ titre: "Appel · Gestionnaire joint → Intéressé", detail: "4 min 12 · depuis le 01 86 00 00 01 · Horlann" })
    expect(decrireActivite(activite({ type: "tache", titre: "Relancer", echeance: new Date(2026, 9, 16, 10, 0).toISOString() }))).toMatchObject({ titre: "Tâche · Relancer", etat: "ouvert" })
    expect(decrireActivite(activite({ type: "etape", etapeDe: "a_prospecter", etapeVers: "interesse" })).titre).toBe("Étape · À prospecter → Intéressé")
    expect(decrireActivite(activite({ sens: "entrant" })).titre).toBe("Appel entrant")
  })
})
