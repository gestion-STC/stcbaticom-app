import { describe, expect, it } from "vitest"
import { appliquerIA, concerneIA, fichePauvre, messageIA, reglageIADepart } from "./ia"
import ecran from "./ia.ts?raw"
import serveur from "../../supabase/functions/_shared/campagnes/ia.ts?raw"

const n = (s: string) => s.replace(/\r\n/g, "\n")
describe("personnalisation par l'IA", () => {
  it("le serveur a la même copie que l'écran", () => expect(n(serveur)).toBe(n(ecran)))
  it("place le texte à la balise, ou après la salutation", () => {
    expect(appliquerIA("Bonjour,\n\n{{accroche_ia}}\n\nSuite", "accroche", "X")).toBe("Bonjour,\n\nX\n\nSuite")
    expect(appliquerIA("Bonjour,\n\nSuite", "accroche", "X")).toBe("Bonjour,\n\nX\n\nSuite")
  })
  it("retire la balise si la fiche est trop pauvre", () => expect(appliquerIA("Bonjour,\n\n{{accroche_ia}}\n\nSuite", "accroche", "")).toBe("Bonjour,\n\nSuite"))
  it("remplace le mail entier", () => expect(appliquerIA("Modèle", "mail", "Tout")).toBe("Tout"))
  it("repère une fiche sans rien à citer", () => {
    const r = reglageIADepart("agences")
    expect(fichePauvre(r, { entreprise: "A", secteur: "" })).toBe(true)
    expect(fichePauvre(r, { entreprise: "A", secteur: "Paris" })).toBe(false)
  })
  it("garde toujours la même moitié", () => {
    const r = { ...reglageIADepart("agences"), qui: "moitie" as const }
    expect(concerneIA(r, { id: "abc", champs: {} })).toBe(concerneIA(r, { id: "abc", champs: {} }))
  })
  it("donne à l'IA le contexte, mais seulement les champs autorisés", () => {
    const m = messageIA({ baseId: "agences", reglage: reglageIADepart("agences"), campagneNom: "C", objet: "O", corps: "B", fiche: { entreprise: "Agence A", secteur: "Paris", prenom: "Secret" }, offre: "" })
    expect(m).toContain("Cold emailing")
    expect(m).toContain("Agence A")
    expect(m).not.toContain("Secret")
  })
})
