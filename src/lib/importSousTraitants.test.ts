import { describe, it, expect } from "vitest"
import { construire } from "./importSousTraitants"

describe("import sous-traitants — construire", () => {
  it("reconnaît les colonnes par leur en-tête", () => {
    const lignes = [
      ["Entreprise", "Contact", "Email", "Téléphone", "Métier", "Ville"],
      ["Plomberie Martin", "Jean Martin", "jean@martin.fr", "06 12 34 56 78", "Plombier", "Lyon"],
    ]
    const { sousTraitants, ignorees } = construire(lignes)
    expect(ignorees).toBe(0)
    expect(sousTraitants).toHaveLength(1)
    const st = sousTraitants[0]
    expect(st.entreprise).toBe("Plomberie Martin")
    expect(st.contact).toBe("Jean Martin")
    expect(st.email).toBe("jean@martin.fr")
    expect(st.telephone).toBe("06 12 34 56 78")
    expect(st.metier).toBe("Plombier")
    expect(st.zone).toBe("Lyon")
    expect(st.statut).toBe("a_contacter")
  })

  it("écarte les lignes sans e-mail ni téléphone (inutilisables pour relancer)", () => {
    const lignes = [
      ["Entreprise", "Email", "Téléphone"],
      ["Avec mail", "a@b.fr", ""],
      ["Sans rien", "", ""],
      ["Avec tel", "", "0612345678"],
    ]
    const { sousTraitants, ignorees } = construire(lignes)
    expect(sousTraitants).toHaveLength(2)
    expect(ignorees).toBe(1)
  })

  it("retrouve e-mail et téléphone même sans en-tête (détection par contenu)", () => {
    const lignes = [["Élec Dupont", "contact@elec.fr", "06.98.76.54.32", "Électricien"]]
    const { sousTraitants } = construire(lignes)
    expect(sousTraitants).toHaveLength(1)
    expect(sousTraitants[0].email).toBe("contact@elec.fr")
    // Le téléphone est reformaté (groupé par 2).
    expect(sousTraitants[0].telephone).toBe("06 98 76 54 32")
  })
})
