import { describe, expect, it } from "vitest"
import {
  effetAnnonce,
  libelleResultat,
  RESULTAT_LANCE,
  enseigneDe,
  nomCle,
  numeroParDefaut,
  premiersInteresses,
  secteurDepuis,
  type Agence,
  type Contact,
} from "./modele"

function agence(p: Partial<Agence> = {}): Agence {
  return {
    id: "a1", nom: "Agence Test", enseigne: "", type: "agence", secteur: "75005", secteurLibelle: "Paris 5", adresse: "", telephone: "01 43 00 00 00", email: "", site: "",
    nbLots: 0, logoUrl: "", etape: "a_prospecter", etapeDepuis: "2026-10-01T10:00:00Z", commercialId: null, tentatives: 0, jointFois: 0, reveilLe: null, motif: "",
    premierOsLe: null, numeroEmission: "", derniereActiviteLe: null, creeLe: "2026-07-01T10:00:00Z",
    nbContacts: 0, contactPrincipal: "", contactLigne: "", prochaineEcheance: null, prochaineTache: "", nbAppels: 0, dernierAppelLe: null, dernierResultat: "", dernierSignal: "", dernierSignalLe: null, compteOuvertLe: null, compteEmail: "",
    ...p,
  }
}
function contact(p: Partial<Contact> = {}): Contact {
  return { id: "c1", agenceId: "a1", prenom: "Sophie", nom: "Martin", role: "gestionnaire", ligneDirecte: "", mobile: "", email: "", principal: false, parti: false, note: "", creeLe: "2026-10-01T10:00:00Z", ...p }
}

describe("nomCle et secteurDepuis", () => {
  it("normalise le nom comme la base", () => {
    expect(nomCle("  Century   21 Lutèce ")).toBe("century 21 lutèce")
  })
  it("lit un code postal dans un texte libre", () => {
    expect(secteurDepuis("75005")).toBe("75005")
    expect(secteurDepuis("92100 Boulogne-Billancourt")).toBe("92100")
    expect(secteurDepuis("Paris 5")).toBeNull()
  })
})

describe("enseigneDe", () => {
  it("reconnaît les réseaux", () => {
    expect(enseigneDe("Century 21 Lutèce Immobilier")).toBe("Century 21")
    expect(enseigneDe("Agence immobilière Laforêt Paris 11Eme")).toBe("Laforêt")
    expect(enseigneDe("Leader Immobilier")).toBe("")
  })
})

describe("numeroParDefaut", () => {
  it("propose la ligne directe du contact principal, sinon le standard", () => {
    const a = agence()
    expect(numeroParDefaut(a, []).numero).toBe("01 43 00 00 00")
    const c = [contact({ id: "c2", nom: "Benali", ligneDirecte: "01 43 00 00 12" }), contact({ principal: true, ligneDirecte: "01 43 00 00 10" })]
    const r = numeroParDefaut(a, c)
    expect(r.numero).toBe("01 43 00 00 10")
    expect(r.contactId).toBe("c1")
  })
  it("ignore un contact parti", () => {
    expect(numeroParDefaut(agence(), [contact({ parti: true, ligneDirecte: "01 00 00 00 00" })]).libelle).toBe("Standard")
  })
})

describe("premiersInteresses", () => {
  it("garde, par agence, le premier appel « intéressé » (les relances ne recomptent pas)", () => {
    const m = premiersInteresses([
      { id: "b", agence_id: "A", date: "2026-10-20T10:00:00Z" },
      { id: "a", agence_id: "A", date: "2026-10-08T10:00:00Z" },
      { id: "c", agence_id: "B", date: "2026-10-09T10:00:00Z" },
    ])
    expect([...m]).toEqual([["A", "a"], ["B", "c"]])
  })
})

describe("effetAnnonce", () => {
  const R = { sommeilApres: 6, sommeilJours: 30, relanceJours: 7 }
  it("compte les tentatives et annonce le sommeil à la sixième", () => {
    expect(effetAnnonce("pas_de_reponse", null, { etape: "a_prospecter", tentatives: 0 }, R)).toBe("Tentative 1 sur 6. L'étape ne change pas.")
    expect(effetAnnonce("standard", null, { etape: "a_prospecter", tentatives: 5 }, R)).toContain("s'endort 30 jours")
    expect(effetAnnonce("pas_de_reponse", null, { etape: "interesse", tentatives: 5 }, R)).toBe("Elle reste intéressée : relance dans 7 jours.")
  })
  it("une endormie toujours injoignable se rendort (13/10), jamais « tentative 7 sur 6 »", () => {
    expect(effetAnnonce("pas_de_reponse", null, { etape: "endormie", tentatives: 6 }, R)).toBe("Toujours personne : elle se rendort 30 jours.")
    expect(effetAnnonce("standard", null, { etape: "endormie", tentatives: 0 }, R)).toBe("Toujours personne : elle se rendort 30 jours.")
  })
  it("décrit chaque issue", () => {
    expect(effetAnnonce("joint", "interesse", { etape: "a_prospecter", tentatives: 2 }, R)).toContain("Relancer")
    expect(effetAnnonce("joint", "pas_interesse", { etape: "a_prospecter", tentatives: 2 }, R)).toContain("motif")
    expect(effetAnnonce("faux_numero", null, { etape: "a_prospecter", tentatives: 2 }, R)).toContain("hors cible")
  })
})

describe("l'appel lancé au clic (13/10)", () => {
  it("se lit « résultat non noté » tant que le résultat n'est pas choisi", () => {
    expect(libelleResultat(RESULTAT_LANCE)).toBe("Appel lancé, résultat non noté")
    expect(libelleResultat("standard")).toBe("Standard, pas de gestionnaire")
  })
})
