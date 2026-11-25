// Les corrections du 25/11/2026 (campagnes fiables) : fonctions pures.
import { describe, expect, it } from "vitest"
import ecranExclusions from "./exclusions.ts?raw"
import serveurExclusions from "../../supabase/functions/_shared/campagnes/exclusions.ts?raw"
import ecranAB from "./abTest.ts?raw"
import serveurAB from "../../supabase/functions/_shared/campagnes/abTest.ts?raw"
import { avecDejaClients, exclusionLibre, pasInteresseExclu } from "./exclusions"
import { debutJourParis, jourDe } from "./moteur"
import { leadsPourAB } from "./abTest"
import { alerteSansEnvoi } from "./alerteLancement"
import { envoisPartis, indicateurs } from "./indicateurs"
import { inscriptionAu, inscriptionsParContact } from "./rattachement"
import { controleLancement, relancable } from "./lancement"
import { mesureAvis } from "./mesureAvis"
import { raisonsExclusion } from "./audience"
import { refusInstantly } from "../lib/etatInstantly"
import { GARDE_DEFAUT, configDe, type ConfigCampagne } from "./configCampagne"
import type { Base, Campagne, Contact, Envoi, Evenement, Inscription } from "./modele"

const n = (s: string) => s.replace(/\r\n/g, "\n")
const k = (id: string, p: Partial<Contact> = {}): Contact => ({ id, baseId: "agences", nom: id, personne: "", email: `${id}@x.fr`, mobile: "", telephone: "0102030405", champs: {}, statut: "libre", desinscrit: false, proprietaireId: null, ...p })
const camp = (p: Partial<Campagne> = {}): Campagne => ({
  id: "c", nom: "C", baseId: "agences", objectif: "", statut: "active", audience: { filtres: {}, doitAvoir: ["email"] },
  rythme: { parJour: 20, jours: [1, 2, 3, 4, 5], heureMin: 9, heureMax: 18, ecartMinH: 48 },
  etapes: [{ id: "m1", type: "mail", variantes: [{ id: "v1", nom: "A", objet: "o", corps: "b" }] }], signaux: [], creeParId: "", creeLe: "2026-11-01T00:00:00Z", lanceeLe: "2026-11-01T08:00:00Z", coutSms: 0, ...p,
})
const env = (id: string, p: Partial<Envoi> = {}): Envoi => ({ id, campagneId: "c", inscriptionId: "i", contactId: "a", etapeId: "m1", varianteId: "v1", canal: "mail", le: "2026-11-20T09:00:00Z", statut: "envoye", cause: "", ...p })
const ev = (envoiId: string, type: Evenement["type"], p: Partial<Evenement> = {}): Evenement => ({ id: envoiId + type, campagneId: "c", envoiId, contactId: "a", type, le: "2026-11-20T10:00:00Z", ...p })
const insc = (p: Partial<Inscription> = {}): Inscription => ({ id: "i", campagneId: "c", contactId: "a", entreeLe: "2026-11-01T09:00:00Z", etapeIndex: 0, prochaineLe: "2026-11-20T09:00:00Z", statut: "en_cours", sortieLe: null, ...p })

describe("copies identiques écran / serveur", () => {
  it("exclusions.ts et abTest.ts", () => {
    expect(n(serveurExclusions)).toBe(n(ecranExclusions))
    expect(n(serveurAB)).toBe(n(ecranAB))
  })
})

describe("exclusions partagées avec le moteur", () => {
  it("« Déjà client » retiré : les clients redeviennent libres ; sans liste, rien ne change", () => {
    const l = [k("a", { statut: "gagne" })]
    expect(avecDejaClients(l, ["Désinscrit"])[0].statut).toBe("libre")
    expect(avecDejaClients(l, ["Déjà client"])[0].statut).toBe("gagne")
    expect(avecDejaClients(l, undefined)[0].statut).toBe("gagne")
  })
  it("« Pas intéressé » repris après le délai", () => {
    const now = new Date("2026-11-25T00:00:00Z")
    expect(pasInteresseExclu("2026-01-01T00:00:00Z", 6, now)).toBe(false)
    expect(pasInteresseExclu("2026-10-01T00:00:00Z", 6, now)).toBe(true)
    expect(pasInteresseExclu("2026-01-01T00:00:00Z", 0, now)).toBe(true)
    expect(pasInteresseExclu(null, 6, now)).toBe(true)
  })
  it("exclusion libre : la valeur d'un champ", () => {
    expect(exclusionLibre({ etape: "Endormie / Orpi" }, ["Déjà client", "orpi"])).toBe("orpi")
    expect(exclusionLibre({ etape: "Endormie" }, ["Déjà client"])).toBeNull()
  })
  it("l'écran lit les rebonds Resend des agences et les « pas intéressé » du moteur", () => {
    const faits = { rebondsAgences: new Set(["r"]), pasInteresses: new Map([["p", "2026-11-01T00:00:00Z"], ["vieux", "2025-01-01T00:00:00Z"]]) }
    const r = raisonsExclusion({ campagneId: "c", garde: GARDE_DEFAUT, ecartCommun: 0, envois: [], evenements: [], inscriptions: [], maintenant: "2026-11-25T00:00:00Z", baseId: "agences", relanceMois: 6, faits })
    expect(r(k("r"))).toBe("Adresse en erreur")
    expect(r(k("p"))).toBe("Pas intéressé")
    expect(r(k("vieux"))).toBeNull()
    expect(r(k("x", { champs: { etape: "Pas intéressé" } }))).toBeNull() // le moteur ne lit pas l'étape affichée
  })
})

describe("fuseau de Paris", () => {
  it("le jour à Paris, pas le jour universel", () => {
    expect(jourDe("2026-11-24T23:30:00Z")).toBe("2026-11-25")
    expect(jourDe("2026-07-24T22:30:00Z")).toBe("2026-07-25")
  })
  it("minuit à Paris l'hiver et l'été, et les jours de changement d'heure", () => {
    expect(debutJourParis(new Date("2026-11-25T10:00:00Z")).toISOString()).toBe("2026-11-24T23:00:00.000Z")
    expect(debutJourParis(new Date("2026-07-15T10:00:00Z")).toISOString()).toBe("2026-07-14T22:00:00.000Z")
    expect(debutJourParis(new Date("2026-03-29T10:00:00Z")).toISOString()).toBe("2026-03-28T23:00:00.000Z")
    expect(debutJourParis(new Date("2026-10-25T10:00:00Z")).toISOString()).toBe("2026-10-24T22:00:00.000Z")
  })
})

describe("confié à Instantly ou parti", () => {
  it("un mail Instantly n'est parti qu'une fois confirmé ; SMS, avis et test le sont d'office", () => {
    const e = [env("1"), env("2"), env("3", { canal: "sms" }), env("4", { test: true })]
    const p = envoisPartis(camp(), e, [ev("1", "delivre")])
    expect([...p].sort()).toEqual(["1", "3", "4"])
    expect(envoisPartis(camp({ baseId: "locataires" }), e, []).size).toBe(4)
    expect(envoisPartis(camp({ origine: "st" }), e, []).size).toBe(4)
  })
  it("touchés comptés sur les confirmations ; le reste en attente", () => {
    const base: Base = { id: "agences", nom: "G", unite: "agences", equipeId: "dev", champs: [], issues: [], gagne: "", prospection: true, liens: [] }
    const envois = [env("1", { contactId: "a" }), env("2", { contactId: "b" })]
    const i = indicateurs(camp(), base, [k("a"), k("b")], [insc({ contactId: "a" }), insc({ id: "j", contactId: "b" })], envois, [ev("1", "delivre")], [], [])
    expect(i.engagement.touches).toBe(1)
    expect(i.envois.envoyes).toBe(2)
    expect(i.envois.enAttente).toBe(1)
    expect(i.delivrabilite.delivres).toBe(1)
  })
})

describe("test A/B : une seule définition des leads", () => {
  it("sorti lead de la campagne, ou fiche lead / gagnée", () => {
    const l = leadsPourAB("c", [insc({ contactId: "a", statut: "lead" }), insc({ contactId: "z", statut: "lead", campagneId: "autre" })], [{ id: "b", statut: "gagne" }, { id: "d", statut: "libre" }])
    expect([...l].sort()).toEqual(["a", "b"])
  })
})

describe("alerte : rien confié depuis 24 h", () => {
  const due = [insc({ prochaineLe: "2026-11-24T08:00:00Z" })]
  it("alerte en semaine quand des mails sont dus et que rien n'est parti", () => {
    expect(alerteSansEnvoi(camp(), [], due, "2026-11-25T14:00:00Z")).toMatch(/Aucun mail/)
  })
  it("pas d'alerte si un mail a été confié, ni le lundi matin après un week-end", () => {
    expect(alerteSansEnvoi(camp(), [env("1", { le: "2026-11-25T09:00:00Z" })], due, "2026-11-25T14:00:00Z")).toBeNull()
    expect(alerteSansEnvoi(camp(), [], due, "2026-11-23T08:05:00Z")).toBeNull()
  })
  it("pas d'alerte sans étape mail ni contact dû", () => {
    expect(alerteSansEnvoi(camp({ etapes: [{ id: "s", type: "sms", variantes: [] }] }), [], due, "2026-11-25T14:00:00Z")).toBeNull()
    expect(alerteSansEnvoi(camp(), [], [], "2026-11-25T14:00:00Z")).toBeNull()
  })
})

describe("rattachement des leads et des appels", () => {
  it("l'inscription en cours à la date, pas la dernière", () => {
    const m = inscriptionsParContact([insc({ id: "oct", campagneId: "octobre", entreeLe: "2026-10-01T00:00:00Z" }), insc({ id: "nov", campagneId: "novembre", entreeLe: "2026-11-10T00:00:00Z" })])
    expect(inscriptionAu(m, "a", "2026-10-20T00:00:00Z")?.campagneId).toBe("octobre")
    expect(inscriptionAu(m, "a", "2026-11-20T00:00:00Z")?.campagneId).toBe("novembre")
    expect(inscriptionAu(m, "a", "2026-09-01T00:00:00Z")).toBeNull()
  })
})

describe("vérification avant de lancer", () => {
  const cfg: ConfigCampagne = configDe(camp())
  it("bloque sans audience, sauf s'il reste des contacts en séquence", () => {
    expect(controleLancement({ cfg, eligibles: 0, unite: "agences", avis: false, comptesLinkedIn: 0 }).bloquant).toBe("Personne dans l'audience")
    expect(controleLancement({ cfg, eligibles: 0, enCours: 3, unite: "agences", avis: false, comptesLinkedIn: 0 }).bloquant).toBeNull()
  })
  it("signale le refus d'Instantly", () => {
    const c = controleLancement({ cfg, eligibles: 5, unite: "agences", avis: false, comptesLinkedIn: 0, refusInstantly: "402" })
    expect(c.lignes.some(([t, ok]) => /Instantly refuse/.test(t) && !ok)).toBe(true)
  })
  it("une campagne terminée ne se relance pas", () => {
    expect(relancable({ statut: "terminee" })).toBe(false)
    expect(relancable({ statut: "pause" })).toBe(true)
  })
})

describe("mesure d'une campagne d'avis", () => {
  it("partis sur Google et désinscriptions", () => {
    const m = mesureAvis("c", [insc({ contactId: "a" }), insc({ id: "j", contactId: "b", statut: "desinscrit" })], [env("1")], [ev("x", "clic", { lien: "google" }), ev("y", "desinscription", { contactId: "c" })])
    expect(m).toEqual({ entres: 2, touches: 1, google: 1, desinscrits: 2 })
  })
})

describe("refus d'Instantly", () => {
  it("dit clairement le forfait non payé", () => {
    expect(refusInstantly({ erreur: "Instantly a répondu 402", detail: "Workspace does not have an active paid plan" })).toMatch(/forfait Instantly n'est pas actif/)
    expect(refusInstantly({})).toBeNull()
  })
})
