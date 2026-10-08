import { describe, it, expect } from "vitest"
import { CHAMPS_REGLAGES, DOMAINE_ENVOI, JOURS_SEMAINE, emailValide, extraireReglages, ligneEtatMachine, memesReglages, validerReglages } from "./reglagesRecrutement"
import type { PilotageST } from "../recrutement"

// Un jeu de réglages valide, le même que les valeurs par défaut de la base.
const base: PilotageST = {
  actif: false, objectifHebdo: 2,
  plafondJour: 100, plafondSmsJour: 40, cadenceEmailMs: 700, cadenceSmsMs: 3000,
  heureMin: "09:00", heureMax: "18:00", heureMinSms: "10:00", heureMaxSms: "17:00",
  jours: [1, 2, 3, 4, 5], sequenceId: null,
  delaiMinTouchesH: 48, tentativesMax: 3, abandonApresJours: 21,
  alerteEmail: "", seuilErreursPct: 20, emailTest: "", adresseEnvoi: "recrutement@crm.stcbatiment.fr",
  recalerAuDemarrage: true, actifDepuis: null, arreteLe: null, recaleLe: null, majLe: null,
}
const avec = (p: Partial<PilotageST>): PilotageST => ({ ...base, ...p })

describe("validerReglages", () => {
  it("accepte les valeurs par défaut", () => {
    expect(validerReglages(base)).toEqual([])
  })

  it("refuse un plafond nul, négatif, vidé ou non entier", () => {
    expect(validerReglages(avec({ plafondJour: 0 }))).toHaveLength(1)
    expect(validerReglages(avec({ plafondSmsJour: -5 }))).toHaveLength(1)
    expect(validerReglages(avec({ plafondJour: NaN }))).toHaveLength(1) // champ vidé à l'écran
    expect(validerReglages(avec({ plafondSmsJour: 2.5 }))).toHaveLength(1)
    expect(validerReglages(avec({ plafondJour: 1, plafondSmsJour: 1 }))).toEqual([])
  })

  it("borne les cadences entre 300 et 60 000 ms", () => {
    expect(validerReglages(avec({ cadenceEmailMs: 299 }))[0]).toMatch(/cadence e-mail/i)
    expect(validerReglages(avec({ cadenceSmsMs: 60_001 }))[0]).toMatch(/cadence SMS/i)
    expect(validerReglages(avec({ cadenceEmailMs: 300, cadenceSmsMs: 60_000 }))).toEqual([])
  })

  it("veut des heures HH:MM avec le début avant la fin, pour chaque canal", () => {
    expect(validerReglages(avec({ heureMin: "9h" }))[0]).toMatch(/HH:MM/)
    expect(validerReglages(avec({ heureMaxSms: "25:00" }))[0]).toMatch(/SMS.*HH:MM/)
    expect(validerReglages(avec({ heureMin: "18:00", heureMax: "09:00" }))[0]).toMatch(/e-mails.*début.*avant/)
    expect(validerReglages(avec({ heureMinSms: "12:00", heureMaxSms: "12:00" }))[0]).toMatch(/SMS.*début.*avant/)
    expect(validerReglages(avec({ heureMin: "00:00", heureMax: "23:59" }))).toEqual([])
  })

  it("exige au moins un jour, connu", () => {
    expect(validerReglages(avec({ jours: [] }))[0]).toMatch(/au moins un jour/)
    expect(validerReglages(avec({ jours: [0] }))[0]).toMatch(/inconnu/)
    expect(validerReglages(avec({ jours: [8] }))[0]).toMatch(/inconnu/)
    expect(validerReglages(avec({ jours: [7] }))).toEqual([])
  })

  it("borne les relances : tentatives 1-10, délai 0-720 h, abandon 1-365 j", () => {
    expect(validerReglages(avec({ tentativesMax: 0 }))[0]).toMatch(/tentatives/)
    expect(validerReglages(avec({ tentativesMax: 11 }))[0]).toMatch(/tentatives/)
    expect(validerReglages(avec({ delaiMinTouchesH: -1 }))[0]).toMatch(/deux touches/)
    expect(validerReglages(avec({ delaiMinTouchesH: 721 }))[0]).toMatch(/deux touches/)
    expect(validerReglages(avec({ abandonApresJours: 0 }))[0]).toMatch(/abandon/i)
    expect(validerReglages(avec({ abandonApresJours: 366 }))[0]).toMatch(/abandon/i)
    expect(validerReglages(avec({ tentativesMax: 10, delaiMinTouchesH: 0, abandonApresJours: 365 }))).toEqual([])
  })

  it("borne le seuil d'erreurs entre 1 et 100 %", () => {
    expect(validerReglages(avec({ seuilErreursPct: 0 }))[0]).toMatch(/seuil/)
    expect(validerReglages(avec({ seuilErreursPct: 101 }))[0]).toMatch(/seuil/)
    expect(validerReglages(avec({ seuilErreursPct: 100 }))).toEqual([])
  })

  it("accepte un e-mail d'alerte et de test vides, refuse une adresse mal formée", () => {
    expect(validerReglages(avec({ alerteEmail: "   ", emailTest: "" }))).toEqual([])
    expect(validerReglages(avec({ alerteEmail: "gestion@stcbatiment.fr" }))).toEqual([])
    expect(validerReglages(avec({ alerteEmail: "pas-un-mail" }))[0]).toMatch(/alerte/)
    expect(validerReglages(avec({ emailTest: "mahdi@" }))[0]).toMatch(/test/)
  })

  it("n'accepte qu'une adresse d'envoi sur le domaine vérifié chez Resend", () => {
    expect(DOMAINE_ENVOI).toBe("crm.stcbatiment.fr")
    expect(validerReglages(avec({ adresseEnvoi: "recrutement@stcbatiment.fr" }))[0]).toMatch(/crm\.stcbatiment\.fr/)
    expect(validerReglages(avec({ adresseEnvoi: "" }))[0]).toMatch(/adresse d'envoi/)
    expect(validerReglages(avec({ adresseEnvoi: "@crm.stcbatiment.fr" }))).toHaveLength(1)
    expect(validerReglages(avec({ adresseEnvoi: "Recrutement@CRM.stcbatiment.fr " }))).toEqual([]) // casse et espace tolérés
  })

  it("cumule toutes les erreurs en une seule passe", () => {
    const erreurs = validerReglages(avec({ plafondJour: 0, cadenceSmsMs: 1, jours: [], seuilErreursPct: 0 }))
    expect(erreurs).toHaveLength(4)
  })
})

describe("emailValide", () => {
  it("juge une adresse simple", () => {
    expect(emailValide("a@b.fr")).toBe(true)
    expect(emailValide(" a@b.fr ")).toBe(true)
    expect(emailValide("a b@c.fr")).toBe(false)
    expect(emailValide("a@b")).toBe(false)
  })
})

describe("JOURS_SEMAINE", () => {
  it("compte 7 jours numérotés 1 (lundi) à 7 (dimanche), avec un libellé court et long", () => {
    expect(JOURS_SEMAINE.map((j) => j.n)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(JOURS_SEMAINE[0]).toEqual({ n: 1, court: "Lun", long: "Lundi" })
    expect(JOURS_SEMAINE[6]).toEqual({ n: 7, court: "Dim", long: "Dimanche" })
  })
})

describe("extraireReglages / memesReglages", () => {
  it("n'emporte jamais l'interrupteur ni l'objectif global vers la base", () => {
    const r = extraireReglages(avec({ actif: true, objectifHebdo: 9 })) as Record<string, unknown>
    expect(r).not.toHaveProperty("actif")
    expect(r).not.toHaveProperty("objectifHebdo")
    expect(r).not.toHaveProperty("actifDepuis")
    expect(Object.keys(r).sort()).toEqual([...CHAMPS_REGLAGES].sort())
  })

  it("dit si l'écran a changé quelque chose (l'interrupteur ne compte pas)", () => {
    expect(memesReglages(base, avec({ actif: true }))).toBe(true)
    expect(memesReglages(base, avec({ plafondJour: 101 }))).toBe(false)
    expect(memesReglages(base, avec({ jours: [1, 2, 3, 4, 5, 6] }))).toBe(false)
  })
})

describe("ligneEtatMachine", () => {
  it("dit depuis quand la machine marche ou est arrêtée, en français", () => {
    const marche = ligneEtatMachine({ actif: true, actifDepuis: "2026-10-08T07:12:00.000Z", arreteLe: null })
    expect(marche).toMatch(/^Machine en marche depuis le .*2026/)
    const arret = ligneEtatMachine({ actif: false, actifDepuis: null, arreteLe: "2026-10-01T16:00:00.000Z" })
    expect(arret).toMatch(/^Machine à l'arrêt depuis le .*2026/)
  })
  it("reste lisible sans date", () => {
    expect(ligneEtatMachine({ actif: true, actifDepuis: null, arreteLe: null })).toBe("Machine en marche.")
    expect(ligneEtatMachine({ actif: false, actifDepuis: null, arreteLe: null })).toBe("Machine à l'arrêt.")
  })
})
