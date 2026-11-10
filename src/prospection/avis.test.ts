import { describe, expect, it } from "vitest"
import { aRappeler, citationAvis, estBaseAvis } from "./avis"
import ecran from "./avis.ts?raw"
import serveur from "../../supabase/functions/_shared/campagnes/avis.ts?raw"

describe("les avis", () => {
  it("le serveur a la même copie que l'écran", () => {
    const n = (s: string) => s.replace(/\r\n/g, "\n")
    expect(n(serveur)).toBe(n(ecran))
  })
  it("reconnaît les bases d'avis", () => {
    expect(estBaseAvis("locataires")).toBe(true)
    expect(estBaseAvis("agences")).toBe(false)
  })
  it("remonte les notes de 3 ou moins", () => {
    expect(aRappeler(3)).toBe(true)
    expect(aRappeler(4)).toBe(false)
  })
  it("cite l'avis tel quel, avec sa date", () => {
    expect(citationAvis({ commentaire: " Très réactifs ", nomAffiche: "Claire M.", note: 5, creeLe: "2026-11-10T12:00:00Z" })).toBe("« Très réactifs » — Claire M., 5/5, avis du 10/11/2026")
  })
  it("a un nom par défaut", () => expect(citationAvis({ commentaire: "Bien", nomAffiche: "", note: 4, creeLe: "2026-11-10T12:00:00Z" })).toContain("Client STC Bâtiment"))
})
