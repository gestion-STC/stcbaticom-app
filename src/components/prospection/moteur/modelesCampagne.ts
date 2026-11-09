// Les points de départ d'une campagne (Mahdi, 09/11/2026) : volume ou qualifiée, agences ou sous-traitants.
// Rien de figé : une fois choisi, tout se modifie dans la campagne.
import { ATTRIBUTIONS, GARDE_DEFAUT, MOTIFS_DEFAUT, creatifVide, nid, type Action, type ConfigCampagne, type Creatif, type EtapeParcours, type Question, type Qualite } from "../../../prospection/configCampagne"

export type ModeleCampagne = { id: string; titre: string; aide: string; baseId: "agences" | "artisans"; creer: () => ConfigCampagne }

const etape = (nom: string, type: string, qui = "Le commercial", validation = "À la main", delai = 2): EtapeParcours => ({ id: nid(), nom, type, qui, validation, delai })
const q = (libelle: string, type: string, qualifiante = false, attendu = ""): Question => ({ id: nid(), libelle, type, requis: true, qualifiante, attendu })
const mail = (nom: string, objet = "", corps = ""): Creatif => { const k = creatifVide("mail", nom); k.variantes[0] = { ...k.variantes[0], objet, corps }; return k }
const formulaire = (nom: string, questions: Question[], remplirPar: Creatif["remplirPar"] = "prospect"): Creatif => ({ ...creatifVide("formulaire", nom), questions, remplirPar })
const envoi = (k: Creatif): Action => ({ id: nid(), type: "mail", creatifId: k.id })
const attendre = (jours: number): Action => ({ id: nid(), type: "attendre", jours })
const fin = (): Action => ({ id: nid(), type: "fin" })
const appel = (consigne: string): Action => ({ id: nid(), type: "appel", consigne })
const niveau = (n: string, p: Partial<Qualite> = {}): Qualite => ({ id: nid(), niveau: n, source: "toujours", questionId: "", operateur: "au moins", valeur: "", etapeId: "", ...p })
const regle = (evenement: string, fois = 1, jours = 7) => ({ id: nid(), evenement, fois, jours })

function config(baseId: "agences" | "artisans", creatifs: Creatif[], actions: Action[], etapes: EtapeParcours[], lead: number, gagne: number, interet: ReturnType<typeof regle>[], qualites: Qualite[] = []): ConfigCampagne {
  return { v: 1, creatifs, actions, zones: [], garde: GARDE_DEFAUT, qualification: { interet, etapes, leadA: etapes[lead].id, gagneA: etapes[gagne].id, qualites, attribution: ATTRIBUTIONS[baseId === "agences" ? 0 : 2], delaiH: 1, motifs: MOTIFS_DEFAUT, relanceMois: 6 } }
}
const finArtisans = () => [etape("Formulaire de qualification", "Formulaire rempli au téléphone"), etape("Contrats envoyés", "Contrats envoyés"), etape("Contrats signés", "Contrats signés", "Le prospect", "Toute seule", 5), etape("Test de l'application", "Test de l'application", "Le prospect", "Toute seule", 5), etape("Compte ouvert", "Compte ouvert", "Automatique", "Toute seule", 0)]
const formTel = () => formulaire("Qualification au téléphone", [q("Effectif de l'entreprise", "Nombre"), q("Zones d'intervention", "Texte court"), q("Assurance décennale à jour", "Oui / Non", true, "Oui"), q("Disponibilité sous 15 jours", "Oui / Non")], "commercial")

export const MODELES: ModeleCampagne[] = [
  { id: "ag-vol", titre: "Agences · volume", aide: "Beaucoup de leads, faible intérêt", baseId: "agences", creer: () => { const m = mail("Première approche"); return config("agences", [m], [envoi(m), attendre(3), appel("Il a montré de l'intérêt : se présenter, proposer une intervention test."), fin()], [etape("Intérêt détecté", "Intérêt détecté", "Automatique", "Toute seule", 0), etape("Joint et intéressé", "Appel : joint et intéressé"), etape("1er ordre de service", "1er ordre de service", "Le prospect", "Toute seule", 30)], 1, 2, [regle("A cliqué un lien"), regle("A ouvert la plaquette", 2, 7)], [niveau("B")]) } },
  { id: "ag-qual", titre: "Agences · qualifiée", aide: "Peu de leads, formulaire rempli", baseId: "agences", creer: () => { const f = formulaire("Fiche agence", [q("Nom du gestionnaire", "Texte court"), q("Nombre de lots gérés", "Nombre", true, "50 ou plus"), q("Votre besoin", "Texte long"), q("Adresse du bien", "Texte court"), q("Pour quand ?", "Date")]); const m = mail("Invitation"); const e = [{ ...etape("Fiche remplie", "Formulaire rempli par le prospect", "Le prospect", "Toute seule", 7), formulaireId: f.id }, etape("Fiche vérifiée", "Validation à la main"), etape("RDV", "RDV"), etape("1er ordre de service", "1er ordre de service", "Le prospect", "Toute seule", 30)]; return config("agences", [m, f], [envoi(m), attendre(4), fin()], e, 0, 3, [], [niveau("A", { source: "question", questionId: f.questions[1].id, valeur: "50" }), niveau("B")]) } },
  { id: "st-vol", titre: "Sous-traitants · volume", aide: "Un stock d'intéressés à appeler", baseId: "artisans", creer: () => { const m = mail("Présentation"); return config("artisans", [m, formTel()], [envoi(m), attendre(3), appel("Il a cliqué : voir s'il est intéressé."), fin()], [etape("Intérêt détecté", "Intérêt détecté", "Automatique", "Toute seule", 0), etape("Intéressé au téléphone", "Appel : joint et intéressé"), etape("Dossier déposé", "Dossier et pièces reçus", "Le prospect", "Toute seule", 7), ...finArtisans()], 1, 7, [regle("A cliqué un lien")]) } },
  { id: "st-qual", titre: "Sous-traitants · qualifiée", aide: "Le lead, c'est le dossier déposé", baseId: "artisans", creer: () => { const m = mail("Déposez votre dossier"); return config("artisans", [m, formTel()], [envoi(m), attendre(4), fin()], [etape("Dossier déposé", "Dossier et pièces reçus", "Le prospect", "Toute seule", 7), ...finArtisans()], 0, 5, []) } },
]
