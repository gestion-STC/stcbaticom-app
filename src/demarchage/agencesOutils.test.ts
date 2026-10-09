import { describe, expect, it } from "vitest"
import type { Message } from "../lib/messagesDb"
import type { Activite, Agence, Contact } from "./modele"
import {
  FILTRES_VIDES,
  basculerTri,
  depuisTexte,
  enRetard,
  enseignesDistinctes,
  filtrerAgences,
  filtrerFil,
  fusionnerFil,
  grouperParJour,
  ilYA,
  isoDepuisChamp,
  joursDepuis,
  ligneExportAgence,
  ligneExportApporteur,
  ligneExportContact,
  nomCommercial,
  noteLongue,
  peutChercherDoublons,
  prospectDepuis,
  secteursParZone,
  sousTitreAgences,
  tachesOuvertes,
  texteActivite,
  trierAgences,
} from "./agencesOutils"

function agence(p: Partial<Agence> = {}): Agence {
  return {
    id: "a1", nom: "Agence Test", enseigne: "", type: "agence", secteur: "75005", secteurLibelle: "Paris 5", adresse: "12 rue Mouffetard", telephone: "01 43 00 00 00", email: "", site: "",
    nbLots: 0, logoUrl: "", etape: "a_prospecter", etapeDepuis: "2026-10-01T10:00:00Z", commercialId: null, tentatives: 0, jointFois: 0, reveilLe: null, motif: "",
    premierOsLe: null, numeroEmission: "", derniereActiviteLe: null, creeLe: "2026-07-01T10:00:00Z",
    nbContacts: 0, contactPrincipal: "", contactLigne: "", prochaineEcheance: null, prochaineTache: "", nbAppels: 0, dernierAppelLe: null, dernierResultat: "",
    ...p,
  }
}
function contact(p: Partial<Contact> = {}): Contact {
  return { id: "c1", agenceId: "a1", prenom: "Sophie", nom: "Martin", role: "gestionnaire", ligneDirecte: "01 43 00 00 10", mobile: "", email: "sophie@agence.fr", principal: true, parti: false, note: "", creeLe: "2026-10-01T10:00:00Z", ...p }
}
function activite(p: Partial<Activite> = {}): Activite {
  return {
    id: "t1", agenceId: "a1", contactId: null, type: "note", date: "2026-10-09T09:30:00", echeance: null, faitLe: null, compteId: null, compteNom: "Horlann", titre: "", note: "", resultat: "", issue: "", motif: "",
    numeroUtilise: "", dureeS: null, callId: "", sens: "sortant", rdvType: "", messageId: null, etapeDe: "", etapeVers: "", source: "fiche", ...p,
  }
}
function message(p: Partial<Message> = {}): Message {
  return { id: "m1", sens: "entrant", espace: "demarchage", sousTraitantId: null, de: "sophie@agence.fr", a: "os@stcbatiment.fr", objet: "Re: Plaquette", corpsText: "", corpsHtml: "", messageId: null, inReplyTo: null, prospectId: null, lu: true, date: "2026-10-08T15:00:00", piecesJointes: [], ...p }
}
const midi = new Date(2026, 9, 9, 12, 0, 0) // vendredi 9 octobre 2026, 12 h

describe("les dates", () => {
  it("compte les jours civils, pas les tranches de 24 h", () => {
    expect(joursDepuis("2026-10-09T01:00:00", midi)).toBe(0)
    expect(joursDepuis("2026-10-08T23:00:00", midi)).toBe(1)
    expect(joursDepuis("2026-10-02T12:00:00", midi)).toBe(7)
    expect(joursDepuis(null, midi)).toBe(0)
  })
  it("écrit « il y a » en mots simples", () => {
    expect(ilYA("2026-10-09T08:00:00", midi)).toBe("aujourd'hui")
    expect(ilYA("2026-10-08T08:00:00", midi)).toBe("hier")
    expect(ilYA("2026-10-04T08:00:00", midi)).toBe("il y a 5 jours")
    expect(ilYA("2026-10-10T08:00:00", midi)).toBe("demain")
    expect(ilYA("2026-10-12T08:00:00", midi)).toBe("dans 3 jours")
    expect(ilYA(null, midi)).toBe("")
  })
  it("écrit « depuis N j » pour l'étape", () => {
    expect(depuisTexte("2026-10-01T10:00:00", midi)).toBe("depuis 8 j")
    expect(depuisTexte("2026-10-09T10:00:00", midi)).toBe("depuis aujourd'hui")
  })
  it("sait si une échéance est passée", () => {
    expect(enRetard("2026-10-09T11:00:00", midi)).toBe(true)
    expect(enRetard("2026-10-09T13:00:00", midi)).toBe(false)
    expect(enRetard(null, midi)).toBe(false)
  })
  it("convertit un champ date en ISO (9 h par défaut pour un jour seul)", () => {
    expect(isoDepuisChamp("")).toBeNull()
    expect(isoDepuisChamp("n'importe quoi")).toBeNull()
    expect(new Date(isoDepuisChamp("2026-10-12")!).getHours()).toBe(9)
    expect(new Date(isoDepuisChamp("2026-10-12T14:30")!).getMinutes()).toBe(30)
  })
})

describe("filtrerAgences", () => {
  const liste = [
    agence({ id: "1", nom: "Century 21 Lutèce", enseigne: "Century 21", jointFois: 2, nbContacts: 1, contactPrincipal: "Sophie Martin" }),
    agence({ id: "2", nom: "Orpi Monge", enseigne: "Orpi", etape: "interesse", secteur: "75006", telephone: "01 45 00 00 00" }),
    agence({ id: "3", nom: "Immo Perdu", etape: "pas_interesse", type: "syndic" }),
    agence({ id: "4", nom: "Apport & Co", type: "apporteur" }),
  ]
  it("ne filtre rien par défaut", () => {
    expect(filtrerAgences(liste, FILTRES_VIDES)).toHaveLength(4)
  })
  it("cherche dans le nom, le téléphone, le contact, sans accents", () => {
    expect(filtrerAgences(liste, { ...FILTRES_VIDES, recherche: "lutece" }).map((a) => a.id)).toEqual(["1"])
    expect(filtrerAgences(liste, { ...FILTRES_VIDES, recherche: "sophie" }).map((a) => a.id)).toEqual(["1"])
    expect(filtrerAgences(liste, { ...FILTRES_VIDES, recherche: "0145" }).map((a) => a.id)).toEqual(["2"])
    expect(filtrerAgences(liste, { ...FILTRES_VIDES, recherche: "+33 1 45" }).map((a) => a.id)).toEqual(["2"])
  })
  it("sépare les étapes actives des sorties", () => {
    expect(filtrerAgences(liste, { ...FILTRES_VIDES, etape: "actives" }).map((a) => a.id)).toEqual(["1", "2", "4"])
    expect(filtrerAgences(liste, { ...FILTRES_VIDES, etape: "sorties" }).map((a) => a.id)).toEqual(["3"])
    expect(filtrerAgences(liste, { ...FILTRES_VIDES, etape: "interesse" }).map((a) => a.id)).toEqual(["2"])
  })
  it("filtre par secteur, type, enseigne, jamais jointe, avec contact", () => {
    expect(filtrerAgences(liste, { ...FILTRES_VIDES, secteur: "75006" }).map((a) => a.id)).toEqual(["2"])
    expect(filtrerAgences(liste, { ...FILTRES_VIDES, type: "syndic" }).map((a) => a.id)).toEqual(["3"])
    expect(filtrerAgences(liste, { ...FILTRES_VIDES, enseigne: "Orpi" }).map((a) => a.id)).toEqual(["2"])
    expect(filtrerAgences(liste, { ...FILTRES_VIDES, jamaisJointe: true }).map((a) => a.id)).toEqual(["2", "3", "4"])
    expect(filtrerAgences(liste, { ...FILTRES_VIDES, avecContact: true }).map((a) => a.id)).toEqual(["1"])
  })
  it("liste les enseignes sans doublon ni vide", () => {
    expect(enseignesDistinctes(liste)).toEqual(["Century 21", "Orpi"])
  })
})

describe("trierAgences", () => {
  const liste = [
    agence({ id: "1", nom: "Bravo", secteurLibelle: "Paris 15", etape: "client", dernierAppelLe: "2026-10-01T10:00:00", prochaineEcheance: null }),
    agence({ id: "2", nom: "Alpha", secteurLibelle: "Paris 5", etape: "a_prospecter", dernierAppelLe: null, prochaineEcheance: "2026-10-12T10:00:00" }),
    agence({ id: "3", nom: "Charlie", secteurLibelle: "Paris 5", etape: "interesse", dernierAppelLe: "2026-10-08T10:00:00", prochaineEcheance: "2026-10-10T10:00:00" }),
  ]
  it("trie par nom dans les deux sens", () => {
    expect(trierAgences(liste, { cle: "nom", sens: "asc" }).map((a) => a.id)).toEqual(["2", "1", "3"])
    expect(trierAgences(liste, { cle: "nom", sens: "desc" }).map((a) => a.id)).toEqual(["3", "1", "2"])
  })
  it("trie le secteur en numérique (Paris 5 avant Paris 15), puis par nom", () => {
    expect(trierAgences(liste, { cle: "secteur", sens: "asc" }).map((a) => a.id)).toEqual(["2", "3", "1"])
  })
  it("trie les étapes dans l'ordre du parcours", () => {
    expect(trierAgences(liste, { cle: "etape", sens: "asc" }).map((a) => a.id)).toEqual(["2", "3", "1"])
  })
  it("met les dates vides à la fin quel que soit le sens", () => {
    expect(trierAgences(liste, { cle: "dernierAppel", sens: "asc" }).map((a) => a.id)).toEqual(["1", "3", "2"])
    expect(trierAgences(liste, { cle: "dernierAppel", sens: "desc" }).map((a) => a.id)).toEqual(["3", "1", "2"])
    expect(trierAgences(liste, { cle: "prochaineTache", sens: "asc" }).map((a) => a.id)).toEqual(["3", "2", "1"])
  })
  it("bascule le sens sur la même colonne", () => {
    expect(basculerTri({ cle: "nom", sens: "asc" }, "nom")).toEqual({ cle: "nom", sens: "desc" })
    expect(basculerTri({ cle: "nom", sens: "desc" }, "etape")).toEqual({ cle: "etape", sens: "asc" })
  })
})

describe("sousTitreAgences et secteursParZone", () => {
  it("compte intéressées = intéressé + RDV", () => {
    expect(sousTitreAgences({ a_prospecter: 200, interesse: 30, rdv_planifie: 10, client: 1, endormie: 5 })).toBe("246 agences · 200 à prospecter · 40 intéressées · 1 cliente")
  })
  it("groupe les secteurs par zone en gardant l'ordre", () => {
    const g = secteursParZone([
      { code: "75001", libelle: "Paris 1", zone: "Paris", ordre: 1 }, { code: "75002", libelle: "Paris 2", zone: "Paris", ordre: 2 }, { code: "92100", libelle: "Boulogne", zone: "92", ordre: 100 },
    ])
    expect(g.map((z) => z.zone)).toEqual(["Paris", "92"])
    expect(g[0].secteurs).toHaveLength(2)
  })
})

describe("le fil", () => {
  it("écrit un appel avec son résultat, son issue, sa durée et son numéro", () => {
    const t = texteActivite(activite({ type: "appel", resultat: "joint", issue: "interesse", dureeS: 252, numeroUtilise: "01 86 00 00 00" }))
    expect(t.titre).toBe("Appel · Gestionnaire joint → Intéressé")
    expect(t.detail).toBe("4 min 12 · depuis le 01 86 00 00 00")
    expect(texteActivite(activite({ type: "appel", resultat: "joint", sens: "entrant" })).titre).toBe("Appel entrant · Gestionnaire joint")
    expect(texteActivite(activite({ type: "appel", resultat: "joint", issue: "pas_interesse", motif: "deja_prestataire" })).titre).toContain("(Déjà un prestataire)")
  })
  it("écrit une étape « A → B », une tâche faite ou non, un e-mail par son objet", () => {
    expect(texteActivite(activite({ type: "etape", etapeDe: "a_prospecter", etapeVers: "interesse" })).titre).toBe("À prospecter → Intéressé")
    expect(texteActivite(activite({ type: "tache", titre: "Relancer", echeance: "2026-10-16T10:00:00" })).detail).toContain("à faire")
    expect(texteActivite(activite({ type: "tache", titre: "Relancer", faitLe: "2026-10-16T10:00:00" })).detail).toBe("faite")
    expect(texteActivite(activite({ type: "email", titre: "Plaquette", sens: "sortant" })).titre).toBe("Plaquette")
    expect(texteActivite(activite({ type: "email" })).titre).toBe("(sans objet)")
  })
  it("fusionne activités et messages, trie du plus récent au plus ancien, sans doublon", () => {
    const fil = fusionnerFil(
      [activite({ id: "t1", date: "2026-10-09T09:30:00" }), activite({ id: "t2", type: "email", titre: "Plaquette", date: "2026-10-07T09:00:00", messageId: "m2" })],
      [message({ id: "m1", date: "2026-10-08T15:00:00" }), message({ id: "m2", date: "2026-10-07T09:00:00", objet: "Plaquette" })],
    )
    expect(fil.map((e) => e.id)).toEqual(["t1", "m-m1", "t2"])
    expect(fil[1].type).toBe("email")
    expect(fil[1].detail).toBe("Reçu de sophie@agence.fr")
  })
  it("filtre par type", () => {
    const fil = fusionnerFil([activite({ id: "t1", type: "note" }), activite({ id: "t2", type: "appel", resultat: "standard" })], [])
    expect(filtrerFil(fil, "tous")).toHaveLength(2)
    expect(filtrerFil(fil, "appel").map((e) => e.id)).toEqual(["t2"])
  })
  it("groupe par jour avec Aujourd'hui / Hier / la date", () => {
    const fil = fusionnerFil([activite({ id: "a", date: "2026-10-09T09:30:00" }), activite({ id: "b", date: "2026-10-09T08:00:00" }), activite({ id: "c", date: "2026-10-08T08:00:00" }), activite({ id: "d", date: "2026-10-01T08:00:00" })], [])
    const g = grouperParJour(fil, midi)
    expect(g.map((x) => x.libelle)).toEqual(["Aujourd'hui", "Hier", "Jeudi 1 octobre"])
    expect(g[0].elements.map((e) => e.id)).toEqual(["a", "b"])
  })
  it("liste les tâches ouvertes, les plus proches d'abord", () => {
    const t = tachesOuvertes([
      activite({ id: "t1", type: "tache", echeance: "2026-10-12T10:00:00" }), activite({ id: "t2", type: "rdv", echeance: "2026-10-10T10:00:00" }),
      activite({ id: "t3", type: "tache", echeance: "2026-10-01T10:00:00", faitLe: "2026-10-01T11:00:00" }), activite({ id: "t4", type: "note" }),
    ])
    expect(t.map((a) => a.id)).toEqual(["t2", "t1"])
  })
  it("replie une note longue", () => {
    expect(noteLongue("courte")).toBe(false)
    expect(noteLongue("a\nb\nc\nd")).toBe(true)
    expect(noteLongue("x".repeat(300))).toBe(true)
  })
})

describe("prospectDepuis", () => {
  it("prend les coordonnées du contact, sinon celles de l'agence", () => {
    const a = agence({ email: "contact@agence.fr" })
    const avec = prospectDepuis(a, contact())
    expect(avec.contact).toBe("Sophie Martin")
    expect(avec.email).toBe("sophie@agence.fr")
    expect(avec.telephone).toBe("01 43 00 00 10")
    const sans = prospectDepuis(a, null)
    expect(sans.contact).toBe("")
    expect(sans.email).toBe("contact@agence.fr")
    expect(sans.telephone).toBe("01 43 00 00 00")
    expect(sans.arrondissement).toBe("Paris 5")
  })
})

describe("les lignes d'export", () => {
  it("écrit les libellés, pas les codes", () => {
    const l = ligneExportAgence(agence({ etape: "pas_interesse", motif: "hors_zone", type: "syndic", dernierAppelLe: "2026-10-08T10:00:00Z", dernierResultat: "standard" }))
    expect(l.etape).toBe("Pas intéressé")
    expect(l.motif).toBe("Hors zone")
    expect(l.type).toBe("Syndic")
    expect(l.dernierAppel).toBe("2026-10-08")
    expect(l.dernierResultat).toBe("Standard, pas de gestionnaire")
    expect(l.nbLots).toBe("")
  })
  it("rattache un contact à son agence", () => {
    const l = ligneExportContact(contact({ role: "directeur" }), agence())
    expect(l.agence).toBe("Agence Test")
    expect(l.role).toBe("Directeur d'agence")
    expect(l.principal).toBe("oui")
    expect(l.parti).toBe("")
  })
  it("préfère la ligne directe du contact pour un apporteur", () => {
    expect(ligneExportApporteur(agence({ contactLigne: "06 00 00 00 00" })).telephone).toBe("06 00 00 00 00")
    expect(ligneExportApporteur(agence()).telephone).toBe("01 43 00 00 00")
  })
})

describe("divers", () => {
  it("cherche des doublons dès 3 lettres ou 9 chiffres", () => {
    expect(peutChercherDoublons("Or", "")).toBe(false)
    expect(peutChercherDoublons("Orp", "")).toBe(true)
    expect(peutChercherDoublons("", "01 43 00 0")).toBe(false)
    expect(peutChercherDoublons("", "01 43 00 00 00")).toBe(true)
  })
  it("retrouve le nom d'un commercial, même sans la liste des comptes", () => {
    expect(nomCommercial("b3a3dd4d-de08-4370-b794-227b8ddf0ba5", [])).toBe("Mahdi Souissi")
    expect(nomCommercial("x", [{ id: "x", nom: "Quelqu'un" }])).toBe("Quelqu'un")
    expect(nomCommercial(null, [])).toBe("")
  })
})
