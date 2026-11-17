import { describe, expect, it } from "vitest"
import { basculerRetire, raisonsExclusion, type Contexte } from "./audience"
import type { Contact, Envoi, Evenement, Inscription } from "./modele"
import { GARDE_DEFAUT, type Garde } from "./configCampagne"
const g = (p: Partial<Garde>): Garde => ({ ...GARDE_DEFAUT, ...p })

const k = (id: string, champs: Record<string, string> = {}) => ({ id, baseId: "agences", nom: id, personne: "", email: `${id}@x.fr`, mobile: "", telephone: "", champs, statut: "libre", desinscrit: false, proprietaireId: null }) as Contact
const ctx = (p: Partial<Contexte> = {}): Contexte => ({ campagneId: "c", garde: g({}), ecartCommun: 14, envois: [], evenements: [], inscriptions: [], maintenant: "2026-11-17T10:00:00.000Z", ...p })

describe("audience réelle", () => {
  it("garde ceux que rien n'exclut", () => {
    expect(raisonsExclusion(ctx())(k("a"))).toBeNull()
  })
  it("applique les mêmes exclusions que le moteur", () => {
    const envois = [{ campagneId: "autre", contactId: "e", statut: "envoye", le: "2026-11-10T09:00:00.000Z" }] as Envoi[]
    const evenements = [{ contactId: "r", type: "rebond" }] as Evenement[]
    const r = raisonsExclusion(ctx({ envois, evenements, garde: g({ exclusions: ["Adresse en erreur", "Pas intéressé", "01 42 24 77 00"], retires: ["x"] }) }))
    expect(r(k("e"))).toBe("Une autre campagne lui a écrit il y a moins de 14 j")
    expect(r(k("r"))).toBe("Adresse en erreur")
    expect(r(k("p", { etape: "Pas intéressé" }))).toBe("Pas intéressé")
    expect(r(k("s", { standard: "01 42 24 77 00" }))).toBe("Exclusion « 01 42 24 77 00 »")
    expect(r(k("x"))).toBe("Retiré de cette campagne")
  })
  it("ne bloque pas ceux déjà entrés, sauf s'ils sont retirés", () => {
    const inscriptions = [{ campagneId: "c", contactId: "e" }, { campagneId: "c", contactId: "x" }] as Inscription[]
    const envois = [{ campagneId: "autre", contactId: "e", statut: "envoye", le: "2026-11-16T09:00:00.000Z" }] as Envoi[]
    const r = raisonsExclusion(ctx({ inscriptions, envois, garde: g({ retires: ["x"] }) }))
    expect(r(k("e"))).toBeNull()
    expect(r(k("x"))).toBe("Retiré de cette campagne")
  })
  it("retire puis remet", () => {
    const r1 = basculerRetire(g({}), "a")
    expect(r1.retires).toEqual(["a"])
    expect(basculerRetire(r1, "a").retires).toEqual([])
  })
})
