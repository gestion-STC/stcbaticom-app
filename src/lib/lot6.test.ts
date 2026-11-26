// LOT 6 (26/11/2026) : les défauts trouvés au contrôle final.
import { describe, expect, it } from "vitest"
import type { EtatProspection } from "../prospection/depot"
import type { Base, Campagne, Contact, Envoi, Evenement, Inscription, Lead } from "../prospection/modele"
import { indicateurs, parInstantly } from "../prospection/indicateurs"
import { lignesCampagnesCockpit } from "./cockpitCampagnes"
import { equipeEtReste } from "./cockpitTelepro"
import { lireChiffres, lireSousTraitantsStc } from "./cockpitStc"
import { lecturesPartielles } from "../components/cockpit/useRafraichi"
import moteur from "../../supabase/functions/campagnes-moteur/index.ts?raw"
import chiffres from "../../supabase/functions/synchro-clients/chiffres.ts?raw"
import lienSt from "../../supabase/functions/lien-st/index.ts?raw"
import session from "../components/demarchage/SessionCall.tsx?raw"
import tableauStDb from "./tableauStDb.ts?raw"
import machineDb from "./machineDb.ts?raw"

const base: Base = { id: "agences", nom: "G", unite: "agences", equipeId: "dev", champs: [], issues: [], gagne: "", prospection: true, liens: [] }
const camp = (p: Partial<Campagne> = {}): Campagne => ({
  id: "c", nom: "histoires", baseId: "agences", objectif: "", statut: "active", audience: { filtres: {}, doitAvoir: [] }, rythme: { parJour: 10, jours: [1, 2, 3, 4, 5], heureMin: 9, heureMax: 18, ecartMinH: 48 },
  etapes: [{ id: "m1", type: "mail", variantes: [{ id: "v1", nom: "A", objet: "o", corps: "b" }] }], signaux: [], creeParId: "", creeLe: "2026-11-01T00:00:00Z", lanceeLe: "2026-11-01T08:00:00Z", coutSms: 0, origine: "", ...p,
})
const k = (id: string): Contact => ({ id, baseId: "agences", nom: id, personne: "", email: `${id}@x.fr`, mobile: "", telephone: "", champs: {}, statut: "libre", desinscrit: false, proprietaireId: null })
const env = (id: string, contactId: string, p: Partial<Envoi> = {}): Envoi => ({ id, campagneId: "c", inscriptionId: "i" + contactId, contactId, etapeId: "m1", varianteId: "v1", canal: "mail", le: "2026-11-20T09:00:00Z", statut: "envoye", cause: "", ...p })
const ev = (envoiId: string, contactId: string, type: Evenement["type"], le = "2026-11-20T10:00:00Z"): Evenement => ({ id: envoiId + type + le, campagneId: "c", envoiId, contactId, type, le })
const insc = (contactId: string): Inscription => ({ id: "i" + contactId, campagneId: "c", contactId, entreeLe: "2026-11-10T09:00:00Z", etapeIndex: 0, prochaineLe: "2026-11-20T09:00:00Z", statut: "en_cours", sortieLe: null })
const lead = (contactId: string): Lead => ({ id: "l" + contactId, contactId, baseId: "agences", campagneId: "c", signal: "", creeLe: "2026-11-21T09:00:00Z", statut: "a_traiter", proprietaireId: null })

describe("G1 · les campagnes du Dashboard = la liste et le Suivi", () => {
  // « histoires » : 2 leads au Suivi (un venu d'un clic, un d'une réponse au mail), 1 seul au Dashboard avant le lot 6.
  const etat = {
    maintenant: "2026-11-26T12:00:00Z", comptes: [], equipes: [], bases: [base], messages: [], taches: [], appels: [],
    contacts: [k("a"), k("b"), k("c")], campagnes: [camp(), camp({ id: "p", nom: "en pause", statut: "pause" })],
    inscriptions: [insc("a"), insc("b"), insc("c")],
    // Instantly : « c » est confié mais pas confirmé parti ; « a » et « b » sont délivrés.
    envois: [env("e1", "a"), env("e2", "b"), env("e3", "c"), env("t1", "a", { test: true })],
    evenements: [ev("e1", "a", "delivre"), ev("e2", "b", "delivre"), ev("e1", "a", "ouvert"), ev("e1", "a", "clic"), ev("e1", "a", "clic", "2026-11-21T10:00:00Z")],
    leads: [lead("a"), lead("b")],
  } as EtatProspection
  it("leads, envoyés, ouverts, clics : les chiffres d'indicateurs(), campagne active seulement", () => {
    const l = lignesCampagnesCockpit(etat, () => base)
    const i = indicateurs(camp(), base, etat.contacts, etat.inscriptions, etat.envois, etat.evenements, etat.leads, etat.appels)
    expect(l).toEqual([{ id: "c", nom: "histoires", base: "agences", envoyes: i.engagement.touches, ouverts: i.engagement.ouvreurs, clics: i.engagement.cliqueurs, leads: i.conversion.leads }])
    expect(l[0]).toMatchObject({ envoyes: 2, ouverts: 1, clics: 1, leads: 2 }) // clics : contacts distincts, pas 2 clics
  })
  it("une campagne de SMS seulement : pas d'ouverture mesurable", () => {
    const sms = { ...etat, envois: etat.envois.map((e) => ({ ...e, canal: "sms" as const })) }
    expect(lignesCampagnesCockpit(sms, () => base)[0].ouverts).toBeNull()
  })
})

describe("G3 · la retenue des relances ne vise que les campagnes Instantly", () => {
  it("le moteur n'appelle attendConfirmation que si parInstantly(c) ; même règle qu'à l'écran", () => {
    expect(moteur).toContain("parInstantly(c) && await attendConfirmation(sb, e.inscriptionId, e.etapeId)")
    expect(moteur).toContain('const parInstantly = (c: { baseId: string; origine?: string }) => !estBaseAvis(c.baseId) && c.origine !== "st"')
    expect(parInstantly({ baseId: "artisans", origine: "st" })).toBe(false)
    expect(parInstantly({ baseId: "locataires", origine: "" })).toBe(false)
    expect(parInstantly({ baseId: "agences", origine: "" })).toBe(true)
  })
})

describe("B1 · les sous-traitants de STC Bâtiment hors de chiffres_stc", () => {
  it("la synchro range le bloc dans chiffres_stc_st et l'ôte de chiffres_stc", () => {
    expect(chiffres).toContain('const { sous_traitants, ...pourTous } = chiffres')
    expect(chiffres).toContain('cle: "chiffres_stc_st", valeur: JSON.stringify(sous_traitants)')
    expect(chiffres).toContain('cle: "chiffres_stc", valeur: JSON.stringify(pourTous)')
  })
  it("les écrans lisent la nouvelle clé, avec repli sur l'ancien emplacement", () => {
    const st = [{ nom: "A", compte_actif: true, missions: [], paye_30: 0, paye_30_60: 0 }]
    const ancien = lireChiffres(JSON.stringify({ version: 2, calcule_le: "", mois: [], particuliers: [], agences: [], sous_traitants: [{ ...st[0], nom: "ancien" }] }))
    expect(lireSousTraitantsStc(JSON.stringify(st), ancien)?.[0].nom).toBe("A")
    expect(lireSousTraitantsStc(null, ancien)?.[0].nom).toBe("ancien")
    expect(lireSousTraitantsStc("illisible", ancien)?.[0].nom).toBe("ancien")
    expect(lireSousTraitantsStc(null, null)).toBeNull()
  })
})

describe("G2 · « a cliqué » côté recrutement : la colonne robot partout", () => {
  it("le Dashboard ST lit robot ; la Machine et la fiche ne lisent que robot = false", () => {
    expect(tableauStDb).toContain('select("id, sous_traitant_id, clique_le, destination, robot")')
    expect(machineDb.match(/\.eq\("robot", false\)/g)).toHaveLength(2)
  })
  it("lien-st note l'ouverture du lien stop et n'écrit plus les dates de clic lui-même", () => {
    expect(lienSt).toContain('supabase.rpc("st_noter_stop_vu", { p_sous_traitant: st.id })')
    expect(lienSt).not.toContain("maj.candidature_clic_le")
    expect(lienSt).not.toContain("maj.bareme_vu_le")
  })
})

describe("M2 · une lecture en échec est dite, pas affichée en zéros", () => {
  it("la valeur de repli, et l'erreur gardée pour le bandeau", async () => {
    const { manques, repli } = lecturesPartielles()
    const v = await Promise.reject(new Error("délai dépassé")).catch(repli("les leads", [] as string[]))
    expect(v).toEqual([])
    expect(manques).toEqual(["les leads : délai dépassé"])
  })
})

describe("M3 · la ligne Équipe = les commerciaux affichés", () => {
  it("les appels et OS d'un compte hors classement, et les OS sans commercial, à part", () => {
    const de = new Date(2026, 10, 1), a = new Date(2026, 10, 27)
    const appel = (compteId: string, agenceId: string) => ({ date: "2026-11-20T10:00:00Z", compteId, resultat: "joint", issue: "interesse", agenceId })
    const r = equipeEtReste(
      [appel("h", "x"), appel("h", "y"), appel("m", "x"), appel("dir", "z")],
      [{ agenceId: "x", date: "2026-11-21", commercialId: "h" }, { agenceId: "z", date: "2026-11-21", commercialId: "dir" }, { agenceId: "w", date: "2026-11-22", commercialId: null }],
      ["h", "m"], de, a)
    expect(r.equipe).toEqual({ appels: 3, joints: 3, interesses: 2, rdv: 0, premiersOs: 1 })
    expect(r.horsClassement).toEqual({ appels: 1, premiersOs: 1 })
    expect(r.sansCommercial).toBe(1)
  })
})

describe("C1 · la proposition au raccroché est gardée (elle s'affiche à l'écran)", () => {
  it("la session appelle toujours proposer-resultat ; la table vient du SQL du lot 6", () => {
    expect(session).toContain("proposerResultat(appelTermineId, appelTermineCall)")
  })
})
