import { describe, expect, it } from "vitest"
import { alerteLancement } from "./alerteLancement"
import type { Envoi } from "./modele"

const maintenant = "2026-11-17T12:00:00.000Z"
const env = (statut: Envoi["statut"], cause = "", le = "2026-11-17T09:00:00.000Z") => ({ campagneId: "c", statut, cause, le }) as Envoi

describe("alerteLancement", () => {
  it("alerte quand tous les envois récents sont en erreur", () => {
    const a = alerteLancement({ id: "c", statut: "active" }, [env("erreur", "boîte refusée"), env("erreur", "boîte refusée"), env("erreur", "autre")], maintenant)
    expect(a).toContain("3 envois")
    expect(a).toContain("boîte refusée")
  })
  it("se tait dès qu'un envoi est parti", () => {
    expect(alerteLancement({ id: "c", statut: "active" }, [env("erreur"), env("erreur"), env("erreur"), env("envoye")], maintenant)).toBeNull()
  })
  it("se tait sous 3 envois, hors campagne active, ou pour les erreurs anciennes", () => {
    expect(alerteLancement({ id: "c", statut: "active" }, [env("erreur"), env("erreur")], maintenant)).toBeNull()
    expect(alerteLancement({ id: "c", statut: "pause" }, [env("erreur"), env("erreur"), env("erreur")], maintenant)).toBeNull()
    const vieux = "2026-11-15T09:00:00.000Z"
    expect(alerteLancement({ id: "c", statut: "active" }, [env("erreur", "", vieux), env("erreur", "", vieux), env("erreur", "", vieux)], maintenant)).toBeNull()
  })
})
