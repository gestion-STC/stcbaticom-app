import { describe, expect, it } from "vitest"
import { ORIGINE_TRACABILITE, compiler, configDe, filtreDesZones, messageVide, versEtapes, versSignaux } from "./configCampagne"
import { estEligible, type Campagne, type Contact, type Etape } from "./modele"

const etapes: Etape[] = [
  { id: "m1", type: "mail", variantes: [{ id: "v1", nom: "Mail J+0", objet: "Objet", corps: "<!DOCTYPE html><p style=\"a\">Texte {{lien_candidature}}</p>" }, { id: "v2", nom: "B", objet: "Autre", corps: "x" }] },
  { id: "a1", type: "attendre", jours: 3 },
  { id: "s1", type: "si", condition: "a_mobile", sinonVers: "f" },
  { id: "t1", type: "sms", variantes: [{ id: "t1", nom: "SMS J+6", objet: "", corps: "Bonjour {{lien_candidature}}" }] },
  { id: "l1", type: "linkedin", variantes: [{ id: "l1", nom: "Invitation", objet: "", corps: "Inviter" }] },
  { id: "n1", type: "newsletter", variantes: [{ id: "n1", nom: "Info", objet: "O", corps: "C" }] },
  { id: "c1", type: "appel", consigne: "Appeler" },
  { id: "f", type: "fin" },
]
const camp = (o: Partial<Campagne> = {}): Campagne => ({
  id: "k", nom: "K", baseId: "agences", objectif: "", statut: "pause", audience: { filtres: { etape: ["À prospecter"] }, doitAvoir: ["email"] },
  rythme: { parJour: 25, jours: [1], heureMin: 9, heureMax: 18, ecartMinH: 48 }, etapes, signaux: ["clic_lien_principal", "reponse"], creeParId: "", creeLe: "", lanceeLe: null, coutSms: 0.06, ...o,
})
const contact = (cp: string, o: Partial<Contact> = {}): Contact => ({ id: cp, baseId: "agences", nom: "", personne: "", email: "a@b.fr", mobile: "", telephone: "", champs: { cp, etape: "À prospecter" }, statut: "libre", desinscrit: false, proprietaireId: null, ...o })

describe("le réglage complet d'une campagne (09/11/2026)", () => {
  it("l'aller-retour ne change RIEN aux étapes d'une campagne existante", () => {
    expect(versEtapes(configDe(camp()))).toEqual(etapes)
    const c = compiler(camp(), configDe(camp()))
    expect(c.etapes).toEqual(etapes)
    expect(c.signaux).toEqual(["clic_lien_principal", "reponse"])
    expect(c.audience.filtres).toEqual({ etape: ["À prospecter"] })
  })
  it("un réglage enregistré est repris tel quel", () => {
    const cfg = configDe(camp())
    cfg.zones = ["92"]
    expect(configDe(camp({ config: cfg as unknown as Record<string, unknown> })).zones).toEqual(["92"])
  })
  it("la traçabilité des gestionnaires montre les critères d'aujourd'hui", () => {
    const q = configDe(camp({ origine: ORIGINE_TRACABILITE, etapes: [], signaux: [] })).qualification
    expect(q.interet.map((r) => [r.evenement, r.fois, r.jours])).toEqual([["A ouvert la plaquette", 2, 7], ["A ouvert la page « Créer un compte »", 1, 7], ["A répondu au mail", 1, 7]])
    expect(q.leadA).toBe("p-interet")
  })
  it("sous-traitants : la campagne s'arrête au dossier déposé, sans formulaire ni contrats", () => {
    const q = configDe(camp({ baseId: "artisans" })).qualification
    expect(q.etapes.find((e) => e.id === q.leadA)?.nom).toBe("Dossier déposé")
    expect(q.etapes.map((e) => e.nom)).toEqual(["Intérêt détecté", "Dossier déposé"])
    expect(q.gagneA).toBe("")
    expect(configDe(camp({ baseId: "artisans" })).creatifs.some((k) => k.id === "f-qualif")).toBe(false)
  })
  it("les zones deviennent un filtre, la France entière n'en met aucun", () => {
    expect(filtreDesZones("agences", [])).toBeNull()
    expect(filtreDesZones("agences", ["pays:250", "92"])).toBeNull()
    expect(filtreDesZones("agences", ["75011", "92"])).toEqual({ cle: "cp", valeurs: ["75011", "92"] })
    expect(filtreDesZones("artisans", ["75011", "75012", "92", "78"])).toEqual({ cle: "zone", valeurs: ["Paris", "Petite couronne", "Grande couronne"] })
  })
  it("le code postal se compare par le début : le 92 ne prend pas Ecquevilly (78920)", () => {
    const cfg = configDe(camp()); cfg.zones = ["92", "75011"]
    const c = compiler(camp(), cfg)
    expect(estEligible(contact("92100"), c)).toBe(true)
    expect(estEligible(contact("75011"), c)).toBe(true)
    expect(estEligible(contact("78920"), c)).toBe(false)
    expect(estEligible(contact("75012"), c)).toBe(false)
  })
  it("retirer les zones retire le filtre", () => {
    const cfg = configDe(camp()); cfg.zones = ["92"]
    const c = compiler(camp(), cfg)
    const sans = compiler(c, { ...cfg, zones: [] })
    expect(sans.audience.filtres).toEqual({ etape: ["À prospecter"] })
  })
  it("seules les règles connues du moteur deviennent ses signaux ; aucune règle, aucun signal", () => {
    expect(versSignaux([])).toEqual([])
    const r = (evenement: string, fois = 1) => ({ id: "x", evenement, fois, jours: 7 })
    expect(versSignaux([r("A cliqué un lien"), r("A ouvert la plaquette"), r("A ouvert le mail", 1)])).toEqual(["clic_lien"])
    expect(versSignaux([r("A ouvert le mail", 2)])).toEqual(["ouvertures_2"])
  })
  it("un envoi sans texte empêche de lancer", () => {
    const cfg = configDe(camp())
    expect(messageVide(cfg)).toBe(false)
    cfg.creatifs[0].variantes = [{ id: "v", nom: "A", objet: "", corps: " " }]
    expect(messageVide(cfg)).toBe(true)
  })
})
