import { describe, expect, it } from "vitest"
import { candidats, candidatSolide, domaineGenerique, nomCle, telCle, type AgenceRef } from "../../supabase/functions/synchro-clients/rapprochement"

const agence = (p: Partial<AgenceRef> & { id: string; nom: string }): AgenceRef => ({
  secteur: null, telephone: "", email: "", etape: "a_prospecter", premierOsLe: null, contactsEmails: [], contactsTels: [], ...p,
})
const base: AgenceRef[] = [
  agence({ id: "eiffel", nom: "Eiffel Housing", secteur: "75007", telephone: "01 84 60 98 95", email: "contact@eiffel-housing.com" }),
  agence({ id: "sgl", nom: "SGL Paris", secteur: "75015", telephone: "01 40 00 00 00", contactsEmails: ["lisa.marc@sgl-immo.com"] }),
  agence({ id: "c21", nom: "Century 21 Lutèce Immobilier", secteur: "75005", telephone: "01 43 00 00 00" }),
  agence({ id: "c21b", nom: "Century 21 Agence Monge", secteur: "75005", telephone: "01 47 00 00 00" }),
  agence({ id: "city", nom: "City Immo", secteur: "75011", telephone: "07 48 88 08 17" }),
]

describe("les clés de comparaison", () => {
  it("telCle garde les 9 derniers chiffres, +33 ou 0033 compris", () => {
    expect(telCle("01.45.82.98.98")).toBe("145829898")
    expect(telCle("+33 1 45 82 98 98")).toBe("145829898")
    expect(telCle("0033145829898")).toBe("145829898")
    expect(telCle("12")).toBe("")
  })
  it("nomCle retire accents et ponctuation", () => {
    expect(nomCle("SGL Paris – Société de Gestion Locative")).toBe("sgl paris societe de gestion locative")
  })
  it("domaineGenerique reconnaît les messageries grand public", () => {
    expect(domaineGenerique("gmail.com")).toBe(true)
    expect(domaineGenerique("eiffel-housing.com")).toBe(false)
  })
})

describe("candidats", () => {
  it("même domaine + même téléphone + même nom : candidat solide", () => {
    const c = candidats({ societe: "Eiffel Housing", nom: "Guillaume Blanchet", email: "guillaume@eiffel-housing.com", telephones: ["01 84 60 98 95"], nomsAgence: "Effeil housing | EIFFFEL HOUSING", codesPostaux: "75007" }, base)
    expect(c[0].agenceId).toBe("eiffel")
    expect(c[0].score).toBe(60 + 50 + 40 + 5)
    expect(c[0].raisons).toContain("même téléphone")
    expect(candidatSolide(c[0])).toBe(true)
  })
  it("l'e-mail d'un contact vaut 100", () => {
    const c = candidats({ societe: "SGL Paris – Société de Gestion Locative", nom: "Lisa MARC", email: "lisa.marc@sgl-immo.com", telephones: [], nomsAgence: "", codesPostaux: "" }, base)
    expect(c[0].agenceId).toBe("sgl")
    expect(c[0].raisons[0]).toBe("même e-mail")
  })
  it("un gmail ne rapproche pas par domaine ; le nom seul reste faible", () => {
    const c = candidats({ societe: "City immo", nom: "LEJEUNE EMELINE", email: "cityimmo@gmail.com", telephones: ["07 48 88 08 17"], nomsAgence: "City immo", codesPostaux: "" }, base)
    expect(c[0].agenceId).toBe("city")
    expect(c[0].raisons).toEqual(["même téléphone", "même nom « City Immo »"])
    const faible = candidats({ societe: "Century 21", nom: "x", email: "x@gmail.com", telephones: [], nomsAgence: "Century 21", codesPostaux: "" }, base)
    expect(faible.length).toBe(2)
    expect(candidatSolide(faible[0])).toBe(false)
  })
  it("aucun indice : aucun candidat", () => {
    expect(candidats({ societe: "Inconnue SARL", nom: "", email: "a@b.fr", telephones: [], nomsAgence: "", codesPostaux: "" }, base)).toEqual([])
  })
})
