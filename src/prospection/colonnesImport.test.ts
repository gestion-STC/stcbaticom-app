import { describe, expect, it } from "vitest"
import { appliquerColonnes, devinerColonnes, IGNORER, indexEntete } from "./colonnesImport"
import { estEntete, preparerLignes } from "../demarchage/importAgences"

describe("les colonnes d'un import", () => {
  it("devine les colonnes d'un fichier de gestionnaires", () => {
    expect(devinerColonnes(["Nom agence", "CP", "Tél", "Gestionnaire", "Email contact", "Portable", "Couleur"], "agences")).toEqual(["Agence", "Code postal", "Téléphone", "Contact", "E-mail du contact", "Ligne directe", IGNORER])
  })
  it("devine les colonnes d'un fichier de sous-traitants", () => {
    expect(devinerColonnes(["Raison sociale", "Gérant", "Email", "Mobile", "Activité", "Code postal"], "artisans")).toEqual(["Entreprise", "Contact", "E-mail", "Téléphone", "Métier", "Zone"])
  })
  it("n'attribue pas deux colonnes au même champ", () => {
    expect(devinerColonnes(["Email", "Mail bis"], "artisans")).toEqual(["E-mail", IGNORER])
  })
  it("trouve la ligne des titres, même après des lignes vides", () => expect(indexEntete([["", " "], ["Agence", "Tel"]])).toBe(1))
  it("réécrit seulement la ligne des titres", () => {
    expect(appliquerColonnes([["a", "b"], ["1", "2"]], ["Agence", IGNORER])).toEqual([["Agence", ""], ["1", "2"]])
  })
  it("l'import des agences lit les titres réécrits", () => {
    const titres = ["Agence", "Code postal", "Téléphone", "Contact", "E-mail du contact", "Ligne directe"]
    expect(estEntete(titres)).toBe(true)
    const p = preparerLignes(appliquerColonnes([["Nom", "CP", "Tel", "Gest", "Mail", "GSM"], ["Orpi Monge", "75005", "0145000000", "Sophie Martin", "sophie@orpi.fr", "0612345678"]], titres))
    expect(p.lignes[0]).toMatchObject({ nom: "Orpi Monge", secteur: "75005", contactNom: "Sophie Martin", contactEmail: "sophie@orpi.fr" })
  })
})
