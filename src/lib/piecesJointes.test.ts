import { describe, expect, it } from "vitest"
import { composer, piecesAEnvoyer, piecesTropLourdes } from "./envoiEmail"
import { extensionEtType } from "./stockage"

// Les documents partent en vraies pièces jointes PDF, plus en liens (Mahdi, 05/11/2026).
describe("pièces jointes", () => {
  const kbis = { nom: "Kbis.pdf", url: "https://x.supabase.co/storage/v1/object/public/pieces-jointes/a.pdf", taille: 51829, chemin: "a.pdf" }

  it("le corps ne contient plus de liens vers les documents", () => {
    const { corpsHtml } = composer({ nom: "m", objet: "o", corps: "Bonjour", ordre: 0, pieces: [kbis] }, { entreprise: "", contact: "", telephone: "", email: "", arrondissement: "" } as never, "")
    expect(corpsHtml).not.toContain("Pièces jointes")
    expect(corpsHtml).not.toContain(kbis.url)
  })

  it("chaque fichier part une seule fois, avec son nom et sa taille", () => {
    expect(piecesAEnvoyer([kbis, { ...kbis, chemin: "b" }])).toEqual([{ nom: "Kbis.pdf", url: kbis.url, taille: 51829 }])
    expect(piecesAEnvoyer(undefined)).toEqual([])
  })

  it("au-delà de 35 Mo au total, l'envoi est bloqué", () => {
    expect(piecesTropLourdes([{ ...kbis, taille: 20 * 1024 * 1024 }, { ...kbis, taille: 16 * 1024 * 1024 }])).toBe(true)
    expect(piecesTropLourdes([kbis])).toBe(false)
  })

  it("un fichier sans extension n'est plus enregistré en .bin", () => {
    expect(extensionEtType("kbis", "application/pdf")).toEqual({ ext: "pdf", type: "application/pdf", nom: "kbis.pdf" })
    expect(extensionEtType("kbis", "")).toEqual({ ext: "pdf", type: "application/pdf", nom: "kbis.pdf" })
    expect(extensionEtType("RIB STC.PDF", "")).toEqual({ ext: "pdf", type: "application/pdf", nom: "RIB STC.PDF" })
    expect(extensionEtType("photo.jpg", "image/jpeg")).toEqual({ ext: "jpg", type: "image/jpeg", nom: "photo.jpg" })
  })
})
