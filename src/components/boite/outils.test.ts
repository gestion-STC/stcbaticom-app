import { describe, expect, it } from "vitest"
import type { Message } from "../../lib/messagesDb"
import type { Conversation } from "../../lib/conversations"
import { interessesSansAgence } from "./outils"

const msg = (p: Partial<Message>): Message => ({
  id: "m", sens: "entrant", espace: "demarchage", sousTraitantId: null, de: "a@b.fr", a: "c@d.fr", objet: "", corpsText: "", corpsHtml: "",
  messageId: null, inReplyTo: null, agenceId: null, lu: false, date: "2026-11-24T10:00:00Z", tri: null, triDetail: null, ...p,
} as Message)
const conv = (cle: string, agenceId: string | null, messages: Message[]): Conversation<Message> => ({
  cle, adresse: "a@b.fr", nom: cle, agenceId, sousTraitantId: null, objet: "", messages, dernier: messages[messages.length - 1], nonLus: 0, aRecu: true, aEnvoye: false, piecesJointes: 0,
})

describe("réponses « intéressé » sans agence", () => {
  it("ne garde que les conversations sans fiche qui portent une réponse intéressée", () => {
    const perdue = conv("perdue", null, [msg({ tri: "interesse" })])
    const rattachee = conv("rattachee", "ag1", [msg({ tri: "interesse", agenceId: "ag1" })])
    const autre = conv("autre", null, [msg({ tri: "autre" })])
    const recrutement = conv("st", null, [msg({ tri: "interesse", espace: "recrutement" })])
    const envoyee = conv("envoyee", null, [msg({ tri: "interesse", sens: "sortant" })])
    expect(interessesSansAgence([perdue, rattachee, autre, recrutement, envoyee]).map((c) => c.cle)).toEqual(["perdue"])
  })
})
