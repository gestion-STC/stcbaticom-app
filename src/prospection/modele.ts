// ════════════════════════════════════════════════════════════════════════════
// LA PROSPECTION, UNE SEULE MÉCANIQUE (07/11/2026, Mahdi : « on crée des campagnes, on traite les leads,
// la prospection ; le logiciel doit être assez bien fait pour que chacun ne soit pas embêté par les autres »).
//
// Le logiciel ne connaît que des CONTACTS rangés dans des BASES (agences immobilières, artisans
// sous-traitants, demain syndics…). Une base porte ses champs, ses issues d'appel, ce qui compte comme
// « gagné », et dit si on la prospecte à froid. Une ÉQUIPE travaille des bases ; un COMPTE est dans des
// équipes et ne voit QUE leurs bases : contacts, campagnes, leads, mails, chiffres.
//
// Une CAMPAGNE = une base, une audience, une séquence d'ÉTAPES (des blocs : mail, SMS, LinkedIn, newsletter,
// appel, attendre, si…, sortir) et les signaux qui font un LEAD. Fichier PUR : aucun accès à la base ici.
// ════════════════════════════════════════════════════════════════════════════

export type Id = string

export type Champ = { cle: string; libelle: string; valeurs?: string[] }
export type Base = {
  id: Id; nom: string; unite: string; equipeId: Id
  champs: Champ[]
  /** Les issues d'un appel joint, propres à la base (1 à 4 au clavier). */
  issues: { code: string; libelle: string }[]
  /** Ce qui compte comme gagné (client, dossier déposé…). */
  gagne: string
  /** Mahdi, 07/11 : « le sous-traitant, on ne le colle pas direct » → pas de file Prospection. */
  prospection: boolean
  /** Ce que valent les liens suivis de la base dans un mail (« Créer un compte », « Candidature »…). */
  liens: { cle: string; libelle: string }[]
}

export type Contact = {
  id: Id; baseId: Id; nom: string; personne: string
  email: string; mobile: string; telephone: string
  champs: Record<string, string>
  statut: "libre" | "lead" | "gagne" | "exclu"
  desinscrit: boolean
  /** Le compte à qui il est attribué (null : l'équipe de la base). */
  proprietaireId: Id | null
}

export type Equipe = { id: Id; nom: string; comptes: Id[] }
export type Compte = { id: Id; nom: string; role: "gerant" | "commercial" }

// ── La séquence : des blocs ──
export type Canal = "mail" | "sms" | "linkedin" | "newsletter"
export type Condition = "a_ouvert" | "a_clique" | "a_repondu" | "a_mobile" | "a_email"
export type Variante = { id: Id; nom: string; objet: string; corps: string }
export type Etape =
  | { id: Id; type: Canal; variantes: Variante[] }
  | { id: Id; type: "attendre"; jours: number }
  | { id: Id; type: "si"; condition: Condition; /** Si NON : on saute à cette étape (sinon on continue). */ sinonVers: Id | null }
  | { id: Id; type: "appel"; consigne: string; /** Le standard de l'entreprise, ou le contact en direct. */ cible?: "standard" | "contact" }
  | { id: Id; type: "fin" }

export type Signal = "clic_lien" | "reponse" | "ouvertures_2" | "clic_lien_principal"
export const LIBELLE_SIGNAL: Record<Signal, string> = {
  clic_lien: "clique un lien suivi",
  clic_lien_principal: "clique le lien principal",
  reponse: "répond (réponse humaine)",
  ouvertures_2: "ouvre 2 fois en 7 jours",
}

export type Audience = {
  /** Champ → valeurs retenues (vide : toutes). */
  filtres: Record<string, string[]>
  /** Mahdi, 07/11 : « on n'attaque que les contacts complets » → mail ET téléphone par défaut. */
  doitAvoir: ("email" | "mobile" | "telephone")[]
}
export type Rythme = { parJour: number; jours: number[]; heureMin: number; heureMax: number; ecartMinH: number }

export type StatutCampagne = "brouillon" | "active" | "pause" | "terminee"
export type Campagne = {
  id: Id; nom: string; baseId: Id; objectif: string; statut: StatutCampagne
  audience: Audience; rythme: Rythme; etapes: Etape[]; signaux: Signal[]
  creeParId: Id; creeLe: string; lanceeLe: string | null
  /** Coût d'un SMS (€), pour le suivi des coûts. */
  coutSms: number
  /** Mode test (Mahdi, 07/11) : tout part vers ces coordonnées, pas vers les contacts. */
  modeTest?: boolean; testEmail?: string; testMobile?: string
  /** « st » : la machine sous-traitants reprise ; « tracabilite » : les critères actuels des agences, jamais lancée. */
  origine?: string
  /** Le réglage complet, tel que l'écran l'édite (voir configCampagne.ts). Le moteur lit les colonnes ci-dessus. */
  config?: Record<string, unknown>
}

// ── Ce que la machine écrit en tournant ──
export type Inscription = {
  id: Id; campagneId: Id; contactId: Id; entreeLe: string
  etapeIndex: number; prochaineLe: string
  statut: "en_cours" | "lead" | "terminee" | "desinscrit" | "rebond"
  sortieLe: string | null
}
export type Envoi = {
  id: Id; campagneId: Id; inscriptionId: Id; contactId: Id; etapeId: Id; varianteId: Id | null
  canal: Canal; le: string; statut: "en_cours" | "envoye" | "erreur" | "saute"; cause: string
}
export type TypeEvenement = "delivre" | "ouvert" | "clic" | "reponse" | "desinscription" | "rebond"
export type Evenement = { id: Id; campagneId: Id; envoiId: Id | null; contactId: Id; type: TypeEvenement; le: string; lien?: string }
export type Lead = {
  id: Id; contactId: Id; baseId: Id; campagneId: Id | null; signal: string; creeLe: string
  statut: "a_traiter" | "traite"; proprietaireId: Id | null
}
/** Une étape « Appel » ou « LinkedIn » : une tâche pour le commercial, dans la session. */
export type Tache = { id: Id; contactId: Id; campagneId: Id; etapeId: Id; type: "appel" | "linkedin"; consigne: string; cible?: "standard" | "contact"; creeLe: string; faiteLe: string | null }
export type Appel = { id: Id; contactId: Id; compteId: Id; le: string; resultat: "pas_de_reponse" | "standard" | "joint" | "faux_numero"; issue: string; campagneId: Id | null }
export type Message = {
  id: Id; contactId: Id | null; sens: "entrant" | "sortant"; de: string; a: string; objet: string; corps: string
  le: string; lu: boolean; campagneId: Id | null
}

/** Ce qu'un compte voit : les bases de ses équipes (le gérant : toutes). */
export function basesVisibles(compte: Compte, equipes: Equipe[], bases: Base[]): Base[] {
  if (compte.role === "gerant") return bases
  const mesEquipes = new Set(equipes.filter((e) => e.comptes.includes(compte.id)).map((e) => e.id))
  return bases.filter((b) => mesEquipes.has(b.equipeId))
}

/** Un contact est-il pour ce compte ? Sa base est visible ET il n'est pas attribué à quelqu'un d'autre. */
export function contactVisible(c: Contact, compte: Compte, bases: Set<Id>): boolean {
  if (!bases.has(c.baseId)) return false
  return compte.role === "gerant" || c.proprietaireId === null || c.proprietaireId === compte.id
}

/** L'audience d'une campagne : les contacts de la base qui passent les filtres et peuvent recevoir. */
export function estEligible(c: Contact, camp: Campagne): boolean {
  if (c.baseId !== camp.baseId || c.desinscrit || c.statut === "exclu" || c.statut === "gagne") return false
  for (const [cle, valeurs] of Object.entries(camp.audience.filtres)) {
    // Un code postal se compare par le début : le 92 ne doit pas prendre le 78920.
    if (valeurs.length && !valeurs.some((v) => (cle === "cp" ? (c.champs[cle] ?? "").startsWith(v) : (c.champs[cle] ?? "").includes(v)))) return false
  }
  if (camp.audience.doitAvoir.includes("email") && !c.email) return false
  if (camp.audience.doitAvoir.includes("mobile") && !c.mobile) return false
  if (camp.audience.doitAvoir.includes("telephone") && !c.telephone && !c.mobile) return false
  return true
}

export const LIBELLE_ETAPE: Record<Etape["type"], string> = {
  mail: "Mail", sms: "SMS", linkedin: "LinkedIn", newsletter: "Newsletter", attendre: "Attendre", si: "Si…", appel: "Appel", fin: "Sortir",
}
export const LIBELLE_CONDITION: Record<Condition, string> = {
  a_ouvert: "a ouvert un mail", a_clique: "a cliqué", a_repondu: "a répondu", a_mobile: "a un mobile", a_email: "a un mail",
}
