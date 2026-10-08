import { describe, it, expect } from "vitest"
import { chronologie } from "./chronologieArtisan"
import type { EnvoiST, EtapeST, SousTraitant } from "../recrutement"

const fiche = (p: Partial<SousTraitant>): SousTraitant => ({
  entreprise: "X", contact: "", email: "x@x.fr", telephone: "0612345678", metier: "Électricité", zone: "", statut: "en_sequence",
  etapeCourante: 0, nbClics: 0, nbEnvoisOk: 0, nbEnvoisErreur: 0, ...p,
})
const etapes: EtapeST[] = [
  { id: "e0", sequenceId: "s", ordre: 0, canal: "email", delaiJours: 0, objet: "Bienvenue", contenu: "", actif: true },
  { id: "e2", sequenceId: "s", ordre: 2, canal: "sms", delaiJours: 6, objet: "", contenu: "", actif: true },
]
const envoi = (p: Partial<EnvoiST>): EnvoiST => ({ id: "v", sousTraitantId: "a", etapeId: "e0", canal: "email", envoyeLe: "2026-08-05T10:00:00Z", statut: "envoye", erreur: "", cause: "", tentative: 1, ...p })

describe("chronologie", () => {
  it("raconte la fiche dans l'ordre, avec le nom de l'étape et ce qu'il s'est passé", () => {
    const st = fiche({ demarreLe: "2026-08-05T09:00:00Z", statutMotif: "campagne Électricité", deposeLe: "2026-08-17T10:40:00Z", statut: "depose" })
    const envois = [
      envoi({}),
      envoi({ id: "v2", etapeId: "e2", canal: "sms", envoyeLe: "2026-08-11T09:30:00Z", statut: "erreur", cause: "Ringover : SMS trop rapprochés", rejouerApres: "2026-08-11T09:45:00Z" }),
      envoi({ id: "v3", etapeId: "e2", canal: "sms", envoyeLe: "2026-08-11T09:46:00Z", tentative: 2 }),
    ]
    const ev = chronologie(st, envois, [{ id: "c", sousTraitantId: "a", cliqueLe: "2026-08-10T18:42:00Z", destination: "candidature" }], [{ id: "m", sens: "entrant", objet: "Re: Bienvenue", date: "2026-08-20T14:10:00Z", lu: false, extrait: "Bonjour…" }], etapes)
    expect(ev.map((e) => e.texte)).toEqual([
      "Démarré",
      "E-mail J+0 · Bienvenue envoyé",
      "A cliqué « candidater »",
      "SMS J+6 en erreur",
      "SMS J+6 envoyé",
      "Dossier déposé sur le site",
      "A répondu : Re: Bienvenue",
    ])
    expect(ev[0].detail).toBe("campagne Électricité")
    expect(ev[3].role).toBe("erreur")
    expect(ev[3].detail).toContain("Ringover : SMS trop rapprochés")
    expect(ev[4].detail).toBe("rejoué (tentative 2)")
    expect(ev[5].detail).toBe("séquence arrêtée")
  })

  it("dit comment l'artisan s'est désinscrit, et signale un calendrier recalé", () => {
    const st = fiche({ demarreLe: "2026-10-09T09:00:00Z", recaleLe: "2026-10-09T09:00:00Z", desinscritLe: "2026-10-10T08:00:00Z", desinscritCanal: "lien", statut: "desinscrit" })
    const ev = chronologie(st, [], [], [], etapes)
    expect(ev.map((e) => e.texte)).toEqual(["Démarré (calendrier recalé)", "Désinscrit"])
    expect(ev[1].detail).toBe("par le lien de désinscription")
  })

  it("une fiche jamais démarrée n'a pas d'histoire", () => {
    expect(chronologie(fiche({}), [], [], [], etapes)).toEqual([])
  })
})
