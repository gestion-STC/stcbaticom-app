import { describe, expect, it } from "vitest"
import {
  ADRESSE_GENERALE,
  compteDesDestinataires,
  compteQuiEnvoie,
  espaceDuMailRecu,
  estDuDomaine,
  expediteurDemarchage,
  identifiantsCites,
  normaliserAdresseDediee,
  repondAUnSujet,
  ressembleAUnArtisan,
  sansCitation,
  signatureAvecAdresse,
  sujetDeBase,
  validerAdresseDediee,
  type IndicesEspace,
} from "./boitesMail"
import { signatureStc } from "./signatureStc"
import ecran from "./boitesMail.ts?raw"
import serveur from "../../supabase/functions/_shared/boitesMail.ts?raw"

// Données fictives uniquement.
const indices = (p: Partial<IndicesEspace>): IndicesEspace => ({ destinataires: [ADRESSE_GENERALE], expediteurEstArtisan: false, repondAuRecrutement: false, objet: "", corps: "", ...p })

describe("les deux copies", () => {
  it("le serveur a la même copie que l'écran", () => {
    const n = (s: string) => s.replace(/\r\n/g, "\n")
    expect(n(serveur)).toBe(n(ecran))
  })
})

describe("l'adresse dédiée", () => {
  it("se normalise : minuscules, sans espaces, le domaine ajouté s'il manque", () => {
    expect(normaliserAdresseDediee("  Jean ")).toBe("jean@crm.stcbatiment.fr")
    expect(normaliserAdresseDediee("Jean.Test@CRM.stcbatiment.fr")).toBe("jean.test@crm.stcbatiment.fr")
    expect(normaliserAdresseDediee("")).toBe("")
  })
  it("vide = pas d'adresse", () => expect(validerAdresseDediee("  ")).toEqual({ ok: true, adresse: null }))
  it("doit être sur le domaine du CRM", () => {
    expect(validerAdresseDediee("jean@gmail.com").ok).toBe(false)
    expect(validerAdresseDediee("jean@stcbatiment.fr").ok).toBe(false)
    expect(validerAdresseDediee("jean@os.stcbatiment.fr").ok).toBe(false)
    expect(validerAdresseDediee("jean@crm.stcbatiment.fr")).toEqual({ ok: true, adresse: "jean@crm.stcbatiment.fr" })
  })
  it("refuse les adresses communes et les caractères spéciaux", () => {
    expect(validerAdresseDediee("contact").ok).toBe(false)
    expect(validerAdresseDediee("recrutement@crm.stcbatiment.fr").ok).toBe(false)
    expect(validerAdresseDediee("élodie").ok).toBe(false)
    expect(validerAdresseDediee(".jean").ok).toBe(false)
  })
  it("reconnaît le domaine", () => {
    expect(estDuDomaine("Jean <jean@crm.stcbatiment.fr>")).toBe(true)
    expect(estDuDomaine("jean@stcbatiment.fr")).toBe(false)
  })
  it("trouve le compte dont l'adresse est parmi les destinataires", () => {
    const adresses = [{ compteId: "c1", email: "jean@crm.stcbatiment.fr" }, { compteId: "c2", email: "lea@crm.stcbatiment.fr" }]
    expect(compteDesDestinataires(["contact@crm.stcbatiment.fr", "Léa <LEA@crm.stcbatiment.fr>"], adresses)).toBe("c2")
    expect(compteDesDestinataires(["contact@crm.stcbatiment.fr"], adresses)).toBeNull()
  })
})

describe("la bonne boîte pour un mail reçu", () => {
  it("adressé au recrutement → Sous-traitants", () => expect(espaceDuMailRecu(indices({ destinataires: ["recrutement@crm.stcbatiment.fr"] }))).toEqual({ espace: "recrutement", raison: "adresse" }))
  it("un artisan de la base → Sous-traitants, même écrit à contact@", () => expect(espaceDuMailRecu(indices({ expediteurEstArtisan: true })).espace).toBe("recrutement"))
  it("une réponse à un mail du recrutement → Sous-traitants", () => expect(espaceDuMailRecu(indices({ repondAuRecrutement: true })).raison).toBe("reponse"))
  it("un artisan inconnu qui propose ses services → Sous-traitants", () => {
    expect(espaceDuMailRecu(indices({ objet: "Proposition", corps: "Bonjour, je suis plombier chauffagiste à Paris et je vous propose mes services." })).raison).toBe("contenu")
    expect(espaceDuMailRecu(indices({ objet: "Contrat de sous traitance", corps: "Ci-joint le contrat signé." })).espace).toBe("recrutement")
    expect(espaceDuMailRecu(indices({ objet: "Re: STC Bâtiment recherche des artisans partenaires", corps: "Intéressé." })).espace).toBe("recrutement")
    expect(espaceDuMailRecu(indices({ corps: "Nous sommes une entreprise de rénovation, nous aimerions devenir votre sous-traitant." })).espace).toBe("recrutement")
    expect(espaceDuMailRecu(indices({ corps: "Je suis électricien, disponible tout de suite." })).espace).toBe("recrutement")
  })
  it("une agence qui demande ou cite le Kbis reste au démarchage (STC est prestataire des agences)", () => {
    expect(espaceDuMailRecu(indices({ objet: "RE: Vos interventions locatives", corps: "Bonjour, merci de nous transmettre votre extrait Kbis ainsi que votre RIB." })).espace).toBe("demarchage")
    expect(espaceDuMailRecu(indices({ objet: "RE: Documents", corps: "Bien reçu.\n\nDe : STC Bâtiment\nVous trouverez notre K-bis à jour et notre attestation." })).espace).toBe("demarchage")
    expect(espaceDuMailRecu(indices({ objet: "Demande de rappel", corps: "Pouvez-vous me rappeler pour un dégât des eaux ?" })).espace).toBe("demarchage")
  })
  it("une agence qui cherche des sous-traitants reste au démarchage (c'est un client)", () => {
    expect(ressembleAUnArtisan("Besoin", "Nous cherchons des sous-traitants fiables pour nos lots.")).toBe(false)
  })
  it("ignore le mail cité en dessous de la réponse", () => {
    const corps = "Merci, rappelez-moi.\n\nLe lun. 3 nov. 2026 à 10:00, Exemple <x@exemple.fr> a écrit :\n> je suis plombier"
    expect(sansCitation(corps)).toBe("Merci, rappelez-moi.\n")
    expect(ressembleAUnArtisan("Re: devis", corps)).toBe(false)
  })
})

describe("les réponses à nos mails", () => {
  it("le sujet de base ôte les Re:, TR:, Fwd:", () => expect(sujetDeBase("RE: TR : Re: Rejoignez le réseau")).toBe("rejoignez le réseau"))
  it("répond à un de nos sujets du recrutement", () => {
    expect(repondAUnSujet("Re: Devenez partenaire", ["Devenez partenaire"])).toBe(true)
    expect(repondAUnSujet("Devenez partenaire", ["Devenez partenaire"])).toBe(false)
    expect(repondAUnSujet("Re: Autre chose", ["Devenez partenaire"])).toBe(false)
  })
  it("lit les identifiants cités, avec et sans le domaine", () => {
    expect(identifiantsCites("<abc-123@exemple.com>", "<x@y> <abc-123@exemple.com>")).toEqual(["abc-123@exemple.com", "abc-123", "x@y", "x"])
    expect(identifiantsCites(null, undefined)).toEqual([])
  })
})

describe("l'adresse qui envoie un mail du démarchage", () => {
  const parDefaut = "STC Bâtiment <contact@crm.stcbatiment.fr>"
  it("le compte connecté d'abord, sinon le commercial de l'agence, sinon personne", () => {
    expect(compteQuiEnvoie({ appelantId: "moi", commercialAgence: "autre" })).toBe("moi")
    expect(compteQuiEnvoie({ appelantId: null, commercialAgence: "autre" })).toBe("autre")
    expect(compteQuiEnvoie({})).toBeNull()
  })
  it("l'adresse dédiée de la personne : expéditeur, réponses, signature", () => {
    expect(expediteurDemarchage({ adresseDediee: "jean@crm.stcbatiment.fr", nom: "Jean Test", parDefaut })).toEqual({
      from: "Jean Test — STC Bâtiment <jean@crm.stcbatiment.fr>", replyTo: "jean@crm.stcbatiment.fr", adresseSignature: "jean@crm.stcbatiment.fr",
    })
  })
  it("sans adresse dédiée (ou une adresse invalide) : contact@, inchangé", () => {
    expect(expediteurDemarchage({ adresseDediee: null, nom: "Jean Test", parDefaut })).toEqual({ from: parDefaut, replyTo: null, adresseSignature: "contact@crm.stcbatiment.fr" })
    expect(expediteurDemarchage({ adresseDediee: "jean@gmail.com", nom: "Jean", parDefaut }).from).toBe(parDefaut)
  })
  it("un nom piégé ne casse pas l'en-tête", () => expect(expediteurDemarchage({ adresseDediee: "jean", nom: 'Jean "<x>"\r\n', parDefaut }).from).toBe("Jean x — STC Bâtiment <jean@crm.stcbatiment.fr>"))
  it("la signature STC porte l'adresse de la personne, le corps n'est pas touché", () => {
    const html = "Écrivez à contact@crm.stcbatiment.fr" + signatureStc({ nom: "Jean Test" })
    const sortie = signatureAvecAdresse(html, "jean@crm.stcbatiment.fr")
    expect(sortie).toContain("mailto:jean@crm.stcbatiment.fr")
    expect(sortie).toContain(">jean@crm.stcbatiment.fr</a>")
    expect(sortie).not.toContain("mailto:contact@crm.stcbatiment.fr")
    expect(sortie.startsWith("Écrivez à contact@crm.stcbatiment.fr")).toBe(true)
    expect(signatureAvecAdresse(html, ADRESSE_GENERALE)).toBe(html)
  })
})
