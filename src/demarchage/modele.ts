// ════════════════════════════════════════════════════════════════════════════
// LE MODÈLE DU DÉMARCHAGE (09/10/2026) — la fiche, c'est l'agence.
//
// Validé par Mahdi : un standard = une agence ; une personne = un contact ;
// un appel / e-mail / RDV / tâche / note = une activité dans un seul fil.
// Cinq étapes + trois sorties, posées par les résultats d'appel (quatre
// boutons). Les règles qui ÉCRIVENT (étape, tentatives, tâches) vivent dans la
// base, dans la fonction `appel_enregistrer` : ici on ne garde que les
// libellés, les listes fermées et les calculs d'affichage.
// ════════════════════════════════════════════════════════════════════════════

export const ETAPES = [
  { code: "a_prospecter", libelle: "À prospecter", court: "À prospecter", ordre: 1 },
  { code: "gestionnaire_joint", libelle: "Gestionnaire joint", court: "Joint", ordre: 2 },
  { code: "interesse", libelle: "Intéressé", court: "Intéressé", ordre: 3 },
  { code: "rdv_planifie", libelle: "RDV planifié", court: "RDV", ordre: 4 },
  { code: "client", libelle: "Client", court: "Client", ordre: 5 },
] as const
export const SORTIES = [
  { code: "pas_interesse", libelle: "Pas intéressé" },
  { code: "endormie", libelle: "Endormie" },
  { code: "hors_cible", libelle: "Hors cible" },
] as const
export type Etape = (typeof ETAPES)[number]["code"] | (typeof SORTIES)[number]["code"]
export const ETAPES_ACTIVES: Etape[] = ETAPES.map((e) => e.code)
export const ETAPES_SORTIES: Etape[] = SORTIES.map((e) => e.code)

export function libelleEtape(code: string): string {
  return ETAPES.find((e) => e.code === code)?.libelle ?? SORTIES.find((e) => e.code === code)?.libelle ?? code
}
export type RolePastille = "actif" | "fait" | "attente" | "probleme" | "inerte" | "info"
export function pastilleEtape(code: string): RolePastille {
  switch (code) {
    case "client": return "fait"
    case "interesse": case "rdv_planifie": return "actif"
    case "gestionnaire_joint": return "info"
    case "pas_interesse": case "hors_cible": return "probleme"
    case "endormie": return "attente"
    default: return "inerte"
  }
}

// ── Après l'appel : quatre boutons, puis quatre issues si joint ──
export const RESULTATS = [
  { code: "pas_de_reponse", libelle: "Pas de réponse", aide: "Répondeur, occupé, sonne dans le vide", touche: "1" },
  { code: "standard", libelle: "Standard, pas de gestionnaire", aide: "Quelqu'un a décroché, mais pas un décideur", touche: "2" },
  { code: "joint", libelle: "Gestionnaire joint", aide: "Un décideur en ligne", touche: "3" },
  { code: "faux_numero", libelle: "Faux numéro / fermé", aide: "La fiche sort en « hors cible »", touche: "4" },
] as const
export type Resultat = (typeof RESULTATS)[number]["code"]
export const ISSUES = [
  { code: "interesse", libelle: "Intéressé", aide: "Veut la plaquette, les tarifs, nous essayer", touche: "1" },
  { code: "rdv", libelle: "RDV", aide: "Un rendez-vous est pris", touche: "2" },
  { code: "a_rappeler", libelle: "À rappeler le…", aide: "Une tâche datée", touche: "3" },
  { code: "pas_interesse", libelle: "Pas intéressé", aide: "Avec un motif", touche: "4" },
] as const
export type Issue = (typeof ISSUES)[number]["code"]
export const MOTIFS = [
  { code: "deja_prestataire", libelle: "Déjà un prestataire" },
  { code: "pas_de_besoin", libelle: "Pas de besoin" },
  { code: "hors_zone", libelle: "Hors zone" },
  { code: "autre", libelle: "Autre" },
] as const
export type Motif = (typeof MOTIFS)[number]["code"]
export function libelleResultat(code: string): string {
  return RESULTATS.find((r) => r.code === code)?.libelle ?? code
}
export function libelleIssue(code: string): string {
  return ISSUES.find((r) => r.code === code)?.libelle ?? code
}
export function libelleMotif(code: string): string {
  return MOTIFS.find((r) => r.code === code)?.libelle ?? code
}

// Les constantes des règles (les mêmes que dans appel_enregistrer, pour les textes d'aide).
export const SOMMEIL_APRES_TENTATIVES = 6
export const SOMMEIL_JOURS = 60
export const RELANCE_JOURS = 7
export const SANS_NOUVELLE_JOURS = 7

// ── Agences et contacts ──
export const TYPES_AGENCE = [
  { code: "agence", libelle: "Agence immobilière" },
  { code: "syndic", libelle: "Syndic" },
  { code: "administrateur", libelle: "Administrateur de biens" },
  { code: "bailleur", libelle: "Bailleur" },
  { code: "apporteur", libelle: "Apporteur d'affaires" },
  { code: "autre", libelle: "Autre" },
] as const
export type TypeAgence = (typeof TYPES_AGENCE)[number]["code"]
export const ROLES_CONTACT = [
  { code: "gestionnaire", libelle: "Gestionnaire locatif" },
  { code: "responsable", libelle: "Responsable location" },
  { code: "directeur", libelle: "Directeur d'agence" },
  { code: "assistant", libelle: "Assistant(e)" },
  { code: "syndic", libelle: "Gestionnaire de copropriété" },
  { code: "apporteur", libelle: "Apporteur d'affaires" },
  { code: "autre", libelle: "Autre" },
] as const
export type RoleContact = (typeof ROLES_CONTACT)[number]["code"]
export function libelleRole(code: string): string {
  return ROLES_CONTACT.find((r) => r.code === code)?.libelle ?? code
}
export function libelleType(code: string): string {
  return TYPES_AGENCE.find((r) => r.code === code)?.libelle ?? code
}

export type Secteur = { code: string; libelle: string; zone: string; ordre: number }

export type Agence = {
  id: string
  nom: string
  enseigne: string
  type: TypeAgence
  secteur: string | null
  secteurLibelle: string
  adresse: string
  telephone: string
  email: string
  site: string
  nbLots: number
  logoUrl: string
  etape: Etape
  etapeDepuis: string
  commercialId: string | null
  tentatives: number
  jointFois: number
  reveilLe: string | null
  motif: string
  premierOsLe: string | null
  numeroEmission: string
  derniereActiviteLe: string | null
  creeLe: string
  // Colonnes de la vue agences_liste
  nbContacts: number
  contactPrincipal: string
  contactLigne: string
  prochaineEcheance: string | null
  prochaineTache: string
  nbAppels: number
  dernierAppelLe: string | null
  dernierResultat: string
}

export type Contact = {
  id: string
  agenceId: string
  prenom: string
  nom: string
  role: RoleContact
  ligneDirecte: string
  mobile: string
  email: string
  principal: boolean
  parti: boolean
  note: string
  creeLe: string
}
export function nomContact(c: Pick<Contact, "prenom" | "nom">): string {
  return `${c.prenom} ${c.nom}`.trim() || "(sans nom)"
}

export type TypeActivite = "appel" | "email" | "rdv" | "tache" | "note" | "etape"
export type Activite = {
  id: string
  agenceId: string
  contactId: string | null
  type: TypeActivite
  date: string
  echeance: string | null
  faitLe: string | null
  compteId: string | null
  compteNom: string
  titre: string
  note: string
  resultat: string
  issue: string
  motif: string
  numeroUtilise: string
  dureeS: number | null
  callId: string
  sens: "sortant" | "entrant"
  rdvType: string
  messageId: string | null
  etapeDe: string
  etapeVers: string
  source: string
}

// ── Petits calculs purs, pour l'affichage ──

// Le nom normalisé qui sert de clé de doublon (le même calcul que la base).
export function nomCle(nom: string): string {
  return (nom || "").trim().replace(/\s+/g, " ").toLowerCase()
}

// Un code postal à 5 chiffres dans un texte libre (« 75005 », « 92100 Boulogne ») → « 75005 ».
export function secteurDepuis(texte: string): string | null {
  const m = (texte || "").match(/\b(\d{5})\b/)
  return m ? m[1] : null
}

// L'enseigne, lue dans le nom (la même liste que la conversion SQL).
const ENSEIGNES: [RegExp, string][] = [
  [/century\s*21/i, "Century 21"], [/\borpi\b/i, "Orpi"], [/foncia/i, "Foncia"], [/lafor[eê]t/i, "Laforêt"], [/guy hoquet/i, "Guy Hoquet"],
  [/nexity/i, "Nexity"], [/citya/i, "Citya"], [/st[ée]phane plaza/i, "Stéphane Plaza"], [/\bera\b/i, "ERA"], [/square habitat/i, "Square Habitat"],
  [/sotheby/i, "Sotheby's"], [/\blamy\b/i, "Lamy"], [/emile garcin/i, "Émile Garcin"], [/barnes/i, "Barnes"], [/engel/i, "Engel & Völkers"], [/\biad\b/i, "IAD"], [/safti/i, "Safti"],
]
export function enseigneDe(nom: string): string {
  for (const [re, e] of ENSEIGNES) if (re.test(nom || "")) return e
  return ""
}

// Le numéro à proposer en premier : la ligne directe du contact principal, sinon le standard.
export function numeroParDefaut(agence: Pick<Agence, "telephone">, contacts: Contact[]): { numero: string; contactId: string | null; libelle: string } {
  const actifs = contacts.filter((c) => !c.parti)
  const principal = actifs.find((c) => c.principal && c.ligneDirecte) ?? actifs.find((c) => c.ligneDirecte) ?? actifs.find((c) => c.principal && c.mobile) ?? actifs.find((c) => c.mobile)
  if (principal) {
    return { numero: principal.ligneDirecte || principal.mobile, contactId: principal.id, libelle: `${nomContact(principal)} · ${principal.ligneDirecte ? "ligne directe" : "mobile"}` }
  }
  return { numero: agence.telephone, contactId: null, libelle: "Standard" }
}

// ── Les quatre files ──
export type File = "a_prospecter" | "rappels" | "sans_nouvelle" | "a_reveiller"
export const FILES: { code: File; libelle: string; aide: string }[] = [
  { code: "a_prospecter", libelle: "À prospecter", aide: "Jamais jointes d'abord, puis la tentative la plus ancienne" },
  { code: "rappels", libelle: "Rappels du jour", aide: "Les tâches datées d'aujourd'hui ou en retard" },
  { code: "sans_nouvelle", libelle: "Intéressés sans nouvelle", aide: `Intéressé ou RDV, rien depuis ${SANS_NOUVELLE_JOURS} jours` },
  { code: "a_reveiller", libelle: "À réveiller", aide: "Endormies dont la date de réveil est passée" },
]

const JOUR_MS = 24 * 3600 * 1000
function debutDeJour(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
function finDeJour(d: Date): number {
  return debutDeJour(d) + JOUR_MS
}
// « 2026-10-09 » du jour local (une date de la base, sans heure, se compare en texte).
export function jourLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Dans quelle file se range une agence (null = dans aucune : elle n'est pas à appeler).
export function fileDe(a: Agence, maintenant: Date): File | null {
  if (a.type === "apporteur") return null
  const echeance = a.prochaineEcheance ? new Date(a.prochaineEcheance).getTime() : null
  if (echeance !== null && echeance < finDeJour(maintenant) && a.etape !== "hors_cible") return "rappels"
  if (a.etape === "endormie") {
    return a.reveilLe && a.reveilLe.slice(0, 10) <= jourLocal(maintenant) ? "a_reveiller" : null
  }
  if (a.etape === "interesse" || a.etape === "rdv_planifie") {
    const derniere = a.derniereActiviteLe ? new Date(a.derniereActiviteLe).getTime() : 0
    return echeance === null && maintenant.getTime() - derniere >= SANS_NOUVELLE_JOURS * JOUR_MS ? "sans_nouvelle" : null
  }
  if (a.etape === "a_prospecter" || a.etape === "gestionnaire_joint") {
    if (echeance !== null) return null // une tâche future : on attend sa date
    return "a_prospecter"
  }
  return null
}

// L'ordre de la file « À prospecter » : secteur du jour d'abord, jamais appelées,
// puis la tentative la plus ancienne ; à égalité, les réseaux avant les indépendants.
export function ordonnerAProspecter(agences: Agence[], secteurDuJour: string | null): Agence[] {
  return [...agences].sort((x, y) => {
    const sx = secteurDuJour && x.secteur === secteurDuJour ? 0 : 1
    const sy = secteurDuJour && y.secteur === secteurDuJour ? 0 : 1
    if (sx !== sy) return sx - sy
    const jx = x.dernierAppelLe ? 1 : 0
    const jy = y.dernierAppelLe ? 1 : 0
    if (jx !== jy) return jx - jy
    if (x.dernierAppelLe && y.dernierAppelLe && x.dernierAppelLe !== y.dernierAppelLe) return x.dernierAppelLe < y.dernierAppelLe ? -1 : 1
    const ex = x.enseigne ? 0 : 1
    const ey = y.enseigne ? 0 : 1
    if (ex !== ey) return ex - ey
    return x.nom.localeCompare(y.nom, "fr")
  })
}

// L'ordre des rappels : en retard d'abord, puis par heure.
export function ordonnerRappels(agences: Agence[]): Agence[] {
  return [...agences].sort((x, y) => (x.prochaineEcheance ?? "") < (y.prochaineEcheance ?? "") ? -1 : 1)
}

// Une agence déjà appelée aujourd'hui ne ressort pas (sauf tâche datée).
export function appeleeAujourdHui(a: Pick<Agence, "dernierAppelLe">, maintenant: Date): boolean {
  if (!a.dernierAppelLe) return false
  const t = new Date(a.dernierAppelLe).getTime()
  return t >= debutDeJour(maintenant) && t < finDeJour(maintenant)
}

// Ce que le résultat va faire, en une phrase (aide sous les boutons).
export function effetAnnonce(resultat: Resultat, issue: Issue | null, a: Pick<Agence, "etape" | "tentatives">): string {
  if (resultat === "pas_de_reponse" || resultat === "standard") {
    const t = a.tentatives + 1
    if (t >= SOMMEIL_APRES_TENTATIVES && (a.etape === "a_prospecter" || a.etape === "gestionnaire_joint")) {
      return `${t}e tentative sans gestionnaire : l'agence s'endort ${SOMMEIL_JOURS} jours.`
    }
    return `Tentative ${t} sur ${SOMMEIL_APRES_TENTATIVES}. L'étape ne change pas.`
  }
  if (resultat === "faux_numero") return "La fiche sort en « hors cible ». Elle n'est pas supprimée."
  switch (issue) {
    case "interesse": return `Étape « Intéressé », tâche « Relancer » dans ${RELANCE_JOURS} jours.`
    case "rdv": return "Étape « RDV planifié », le rendez-vous va dans l'agenda."
    case "a_rappeler": return "Une tâche « Rappeler » à la date choisie."
    case "pas_interesse": return "Étape « Pas intéressé », avec le motif."
    default: return "Choisis ce qui s'est passé avec le gestionnaire."
  }
}

// Durée lisible : 252 s → « 4 min 12 ».
export function dureeLisible(s: number | null | undefined): string {
  if (!s || s <= 0) return ""
  const m = Math.floor(s / 60)
  const r = s % 60
  return m ? `${m} min ${r.toString().padStart(2, "0")}` : `${r} s`
}
