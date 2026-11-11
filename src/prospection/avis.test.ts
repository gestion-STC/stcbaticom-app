import { describe, expect, it } from "vitest"
import { AVIS_DEPART, aRappeler, citationAvis, estBaseAvis, pretPourAvis } from "./avis"
import ecran from "./avis.ts?raw"
import serveur from "../../supabase/functions/_shared/campagnes/avis.ts?raw"

describe("les avis", () => {
  it("le serveur a la même copie que l'écran", () => {
    const n = (s: string) => s.replace(/\r\n/g, "\n")
    expect(n(serveur)).toBe(n(ecran))
  })
  it("le délai après la fin du chantier se règle", () => {
    const m = new Date("2026-11-11T10:00:00Z"), il = (j: number) => new Date(m.getTime() - j * 86_400_000).toISOString()
    expect(pretPourAvis(il(1), AVIS_DEPART, m)).toBe(false)
    expect(pretPourAvis(il(4), AVIS_DEPART, m)).toBe(true)
    expect(pretPourAvis(il(150), AVIS_DEPART, m)).toBe(false)
    expect(pretPourAvis(il(0.1), { delaiJours: 0, fenetreJours: 120 }, m)).toBe(true)
    expect(pretPourAvis(null, AVIS_DEPART, m)).toBe(true)
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
