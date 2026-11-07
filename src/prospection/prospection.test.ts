import { describe, expect, it } from "vitest"
import type { Base, Campagne, Compte, Contact, Envoi, Equipe, Evenement, Inscription } from "./modele"
import { basesVisibles, contactVisible, estEligible } from "./modele"
import { leadsNouveaux, passage } from "./moteur"
import { constats, indicateurs } from "./indicateurs"
import modeleEcran from "./modele.ts?raw"
import moteurEcran from "./moteur.ts?raw"
import modeleServeur from "../../supabase/functions/_shared/campagnes/modele.ts?raw"
import moteurServeur from "../../supabase/functions/_shared/campagnes/moteur.ts?raw"

let n = 0
const id = () => `x${++n}`
const base: Base = { id: "b1", nom: "Agences", unite: "agences", equipeId: "e1", champs: [{ cle: "secteur", libelle: "Secteur" }], issues: [], gagne: "client", prospection: true, liens: [] }
const contact = (o: Partial<Contact> = {}): Contact => ({ id: id(), baseId: "b1", nom: "Agence", personne: "", email: "a@b.fr", mobile: "", telephone: "", champs: { secteur: "75011" }, statut: "libre", desinscrit: false, proprietaireId: null, ...o })
const campagne = (o: Partial<Campagne> = {}): Campagne => ({
  id: "c1", nom: "Test", baseId: "b1", objectif: "", statut: "active",
  audience: { filtres: {}, doitAvoir: ["email"] }, rythme: { parJour: 2, jours: [1, 2, 3, 4, 5, 6, 7], heureMin: 0, heureMax: 24, ecartMinH: 48 },
  etapes: [
    { id: "s1", type: "mail", variantes: [{ id: "va", nom: "A", objet: "Bonjour", corps: "" }, { id: "vb", nom: "B", objet: "Salut", corps: "" }] },
    { id: "s2", type: "attendre", jours: 3 },
    { id: "s3", type: "si", condition: "a_mobile", sinonVers: "s5" },
    { id: "s4", type: "sms", variantes: [{ id: "vs", nom: "SMS", objet: "", corps: "" }] },
    { id: "s5", type: "appel", consigne: "Appeler" },
    { id: "s6", type: "fin" },
  ],
  signaux: ["clic_lien", "reponse"], creeParId: "m", creeLe: "2026-11-01T08:00:00Z", lanceeLe: "2026-11-01T08:00:00Z", coutSms: 0.06, ...o,
})
const appliquer = (inscs: Inscription[], ecr: ReturnType<typeof passage>) => {
  const m = new Map(inscs.map((i) => [i.id, i]))
  for (const i of [...ecr.inscriptions, ...ecr.majInscriptions]) m.set(i.id, i)
  return [...m.values()]
}

describe("le cloisonnement", () => {
  const equipes: Equipe[] = [{ id: "e1", nom: "Développement", comptes: ["h"] }, { id: "e2", nom: "Recrutement", comptes: ["a"] }]
  const bases: Base[] = [base, { ...base, id: "b2", equipeId: "e2" }]
  const h: Compte = { id: "h", nom: "Horlann", role: "commercial" }, m: Compte = { id: "m", nom: "Mahdi", role: "gerant" }
  it("un commercial ne voit que les bases de ses équipes ; le gérant voit tout", () => {
    expect(basesVisibles(h, equipes, bases).map((b) => b.id)).toEqual(["b1"])
    expect(basesVisibles(m, equipes, bases)).toHaveLength(2)
  })
  it("un contact attribué à un autre commercial reste caché, même dans une base visible", () => {
    const vis = new Set(["b1"])
    expect(contactVisible(contact(), h, vis)).toBe(true)
    expect(contactVisible(contact({ proprietaireId: "autre" }), h, vis)).toBe(false)
    expect(contactVisible(contact({ baseId: "b2" }), h, vis)).toBe(false)
    expect(contactVisible(contact({ proprietaireId: "autre" }), m, vis)).toBe(true)
  })
})

describe("le moteur", () => {
  it("l'audience : filtres, désinscrits, clients et sans-mail exclus", () => {
    const c = campagne({ audience: { filtres: { secteur: ["750"] }, doitAvoir: ["email"] } })
    expect(estEligible(contact(), c)).toBe(true)
    expect(estEligible(contact({ champs: { secteur: "92100" } }), c)).toBe(false)
    expect(estEligible(contact({ desinscrit: true }), c)).toBe(false)
    expect(estEligible(contact({ statut: "gagne" }), c)).toBe(false)
    expect(estEligible(contact({ email: "" }), c)).toBe(false)
  })
  it("entre au plus le plafond du jour, et envoie la 1re étape tout de suite", () => {
    const contacts = [contact(), contact(), contact()]
    const ecr = passage({ campagne: campagne(), contacts, inscriptions: [], envois: [], evenements: [] }, new Date("2026-11-02T09:00:00Z"), id)
    expect(ecr.inscriptions).toHaveLength(2)
    expect(ecr.envois.map((e) => e.statut)).toEqual(["envoye", "envoye"])
    expect(ecr.inscriptions.every((i) => i.etapeIndex === 2)).toBe(true) // mail fait, attente posée
  })
  it("« Si a un mobile » : sans mobile, on saute le SMS et on va à l'appel ; la tâche d'appel est créée", () => {
    const k = contact()
    const t0 = new Date("2026-11-02T09:00:00Z")
    let inscs: Inscription[] = []
    const envois: Envoi[] = []
    let ecr = passage({ campagne: campagne(), contacts: [k], inscriptions: inscs, envois, evenements: [] }, t0, id)
    inscs = appliquer(inscs, ecr); envois.push(...ecr.envois)
    ecr = passage({ campagne: campagne(), contacts: [k], inscriptions: inscs, envois, evenements: [] }, new Date("2026-11-05T10:00:00Z"), id)
    expect(ecr.envois).toHaveLength(0)
    expect(ecr.taches.map((x) => x.type)).toEqual(["appel"])
    expect(ecr.majInscriptions[0].statut).toBe("terminee")
  })
  it("48 h minimum entre deux touches", () => {
    const k = contact({ mobile: "0612345678" })
    const c = campagne({ etapes: [{ id: "m1", type: "mail", variantes: [] }, { id: "m2", type: "sms", variantes: [] }, { id: "f", type: "fin" }] })
    const t0 = new Date("2026-11-02T09:00:00Z")
    let inscs: Inscription[] = []
    const envois: Envoi[] = []
    let ecr = passage({ campagne: c, contacts: [k], inscriptions: inscs, envois, evenements: [] }, t0, id)
    inscs = appliquer(inscs, ecr); envois.push(...ecr.envois)
    ecr = passage({ campagne: c, contacts: [k], inscriptions: inscs, envois, evenements: [] }, new Date("2026-11-03T09:00:00Z"), id)
    expect(ecr.envois).toHaveLength(0)
    ecr = passage({ campagne: c, contacts: [k], inscriptions: inscs, envois, evenements: [] }, new Date("2026-11-04T10:00:00Z"), id)
    expect(ecr.envois.map((e) => e.canal)).toEqual(["sms"])
  })
  it("un clic fait un lead : le contact sort de la séquence", () => {
    const k = contact()
    const insc: Inscription = { id: "i1", campagneId: "c1", contactId: k.id, entreeLe: "2026-11-02T09:00:00Z", etapeIndex: 2, prochaineLe: "2026-11-05T09:00:00Z", statut: "en_cours", sortieLe: null }
    const ev: Evenement = { id: "e", campagneId: "c1", envoiId: null, contactId: k.id, type: "clic", le: "2026-11-02T10:00:00Z" }
    const r = leadsNouveaux(campagne(), [ev], [insc], [], [k], new Date("2026-11-02T11:00:00Z"), id)
    expect(r.leads.map((l) => l.signal)).toEqual(["A cliqué un lien"])
    expect(r.sorties[0].statut).toBe("lead")
  })
})

describe("les indicateurs", () => {
  it("touchés, taux, 1er clic rattaché à son envoi, coûts SMS, A/B", () => {
    const a = contact({ champs: { secteur: "75011" } }), b = contact({ champs: { secteur: "92100" } })
    const c = campagne()
    const inscs: Inscription[] = [a, b].map((k, i) => ({ id: `i${i}`, campagneId: "c1", contactId: k.id, entreeLe: "2026-11-02T09:00:00Z", etapeIndex: 2, prochaineLe: "", statut: "en_cours", sortieLe: null }))
    const envois: Envoi[] = [
      { id: "n1", campagneId: "c1", inscriptionId: "i0", contactId: a.id, etapeId: "s1", varianteId: "va", canal: "mail", le: "2026-11-02T09:00:00Z", statut: "envoye", cause: "" },
      { id: "n2", campagneId: "c1", inscriptionId: "i1", contactId: b.id, etapeId: "s1", varianteId: "vb", canal: "mail", le: "2026-11-02T09:00:00Z", statut: "envoye", cause: "" },
      { id: "n3", campagneId: "c1", inscriptionId: "i1", contactId: b.id, etapeId: "s4", varianteId: "vs", canal: "sms", le: "2026-11-05T09:00:00Z", statut: "envoye", cause: "" },
    ]
    const evs: Evenement[] = [
      { id: "v1", campagneId: "c1", envoiId: "n1", contactId: a.id, type: "ouvert", le: "2026-11-02T10:00:00Z" },
      { id: "v2", campagneId: "c1", envoiId: "n1", contactId: a.id, type: "clic", le: "2026-11-02T10:05:00Z" },
      { id: "v3", campagneId: "c1", envoiId: "n3", contactId: b.id, type: "clic", le: "2026-11-05T11:00:00Z" },
    ]
    const lead = { id: "l", contactId: a.id, baseId: "b1", campagneId: "c1", signal: "", creeLe: "2026-11-02T10:05:00Z", statut: "a_traiter" as const, proprietaireId: null }
    const ind = indicateurs(c, base, [a, b], inscs, envois, evs, [lead], [])
    expect(ind.engagement.touches).toBe(2)
    expect(ind.engagement.tauxClic).toBe(1)
    expect(ind.parEtape.find((e) => e.etapeId === "s1")!.premiersClics).toBe(1)
    expect(ind.parEtape.find((e) => e.etapeId === "s4")!.premiersClics).toBe(1)
    expect(ind.couts).toMatchObject({ sms: 1, coutSms: 0.06, coutParLead: 0.06 })
    expect(ind.parVariante.map((v) => [v.nom, v.envoyes, v.cliqueurs])).toEqual([["A", 1, 1], ["B", 1, 0]])
    expect(ind.parSegment[0].lignes.map((l) => l.valeur).sort()).toEqual(["75011", "92100"])
    expect(ind.conversion.delaiMedianLeadJ).toBeCloseTo(1.08 / 24, 2)
    expect(constats(ind).some((k) => k.titre.includes("attend"))).toBe(true)
  })
})

describe("le moteur du serveur", () => {
  it("est la copie EXACTE du moteur de l'écran (_shared/campagnes)", () => {
    const n = (t: string) => t.replace(/\r\n/g, "\n")
    expect(n(modeleServeur)).toBe(n(modeleEcran))
    expect(n(moteurServeur)).toBe(n(moteurEcran))
  })
  it("la plage horaire est celle de Paris, pas celle du serveur", async () => {
    const { dansLaPlage } = await import("./moteur")
    const c = campagne({ rythme: { parJour: 2, jours: [1, 2, 3, 4, 5], heureMin: 9, heureMax: 18, ecartMinH: 48 } })
    expect(dansLaPlage(c, new Date("2026-11-02T07:30:00Z"))).toBe(false) // 8 h 30 à Paris
    expect(dansLaPlage(c, new Date("2026-11-02T08:30:00Z"))).toBe(true) // 9 h 30
    expect(dansLaPlage(c, new Date("2026-11-07T10:00:00Z"))).toBe(false) // samedi
  })
  it("« contacts complets » : mail ET téléphone exigés", () => {
    const c = campagne({ audience: { filtres: {}, doitAvoir: ["email", "telephone"] } })
    expect(estEligible(contact({ telephone: "0145000000" }), c)).toBe(true)
    expect(estEligible(contact({ telephone: "" }), c)).toBe(false)
  })
})
