import { describe, expect, it } from "vitest"
import {
  compterNonLues,
  etiquetteDe,
  filtrerConversations,
  grouperEnConversations,
  objetNormalise,
  paginer,
  type MessageConv,
} from "./conversations"

function msg(partiel: Partial<MessageConv> & { id: string }): MessageConv {
  return {
    sens: "entrant",
    de: "Jean Dupont <jean@ex.fr>",
    a: "contact@crm.stcbatiment.fr",
    objet: "Devis",
    prospectId: null,
    lu: true,
    date: "2026-10-01T10:00:00Z",
    ...partiel,
  }
}

describe("objetNormalise", () => {
  it("retire les préfixes de réponse et de transfert, même empilés", () => {
    expect(objetNormalise("Re: Re: Devis salle de bain")).toBe("devis salle de bain")
    expect(objetNormalise("TR: Fwd: Devis")).toBe("devis")
    expect(objetNormalise("RE : Devis")).toBe("devis")
  })
  it("ignore la casse et les espaces en trop", () => {
    expect(objetNormalise("  DEVIS   salle ")).toBe("devis salle")
  })
  it("donne un objet aux messages sans objet", () => {
    expect(objetNormalise("")).toBe("(sans objet)")
  })
})

describe("grouperEnConversations", () => {
  const messages: MessageConv[] = [
    msg({ id: "1", objet: "Devis", lu: false, date: "2026-10-01T10:00:00Z" }),
    msg({ id: "2", sens: "sortant", de: "contact@crm.stcbatiment.fr", a: "jean@ex.fr", objet: "Re: Devis", date: "2026-10-02T10:00:00Z" }),
    msg({ id: "3", objet: "Re: Devis", lu: false, date: "2026-10-03T10:00:00Z", piecesJointes: [{}, {}] }),
    msg({ id: "4", objet: "Autre sujet", date: "2026-10-02T12:00:00Z" }),
    msg({ id: "5", de: "Paul <paul@ex.fr>", objet: "Devis", date: "2026-09-30T10:00:00Z" }),
  ]
  const convs = grouperEnConversations(messages)

  it("réunit l'aller-retour d'un même correspondant sur un même objet", () => {
    const devisJean = convs.find((c) => c.adresse === "jean@ex.fr" && c.objet === "Re: Devis")
    expect(devisJean?.messages.map((m) => m.id)).toEqual(["1", "2", "3"])
    expect(devisJean?.nonLus).toBe(2)
    expect(devisJean?.aRecu).toBe(true)
    expect(devisJean?.aEnvoye).toBe(true)
    expect(devisJean?.piecesJointes).toBe(2)
    expect(devisJean?.nom).toBe("Jean Dupont")
  })
  it("sépare un autre objet du même correspondant, et le même objet d'un autre correspondant", () => {
    expect(convs).toHaveLength(3)
    expect(convs.find((c) => c.objet === "Autre sujet")?.messages).toHaveLength(1)
    expect(convs.find((c) => c.adresse === "paul@ex.fr")?.nom).toBe("Paul")
  })
  it("classe de la conversation la plus récente à la plus ancienne", () => {
    expect(convs.map((c) => c.dernier.id)).toEqual(["3", "4", "5"])
  })
  it("regroupe par prospect quand il est connu, même si l'adresse change", () => {
    const deux = grouperEnConversations([
      msg({ id: "a", de: "pro@ex.fr", prospectId: "P1", date: "2026-10-01T10:00:00Z" }),
      msg({ id: "b", de: "perso@gmail.com", prospectId: "P1", date: "2026-10-02T10:00:00Z" }),
    ])
    expect(deux).toHaveLength(1)
  })
  it("sait qu'une conversation seulement envoyée n'a rien reçu", () => {
    const [c] = grouperEnConversations([msg({ id: "s", sens: "sortant", de: "moi@crm", a: "x@ex.fr" })])
    expect(c.aRecu).toBe(false)
    expect(c.aEnvoye).toBe(true)
    expect(c.nom).toBe("x@ex.fr")
    expect(etiquetteDe(c)).toBe("Envoyés")
  })
})

describe("filtrerConversations", () => {
  const convs = grouperEnConversations([
    msg({ id: "1", objet: "Devis", lu: false, corpsText: "Merci pour votre proposition" }),
    msg({ id: "2", sens: "sortant", de: "moi@crm", a: "x@ex.fr", objet: "Relance", date: "2026-10-02T10:00:00Z" }),
    msg({ id: "3", de: "Paul <paul@ex.fr>", objet: "Question", date: "2026-10-03T10:00:00Z" }),
  ])
  it("filtre par dossier", () => {
    expect(filtrerConversations(convs, "reception").map((c) => c.objet)).toEqual(["Question", "Devis"])
    expect(filtrerConversations(convs, "nonlus").map((c) => c.objet)).toEqual(["Devis"])
    expect(filtrerConversations(convs, "envoyes").map((c) => c.objet)).toEqual(["Relance"])
    expect(filtrerConversations(convs, "tous")).toHaveLength(3)
  })
  it("cherche dans le nom, l'objet et le contenu", () => {
    expect(filtrerConversations(convs, "tous", "proposition").map((c) => c.objet)).toEqual(["Devis"])
    expect(filtrerConversations(convs, "tous", "paul").map((c) => c.objet)).toEqual(["Question"])
    expect(filtrerConversations(convs, "tous", "introuvable")).toEqual([])
  })
  it("compte les conversations non lues", () => {
    expect(compterNonLues(convs)).toBe(1)
  })
})

describe("paginer", () => {
  const liste = Array.from({ length: 120 }, (_, i) => i + 1)
  it("découpe par 50 et annonce la tranche", () => {
    const p = paginer(liste, 3)
    expect(p.tranche[0]).toBe(101)
    expect(p.tranche).toHaveLength(20)
    expect(p.debut).toBe(101)
    expect(p.fin).toBe(120)
    expect(p.pages).toBe(3)
  })
  it("ramène une page hors limites dans les bornes", () => {
    expect(paginer(liste, 9).page).toBe(3)
    expect(paginer(liste, 0).page).toBe(1)
  })
  it("gère une liste vide", () => {
    const p = paginer([], 1)
    expect(p.debut).toBe(0)
    expect(p.fin).toBe(0)
    expect(p.pages).toBe(1)
  })
})
