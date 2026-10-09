import { describe, expect, it } from "vitest"
import {
  analyserLignes,
  estEntete,
  lireLigne,
  preparerLignes,
  rapprocher,
  repererColonnes,
  telephonePropre,
  trouverEmails,
  trouverTelephones,
  type AgenceConnue,
} from "./importAgences"

const sansColonnes = {}

describe("téléphones et e-mails, n'importe où sur la ligne", () => {
  it("remet le 0 qu'Excel a mangé et groupe par deux", () => {
    expect(telephonePropre("143000000")).toBe("01 43 00 00 00")
    expect(telephonePropre("+33 6 12 34 56 78")).toBe("06 12 34 56 78")
    expect(telephonePropre("0033612345678")).toBe("06 12 34 56 78")
    expect(telephonePropre("75005")).toBe("")
  })
  it("trouve deux numéros dans une même cellule, sans doublon", () => {
    expect(trouverTelephones(["Standard 01 43 00 00 00 / mobile 06.12.34.56.78", "01 43 00 00 00"])).toEqual(["01 43 00 00 00", "06 12 34 56 78"])
  })
  it("ne prend pas un code postal ni un SIRET pour un téléphone", () => {
    expect(trouverTelephones(["75005", "12345678901234"])).toEqual([])
  })
  it("trouve les e-mails en minuscules, sans doublon", () => {
    expect(trouverEmails(["Nom: Mme Dupont Mail: S.Dupont@Agence.fr", "s.dupont@agence.fr"])).toEqual(["s.dupont@agence.fr"])
  })
})

describe("une ligne sans en-tête (l'ancien Google Sheet)", () => {
  it("lit une ligne complète : nom, adresse, code postal, téléphone, e-mail et contact dans la note", () => {
    const l = lireLigne(["Century 21 Lutèce", "12 rue Monge 75005 Paris", "01 43 00 00 00", "contact@c21-lutece.fr", "Nom: Mme Dupont Mail: s.dupont@c21.fr"], 2, sansColonnes)
    expect(l).toMatchObject({
      numero: 2, nom: "Century 21 Lutèce", adresse: "12 rue Monge 75005 Paris", secteur: "75005", telephone: "01 43 00 00 00", email: "contact@c21-lutece.fr",
      enseigne: "Century 21", type: "agence", contactNom: "Mme Dupont", contactEmail: "s.dupont@c21.fr", contactLigne: "",
    })
  })
  it("garde une ligne sans téléphone si elle a un e-mail, et laisse le téléphone vide", () => {
    const l = lireLigne(["Orpi Boulogne", "92100 Boulogne", "", "orpi@boulogne.fr"], 3, sansColonnes)
    expect(l?.telephone).toBe("")
    expect(l?.email).toBe("orpi@boulogne.fr")
    expect(l?.secteur).toBe("92100")
  })
  it("range la ligne en apporteur quand le mot y est", () => {
    const l = lireLigne(["Dupont Courtage", "·", "06 12 34 56 78", "Apporteur d'affaires, M. Dupont"], 4, sansColonnes)
    expect(l?.type).toBe("apporteur")
    expect(l?.adresse).toBe("")
  })
  it("prend le 2e numéro trouvé comme ligne directe du contact", () => {
    const l = lireLigne(["Foncia Nanterre", "92000", "01 47 00 00 00", "Mme Martin 06 11 22 33 44"], 5, sansColonnes)
    expect(l?.telephone).toBe("01 47 00 00 00")
    expect(l?.contactLigne).toBe("06 11 22 33 44")
    expect(l?.contactNom).toBe("Mme Martin")
  })
  it("renvoie null pour une ligne vide", () => {
    expect(lireLigne(["", " ", ""], 1, sansColonnes)).toBeNull()
  })
})

describe("une ligne avec en-tête", () => {
  const entete = ["Agence", "Téléphone", "E-mail", "Adresse", "Code postal", "Contact", "E-mail du contact", "Ligne directe", "Type"]
  it("reconnaît l'en-tête et ses colonnes", () => {
    expect(estEntete(entete)).toBe(true)
    expect(estEntete(["Century 21", "01 43 00 00 00", ""])).toBe(false)
    expect(repererColonnes(entete)).toEqual({ nom: 0, telephone: 1, email: 2, adresse: 3, secteur: 4, contactNom: 5, contactEmail: 6, contactLigne: 7, type: 8 })
  })
  it("lit chaque colonne à sa place, dont un code postal dans l'adresse", () => {
    const cols = repererColonnes(entete)
    const l = lireLigne(["Laforêt Colombes", "0147000000", "colombes@laforet.fr", "3 av. de l'Europe, 92700 Colombes", "", "Jean Martin", "jm@laforet.fr", "", "Syndic"], 2, cols)
    expect(l).toMatchObject({ nom: "Laforêt Colombes", telephone: "01 47 00 00 00", email: "colombes@laforet.fr", secteur: "92700", contactNom: "Jean Martin", contactEmail: "jm@laforet.fr", type: "syndic", enseigne: "Laforêt" })
  })
})

describe("les doublons dans le fichier", () => {
  it("garde la première ligne et rattache le contact de la seconde", () => {
    const r = preparerLignes([
      ["Agence", "Téléphone", "Contact"],
      ["Orpi Puteaux 92800", "01 40 00 00 00", "Mme A"],
      ["ORPI  Puteaux 92800", "01 40 00 00 00", "M. B"],
      ["Autre agence", "01 41 00 00 00", ""],
    ])
    expect(r.total).toBe(3)
    expect(r.lignes.map((l) => l.nom)).toEqual(["Orpi Puteaux 92800", "Autre agence"])
    expect(r.lignes[0].autresContacts).toEqual([{ nom: "M. B", email: "", ligne: "" }])
    expect(r.ignorees).toHaveLength(1)
    expect(r.ignorees[0].raison).toContain("ligne 2")
  })
  it("ignore une ligne sans nom et une ligne injoignable, avec la raison", () => {
    const r = preparerLignes([["", "01 40 00 00 00"], ["Sans rien", "juste un commentaire"]])
    expect(r.lignes).toHaveLength(0)
    expect(r.ignorees.map((i) => i.raison)).toEqual(["Pas de nom d'agence", "Ni téléphone ni e-mail : impossible de la joindre"])
  })
})

describe("le rapprochement avec la base", () => {
  const connues: AgenceConnue[] = [
    { id: "a1", nomCle: "century 21 lutèce", secteur: "75005", telephone: "01 43 00 00 00" },
    { id: "a2", nomCle: "orpi", secteur: "92100", telephone: "01 46 00 00 00" },
  ]
  it("reconnaît le même nom dans le même secteur, ou le même standard", () => {
    const { lignes } = preparerLignes([
      ["Century 21 Lutèce", "75005", "01 99 99 99 99"], // même nom + secteur, autre numéro
      ["Orpi Boulogne", "92100", "+33 1 46 00 00 00"], // autre nom, même standard
      ["Orpi", "75011", "01 55 55 55 55"], // même nom, autre secteur : une autre agence
    ])
    const r = rapprocher(lignes, connues, new Map())
    expect(r.dejaLa.map((d) => d.agenceId)).toEqual(["a1", "a2"])
    expect(r.aCreer.map((l) => l.nom)).toEqual(["Orpi"])
  })
  it("n'ajoute un contact à une agence connue que s'il n'y est pas déjà", () => {
    const { lignes } = preparerLignes([["Century 21 Lutèce", "75005", "01 43 00 00 00", "Nom: Mme Dupont"], ["Orpi", "92100", "01 46 00 00 00", "Nom: M. Neuf"]])
    const r = rapprocher(lignes, connues, new Map([["a1", ["Mme Dupont"]]]))
    expect(r.dejaLa[0].contactsAAjouter).toEqual([])
    expect(r.dejaLa[1].contactsAAjouter).toEqual([{ nom: "M. Neuf", email: "", ligne: "" }])
  })
  it("signale les codes postaux absents de la liste des secteurs", () => {
    const a = analyserLignes([["Agence X", "77100 Meaux", "01 60 00 00 00"], ["Agence Y", "75005", "01 61 00 00 00"]], [], new Map(), new Set(["75005"]), "Feuil1")
    expect(a.aCreer).toHaveLength(2)
    expect(a.secteursInconnus).toEqual(["77100"])
    expect(a.feuille).toBe("Feuil1")
  })
})
