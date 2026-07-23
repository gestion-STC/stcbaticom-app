// Recrutement sous-traitants : types + petits utilitaires partagés.
// La base ST est démarchée par une SÉQUENCE (suite d'étapes SMS/e-mail) qui pousse
// l'artisan à déposer son dossier sur le site. Tunnel : envoyé → clic → dépôt.

export type StatutST = "a_contacter" | "en_sequence" | "depose" | "exclu"
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
  statut: StatutST
  sequenceId?: string | null
  etapeCourante: number // index de la PROCHAINE étape à envoyer
  demarreLe?: string | null
  token?: string
  dernierClicLe?: string | null
  nbClics: number
  deposeLe?: string | null
  dossierId?: string | null
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

// Pilotage global : combien de ST on veut recruter, à quelle cadence, marche/arrêt.
export type PilotageST = {
  actif: boolean
  objectifHebdo: number
  plafondJour: number
  heureMin: string
  heureMax: string
  jours: number[] // 1=lundi … 7=dimanche
  sequenceId?: string | null
}

// Variables utilisables dans le contenu d'une étape (e-mail ou SMS).
export const variablesST = [
  { cle: "{{contact}}", desc: "le nom du contact" },
  { cle: "{{entreprise}}", desc: "le nom de l'entreprise" },
  { cle: "{{metier}}", desc: "le métier / corps de métier" },
  { cle: "{{lien}}", desc: "le lien vers le dépôt de dossier (tracké)" },
] as const

// Remplace les variables par les vraies valeurs du sous-traitant.
export function remplirST(texte: string, st: Partial<SousTraitant>, lien: string): string {
  return texte
    .replaceAll("{{contact}}", st.contact || "")
    .replaceAll("{{entreprise}}", st.entreprise || "")
    .replaceAll("{{metier}}", st.metier || "")
    .replaceAll("{{lien}}", lien)
}

// Étape neuve (valeurs par défaut).
export function etapeVide(sequenceId: string, ordre: number): EtapeST {
  return { sequenceId, ordre, canal: "email", delaiJours: ordre === 0 ? 0 : 2, objet: "", contenu: "", actif: true }
}

// Libellés lisibles des statuts (pour l'affichage).
export const libelleStatutST: Record<StatutST, string> = {
  a_contacter: "À contacter",
  en_sequence: "En séquence",
  depose: "Dossier déposé",
  exclu: "Exclu",
}
