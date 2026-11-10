// Les points de départ d'une campagne (Mahdi, 09/11/2026) : volume ou qualifiée, agences ou sous-traitants.
// Rien de figé : une fois choisi, tout se modifie dans la campagne.
import { ATTRIBUTIONS, GARDE_DEFAUT, MOTIFS_DEFAUT, creatifVide, nid, type Action, type ConfigCampagne, type Creatif, type EtapeParcours, type Question, type Qualite } from "../../../prospection/configCampagne"

export type ModeleCampagne = { id: string; titre: string; aide: string; baseId: string; creer: () => ConfigCampagne }

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

function config(baseId: string, creatifs: Creatif[], actions: Action[], etapes: EtapeParcours[], lead: number, gagne: number, interet: ReturnType<typeof regle>[], qualites: Qualite[] = []): ConfigCampagne {
  return { v: 1, creatifs, actions, zones: [], garde: GARDE_DEFAUT, qualification: { interet, etapes, leadA: etapes[lead].id, gagneA: gagne >= 0 ? etapes[gagne].id : "", qualites, attribution: ATTRIBUTIONS[baseId === "agences" ? 0 : 2], delaiH: 1, motifs: MOTIFS_DEFAUT, relanceMois: 6 } }
}
// La campagne s'arrête au lead : la qualification des sous-traitants vit à part, sur la fiche.
const etapesArtisans = () => [etape("Intérêt détecté", "Intérêt détecté", "Automatique", "Toute seule", 0), etape("Dossier déposé", "Dossier et pièces reçus", "Le prospect", "Toute seule", 7)]

// Une campagne d'avis : un mail, une relance, et une page d'avis. Aucun lead, aucun appel.
function configAvis(baseId: string, objet: string, intro: string): ConfigCampagne {
  const page: Creatif = { ...creatifVide("avis", "Page d'avis"), lienGoogle: "" }
  page.variantes[0] = { ...page.variantes[0], objet: "Votre avis compte", corps: intro }
  const m = mail("Demande d'avis", objet, "Bonjour {{contact}},\n\nVotre avis nous aide à nous améliorer. Pouvez-vous nous accorder une minute ?\n\n{{lien_avis}}\n\nMerci d'avance.")
  const relance = mail("Relance", `Rappel : ${objet.toLowerCase()}`, "Bonjour {{contact}},\n\nSi vous avez une minute pour nous donner votre avis, cela nous aiderait beaucoup :\n\n{{lien_avis}}\n\nMerci.")
  return config(baseId, [m, relance, page], [envoi(m), attendre(7), envoi(relance), fin()], [etape("Avis reçu", "Intérêt détecté", "Automatique", "Toute seule", 0)], 0, -1, [])
}
export const MODELES: ModeleCampagne[] = [
  { id: "ag-vol", titre: "Agences · volume", aide: "Beaucoup de leads, faible intérêt", baseId: "agences", creer: () => { const m = mail("Première approche"); return config("agences", [m], [envoi(m), attendre(3), appel("Il a montré de l'intérêt : se présenter, proposer une intervention test."), fin()], [etape("Intérêt détecté", "Intérêt détecté", "Automatique", "Toute seule", 0), etape("Joint et intéressé", "Appel : joint et intéressé"), etape("1er ordre de service", "1er ordre de service", "Le prospect", "Toute seule", 30)], 1, 2, [regle("A cliqué un lien"), regle("A ouvert la plaquette", 2, 7)], [niveau("B")]) } },
  { id: "ag-qual", titre: "Agences · qualifiée", aide: "Peu de leads, formulaire rempli", baseId: "agences", creer: () => { const f = formulaire("Fiche agence", [q("Nom du gestionnaire", "Texte court"), q("Nombre de lots gérés", "Nombre", true, "50 ou plus"), q("Votre besoin", "Texte long"), q("Adresse du bien", "Texte court"), q("Pour quand ?", "Date")]); const m = mail("Invitation"); const e = [{ ...etape("Fiche remplie", "Formulaire rempli par le prospect", "Le prospect", "Toute seule", 7), formulaireId: f.id }, etape("Fiche vérifiée", "Validation à la main"), etape("RDV", "RDV"), etape("1er ordre de service", "1er ordre de service", "Le prospect", "Toute seule", 30)]; return config("agences", [m, f], [envoi(m), attendre(4), fin()], e, 0, 3, [], [niveau("A", { source: "question", questionId: f.questions[1].id, valeur: "50" }), niveau("B")]) } },
  { id: "st-vol", titre: "Sous-traitants · volume", aide: "Un stock d'intéressés à appeler", baseId: "artisans", creer: () => { const m = mail("Présentation"); return config("artisans", [m], [envoi(m), attendre(3), appel("Il a cliqué : voir s'il est intéressé."), fin()], etapesArtisans(), 1, -1, [regle("A cliqué le lien principal")]) } },
  { id: "st-qual", titre: "Sous-traitants · qualifiée", aide: "Le lead, c'est le dossier déposé", baseId: "artisans", creer: () => { const m = mail("Déposez votre dossier"); return config("artisans", [m], [envoi(m), attendre(4), fin()], etapesArtisans(), 1, -1, []) } },
  { id: "av-loc", titre: "Avis · locataires", aide: "Après une intervention", baseId: "locataires", creer: () => configAvis("locataires", "Votre avis sur notre intervention", "Dites-nous comment s'est passée notre intervention.") },
  { id: "av-cli", titre: "Avis · gestionnaires clients", aide: "Vos agences clientes", baseId: "clients_gestionnaires", creer: () => configAvis("clients_gestionnaires", "Votre avis sur STC Bâtiment", "Dites-nous comment se passe notre collaboration.") },
  { id: "av-st", titre: "Avis · sous-traitants actuels", aide: "Ceux qui travaillent avec vous", baseId: "sous_traitants_actifs", creer: () => configAvis("sous_traitants_actifs", "Votre avis sur le travail avec STC Bâtiment", "Dites-nous comment se passe le travail avec nos équipes.") },
]
