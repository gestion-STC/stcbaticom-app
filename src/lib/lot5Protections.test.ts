// Lot 5 (26/11/2026) : protections contre les pertes, côté écran.
import { describe, expect, it, vi } from "vitest"
import { statutSansDossier } from "./machineDb"
import { ceQuiDisparait, raisonsDeGarder, type BilanSuppression } from "./suppressionArtisan"
import { gardeActive, peutQuitter, poserGarde } from "./gardeQuitter"
import { chronologie } from "./chronologieArtisan"
import type { EnvoiST, SousTraitant } from "../recrutement"

const vide: BilanSuppression = { envois: 0, clics: 0, appels: 0, qualifications: 0, contrats: 0, formations: 0, dossiers: 0 }
const fiche = (p: Partial<SousTraitant> = {}): SousTraitant => ({
  entreprise: "X", contact: "", email: "x@x.fr", telephone: "", metier: "", zone: "", statut: "en_sequence",
  etapeCourante: 0, nbClics: 0, nbEnvoisOk: 0, nbEnvoisErreur: 0, ...p,
})

describe("statutSansDossier : la fiche quittée par un dossier mal rattaché", () => {
  it("reprend sa séquence si elle avait démarré", () => {
    expect(statutSansDossier({ demarreLe: "2026-11-01T10:00:00Z", sequenceId: "s" })).toBe("en_sequence")
  })
  it("redevient à contacter si elle n'avait jamais démarré", () => {
    expect(statutSansDossier({})).toBe("a_contacter")
  })
  it("garde un arrêt antérieur : désinscrite, injoignable, terminée", () => {
    expect(statutSansDossier({ desinscritLe: "x", demarreLe: "x", sequenceId: "s" })).toBe("desinscrit")
    expect(statutSansDossier({ injoignableLe: "x", demarreLe: "x", sequenceId: "s" })).toBe("injoignable")
    expect(statutSansDossier({ termineLe: "x", demarreLe: "x", sequenceId: "s" })).toBe("termine")
  })
  it("démarrée mais sans séquence (supprimée) : terminée, pas relancée", () => {
    expect(statutSansDossier({ demarreLe: "x", sequenceId: null })).toBe("termine")
  })
})

describe("suppression définitive d'une fiche artisan", () => {
  it("refusée avec un contrat, un dossier déposé ou une formation", () => {
    expect(raisonsDeGarder(fiche(), { ...vide, contrats: 2 })).toEqual(["2 contrats"])
    expect(raisonsDeGarder(fiche({ statut: "depose" }), vide)).toEqual(["un dossier déposé"])
    expect(raisonsDeGarder(fiche({ contratStatut: "signe" as SousTraitant["contratStatut"] }), vide)).toEqual(["un contrat"])
    expect(raisonsDeGarder(fiche(), { ...vide, formations: 1, dossiers: 1 })).toEqual(["un dossier déposé", "une formation"])
  })
  it("permise sinon, et le dialogue liste ce qui disparaît", () => {
    const b = { ...vide, envois: 12, clics: 1, appels: 3, qualifications: 1 }
    expect(raisonsDeGarder(fiche(), b)).toEqual([])
    expect(ceQuiDisparait(b)).toEqual(["12 envois (e-mails et SMS) de son historique", "1 clic", "3 appels notés", "sa qualification"])
    expect(ceQuiDisparait(vide)).toEqual([])
  })
})

describe("garde avant de quitter un éditeur", () => {
  it("sans modification, on part sans question", () => {
    poserGarde(null)
    const confirmer = vi.fn(() => false)
    expect(peutQuitter(confirmer)).toBe(true)
    expect(confirmer).not.toHaveBeenCalled()
  })
  it("avec modifications : on demande, un refus retient, un accord lève la garde", () => {
    poserGarde("Quitter ?")
    expect(peutQuitter(() => false)).toBe(false)
    expect(gardeActive()).toBe(true)
    expect(peutQuitter(() => true)).toBe(true)
    expect(gardeActive()).toBe(false)
  })
})

describe("chronologie : l'envoi d'une étape supprimée reste, avec son nom", () => {
  it("affiche le libellé conservé", () => {
    const e: EnvoiST = { id: "e", sousTraitantId: "s", etapeId: null, etapeLibelle: "E-mail J+0 · Rejoignez STC", canal: "email", envoyeLe: "2026-11-01T10:00:00Z", statut: "envoye", erreur: "", cause: "", tentative: 1 }
    const ev = chronologie(fiche(), [e], [], [], [])
    expect(ev[0].texte).toBe("E-mail J+0 · Rejoignez STC (étape supprimée) envoyé")
  })
})
