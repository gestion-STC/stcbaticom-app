import { describe, expect, it } from "vitest"
import {
  appeleeAujourdHui,
  effetAnnonce,
  libelleResultat,
  RESULTAT_LANCE,
  enseigneDe,
  fileDe,
  nomCle,
  numeroParDefaut,
  ordonnerAProspecter,
  premiersInteresses,
  ordonnerInteresses,
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
const midi = new Date(2026, 9, 9, 12, 0, 0) // vendredi 9 octobre 2026, 12 h

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

describe("fileDe", () => {
  it("une agence à prospecter sans tâche va dans « À prospecter »", () => {
    expect(fileDe(agence(), midi)).toBe("a_prospecter")
    expect(fileDe(agence({ etape: "gestionnaire_joint" }), midi)).toBe("a_prospecter")
  })
  it("une tâche datée aujourd'hui ou en retard prime sur tout", () => {
    expect(fileDe(agence({ prochaineEcheance: "2026-10-09T10:00:00" }), midi)).toBe("rappels")
    expect(fileDe(agence({ etape: "interesse", prochaineEcheance: "2026-10-01T10:00:00" }), midi)).toBe("rappels")
  })
  it("une tâche future met l'agence en attente, hors des files", () => {
    expect(fileDe(agence({ prochaineEcheance: "2026-10-20T10:00:00" }), midi)).toBeNull()
  })
  it("une intéressée est toujours dans la pile des intéressés (sauf relance due : rappels)", () => {
    expect(fileDe(agence({ etape: "interesse", derniereActiviteLe: "2026-10-01T10:00:00Z" }), midi)).toBe("sans_nouvelle")
    expect(fileDe(agence({ etape: "interesse", derniereActiviteLe: "2026-10-08T10:00:00Z", prochaineEcheance: "2026-10-16T12:00:00" }), midi)).toBe("sans_nouvelle")
    expect(fileDe(agence({ etape: "rdv_planifie", prochaineEcheance: "2026-10-20T10:00:00" }), midi)).toBe("sans_nouvelle")
  })
  it("les intéressés se classent : relance due, puis rien de prévu, puis relance à venir", () => {
    const liste = [
      agence({ id: "a-venir", etape: "interesse", prochaineEcheance: "2026-10-16T12:00:00" }),
      agence({ id: "rien-recent", etape: "interesse", derniereActiviteLe: "2026-10-08T10:00:00Z" }),
      agence({ id: "en-retard", etape: "interesse", prochaineEcheance: "2026-10-07T10:00:00" }),
      agence({ id: "rien-ancien", etape: "interesse", derniereActiviteLe: "2026-09-01T10:00:00Z" }),
    ]
    expect(ordonnerInteresses(liste, midi).map((a) => a.id)).toEqual(["en-retard", "rien-ancien", "rien-recent", "a-venir"])
  })
  it("une endormie ne revient qu'à sa date de réveil", () => {
    expect(fileDe(agence({ etape: "endormie", reveilLe: "2026-12-08" }), midi)).toBeNull()
    expect(fileDe(agence({ etape: "endormie", reveilLe: "2026-10-09" }), midi)).toBe("a_reveiller")
  })
  it("les clients, les refus, les hors cible et les apporteurs ne sont dans aucune file", () => {
    expect(fileDe(agence({ etape: "client" }), midi)).toBeNull()
    expect(fileDe(agence({ etape: "pas_interesse" }), midi)).toBeNull()
    expect(fileDe(agence({ etape: "hors_cible", prochaineEcheance: "2026-10-09T10:00:00" }), midi)).toBeNull()
    expect(fileDe(agence({ type: "apporteur" }), midi)).toBeNull()
  })
})

describe("ordonnerAProspecter", () => {
  it("jamais appelées d'abord (secteur du jour en tête), puis la tentative la plus ancienne, puis les réseaux", () => {
    const liste = [
      agence({ id: "vieille", secteur: "75013", dernierAppelLe: "2026-07-10T10:00:00Z", nom: "B" }),
      agence({ id: "jamais-indep", secteur: "75013", nom: "Zed" }),
      agence({ id: "jamais-reseau", secteur: "75013", nom: "Alpha", enseigne: "Orpi" }),
      agence({ id: "jamais-secteur-du-jour", secteur: "75005", nom: "Zz" }),
      agence({ id: "appelee-secteur-du-jour", secteur: "75005", dernierAppelLe: "2026-09-01T10:00:00Z" }),
      agence({ id: "recente", secteur: "75013", dernierAppelLe: "2026-10-01T10:00:00Z" }),
    ]
    // Une agence déjà appelée, même du secteur du jour, passe après TOUTES les jamais appelées, puis la plus anciennement appelée.
    expect(ordonnerAProspecter(liste, "75005").map((a) => a.id)).toEqual(["jamais-secteur-du-jour", "jamais-reseau", "jamais-indep", "vieille", "appelee-secteur-du-jour", "recente"])
  })
  it("une fois la base appelée : la plus anciennement appelée d'abord, et une agence sans aucun numéro tout à la fin", () => {
    const liste = [
      agence({ id: "appelee-recemment", nbAppels: 1, dernierAppelLe: "2026-10-01T10:00:00Z" }),
      agence({ id: "sans-numero", telephone: "", nbContacts: 0 }),
      agence({ id: "appelee-en-juillet", nbAppels: 2, dernierAppelLe: "2026-07-01T10:00:00Z", secteur: "75013" }),
      agence({ id: "jamais" }),
    ]
    // Le secteur du jour ne fait pas repasser une agence appelée devant une plus ancienne.
    expect(ordonnerAProspecter(liste, "75005").map((a) => a.id)).toEqual(["jamais", "appelee-en-juillet", "appelee-recemment", "sans-numero"])
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

describe("appeleeAujourdHui", () => {
  it("compare au jour civil", () => {
    expect(appeleeAujourdHui({ dernierAppelLe: "2026-10-09T08:00:00" }, midi)).toBe(true)
    expect(appeleeAujourdHui({ dernierAppelLe: "2026-10-08T23:00:00" }, midi)).toBe(false)
    expect(appeleeAujourdHui({ dernierAppelLe: null }, midi)).toBe(false)
  })
})

describe("effetAnnonce", () => {
  it("compte les tentatives et annonce le sommeil à la sixième", () => {
    expect(effetAnnonce("pas_de_reponse", null, { etape: "a_prospecter", tentatives: 0 })).toBe("Tentative 1 sur 6. L'étape ne change pas.")
    expect(effetAnnonce("standard", null, { etape: "a_prospecter", tentatives: 5 })).toContain("s'endort 60 jours")
    expect(effetAnnonce("pas_de_reponse", null, { etape: "interesse", tentatives: 5 })).toBe("Elle reste intéressée : relance dans 7 jours.")
  })
  it("décrit chaque issue", () => {
    expect(effetAnnonce("joint", "interesse", { etape: "a_prospecter", tentatives: 2 })).toContain("Relancer")
    expect(effetAnnonce("joint", "pas_interesse", { etape: "a_prospecter", tentatives: 2 })).toContain("motif")
    expect(effetAnnonce("faux_numero", null, { etape: "a_prospecter", tentatives: 2 })).toContain("hors cible")
  })
})

describe("l'appel lancé au clic (13/10)", () => {
  it("se lit « résultat non noté » tant que le résultat n'est pas choisi", () => {
    expect(libelleResultat(RESULTAT_LANCE)).toBe("Appel lancé, résultat non noté")
    expect(libelleResultat("standard")).toBe("Standard, pas de gestionnaire")
  })
})
