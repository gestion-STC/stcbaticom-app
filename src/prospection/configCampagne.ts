// ════════════════════════════════════════════════════════════════════════════
// LE RÉGLAGE COMPLET D'UNE CAMPAGNE (Mahdi, 09/11/2026 : « tout reste programmable, en libre décision »).
//
// Une campagne se règle en six parties : audience, actions et séquence, créatifs, qualification, garde-fous,
// mesure. Ce réglage vit dans cmp_campagnes.config. Le moteur, lui, continue de lire ses colonnes (etapes,
// audience, signaux) : `compiler` les écrit à partir du réglage, `configDe` relit une campagne d'avant.
// L'aller-retour ne change RIEN aux étapes d'une campagne existante (identifiants et textes), voir le test.
// Fichier PUR.
// ════════════════════════════════════════════════════════════════════════════
import type { Campagne, Condition, Etape, Signal, Variante } from "./modele"
import type { ReglageIA } from "./ia"
import { MONTEE_DEFAUT, type AlerteOuverture, type Montee } from "./montee"

export type TypeCreatif = "mail" | "sms" | "linkedin" | "page" | "formulaire" | "avis"
export type Question = { id: string; libelle: string; type: string; requis: boolean; qualifiante: boolean; attendu: string; /** Pour un choix unique : les réponses, séparées par des virgules. */ options?: string }
export type Creatif = { id: string; type: TypeCreatif; nom: string; variantes: Variante[]; video: boolean; videoUrl?: string; versId: string; remplirPar: "prospect" | "commercial"; questions: Question[]; /** Page d'avis : le lien Google proposé à tout le monde après l'avis. */ lienGoogle?: string; /** Un mail personnalisé par l'IA. */ ia?: ReglageIA; /** false : la relance part en nouveau mail plutôt que dans le fil. */ memeFil?: boolean }
export type TypeAction = Etape["type"]
export type Action = { id: string; type: TypeAction; creatifId?: string; jours?: number; condition?: Condition; sinonVers?: string | null; consigne?: string; cible?: "standard" | "contact" }
export type Regle = { id: string; evenement: string; fois: number; jours: number }
export type EtapeParcours = { id: string; nom: string; type: string; qui: string; validation: string; delai: number; formulaireId?: string }
export type Qualite = { id: string; niveau: string; source: "question" | "etape" | "toujours"; questionId: string; operateur: string; valeur: string; etapeId: string }
/** Ce que fait une réponse au mail, selon le tri de l'IA (Mahdi, 11/11/2026). */
export type ActionReponse = "lead" | "dead" | "rien"
export type Qualification = { /** Absent : le réglage par défaut. */ reponses?: Partial<Record<string, ActionReponse>>; interet: Regle[]; etapes: EtapeParcours[]; leadA: string; gagneA: string; qualites: Qualite[]; attribution: string; /** « Une personne précise » : la première ; « Chacun son tour » : toutes. */ attributionIds?: string[]; delaiH: number; motifs: string[]; relanceMois: number }
export type Garde = { ecartCampagnes: number; exclusions: string[]; plafondMail: number; plafondSms: number; suiviOuvertures?: boolean; montee?: Montee; alerteOuverture?: AlerteOuverture }
export type ConfigCampagne = { v: 1; creatifs: Creatif[]; actions: Action[]; zones: string[]; qualification: Qualification; garde: Garde }

export const ORIGINE_TRACABILITE = "tracabilite"
export const EVENEMENTS = ["A ouvert le mail", "A cliqué un lien", "A cliqué le lien principal", "A ouvert la plaquette", "A ouvert la page « Créer un compte »", "A cliqué le SMS", "A regardé la vidéo", "A répondu au mail"]
export const TYPES_ETAPE = ["Intérêt détecté", "Appel : joint et intéressé", "Formulaire rempli par le prospect", "Formulaire rempli au téléphone", "Dossier et pièces reçus", "Contrats envoyés", "Contrats signés", "RDV", "Test de l'application", "Compte ouvert", "1er ordre de service", "Validation à la main"]
/** Les événements proposés dans « Intérêt » : seulement ceux qui ont un effet pour cette campagne (Mahdi, 11/11/2026).
 *  Une réponse est réglée dans « Quand il répond au mail » ; la page « Créer un compte », c'est le lien principal.
 *  La campagne des gestionnaires (traçabilité) et les sous-traitants gardent leurs règles d'avant. */
export function evenementsProposes(cfg: ConfigCampagne, baseId: string, tracabilite: boolean): string[] {
  const sms = cfg.actions.some((a) => a.type === "sms"), video = cfg.creatifs.some((k) => k.video)
  return EVENEMENTS.filter((e) => {
    if (!tracabilite && baseId !== "artisans" && (e === "A répondu au mail" || e === "A ouvert la page « Créer un compte »")) return false
    if (e === "A cliqué le SMS") return sms
    if (e === "A regardé la vidéo") return video
    return true
  })
}
const ETAPES_ARTISANS = ["Dossier et pièces reçus", "Contrats envoyés", "Contrats signés"]
/** Les types d'étape proposés : « Test de l'application » n'est jamais détecté seul (une validation à la main le remplace). */
export function typesEtapeProposes(baseId: string): string[] {
  return TYPES_ETAPE.filter((t) => t !== "Test de l'application" && (baseId === "artisans" ? t !== "1er ordre de service" : !ETAPES_ARTISANS.includes(t)))
}
/** Les motifs de perte d'une agence : ceux de sa fiche, partout (une seule liste). */
export const MOTIFS_AGENCE = ["Déjà un prestataire", "Pas de besoin", "Hors zone", "Autre"]
export const TYPES_FORMULAIRE = ["Formulaire rempli par le prospect", "Formulaire rempli au téléphone"]
export const VALIDATIONS = ["Toute seule", "À la main"]
export const TYPES_QUESTION = ["Texte court", "Texte long", "Nombre", "Choix unique", "Oui / Non", "Date"]
export const OPERATEURS = ["est", "au moins", "au plus", "contient"]
export const ATTRIBUTIONS = ["Le commercial attribué au contact", "Le commercial du secteur", "L'équipe de la base", "Chacun son tour", "Une personne précise"]
export const GARDE_DEFAUT: Garde = { ecartCampagnes: 14, exclusions: ["Déjà client", "Désinscrit", "Adresse en erreur", "Pas intéressé"], plafondMail: 200, plafondSms: 40, suiviOuvertures: true, montee: MONTEE_DEFAUT }
/** Les réponses réglables, et ce qu'elles font par défaut. Même règle en base : cmp_action_reponse. */
export const REPONSES_REGLABLES: { tri: string; libelle: string; aide: string; defaut: ActionReponse }[] = [
  { tri: "interesse", libelle: "Intéressé", aide: "veut en savoir plus, demande un rappel, un prix", defaut: "lead" },
  { tri: "pas_interesse", libelle: "Pas intéressé", aide: "refuse, pas de besoin, déjà un prestataire", defaut: "dead" },
  { tri: "mauvaise_personne", libelle: "Mauvaise personne", aide: "renvoie vers quelqu'un d'autre", defaut: "lead" },
  { tri: "autre", libelle: "À lire", aide: "l'IA ne sait pas trancher", defaut: "lead" },
]
export const ACTIONS_REPONSE: { id: ActionReponse; libelle: string }[] = [{ id: "lead", libelle: "Lead" }, { id: "dead", libelle: "Dead : l'agence passe en « Pas intéressé »" }, { id: "rien", libelle: "Rien" }]
export const actionReponse = (q: Pick<Qualification, "reponses">, tri: string): ActionReponse => (tri === "absent" ? "rien" : q.reponses?.[tri] ?? REPONSES_REGLABLES.find((r) => r.tri === tri)?.defaut ?? "lead")
export const MOTIFS_DEFAUT = ["Pas intéressé", "Hors cible", "Déjà équipé", "Injoignable"]

const FRANCE = "pays:250"
const COURONNE: Record<string, string> = { "75": "Paris", "92": "Petite couronne", "93": "Petite couronne", "94": "Petite couronne", "77": "Grande couronne", "78": "Grande couronne", "91": "Grande couronne", "95": "Grande couronne" }

let compteur = 0
export const nid = () => `${Date.now().toString(36)}-${(++compteur).toString(36)}`

const etape = (id: string, nom: string, type: string, qui = "Le commercial", validation = "À la main", delai = 2): EtapeParcours => ({ id, nom, type, qui, validation, delai })
const regle = (id: string, evenement: string, fois = 1, jours = 7): Regle => ({ id, evenement, fois, jours })

export const creatifVide = (type: TypeCreatif, nom: string): Creatif => ({ id: nid(), type, nom, variantes: type === "formulaire" ? [] : [{ id: nid(), nom: "A", objet: "", corps: "" }], video: false, versId: "", remplirPar: "prospect", questions: type === "formulaire" ? [questionVide()] : [] })
export const questionVide = (): Question => ({ id: nid(), libelle: "", type: "Texte court", requis: true, qualifiante: false, attendu: "" })

/** Le parcours de départ d'une campagne qui n'en a pas encore : tout reste modifiable ensuite. */
export function qualificationDeDepart(baseId: string, origine = ""): Qualification {
  const commun = { qualites: [], attribution: ATTRIBUTIONS[baseId !== "artisans" ? 0 : 2], delaiH: 1, motifs: MOTIFS_DEFAUT, relanceMois: 6 }
  if (baseId === "artisans") {
    // La campagne s'arrête au lead : la qualification (formulaire, test, contrats) vit à part, sur la fiche.
    const etapes = [etape("p-interet", "Intérêt détecté", "Intérêt détecté", "Automatique", "Toute seule", 0), etape("p-dossier", "Dossier déposé", "Dossier et pièces reçus", "Le prospect", "Toute seule", 7)]
    return { ...commun, interet: [regle("r-clic", "A cliqué le lien principal")], etapes, leadA: "p-dossier", gagneA: "" }
  }
  const etapes = [etape("p-interet", "Intérêt détecté", "Intérêt détecté", "Automatique", "Toute seule", 0), etape("p-tel", "Joint et intéressé", "Appel : joint et intéressé"), etape("p-compte", "Compte ouvert", "Compte ouvert", "Le prospect", "Toute seule", 14), etape("p-os", "1er ordre de service", "1er ordre de service", "Le prospect", "Toute seule", 30)]
  // La traçabilité des gestionnaires : les critères tels qu'ils tournent aujourd'hui.
  if (origine === ORIGINE_TRACABILITE) return { ...commun, interet: [regle("r-plaq", "A ouvert la plaquette", 2, 7), regle("r-page", "A ouvert la page « Créer un compte »"), regle("r-mail", "A répondu au mail")], etapes, leadA: "p-interet", gagneA: "p-os" }
  return { ...commun, interet: [regle("r-clic", "A cliqué un lien")], etapes, leadA: "p-tel", gagneA: "p-os" }
}


const TEXTE_SIGNAL: Record<Signal, Omit<Regle, "id">> = {
  clic_lien: { evenement: "A cliqué un lien", fois: 1, jours: 7 },
  clic_lien_principal: { evenement: "A cliqué le lien principal", fois: 1, jours: 7 },
  reponse: { evenement: "A répondu au mail", fois: 1, jours: 7 },
  ouvertures_2: { evenement: "A ouvert le mail", fois: 2, jours: 7 },
}

/** Le réglage d'une campagne : celui enregistré, sinon relu depuis ses colonnes (les textes restent tels quels). */
export function configDe(c: Campagne): ConfigCampagne {
  if (c.config && (c.config as { v?: number }).v === 1) return c.config as unknown as ConfigCampagne
  const creatifs: Creatif[] = []
  const actions: Action[] = c.etapes.map((e) => {
    if ("variantes" in e) {
      const type: TypeCreatif = e.type === "sms" ? "sms" : e.type === "linkedin" ? "linkedin" : "mail"
      const k: Creatif = { id: "c-" + e.id, type, nom: e.variantes[0]?.nom || `${type === "sms" ? "SMS" : type === "linkedin" ? "LinkedIn" : "Mail"} ${creatifs.length + 1}`, variantes: e.variantes, video: false, versId: "", remplirPar: "prospect", questions: [] }
      creatifs.push(k)
      return { id: e.id, type: e.type, creatifId: k.id }
    }
    if (e.type === "attendre") return { id: e.id, type: e.type, jours: e.jours }
    if (e.type === "si") return { id: e.id, type: e.type, condition: e.condition, sinonVers: e.sinonVers }
    if (e.type === "appel") return { id: e.id, type: e.type, consigne: e.consigne, cible: e.cible }
    return { id: e.id, type: e.type }
  })
  const depart = qualificationDeDepart(c.baseId, c.origine)
  const interet = c.origine === ORIGINE_TRACABILITE ? depart.interet : c.signaux.map((s) => ({ id: "r-" + s, ...TEXTE_SIGNAL[s] }))
  return { v: 1, creatifs, actions, zones: [], qualification: { ...depart, interet }, garde: GARDE_DEFAUT }
}

export function versEtapes(cfg: ConfigCampagne): Etape[] {
  return cfg.actions.map((a): Etape => {
    if (a.type === "attendre") return { id: a.id, type: a.type, jours: a.jours ?? 1 }
    if (a.type === "si") return { id: a.id, type: a.type, condition: a.condition ?? "a_clique", sinonVers: a.sinonVers ?? null }
    if (a.type === "appel") return { id: a.id, type: a.type, consigne: a.consigne ?? "", ...(a.cible ? { cible: a.cible } : {}) }
    if (a.type === "fin") return { id: a.id, type: a.type }
    return { id: a.id, type: a.type, variantes: cfg.creatifs.find((k) => k.id === a.creatifId)?.variantes ?? [] }
  })
}

/** Les zones de la carte traduites en filtre : code postal pour les agences, zone pour les artisans. */
export function filtreDesZones(baseId: string, zones: string[]): { cle: "cp" | "zone"; valeurs: string[] } | null {
  if (!zones.length || zones.includes(FRANCE)) return null
  if (baseId !== "artisans") return { cle: "cp", valeurs: zones }
  const groupes = zones.map((z) => (z.startsWith("75") ? "Paris" : COURONNE[z] ?? z))
  return { cle: "zone", valeurs: [...new Set(groupes)] }
}

/** Les règles d'intérêt que le moteur sait déjà reconnaître : elles deviennent ses signaux. */
export function versSignaux(regles: Regle[]): Signal[] {
  const out = new Set<Signal>()
  for (const r of regles) {
    if (r.evenement === "A cliqué un lien") out.add("clic_lien")
    else if (r.evenement === "A cliqué le lien principal") out.add("clic_lien_principal")
    else if (r.evenement === "A répondu au mail") out.add("reponse")
    else if (r.evenement === "A ouvert le mail" && r.fois >= 2) out.add("ouvertures_2")
  }
  return [...out]
}

/** La campagne prête à enregistrer : ses colonnes réécrites depuis le réglage. */
export function compiler(c: Campagne, cfg: ConfigCampagne): Campagne {
  const filtres = { ...c.audience.filtres }
  delete filtres.cp
  if (c.baseId === "artisans") delete filtres.zone
  const f = filtreDesZones(c.baseId, cfg.zones)
  if (f) filtres[f.cle] = f.valeurs
  // Un seul chiffre par jour : le rythme de la campagne est aussi le plafond des mails.
  const reglage: ConfigCampagne = { ...cfg, garde: { ...cfg.garde, plafondMail: c.rythme.parJour } }
  return { ...c, audience: { ...c.audience, filtres }, etapes: versEtapes(cfg), signaux: versSignaux(cfg.qualification.interet), config: reglage as unknown as Record<string, unknown> }
}

/** Un envoi sans texte empêche de lancer. */
export function messageVide(cfg: ConfigCampagne): boolean {
  return cfg.actions.some((a) => {
    if (a.type !== "mail" && a.type !== "sms" && a.type !== "newsletter" && a.type !== "linkedin") return false
    const k = cfg.creatifs.find((x) => x.id === a.creatifId)
    return !k || !k.variantes.length || k.variantes.some((v) => !v.corps.trim())
  })
}
