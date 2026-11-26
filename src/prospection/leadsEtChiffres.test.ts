// LOT 3 (26/11/2026) : des leads et des chiffres justes, une seule règle par chiffre.
import { describe, expect, it } from "vitest"
import { estEligible, valeurRetenue, type Base, type Campagne, type Contact, type Envoi, type Evenement, type Inscription, type Lead } from "./modele"
import { estLeadRobot, leadsAgencesRattaches, leadsArtisansRattaches, leadsPourAB, mesuresAB } from "./abTest"
import { constats, derniersEssais, indicateurs } from "./indicateurs"
import { mesureCampagne } from "./mesureCampagne"
import { configDe, qualificationDeDepart, ORIGINE_TRACABILITE } from "./configCampagne"
import { AUCUN_FAIT, positionDans } from "../lib/parcoursLead"

const camp = (p: Partial<Campagne> = {}): Campagne => ({
  id: "c", nom: "C", baseId: "agences", objectif: "", statut: "active", audience: { filtres: {}, doitAvoir: [] }, rythme: { parJour: 10, jours: [1, 2, 3, 4, 5], heureMin: 9, heureMax: 18, ecartMinH: 48 },
  etapes: [{ id: "m1", type: "mail", variantes: [{ id: "v1", nom: "A", objet: "o", corps: "b" }, { id: "v2", nom: "B", objet: "o2", corps: "b" }] }], signaux: [], creeParId: "", creeLe: "2026-11-01T00:00:00Z", lanceeLe: "2026-11-01T08:00:00Z", coutSms: 0, ...p,
})
const k = (id: string, p: Partial<Contact> = {}): Contact => ({ id, baseId: "agences", nom: id, personne: "", email: `${id}@x.fr`, mobile: "", telephone: "", champs: {}, statut: "libre", desinscrit: false, proprietaireId: null, ...p })
const env = (id: string, p: Partial<Envoi> = {}): Envoi => ({ id, campagneId: "c", inscriptionId: "i", contactId: "a", etapeId: "m1", varianteId: "v1", canal: "mail", le: "2026-11-20T09:00:00Z", statut: "envoye", cause: "", ...p })
const ev = (envoiId: string, type: Evenement["type"], p: Partial<Evenement> = {}): Evenement => ({ id: envoiId + type, campagneId: "c", envoiId, contactId: "a", type, le: "2026-11-20T10:00:00Z", ...p })
const insc = (contactId: string, p: Partial<Inscription> = {}): Inscription => ({ id: "i" + contactId, campagneId: "c", contactId, entreeLe: "2026-11-10T09:00:00Z", etapeIndex: 0, prochaineLe: "2026-11-20T09:00:00Z", statut: "en_cours", sortieLe: null, ...p })
const base: Base = { id: "agences", nom: "G", unite: "agences", equipeId: "dev", champs: [], issues: [], gagne: "", prospection: true, liens: [] }

describe("filtre d'audience : égalité exacte", () => {
  it("« Paris 1 » ne prend plus Paris 10 à 19, « Paris 2 » plus Paris 20", () => {
    expect(valeurRetenue("Paris 1", "Paris 1")).toBe(true)
    for (const s of ["Paris 10", "Paris 15", "Paris 19"]) expect(valeurRetenue(s, "Paris 1")).toBe(false)
    expect(valeurRetenue("Paris 20", "Paris 2")).toBe(false)
    const c = camp({ audience: { filtres: { secteur: ["Paris 1"] }, doitAvoir: [] } })
    expect(estEligible(k("a", { champs: { secteur: "Paris 1" } }), c)).toBe(true)
    expect(estEligible(k("b", { champs: { secteur: "Paris 12" } }), c)).toBe(false)
  })
  it("sans tenir compte de la casse, des accents ni des espaces", () => {
    expect(valeurRetenue("  Électricité ", "electricite")).toBe(true)
    expect(valeurRetenue("Saint-Ouen", "saint-ouen ")).toBe(true)
  })
  it("un champ à plusieurs valeurs, et une valeur qui contient elle-même « / »", () => {
    expect(valeurRetenue("Peinture / Électricité", "Électricité")).toBe(true)
    expect(valeurRetenue("Peinture / Électricité", "Élec")).toBe(false)
    expect(valeurRetenue("Électricité / Plomberie / sanitaire", "Plomberie / sanitaire")).toBe(true)
    expect(valeurRetenue("Plomberie", "Plomberie / sanitaire")).toBe(false)
    expect(valeurRetenue("", "Paris 1")).toBe(false)
  })
  it("le code postal garde sa comparaison par le début", () => {
    const c = camp({ audience: { filtres: { cp: ["92"] }, doitAvoir: [] } })
    expect(estEligible(k("a", { champs: { cp: "92100" } }), c)).toBe(true)
    expect(estEligible(k("b", { champs: { cp: "78920" } }), c)).toBe(false)
  })
})

describe("les faux leads des robots ne comptent nulle part", () => {
  it("un lead fermé « robot » n'est rattaché à aucune campagne", () => {
    expect(estLeadRobot({ resultat: "robot" })).toBe(true)
    expect(estLeadRobot({ resultat: "" })).toBe(false)
    const r = leadsAgencesRattaches([{ agenceId: "a", creeLe: "2026-11-20T00:00:00Z", resultat: "robot" }, { agenceId: "b", creeLe: "2026-11-20T00:00:00Z", resultat: "" }], [{ campagneId: "c", contactId: "a", entreeLe: "2026-11-10T00:00:00Z" }, { campagneId: "c", contactId: "b", entreeLe: "2026-11-10T00:00:00Z" }])
    expect(r).toEqual([{ contactId: "b", campagneId: "c" }])
  })
})

describe("leads d'une campagne : la règle de la liste, reprise par le test A/B", () => {
  it("un lead revient à la campagne où le contact était entré à sa date ; avant toute entrée, à aucune", () => {
    const inscs = [{ campagneId: "c1", contactId: "a", entreeLe: "2026-10-01T00:00:00Z" }, { campagneId: "c2", contactId: "a", entreeLe: "2026-11-01T00:00:00Z" }]
    const r = leadsAgencesRattaches([{ agenceId: "a", creeLe: "2026-10-15T00:00:00Z" }, { agenceId: "a", creeLe: "2026-11-15T00:00:00Z" }, { agenceId: "a", creeLe: "2026-09-01T00:00:00Z" }], inscs)
    expect(r.map((x) => x.campagneId)).toEqual(["c1", "c2", null])
  })
  it("artisan : lead ou gagné, inscrit, rattaché à la campagne de son premier clic", () => {
    const r = leadsArtisansRattaches([{ id: "a", statut: "lead" }, { id: "b", statut: "libre" }, { id: "c", statut: "gagne" }], [{ contactId: "a", campagneId: "x", le: "2026-11-02" }, { contactId: "a", campagneId: "y", le: "2026-11-01" }, { contactId: "b", campagneId: "x", le: "2026-11-01" }], new Set(["a", "b", "c"]))
    expect(r).toEqual([{ contactId: "a", campagneId: "y" }])
  })
  it("A/B : une fiche « lead » devenue lead AILLEURS ne compte plus pour le test", () => {
    const lds: Lead[] = [{ id: "l", contactId: "a", baseId: "agences", campagneId: "c", signal: "", creeLe: "2026-11-21T00:00:00Z", statut: "a_traiter", proprietaireId: null }]
    const contacts = [k("a", { statut: "lead" }), k("b", { statut: "lead" })]
    const envois = [env("1", { contactId: "a" }), env("2", { contactId: "b", varianteId: "v2" })]
    const evs = [ev("1", "delivre"), ev("2", "delivre", { contactId: "b" })]
    const ind = indicateurs(camp(), base, contacts, [insc("a"), insc("b")], envois, evs, lds, [])
    expect(ind.parVariante.map((v) => [v.nom, v.leads])).toEqual([["A", 1], ["B", 0]])
    expect(ind.conversion.leads).toBe(1)
    expect([...leadsPourAB("c", lds)]).toEqual(["a"])
  })
})

describe("touché = envoi confirmé parti, partout", () => {
  // 4 contacts confiés à Instantly, 2 confirmés : le Suivi, les étapes, l'A/B et la Mesure de l'éditeur disent tous 2.
  const envois = ["a", "b", "c", "d"].map((x, i) => env(String(i), { contactId: x, varianteId: i % 2 ? "v2" : "v1" }))
  const evs = [ev("0", "delivre"), ev("1", "ouvert", { contactId: "b" })]
  const contacts = ["a", "b", "c", "d"].map((x) => k(x))
  const inscs = ["a", "b", "c", "d"].map((x) => insc(x))
  it("Suivi, onglet Étapes, A/B", () => {
    const ind = indicateurs(camp(), base, contacts, inscs, envois, evs, [], [])
    expect(ind.engagement.touches).toBe(2)
    expect(ind.parEtape[0].envoyes).toBe(2)
    expect(ind.parVariante.reduce((s, v) => s + v.envoyes, 0)).toBe(2)
    expect(ind.parVariante.find((v) => v.nom === "B")!.tauxOuverture).toBe(1)
  })
  it("Mesure de l'éditeur", () => {
    const m = mesureCampagne(configDe(camp()), "c", 0, inscs, envois, evs, [], 0, true, { leads: 0, gagnes: 0, contactsLeads: [] })
    expect(m.lignes.find((l) => l.libelle === "Touchés")!.n).toBe(2)
    // Hors Instantly (machine sous-traitants, avis) : tout envoi « envoyé » est parti.
    expect(mesureCampagne(configDe(camp()), "c", 0, inscs, envois, evs, [], 0, false, { leads: 0, gagnes: 0, contactsLeads: [] }).lignes.find((l) => l.libelle === "Touchés")!.n).toBe(4)
  })
  it("le moteur mesure l'A/B pareil : envois partis, hors tests", () => {
    const m = mesuresAB([{ id: "v1", nom: "A" }, { id: "v2", nom: "B" }], [...envois, env("t", { contactId: "z", test: true })], evs, new Set(), true)
    expect(m.map((x) => x.envoyes)).toEqual([1, 1])
  })
})

describe("sautés et erreurs comptés par contact, sur son dernier état", () => {
  it("35 contacts sautés à chaque passage ne font pas 8 857 sautés ; une erreur finalement partie n'est plus une erreur", () => {
    const envois: Envoi[] = []
    for (let p = 0; p < 5; p++) for (let i = 0; i < 3; i++) envois.push(env(`s${p}-${i}`, { contactId: `s${i}`, statut: "saute", le: `2026-11-2${p}T09:00:00Z` }))
    envois.push(env("e1", { contactId: "x", statut: "erreur", le: "2026-11-20T09:00:00Z" }), env("e2", { contactId: "x", statut: "envoye", le: "2026-11-21T09:00:00Z" }))
    envois.push(env("e3", { contactId: "y", statut: "erreur", le: "2026-11-20T09:00:00Z" }), env("e4", { contactId: "y", statut: "erreur", le: "2026-11-21T09:00:00Z" }))
    expect(derniersEssais(envois)).toHaveLength(5)
    const ind = indicateurs(camp({ origine: "st", baseId: "artisans" }), { ...base, id: "artisans" }, [], [], envois, [], [], [])
    expect(ind.envois.sautes).toBe(3)
    expect(ind.envois.erreurs).toBe(1)
    expect(ind.parEtape[0]).toMatchObject({ sautes: 3, erreurs: 1, envoyes: 1 })
    expect(ind.parJour.reduce((s, j) => s + j.erreurs, 0)).toBe(1)
    const texte = constats(ind).map((c) => c.preuve).join(" ")
    expect(texte).toMatch(/3 contacts sans mail pour 1 touché/)
  })
  it("un message parti puis un nouvel essai en erreur : le contact compte parti, pas en erreur", () => {
    const envois = [
      env("p1", { contactId: "x", statut: "envoye", le: "2026-08-18T09:00:00Z" }),
      env("p2", { contactId: "x", statut: "erreur", le: "2026-08-19T09:00:00Z" }),
      env("p3", { contactId: "y", statut: "erreur", le: "2026-08-19T09:00:00Z" }),
    ]
    const d = derniersEssais(envois)
    expect(d.map((e) => e.id).sort()).toEqual(["p1", "p3"])
    const ind = indicateurs(camp({ origine: "st", baseId: "artisans" }), { ...base, id: "artisans" }, [], [], envois, [], [], [])
    expect(ind.envois.erreurs).toBe(1)
    expect(ind.parEtape[0]).toMatchObject({ erreurs: 1 })
  })
})

describe("gagnés d'une campagne : devenus clients APRÈS leur entrée", () => {
  it("un client de longue date entré dans la campagne n'est pas gagné par elle", () => {
    const contacts = [k("a", { statut: "gagne", gagneLe: "2026-11-15" }), k("b", { statut: "gagne", gagneLe: "2026-01-01" }), k("c", { statut: "gagne", gagneLe: null }), k("d", { statut: "gagne", gagneLe: "2026-11-10" })]
    const ind = indicateurs(camp(), base, contacts, ["a", "b", "c", "d"].map((x) => insc(x)), [], [], [], [])
    expect(ind.conversion.gagnes).toBe(2) // a, et d (le jour même de son entrée)
  })
})

describe("Leads reçus : un lead hors campagne reste un lead", () => {
  it("avec les règles d'avant (traçabilité) : l'intérêt suffit", () => {
    const q = qualificationDeDepart("agences", ORIGINE_TRACABILITE)
    const p = positionDans(q, { ...AUCUN_FAIT, interet: true }, new Set(), false)
    expect(p.estLead).toBe(true)
    expect(p.etape).toBe("nouveaux")
    // Une agence passée « Intéressé » sans lead en base : lead aussi.
    expect(positionDans(q, { ...AUCUN_FAIT, jointInteresse: true }, new Set(), false).estLead).toBe(true)
  })
})
