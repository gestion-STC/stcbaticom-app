// La passerelle des avis (Mahdi, 11/11/2026) : qui reçoit une demande d'avis.
import { describe, expect, it } from "vitest"
import { aRetirer, aSolliciter, numeroFactice, versAvisContact, type LigneAvisStc } from "../../supabase/functions/synchro-clients/avisRegles"

const maintenant = new Date("2026-11-11T10:00:00Z")
const jours = (n: number) => new Date(maintenant.getTime() - n * 86_400_000).toISOString()
const l = (p: Partial<LigneAvisStc>): LigneAvisStc => ({ ref: "os:1", public: "locataires", nom: "Claire Dubois", personne: "Claire Dubois", email: "claire@exemple.fr", telephone: "", fin_le: jours(5), detail: "", ...p })

describe("à qui demander un avis", () => {
  it("un locataire : dès la fin du chantier (la campagne choisit quand), pas au-delà d'un an", () => {
    expect(aSolliciter([l({ fin_le: jours(0) })], maintenant)).toHaveLength(1)
    expect(aSolliciter([l({ fin_le: jours(200) })], maintenant)).toHaveLength(1)
    expect(aSolliciter([l({ fin_le: jours(400) })], maintenant)).toHaveLength(0)
    expect(aSolliciter([l({ fin_le: null })], maintenant)).toHaveLength(0)
  })
  it("sans mail ni téléphone, personne ; un téléphone seul suffit (SMS)", () => {
    expect(aSolliciter([l({ email: "", telephone: "" })], maintenant)).toHaveLength(0)
    expect(aSolliciter([l({ email: "", telephone: "06 12 34 56 78" })], maintenant)).toHaveLength(1)
  })
  it("un sous-traitant actif, toujours", () => {
    expect(aSolliciter([l({ public: "sous_traitants_actifs", fin_le: null })], maintenant)).toHaveLength(1)
  })
  it("la ligne gardée ne touche pas à la désinscription", () => {
    const v = versAvisContact(l({ email: " Claire@Exemple.fr " }), maintenant)
    expect(v.email).toBe("claire@exemple.fr")
    expect(v).not.toHaveProperty("desinscrit")
    expect(v.ref_stc).toBe("os:1")
  })
  it("un numéro factice ne compte pas (16/11/2026)", () => {
    expect(numeroFactice("0000000000")).toBe(true)
    expect(numeroFactice("+33 6 00 00 00 00")).toBe(true)
    expect(numeroFactice("06 12 34 56 78")).toBe(false)
    expect(aSolliciter([l({ email: "", telephone: "0000000000" })], maintenant)).toHaveLength(0)
    expect(versAvisContact(l({ telephone: "33000000000" }), maintenant).mobile).toBe("")
  })
  it("ceux que STC Bâtiment ne renvoie plus sortent, sauf déjà en campagne ou en cas de panne", () => {
    const ex = [{ id: "a", ref_stc: "os:1" }, { id: "b", ref_stc: "os:2" }, { id: "c", ref_stc: "os:3" }, { id: "d", ref_stc: null }]
    expect(aRetirer(ex, ["os:1"], new Set(["c"]))).toEqual(["b"])
    expect(aRetirer(ex, [], new Set())).toEqual([])
  })
})
