// La passerelle des avis (Mahdi, 11/11/2026) : qui reçoit une demande d'avis.
import { describe, expect, it } from "vitest"
import { aSolliciter, versAvisContact, type LigneAvisStc } from "../../supabase/functions/synchro-clients/avisRegles"

const maintenant = new Date("2026-11-11T10:00:00Z")
const jours = (n: number) => new Date(maintenant.getTime() - n * 86_400_000).toISOString()
const l = (p: Partial<LigneAvisStc>): LigneAvisStc => ({ ref: "os:1", public: "locataires", nom: "Claire Dubois", personne: "Claire Dubois", email: "claire@exemple.fr", telephone: "", fin_le: jours(5), detail: "", ...p })

describe("à qui demander un avis", () => {
  it("un locataire : quelques jours après la fin du chantier, et pas pour un chantier trop ancien", () => {
    expect(aSolliciter([l({ fin_le: jours(1) })], maintenant)).toHaveLength(0)
    expect(aSolliciter([l({ fin_le: jours(5) })], maintenant)).toHaveLength(1)
    expect(aSolliciter([l({ fin_le: jours(200) })], maintenant)).toHaveLength(0)
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
})
