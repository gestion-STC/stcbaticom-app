import { describe, expect, it } from "vitest"
import type { Email, PieceJointe } from "../emails"
import { basculerDocument, bibliothequeDocuments, estJoint } from "./documentsBibliotheque"

const pj = (nom: string, chemin: string): PieceJointe => ({ nom, chemin, url: "https://x/" + chemin, taille: 1000 })
const email = (nom: string, pieces: PieceJointe[]): Email => ({ id: nom, nom, objet: "", corps: "", ordre: 0, pieces })

describe("bibliothèque des documents", () => {
  it("réunit les pièces de tous les modèles, sans doublon de nom, triées", () => {
    const docs = bibliothequeDocuments([
      email("Prospection", [pj("Plaquette STC Bâtiment – Service gestion locative.pdf", "a.pdf"), pj("Kbis STC Bâtiment (24-07-2026).pdf", "b.pdf")]),
      email("Compte-rendu", [pj("Plaquette STC Bâtiment – Service gestion locative.pdf", "c.pdf"), pj("Attestation d'assurance STC Bâtiment (SMA BTP).pdf", "d.pdf")]),
    ])
    expect(docs.map((d) => d.nom)).toEqual(["Attestation d'assurance STC Bâtiment (SMA BTP).pdf", "Kbis STC Bâtiment (24-07-2026).pdf", "Plaquette STC Bâtiment – Service gestion locative.pdf"])
    expect(docs.find((d) => d.nom.startsWith("Plaquette"))?.chemin).toBe("a.pdf")
  })
  it("ignore « (7) » et la casse pour reconnaître un même document", () => {
    const docs = bibliothequeDocuments([email("A", [pj("Plaquette_STC (7).pdf", "a.pdf")]), email("B", [pj("plaquette_stc.pdf", "b.pdf")])])
    expect(docs).toHaveLength(1)
  })
  it("joint puis retire un document", () => {
    const kbis = pj("Kbis.pdf", "k.pdf")
    expect(estJoint(kbis, [])).toBe(false)
    const avec = basculerDocument(kbis, [])
    expect(avec).toHaveLength(1)
    expect(estJoint(kbis, avec)).toBe(true)
    expect(basculerDocument(kbis, avec)).toHaveLength(0)
  })
  it("reconnaît le même document joint sous un autre fichier", () => {
    const dansModele = pj("Kbis STC Bâtiment.pdf", "x.pdf"), dansBiblio = pj("Kbis STC Bâtiment.pdf", "y.pdf")
    expect(estJoint(dansBiblio, [dansModele])).toBe(true)
    expect(basculerDocument(dansBiblio, [dansModele])).toHaveLength(0)
  })
})
