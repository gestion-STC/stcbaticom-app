import { describe, it, expect } from "vitest"
import { fusionnerChamps } from "./prospectsDb"
import type { Prospect } from "../data"

// Fabrique un prospect minimal pour les tests.
function p(over: Partial<Prospect>): Prospect {
  return {
    entreprise: "",
    contact: "",
    telephone: "",
    email: "",
    adresse: "",
    arrondissement: "",
    commentaire: "",
    type: "Gestionnaire locatif",
    statut: "Nouveau prospect",
    priorite: "Moyenne",
    prochaineRelance: "—",
    ...over,
  }
}

describe("fusionnerChamps", () => {
  it("garde la valeur de la fiche conservée quand elle est renseignée", () => {
    const garde = p({ email: "garde@x.fr" })
    const autre = p({ email: "autre@x.fr" })
    expect(fusionnerChamps(garde, [autre]).email).toBe("garde@x.fr")
  })

  it("comble un trou de la fiche conservée avec l'autre fiche", () => {
    const garde = p({ email: "" })
    const autre = p({ email: "autre@x.fr", telephone: "0102030405" })
    const r = fusionnerChamps(garde, [autre])
    expect(r.email).toBe("autre@x.fr")
    expect(r.telephone).toBe("0102030405")
  })

  it("fusionne les commentaires distincts (sans doublon)", () => {
    const garde = p({ commentaire: "A" })
    const autre1 = p({ commentaire: "B" })
    const autre2 = p({ commentaire: "A" }) // doublon → non répété
    const r = fusionnerChamps(garde, [autre1, autre2])
    expect(r.commentaire).toContain("A")
    expect(r.commentaire).toContain("B")
    // "A" ne doit apparaître qu'une seule fois
    expect(r.commentaire.match(/A/g)?.length).toBe(1)
  })
})
