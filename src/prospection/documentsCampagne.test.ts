import { describe, expect, it } from "vitest"
import { documentsCites, fusionnerDocuments, lienDocument, lireDocumentsAjoutes, remplacerDocuments, variablesInconnues } from "./documentsCampagne"
import moteur from "../../supabase/functions/campagnes-moteur/index.ts?raw"
import { DOCUMENTS_NOMMES } from "./documentsCampagne"

const doc = (nom: string, chemin: string) => ({ nom, chemin, url: `https://x/${chemin}`, taille: 1 })

describe("documents dans les campagnes", () => {
  it("insère un lien lisible vers le document", () => {
    expect(lienDocument(doc("Plaquette Remise en état (2).pdf", "abc.pdf"))).toBe("[Plaquette Remise en état]({{document:abc.pdf}})")
  })
  it("retrouve les documents cités et les ouvre dans l'aperçu", () => {
    const t = "Voir [A]({{document:a.pdf}}) et [B]({{lien_plaquette}}) et encore {{document:a.pdf}}"
    expect(documentsCites(t)).toEqual(["a.pdf"])
    expect(remplacerDocuments(t, "https://s/")).toBe("Voir [A](https://s/a.pdf) et [B](https://s/801aeb9d-311d-48a8-ba02-97c96754dfa2.pdf) et encore https://s/a.pdf")
  })
  it("signale ce qui partirait tel quel", () => {
    expect(variablesInconnues("{{lien_plaquete}} {{lien_site}} {{prenom}}")).toEqual(["{{lien_plaquete}}"])
    expect(variablesInconnues("{{document:a.pdf}} {{document:b.pdf}} {{document: c d}}", [doc("A", "a.pdf")])).toEqual(["{{document:b.pdf}}", "{{document: c d}}"])
    expect(variablesInconnues("{{document:b.pdf}}")).toEqual([])
  })
  it("relit la liste enregistrée sans casser, et fusionne sans doublon", () => {
    expect(lireDocumentsAjoutes("pas du json")).toEqual([])
    expect(lireDocumentsAjoutes(JSON.stringify([doc("A", "a.pdf"), { nom: "x" }]))).toHaveLength(1)
    expect(fusionnerDocuments([doc("B", "b.pdf")], [doc("A", "a.pdf"), doc("B bis", "b.pdf")]).map((d) => d.chemin)).toEqual(["a.pdf", "b.pdf"])
  })
  it("le moteur connaît les mêmes documents nommés, et les {{document:…}}", () => {
    for (const [variable, fichier] of Object.entries(DOCUMENTS_NOMMES)) expect(moteur).toContain(`"${variable}": "${fichier}"`)
    expect(moteur).toContain("{{document:")
  })
})
