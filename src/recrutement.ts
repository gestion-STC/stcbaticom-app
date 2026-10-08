// Recrutement sous-traitants : types + petits utilitaires partagés.
// La base ST est démarchée par une SÉQUENCE (suite d'étapes SMS/e-mail) qui pousse
// l'artisan à déposer son dossier sur le site. Tunnel : envoyé → clic → dépôt.
//
// 08/10/2026 — la fiche sait POURQUOI elle s'est arrêtée (terminé, déposé,
// désinscrit, injoignable, exclu), ce qu'elle a reçu, et sa dernière erreur ;
// les réglages de la machine sont par canal ; les envois se rejouent.

export type StatutST = "a_contacter" | "en_sequence" | "depose" | "termine" | "desinscrit" | "injoignable" | "exclu"
export type CanalEtape = "email" | "sms"

// Un sous-traitant de la base de recrutement.
export type SousTraitant = {
  id?: string
  entreprise: string
  contact: string
  email: string
  telephone: string
  metier: string
  zone: string
  source?: string // d'où vient l'artisan (Pages Jaunes, Google Maps, fichier…)
  statut: StatutST
  statutMotif?: string
  statutLe?: string | null
  sequenceId?: string | null
  etapeCourante: number // index de la PROCHAINE étape à envoyer
  demarreLe?: string | null
  token?: string
  dernierClicLe?: string | null
  nbClics: number
  baremeVuLe?: string | null // a cliqué le lien « barème » = a consulté le barème
  candidatureClicLe?: string | null // a cliqué le lien « candidater » (déposé ou non)
  deposeLe?: string | null
  dossierId?: string | null
  termineLe?: string | null
  desinscritLe?: string | null
  desinscritCanal?: string // lien | reponse_email | plainte | ecran
  injoignableLe?: string | null
  pauseJusquAu?: string | null
  dernierEnvoiLe?: string | null
  derniereErreur?: string
  nbEnvoisOk: number
  nbEnvoisErreur: number
  emailInvalide?: boolean
  recaleLe?: string | null // calendrier décalé à la reprise (la prochaine étape redevenue due)
  creeLe?: string
}

// Une séquence nommée (scénario de relance).
export type SequenceST = {
  id?: string
  nom: string
  actif: boolean // séquence utilisée pour démarrer les nouveaux ST
  creeLe?: string
}

// Une étape d'une séquence : un SMS ou un e-mail, envoyé à J+delaiJours du démarrage.
export type EtapeST = {
  id?: string
  sequenceId: string
  ordre: number
  canal: CanalEtape
  delaiJours: number
  objet: string // objet (e-mail uniquement)
  contenu: string // corps e-mail (HTML) ou texte du SMS
  actif: boolean
}

// Objectif de recrutement pour UN métier (ex. Plombier : 2/semaine).
export type ObjectifMetier = {
  id?: string
  metier: string
  objectifHebdo: number
  actif: boolean
}

// Les réglages de la machine (une seule ligne) : marche/arrêt, cadence et
// plafond par canal, plages, relances, alertes, adresse d'envoi.
export type PilotageST = {
  actif: boolean
  objectifHebdo: number
  plafondJour: number // e-mails par jour
  plafondSmsJour: number
  cadenceEmailMs: number
  cadenceSmsMs: number
  heureMin: string
  heureMax: string
  heureMinSms: string
  heureMaxSms: string
  jours: number[] // 1=lundi … 7=dimanche
  sequenceId?: string | null
  delaiMinTouchesH: number
  tentativesMax: number
  abandonApresJours: number
  alerteEmail: string
  seuilErreursPct: number
  emailTest: string
  adresseEnvoi: string
  recalerAuDemarrage: boolean
  actifDepuis?: string | null
  arreteLe?: string | null
  recaleLe?: string | null
  majLe?: string | null
}

// Un envoi du journal (une étape, une tentative).
export type EnvoiST = {
  id: string
  sousTraitantId: string
  etapeId: string
  canal: CanalEtape
  envoyeLe: string
  statut: "envoye" | "erreur" | "saute" | "abandonne"
  erreur: string
  cause: string
  tentative: number
  rejouerApres?: string | null
  resendId?: string | null
  delivreLe?: string | null
  ouvertLe?: string | null
}

export type ClicST = { id: string; sousTraitantId: string; cliqueLe: string; destination: "candidature" | "bareme" | "stop" }

// Un passage du moteur.
export type PassageST = {
  id: string
  debut: string
  fin?: string | null
  bilan: Record<string, number | string | null>
  erreur: string
}

// Un dossier déposé sur le site.
export type DossierST = {
  id: string
  creeLe: string
  raisonSociale: string
  email: string
  donnees: { sections?: { titre: string; lignes: { label: string; valeur: string }[] }[] }
  fichiers: { slot?: string; path: string; nom?: string }[]
  emailEnvoye: boolean
  tokenRef?: string | null
  sousTraitantId?: string | null
  vuLe?: string | null
  traiteLe?: string | null
}

export type ExclusionST = { id: string; email: string; telephone: string; motif: string; creeLe: string }

// Variables utilisables dans le contenu d'une étape (e-mail ou SMS).
export const variablesST = [
  { cle: "{{contact}}", desc: "le nom du contact" },
  { cle: "{{entreprise}}", desc: "le nom de l'entreprise" },
  { cle: "{{metier}}", desc: "le métier / corps de métier" },
  { cle: "{{lien_candidature}}", desc: "lien tracké vers le dépôt de dossier (candidater)" },
  { cle: "{{lien_bareme}}", desc: "lien tracké vers le barème de prix (PDF)" },
  { cle: "{{lien_desinscription}}", desc: "lien de désinscription en un clic — obligatoire dans chaque e-mail et chaque SMS" },
  { cle: "{{lien}}", desc: "raccourci = lien candidature (rétrocompat)" },
] as const

export type LiensST = { candidature: string; bareme: string; stop: string }

// Remplace les variables par les vraies valeurs du sous-traitant. `liens` peut
// être une seule adresse (ancien usage : {{lien}}) ou les trois liens trackés.
export function remplirST(texte: string, st: Partial<SousTraitant>, liens: string | LiensST): string {
  const l: LiensST = typeof liens === "string" ? { candidature: liens, bareme: liens, stop: liens } : liens
  return texte
    .replaceAll("{{contact}}", st.contact || "")
    .replaceAll("{{entreprise}}", st.entreprise || "")
    .replaceAll("{{metier}}", st.metier || "")
    .replaceAll("{{lien_candidature}}", l.candidature)
    .replaceAll("{{lien_bareme}}", l.bareme)
    .replaceAll("{{lien_desinscription}}", l.stop)
    .replaceAll("{{lien}}", l.candidature)
}

// Un contenu d'étape porte-t-il le lien de désinscription ? (règle : toujours)
export const porteDesinscription = (contenu: string) => contenu.includes("{{lien_desinscription}}")

// Étape neuve (valeurs par défaut).
export function etapeVide(sequenceId: string, ordre: number): EtapeST {
  return { sequenceId, ordre, canal: "email", delaiJours: ordre === 0 ? 0 : 2, objet: "", contenu: "", actif: true }
}

// Libellés lisibles des statuts (pour l'affichage).
export const libelleStatutST: Record<StatutST, string> = {
  a_contacter: "À contacter",
  en_sequence: "En séquence",
  depose: "Dossier déposé",
  termine: "Terminé",
  desinscrit: "Désinscrit",
  injoignable: "Injoignable",
  exclu: "Exclu",
}

// Le rôle de couleur de chaque statut (pastille).
export const rolePastilleStatut: Record<StatutST, "actif" | "fait" | "attente" | "probleme" | "inerte" | "info"> = {
  a_contacter: "inerte",
  en_sequence: "info",
  depose: "fait",
  termine: "actif",
  desinscrit: "probleme",
  injoignable: "attente",
  exclu: "inerte",
}

// Les statuts qui n'avancent plus (la machine ne leur écrit jamais).
export const STATUTS_ARRETES: StatutST[] = ["depose", "termine", "desinscrit", "injoignable", "exclu"]
