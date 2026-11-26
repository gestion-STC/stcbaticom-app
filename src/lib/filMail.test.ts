// Lot 2 « boîte mail » (26/11/2026) : pièces reçues, boîte sans plafond, répondre, transférer, rebonds, fil.
import { describe, expect, it } from "vitest"
import { cheminDuJournal, citationTransfert, enteteDeFil, htmlNettoye, listeAdresses, nomDeStockage } from "../../supabase/functions/_shared/fil"
import { adresseAncree, messageDeLAncre, porteSansAncre, espaceDuMailRecu } from "./boitesMail"
import { destinatairesDe, destinatairesReponse, filDeReponse, messageATransferer, type MessageDeBase } from "./messagesUtils"
import { cheminPrive, clesDe, compterConversationsNonLues, fusionner, type Message } from "./messagesDb"
import { filtrerConversations, grouperEnConversations } from "./conversations"
import recevoir from "../../supabase/functions/recevoir-email/index.ts?raw"
import envoyer from "../../supabase/functions/envoyer-email/index.ts?raw"
import resend from "../../supabase/functions/resend-evenements/index.ts?raw"
import sql from "../../supabase/maj-2026-11-26-lot2-boite-mail.sql?raw"

type M = MessageDeBase & { messageId?: string | null }
const m = (id: string, p: Partial<M> = {}): M => ({ id, sens: "entrant", de: "x@agence.fr", a: "contact@crm.stcbatiment.fr", objet: "Devis", agenceId: null, lu: true, date: `2026-11-${id.padStart(2, "0")}T10:00:00Z`, ...p })

describe("1. pièces reçues : plus de perte silencieuse", () => {
  it("le nom de stockage n'a plus d'accent ni d'apostrophe typographique (cas kadipeint 31/08)", () => {
    expect(nomDeStockage("Barème 2026 VIAREN.pdf")).toBe("Bareme_2026_VIAREN.pdf")
    expect(nomDeStockage("Capture d’écran 2026-08-04 à 10.12.pdf")).toBe("Capture_d_ecran_2026-08-04_a_10.12.pdf")
    expect(nomDeStockage("")).toBe("fichier")
    expect(nomDeStockage(".htaccess")).toBe("htaccess")
  })
  it("le nom d'origine reste affiché, une pièce non gardée est notée avec sa raison", () => {
    expect(recevoir).toContain("nonGardee: raison")
    expect(recevoir).toMatch(/trop lourde/)
    expect(recevoir).toMatch(/stockage refusé/)
    expect(recevoir).not.toMatch(/if \(errUp\) continue;/)
    expect(recevoir).not.toMatch(/MAX_PJ_OCTETS\) continue;/)
  })
})

describe("2. la boîte sans plafond", () => {
  const msg = (id: string, p: Partial<Message> = {}): Message => ({ id, sens: "sortant", espace: "recrutement", sousTraitantId: null, de: "recrutement@crm.stcbatiment.fr", a: "art@x.fr", objet: "Rejoignez", corpsText: "", corpsHtml: "", messageId: null, inReplyTo: null, agenceId: null, lu: true, date: `2026-11-${id.padStart(2, "0")}T10:00:00Z`, piecesJointes: [], ...p })
  it("les clés d'une conversation : agence, artisan, adresse de l'autre côté", () => {
    const k = clesDe([msg("1", { sousTraitantId: "st1" }), msg("2", { sens: "entrant", de: "Jean <JEAN@x.fr>", a: "recrutement@crm.stcbatiment.fr", agenceId: "ag" })])
    expect(k).toEqual({ agences: ["ag"], artisans: ["st1"], adresses: ["art@x.fr", "jean@x.fr"] })
  })
  it("fusion sans doublon, la plus récente d'abord", () => {
    expect(fusionner([msg("1"), msg("3")], [msg("2"), msg("3")]).map((x) => x.id)).toEqual(["3", "2", "1"])
  })
  it("la recherche du serveur garde une conversation trouvée dans la mise en page (339 envois sans texte)", () => {
    const convs = grouperEnConversations([msg("1", { corpsHtml: "<p>Barème</p>" })])
    expect(filtrerConversations(convs, "tous", "barème")).toHaveLength(0)
    expect(filtrerConversations(convs, "tous", "barème", new Set(["1"]))).toHaveLength(1)
  })
})

describe("3. répondre : au dernier message REÇU, À modifiable, adresse liste découpée", () => {
  it("l'expéditeur du dernier reçu, pas notre dernier envoi à un autre", () => {
    const fil = [m("1", { de: "Paul <paul@agence.fr>" }), m("2", { sens: "sortant", de: "contact@crm.stcbatiment.fr", a: "autre@agence.fr" })]
    expect(destinatairesReponse(fil)).toEqual({ to: ["paul@agence.fr"], cc: [] })
  })
  it("répondre à un message choisi", () => {
    const fil = [m("1", { de: "a@x.fr" }), m("2", { de: "b@x.fr" })]
    expect(destinatairesReponse(fil, fil[0]).to).toEqual(["a@x.fr"])
  })
  it("sans réponse : les destinataires de notre envoi, la liste découpée (« a@x, b@y », « h2i@… · cc : … »)", () => {
    expect(destinatairesDe("a@x.fr, b@y.fr")).toEqual({ to: ["a@x.fr", "b@y.fr"], cc: [] })
    expect(destinatairesDe("h2i@agence.fr · cc : c@agence.fr · cci : d@z.fr")).toEqual({ to: ["h2i@agence.fr"], cc: ["c@agence.fr"] })
    expect(destinatairesReponse([m("1", { sens: "sortant", a: "a@x.fr, b@y.fr" })]).to).toEqual(["a@x.fr", "b@y.fr"])
  })
  it("le serveur découpe aussi une adresse liste (contrats A et B), et prend Cc / Cci en réponse", () => {
    expect(listeAdresses("a@x.fr, B@y.fr")).toEqual(["a@x.fr", "b@y.fr"])
    expect(listeAdresses("h2i@agence.fr · cc : c@agence.fr")).toEqual(["h2i@agence.fr", "c@agence.fr"])
    expect(listeAdresses(["Jean <j@x.fr>", "j@x.fr"])).toEqual(["j@x.fr"])
    expect(envoyer).toMatch(/const tousB = listeAdresses\(to/)
    expect(envoyer).toMatch(/ccB\.length \? \{ cc: ccB \}/)
  })
})

describe("4. transférer le message choisi, avec sa mise en page", () => {
  it("le message cliqué, sinon le dernier reçu", () => {
    const fil = [m("1"), m("2", { sens: "sortant" })]
    expect(messageATransferer(fil)?.id).toBe("1")
    expect(messageATransferer(fil, fil[1])?.id).toBe("2")
  })
  it("le HTML repart nettoyé : ni script, ni gestionnaire, ni lien javascript", () => {
    const h = htmlNettoye(`<html><head><title>t</title></head><body><p onclick="x()">Bonjour</p><script>alert(1)</script><a href="javascript:alert(1)">l</a><iframe src="x"></iframe></body></html>`)
    expect(h).toBe(`<p>Bonjour</p><a href="#">l</a>`)
  })
  it("un envoi sans texte (démarchage) se transfère quand même, en-tête compris", () => {
    const c = citationTransfert({ de: "contact@crm.stcbatiment.fr", a: "x@y.fr", date: "2026-11-20T09:00:00Z", objet: "Offre", html: "<p>Notre offre</p>", texte: "" })
    expect(c?.html).toContain("<p>Notre offre</p>")
    expect(c?.html).toContain("Objet : Offre")
    expect(c?.texte).toContain("Notre offre")
    expect(citationTransfert({ objet: "vide" })).toBeNull()
  })
})

describe("5. pièces d'un transfert : le chemin, pas un lien d'une heure", () => {
  const signe = "https://ifv.supabase.co/storage/v1/object/sign/mails-recus/abc/Bareme%202026.pdf?token=xyz"
  it("le journal garde le chemin du stockage privé", () => {
    expect(cheminDuJournal(signe)).toBe("abc/Bareme 2026.pdf")
    expect(cheminDuJournal("https://ifv.supabase.co/storage/v1/object/public/documents/kbis.pdf")).toBe("https://ifv.supabase.co/storage/v1/object/public/documents/kbis.pdf")
  })
  it("l'écran refait un lien, même pour un ancien transfert (cas Garance 23/11)", () => {
    expect(cheminPrive(signe)).toBe("abc/Bareme 2026.pdf")
    expect(cheminPrive("abc/x.pdf")).toBe("abc/x.pdf")
    expect(cheminPrive("https://ifv.supabase.co/storage/v1/object/public/documents/kbis.pdf")).toBeNull()
  })
})

describe("6. un rebond se voit dans la boîte", () => {
  it("resend-evenements marque le message non remis, sans toucher à la signature du lot 1", () => {
    expect(resend).toMatch(/non_remis_le: quand/)
    expect(resend).toMatch(/if \(!secret\)[^\n]*return json\(\{ error: "signature non vérifiable" \}, 401\)/)
    expect(resend).toMatch(/if \(!\(await signatureValide\(req, corps, secret\)\)\) return json/)
  })
  it("le SQL ajoute les colonnes et rattrape les 35 rebonds notés, sans rien supprimer", () => {
    expect(sql).toMatch(/add column if not exists non_remis_le timestamptz/)
    expect(sql).toMatch(/E-mail rebondi \(adresse injoignable\)/)
    expect(sql).not.toMatch(/\b(drop|delete|truncate)\b/i)
    expect(sql).not.toMatch(/on commit drop/i)
  })
})

describe("7-8. le fil : l'adresse de réponse porte le message, seuls de vrais Message-ID en en-tête", () => {
  const id = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b"
  it("prenom@ → prenom-r-<id>@, et retour", () => {
    const a = adresseAncree("horlannmaunier@crm.stcbatiment.fr", id)
    expect(a).toBe(`horlannmaunier-r-${id}@crm.stcbatiment.fr`)
    expect(messageDeLAncre(`Horlann <${a!.toUpperCase()}>`)).toBe(id)
    expect(porteSansAncre(a!)).toBe("horlannmaunier@crm.stcbatiment.fr")
    expect(adresseAncree(a, id)).toBe(a) // pas d'ancre en double
  })
  it("jamais hors de notre domaine, jamais une ancre lue ailleurs", () => {
    expect(adresseAncree("artisan@gmail.com", id)).toBeNull()
    expect(messageDeLAncre(`x-r-${id}@gmail.com`)).toBeNull()
    expect(messageDeLAncre("contact@crm.stcbatiment.fr")).toBeNull()
  })
  it("le recrutement reste le recrutement une fois l'ancre retirée", () => {
    const porte = porteSansAncre(adresseAncree("recrutement@crm.stcbatiment.fr", id)!)
    expect(espaceDuMailRecu({ destinataires: [porte], expediteurEstArtisan: false, repondAuRecrutement: false, objet: "", corps: "" }).espace).toBe("recrutement")
  })
  it("envoyer-email fixe l'identifiant avant l'envoi et le pose dans l'adresse de réponse ; recevoir-email le relit", () => {
    expect(envoyer).toMatch(/const idJournal = crypto\.randomUUID\(\)/)
    expect(envoyer).toMatch(/id: idJournal, sens: "sortant"/)
    expect(recevoir).toMatch(/messageDeLAncre/)
    expect(recevoir).toMatch(/agence_id: origine\.agence_id/)
  })
  it("un identifiant Resend (notre envoi) n'est jamais un In-Reply-To", () => {
    expect(enteteDeFil("935b2d77-947d-41ba-bd44-de2b9d910ca0")).toBeNull()
    expect(enteteDeFil("<CAOt@mail.gmail.com>", ["<a@x>", "b@y"])).toEqual({ "In-Reply-To": "<CAOt@mail.gmail.com>", References: "<a@x> <b@y> <CAOt@mail.gmail.com>" })
  })
  it("une relance après notre propre réponse cite le dernier mail REÇU", () => {
    const fil = [m("1", { messageId: "<r1@gmail.com>" }), m("2", { sens: "sortant", messageId: "935b2d77-947d-41ba-bd44-de2b9d910ca0" }), m("3", { sens: "sortant", messageId: "aaaa" })]
    expect(filDeReponse(fil)).toEqual({ inReplyTo: "r1@gmail.com", references: ["r1@gmail.com"] })
    expect(filDeReponse([m("1", { sens: "sortant", messageId: "x" })])).toEqual({ inReplyTo: null, references: [] })
  })
})

describe("10. la pastille compte des conversations, comme le titre", () => {
  it("trois messages non lus dans deux conversations → 2", () => {
    const l = [m("1", { lu: false }), m("2", { lu: false, objet: "Re: Devis" }), m("3", { lu: false, objet: "Autre" })]
    expect(compterConversationsNonLues(l)).toBe(2)
  })
})
