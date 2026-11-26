// Lot 7 de l'audit du 26/11 « boîte mail » : D6, D69, D70, D72 à D76 et la pastille de D100.
import { describe, expect, it } from "vitest"
import { citationTransfert, estDefiAntiSpam, texteDuHtml } from "../../supabase/functions/_shared/fil"
import { espaceAutorise } from "../../supabase/functions/_shared/perimetre"
import { adresseCorrespondant, premiereAdresse } from "./messagesUtils"
import { grouperEnConversations } from "./conversations"
import { clesDe, contactDejaPresent } from "./messagesDb"
import { antiSpamEnAttente, etiquetteTri } from "../components/boite/outils"
import messagesTsx from "../components/Messages.tsx?raw"
import sidebar from "../components/Sidebar.tsx?raw"
import emailsManager from "../components/EmailsManager.tsx?raw"
import envoyer from "../../supabase/functions/envoyer-email/index.ts?raw"
import recevoir from "../../supabase/functions/recevoir-email/index.ts?raw"
import instantly from "../../supabase/functions/instantly-repondre/index.ts?raw"
import linkedin from "../../supabase/functions/linkedin/index.ts?raw"
import corriger from "../../supabase/functions/corriger-texte/index.ts?raw"

describe("D6 : le périmètre de l'appelant côté serveur", () => {
  it("un administrateur a les deux boîtes ; un téléprospecteur, celles de la base ; une lecture ratée refuse", () => {
    expect(espaceAutorise("admin", null, "recrutement")).toBe(true)
    expect(espaceAutorise("telepro", ["demarchage"], "recrutement")).toBe(false)
    expect(espaceAutorise("telepro", ["demarchage"], "demarchage")).toBe(true)
    expect(espaceAutorise("telepro", null, "demarchage")).toBe(false)
  })
  it("envoyer-email refuse une boîte hors périmètre ; Instantly et LinkedIn relisent le message avec le jeton de l'appelant", () => {
    expect(envoyer).toMatch(/espaceAutorise\(appelant\.role, await espacesDeLAppelant\(jetonAppel\), espace\)/)
    expect(instantly).toMatch(/optionsDeLAppelant\(jeton\)\)\.from\("messages"\)/)
    expect(linkedin).toMatch(/const lecteur = qui\.id === "essai" \? sb : createClient\(base, Deno\.env\.get\("SUPABASE_ANON_KEY"\)!, optionsDeLAppelant\(jetonDe\(req\)\)\)/)
    expect(corriger).toMatch(/await membre\(jetonDe\(req\)\)/)
  })
})

describe("D69 : le nouveau message a ses propres champs", () => {
  it("la fenêtre flottante écrit dans nv*, et l'envoi d'une réponse ne passe plus par « nouveau »", () => {
    expect(messagesTsx).toMatch(/value=\{nvCorps\}/)
    expect(messagesTsx).toMatch(/onClick=\{\(\) => void envoyerNouveau\(\)\}/)
    expect(messagesTsx).not.toMatch(/if \(nouveau\) \{\s*await repondreMessage/)
    expect(messagesTsx).not.toMatch(/compoObjet/)
  })
})

describe("D70 : une conversation se range sur la première adresse ; la réponse au recrutement porte l'artisan", () => {
  it("« a@x · cc : b@y » se range sur a@x, avec le mail reçu de a@x", () => {
    expect(premiereAdresse("Adrien <adrien@aeg-btp.fr>, c@d.fr · cc : z@w.fr")).toBe("adrien@aeg-btp.fr")
    expect(adresseCorrespondant({ sens: "sortant", de: "recrutement@crm.stcbatiment.fr", a: "adrien@aeg-btp.fr · cc : z@w.fr" })).toBe("adrien@aeg-btp.fr")
    const base = { objet: "Re: Partenariat", agenceId: null, sousTraitantId: null, lu: true }
    const convs = grouperEnConversations([
      { ...base, id: "1", sens: "entrant" as const, de: "adrien@aeg-btp.fr", a: "recrutement@crm.stcbatiment.fr", date: "2026-11-20T10:00:00Z" },
      { ...base, id: "2", sens: "sortant" as const, de: "recrutement@crm.stcbatiment.fr", a: "adrien@aeg-btp.fr · cc : z@w.fr", date: "2026-11-21T10:00:00Z" },
    ])
    expect(convs).toHaveLength(1)
    expect(clesDe(convs[0].messages).adresses).toEqual(["adrien@aeg-btp.fr"])
  })
  it("l'écran envoie l'artisan, le serveur le vérifie puis le retrouve par l'adresse", () => {
    expect(messagesTsx).toMatch(/sousTraitantId: \(cible \?\? ouvert\.dernier\)\.espace === "recrutement" \? ouvert\.sousTraitantId : null/)
    expect(envoyer).toMatch(/corps\?\.sous_traitant_id/)
    expect(envoyer).toMatch(/sousTraitantIdPourMessage = \(s as \{ id\?: string \} \| null\)\?\.id \?\? null;/)
  })
})

describe("D72 : une demande d'arrêt dans un mail en HTML seul", () => {
  it("le texte du HTML ignore l'en-tête et les styles", () => {
    const html = "<html><head><style>p{color:red}" + "x".repeat(600) + "</style></head><body><p>Merci de ne plus nous solliciter.</p></body></html>"
    expect(texteDuHtml(html)).toBe("Merci de ne plus nous solliciter.")
    expect(texteDuHtml("a&nbsp;b<br>c")).toBe("a b\nc")
  })
  it("recevoir-email lit le HTML quand la version texte est vide", () => {
    expect(recevoir).toMatch(/demandeArret\(objet, corpsText\.trim\(\) \? corpsText : texteDuHtml\(corpsHtml\)\)/)
  })
})

describe("D73 : transférer un mail qui n'a qu'une pièce jointe", () => {
  it("la citation existe avec des pièces, même sans texte", () => {
    const c = { de: "a@b.fr", date: "2026-11-20T10:00:00Z", objet: "Kbis", html: "", texte: "" }
    expect(citationTransfert(c)).toBeNull()
    const avec = citationTransfert(c, true)
    expect(avec?.html).toMatch(/Message transféré/)
    expect(avec?.texte).toMatch(/Objet : Kbis/)
  })
  it("le serveur passe les pièces à la citation ; l'écran ouvre l'envoi quand le message transféré a des pièces", () => {
    expect(envoyer).toMatch(/citationTransfert\(citation, avecPieces\)/)
    expect(messagesTsx).toMatch(/compoPieces\.length > 0\)/)
  })
})

describe("D74 : « Créer ce contact » ne crée pas de doublon", () => {
  it("même adresse, ou même nom (civilité, accents et casse ignorés)", () => {
    const fiche = [{ prenom: "Hélène", nom: "Martin", email: "h.martin@agence.fr" }]
    expect(contactDejaPresent({ contact_email: "H.Martin@agence.fr" }, fiche)).toBe(true)
    expect(contactDejaPresent({ contact_nom: "Mme Helene MARTIN" }, fiche)).toBe(true)
    expect(contactDejaPresent({ contact_nom: "Mme Durand", contact_email: "durand@agence.fr" }, fiche)).toBe(false)
    expect(contactDejaPresent({}, fiche)).toBe(false)
  })
  it("l'écran affiche « Déjà sur la fiche »", () => expect(messagesTsx).toMatch(/Déjà sur la fiche/))
})

describe("D75 : la demande d'un anti-spam", () => {
  it("Mailinblack est reconnu, une agence ordinaire non", () => {
    expect(estDefiAntiSpam("diderot_immobilier@invitations.mailinblack.com")).toBe(true)
    expect(estDefiAntiSpam("x@mailinblack.com")).toBe(true)
    expect(estDefiAntiSpam("contact@notmailinblack.com")).toBe(false)
    expect(estDefiAntiSpam("paris@human-location.fr")).toBe(false)
  })
  it("recevoir-email pose le tri « anti_spam » sans IA ni désinscription ; la boîte la signale", () => {
    expect(recevoir).toMatch(/const antiSpam = espace === "demarchage" && estDefiAntiSpam\(de\);/)
    expect(recevoir).toMatch(/antiSpam \? \{ tri: "anti_spam", detail: null \}/)
    expect(etiquetteTri({ tri: "anti_spam", triDetail: null })?.libelle).toBe("Anti-spam de l'agence")
    const m = { id: "1", sens: "entrant" as const, de: "x@invitations.mailinblack.com", a: "h@crm.stcbatiment.fr", objet: "Re: Offre", agenceId: "g", lu: false, date: "2026-11-20T10:00:00Z", tri: "anti_spam" }
    expect(antiSpamEnAttente(grouperEnConversations([m]) as never)).toHaveLength(1)
    expect(antiSpamEnAttente(grouperEnConversations([{ ...m, lu: true }]) as never)).toHaveLength(0)
  })
})

describe("D76 et D100 : une lecture ratée n'est pas une liste vide", () => {
  it("Mes signatures : pas de « chargée » sur échec, et « Réessayer »", () => {
    expect(emailsManager).not.toMatch(/\.catch\(\(\) => \[\] as string\[\]\)/)
    expect(emailsManager).toMatch(/Réessayer/)
  })
  it("la pastille garde son chiffre et le signale", () => {
    expect(sidebar).toMatch(/lireNonLus\(e\)/)
    expect(sidebar).toMatch(/nonLusRates\[e\] && !nonLus\[e\] \? "\?"/)
  })
})
