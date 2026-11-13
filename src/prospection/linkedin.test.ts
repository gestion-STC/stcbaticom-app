// LinkedIn dans les campagnes (Mahdi, 11/11/2026).
import { describe, expect, it } from "vitest"
import type { Campagne, Contact } from "./modele"
import { estEligible } from "./modele"
import { passage } from "./moteur"
import { LINKEDIN_DEPART, NOTE_MAX, compteDeCampagne, estAttenteLinkedIn, estSautLinkedIn, faitsParCompte, identifiantLinkedIn, noteInvitation, peutAgirLinkedIn, restantLinkedIn } from "./linkedin"
import sqlParCompte from "../../supabase/maj-2026-11-13-linkedin-par-compte.sql?raw"
import { devinerColonnes } from "./colonnesImport"
import { preparerLignes } from "../demarchage/importAgences"
import ecran from "./linkedin.ts?raw"
import serveur from "../../supabase/functions/_shared/campagnes/linkedin.ts?raw"
import sql from "../../supabase/maj-2026-11-11-linkedin.sql?raw"

let n = 0
const id = () => `l${++n}`
const contact = (o: Partial<Contact> = {}): Contact => ({ id: id(), baseId: "agences", nom: "Agence", personne: "Claire Martin", email: "c@a.fr", mobile: "", telephone: "", champs: { linkedin: "https://www.linkedin.com/in/claire-martin-123/" }, statut: "libre", desinscrit: false, proprietaireId: null, ...o })
const campagne = (etapes: Campagne["etapes"], o: Partial<Campagne> = {}): Campagne => ({
  id: "c1", nom: "LinkedIn", baseId: "agences", objectif: "", statut: "active", audience: { filtres: {}, doitAvoir: [] },
  rythme: { parJour: 5, jours: [1, 2, 3, 4, 5, 6, 7], heureMin: 0, heureMax: 24, ecartMinH: 0 }, etapes, signaux: [], creeParId: "m", creeLe: "2026-11-01T08:00:00Z", lanceeLe: "2026-11-01T08:00:00Z", coutSms: 0, ...o,
})
const v = [{ id: "v1", nom: "A", objet: "", corps: "Bonjour {{contact}}" }]

describe("LinkedIn", () => {
  it("le serveur a la même copie que l'écran", () => expect(serveur.replace(/\r\n/g, "\n")).toBe(ecran.replace(/\r\n/g, "\n")))
  it("lit le profil d'une fiche : adresse, Sales Navigator, identifiant seul", () => {
    expect(identifiantLinkedIn("https://www.linkedin.com/in/claire-martin-123/")).toBe("claire-martin-123")
    expect(identifiantLinkedIn("linkedin.com/in/jean%C3%A9ric?trk=x")).toBe("jeanéric")
    expect(identifiantLinkedIn("https://www.linkedin.com/sales/lead/ACwAAA123,NAME_SEARCH,abc")).toBe("ACwAAA123")
    expect(identifiantLinkedIn("claire-martin-123")).toBe("claire-martin-123")
    expect(identifiantLinkedIn("https://exemple.com/claire")).toBe("")
    expect(identifiantLinkedIn("")).toBe("")
  })
  it("une note d'invitation ne dépasse jamais 300 caractères, et ne coupe pas un mot", () => {
    const n = noteInvitation("mot ".repeat(120))
    expect(n.length).toBeLessThanOrEqual(NOTE_MAX)
    expect(n.endsWith("…")).toBe(true)
    expect(noteInvitation("Bonjour Claire")).toBe("Bonjour Claire")
  })
  it("les plafonds et les heures du compte", () => {
    expect(peutAgirLinkedIn(LINKEDIN_DEPART, 0, 0, 10).ok).toBe(true)
    expect(peutAgirLinkedIn(LINKEDIN_DEPART, 20, 0, 10).motif).toContain("du jour")
    expect(peutAgirLinkedIn(LINKEDIN_DEPART, 0, 80, 10).motif).toContain("semaine")
    expect(peutAgirLinkedIn(LINKEDIN_DEPART, 0, 0, 20).ok).toBe(false)
  })
  it("les réponses d'Unipile : attendre, ou passer", () => {
    expect(estAttenteLinkedIn(422, "errors/cannot_resend_yet")).toBe(true)
    expect(estAttenteLinkedIn(429, "")).toBe(true)
    expect(estSautLinkedIn("errors/already_invited_recently")).toBe(true)
    expect(estSautLinkedIn("errors/invalid_parameters")).toBe(false)
  })
  it("le moteur : une invitation automatique devient un envoi LinkedIn ; sans profil, l'étape est sautée", () => {
    const c = campagne([{ id: "e1", type: "linkedin", variantes: v, linkedin: "invitation" }, { id: "e2", type: "fin" }])
    const avec = contact(), sans = contact({ champs: {} })
    const r = passage({ campagne: c, contacts: [avec, sans], inscriptions: [], envois: [], evenements: [] }, new Date("2026-11-12T09:00:00Z"), id)
    const e = r.envois.find((x) => x.contactId === avec.id)!, s = r.envois.find((x) => x.contactId === sans.id)!
    expect(e.canal).toBe("linkedin")
    expect(e.statut).toBe("envoye")
    expect(s.statut).toBe("saute")
    expect(s.cause).toBe("pas de profil LinkedIn")
    expect(r.taches).toHaveLength(0)
  })
  it("le moteur : sans mode, une étape LinkedIn reste une tâche pour le commercial", () => {
    const c = campagne([{ id: "e1", type: "linkedin", variantes: v }, { id: "e2", type: "fin" }])
    const r = passage({ campagne: c, contacts: [contact()], inscriptions: [], envois: [], evenements: [] }, new Date("2026-11-12T09:00:00Z"), id)
    expect(r.taches.map((t) => t.type)).toEqual(["linkedin"])
    expect(r.envois).toHaveLength(0)
  })
  it("« Si… a accepté l'invitation » : suit l'événement connexion", () => {
    const k = contact()
    const c = campagne([{ id: "s", type: "si", condition: "a_accepte", sinonVers: "m" }, { id: "li", type: "linkedin", variantes: v, linkedin: "message" }, { id: "m", type: "mail", variantes: v }])
    const insc = { id: "i1", campagneId: "c1", contactId: k.id, entreeLe: "2026-11-10T09:00:00Z", etapeIndex: 0, prochaineLe: "2026-11-10T09:00:00Z", statut: "en_cours" as const, sortieLe: null }
    const oui = passage({ campagne: c, contacts: [k], inscriptions: [insc], envois: [], evenements: [{ id: "x", campagneId: "c1", envoiId: null, contactId: k.id, type: "connexion", le: "2026-11-11T09:00:00Z" }] }, new Date("2026-11-12T09:00:00Z"), id)
    expect(oui.envois[0].canal).toBe("linkedin")
    const non = passage({ campagne: c, contacts: [k], inscriptions: [insc], envois: [], evenements: [] }, new Date("2026-11-12T09:00:00Z"), id)
    expect(non.envois[0].canal).toBe("mail")
  })
  it("l'audience « doit avoir un profil LinkedIn »", () => {
    const c = campagne([], { audience: { filtres: {}, doitAvoir: ["linkedin"] } })
    expect(estEligible(contact(), c)).toBe(true)
    expect(estEligible(contact({ champs: {} }), c)).toBe(false)
  })
  it("l'import d'un fichier Sales Navigator : prénom, nom et profil LinkedIn", () => {
    expect(devinerColonnes(["First Name", "Last Name", "Company", "LinkedIn URL", "Email"], "agences")).toEqual(["Prénom du contact", "Contact", "Agence", "LinkedIn", "E-mail"])
    const { lignes } = preparerLignes([["Agence", "Téléphone", "Prénom du contact", "Contact", "LinkedIn"], ["Agence Martin", "01 43 00 00 00", "Claire", "Martin", "https://www.linkedin.com/in/claire-martin-123/"]])
    expect(lignes[0].contactNom).toBe("Claire Martin")
    expect(lignes[0].contactLinkedin).toBe("https://www.linkedin.com/in/claire-martin-123/")
  })
  it("le SQL : la colonne, l'événement, la base des campagnes", () => {
    expect(sql).toContain("add column if not exists linkedin text")
    expect(sql).toContain("'connexion'")
    expect(sql).toContain("security_invoker = true")
  })
  it("le plafond se compte pour chaque compte branché", () => {
    const debut = "2026-11-13T00:00:00Z"
    const envois = [
      { compte: "horlann", le: "2026-11-13T09:00:00Z" }, { compte: "horlann", le: "2026-11-12T09:00:00Z" },
      { compte: "alexandre", le: "2026-11-13T10:00:00Z" },
      { compte: null, le: "2026-11-13T08:00:00Z" }, // d'avant : compté pour le premier compte
    ]
    const f = faitsParCompte(envois, debut, "horlann")
    expect(f.get("horlann")).toEqual({ jour: 2, semaine: 3 })
    expect(f.get("alexandre")).toEqual({ jour: 1, semaine: 1 })
    // Chacun a ses 20 par jour et ses 2 par passage, sans manger ceux de l'autre.
    expect(restantLinkedIn(LINKEDIN_DEPART, { jour: 19, semaine: 19, passage: 0 }, 10)).toBe(1)
    expect(restantLinkedIn(LINKEDIN_DEPART, { jour: 0, semaine: 0, passage: 0 }, 10)).toBe(2)
    expect(restantLinkedIn(LINKEDIN_DEPART, { jour: 0, semaine: 0, passage: 2 }, 10)).toBe(0)
    expect(restantLinkedIn(LINKEDIN_DEPART, { jour: 20, semaine: 20, passage: 0 }, 10)).toBe(0)
    expect(restantLinkedIn(LINKEDIN_DEPART, { jour: 0, semaine: 80, passage: 0 }, 10)).toBe(0)
    expect(restantLinkedIn(LINKEDIN_DEPART, { jour: 0, semaine: 0, passage: 0 }, 20)).toBe(0) // hors des heures
  })
  it("le compte d'une campagne : celui choisi s'il est branché, sinon le premier", () => {
    const comptes = [{ id: "horlann" }, { id: "alexandre" }]
    expect(compteDeCampagne(comptes, "alexandre")?.id).toBe("alexandre")
    expect(compteDeCampagne(comptes, "debranche")?.id).toBe("horlann")
    expect(compteDeCampagne(comptes, undefined)?.id).toBe("horlann")
    expect(compteDeCampagne([], "alexandre")).toBeNull()
  })
  it("le SQL du plafond par compte : une colonne, additive", () => {
    expect(sqlParCompte).toContain("add column if not exists compte_linkedin text")
    expect(sqlParCompte).not.toMatch(/drop |delete |update /i)
  })
})
