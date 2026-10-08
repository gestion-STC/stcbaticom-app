import { describe, it, expect } from "vitest"
import { construire, dedoublonner, normaliserEmail, normaliserTelephone } from "./importSousTraitants"
import type { SousTraitant } from "../recrutement"

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

  it("reconnaît la colonne Source (origine de l'artisan)", () => {
    const lignes = [
      ["Entreprise", "Email", "Téléphone", "Métier", "Source"],
      ["Plomberie Martin", "jean@martin.fr", "0612345678", "Plombier", "Pages Jaunes"],
    ]
    const { sousTraitants } = construire(lignes)
    expect(sousTraitants[0].source).toBe("Pages Jaunes")
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

describe("import sous-traitants — normalisations", () => {
  it("normaliserEmail : minuscules, sans espaces", () => {
    expect(normaliserEmail(" Jean.Martin@Plomberie.FR ")).toBe("jean.martin@plomberie.fr")
    expect(normaliserEmail("a b@c.fr")).toBe("ab@c.fr")
    expect(normaliserEmail(undefined)).toBe("")
  })

  it("normaliserTelephone : chiffres seulement, +33 / 0033 / 33 → 0", () => {
    expect(normaliserTelephone("06 12 34 56 78")).toBe("0612345678")
    expect(normaliserTelephone("+33 6 12 34 56 78")).toBe("0612345678")
    expect(normaliserTelephone("0033 6 12 34 56 78")).toBe("0612345678")
    expect(normaliserTelephone("33612345678")).toBe("0612345678")
    expect(normaliserTelephone("06.12.34.56.78")).toBe("0612345678")
    // Le 0 initial perdu par Excel (9 chiffres) est rétabli.
    expect(normaliserTelephone("612345678")).toBe("0612345678")
    expect(normaliserTelephone("")).toBe("")
    expect(normaliserTelephone(null)).toBe("")
  })
})

describe("import sous-traitants — dedoublonner", () => {
  const fiche = (email: string, telephone: string, entreprise = "X"): Partial<SousTraitant> => ({ entreprise, email, telephone })

  it("garde tout quand rien n'est connu", () => {
    const r = dedoublonner([fiche("a@b.fr", "0612345678"), fiche("c@d.fr", "0698765432")], [], [])
    expect(r.aAjouter).toHaveLength(2)
    expect(r.doublons).toBe(0)
    expect(r.exclus).toBe(0)
  })

  it("écarte un doublon par e-mail, quelle que soit la casse ou les espaces", () => {
    const r = dedoublonner([fiche("Jean@Martin.FR ", "")], [{ email: "jean@martin.fr", telephone: "" }], [])
    expect(r.aAjouter).toHaveLength(0)
    expect(r.doublons).toBe(1)
  })

  it("écarte un doublon par téléphone sous ses trois écritures (06…, +33 6…, 0033 6…)", () => {
    const existantes = [{ email: "", telephone: "06 12 34 56 78" }]
    const r = dedoublonner(
      [fiche("", "0612345678"), fiche("", "+33 6 12 34 56 78"), fiche("", "0033 6 12 34 56 78"), fiche("", "0699999999")],
      existantes,
      [],
    )
    expect(r.doublons).toBe(3)
    expect(r.aAjouter).toHaveLength(1)
    expect(r.aAjouter[0].telephone).toBe("0699999999")
  })

  it("un e-mail connu suffit même si le téléphone est nouveau (et inversement)", () => {
    const existantes = [{ email: "a@b.fr", telephone: "0611111111" }]
    const r = dedoublonner([fiche("a@b.fr", "0622222222"), fiche("z@z.fr", "+33611111111")], existantes, [])
    expect(r.doublons).toBe(2)
    expect(r.aAjouter).toHaveLength(0)
  })

  it("écarte les fiches de la liste d'exclusion, par e-mail ou par téléphone", () => {
    const exclusions = [{ email: "stop@x.fr", telephone: "" }, { email: "", telephone: "+33 6 55 55 55 55" }]
    const r = dedoublonner([fiche("STOP@x.fr", "0600000000"), fiche("ok@x.fr", "06 55 55 55 55"), fiche("ok2@x.fr", "0600000001")], [], exclusions)
    expect(r.exclus).toBe(2)
    expect(r.doublons).toBe(0)
    expect(r.aAjouter).toHaveLength(1)
    expect(r.aAjouter[0].email).toBe("ok2@x.fr")
  })

  it("l'exclusion prime sur le doublon (un désinscrit est aussi dans la base)", () => {
    const r = dedoublonner([fiche("stop@x.fr", "")], [{ email: "stop@x.fr", telephone: "" }], [{ email: "stop@x.fr", telephone: "" }])
    expect(r.exclus).toBe(1)
    expect(r.doublons).toBe(0)
  })

  it("dédoublonne aussi à l'intérieur du fichier importé", () => {
    const r = dedoublonner(
      [fiche("a@b.fr", "0612345678"), fiche("A@B.FR", ""), fiche("", "+33 6 12 34 56 78"), fiche("autre@b.fr", "")],
      [],
      [],
    )
    expect(r.aAjouter).toHaveLength(2)
    expect(r.doublons).toBe(2)
  })

  it("ne confond pas deux fiches sans e-mail ni téléphone comparable", () => {
    const r = dedoublonner([fiche("", ""), fiche("", "")], [{ email: "", telephone: "" }], [{ email: "", telephone: "" }])
    expect(r.aAjouter).toHaveLength(2)
    expect(r.doublons).toBe(0)
    expect(r.exclus).toBe(0)
  })
})
