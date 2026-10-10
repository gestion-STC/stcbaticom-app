// ════════════════════════════════════════════════════════════════════════════
// SESSIONS DE CALL — les calculs purs de l'écran (09/10/2026).
//
// Tout ce qui se teste sans navigateur ni base vit ici : la constitution de la
// file, le numéro d'émission à utiliser, la jauge du jour, la machine à états
// qui suit un appel Ringover, les raccourcis clavier, les dates et les textes.
// L'écran (`components/demarchage/SessionCall.tsx`) ne fait qu'appeler.
// ════════════════════════════════════════════════════════════════════════════
import type { Prospect } from "../data"
import { estDansLaReserve, normaliser } from "../lib/numerosEmission"
import { chiffresTel, formaterTelephone } from "../lib/telephone"
import type { BilanAppel } from "./db"
import {
  type Activite,
  type Agence,
  type Contact,
  type File,
  type Issue,
  type Motif,
  type Resultat,
  ISSUES,
  RELANCE_JOURS,
  RESULTATS,
  libelleEtape,
  libelleIssue,
  libelleMotif,
  libelleResultat,
  libelleRole,
  nomContact,
  numeroParDefaut,
} from "./modele"

// ── La file ──────────────────────────────────────────────────────────────────

export type OptionsFile = {
  file: File
  appeleesAujourdHui: Set<string> // ids d'agences déjà appelées aujourd'hui
  inclureDejaAppelees: boolean // la case « inclure les agences déjà appelées aujourd'hui »
}

// La file telle qu'on l'appelle : l'ordre de `chargerFile` est gardé, on retire
// celles appelées ce matin (sauf dans « À rappeler aujourd'hui » : une tâche datée est
// une tâche datée) et on ne compose jamais deux fois le même standard dans la
// même session — deux fiches derrière le même numéro tomberaient sur la même
// personne deux fois.
export function constituerFile(agences: Agence[], o: OptionsFile): Agence[] {
  const garderAppelees = o.inclureDejaAppelees || o.file === "rappels"
  // Les standards des agences déjà appelées : une fiche en double partage le numéro.
  const telsAppeles = new Set<string>()
  if (!garderAppelees) {
    for (const a of agences) {
      const t = chiffresTel(a.telephone)
      if (t && o.appeleesAujourdHui.has(a.id)) telsAppeles.add(t)
    }
  }
  const telsVus = new Set<string>()
  const out: Agence[] = []
  for (const a of agences) {
    const t = chiffresTel(a.telephone)
    if (!garderAppelees && (o.appeleesAujourdHui.has(a.id) || (t && telsAppeles.has(t)))) continue
    if (t) {
      if (telsVus.has(t)) continue
      telsVus.add(t)
    }
    out.push(a)
  }
  return out
}

// ── Le numéro d'émission ─────────────────────────────────────────────────────

export type AttributionNumero = { numero: string; aEnregistrer: boolean; bloque: boolean }

// Le numéro de la réserve le moins attribué parmi les agences connues (même
// règle que `numeroLeMoinsUtilise`, écrite pour des agences et non des prospects).
export function numeroLeMoinsAttribue(reserve: string[], agences: Pick<Agence, "numeroEmission">[]): string {
  if (reserve.length === 0) return ""
  const compte = new Map<string, number>(reserve.map((r) => [normaliser(r), 0]))
  for (const a of agences) {
    const n = normaliser(a.numeroEmission ?? "")
    if (n && compte.has(n)) compte.set(n, (compte.get(n) ?? 0) + 1)
  }
  let meilleur = reserve[0]
  let min = Infinity
  for (const r of reserve) {
    const c = compte.get(normaliser(r)) ?? 0
    if (c < min) {
      min = c
      meilleur = r
    }
  }
  return meilleur
}

// Quel numéro pour appeler cette agence (la règle de `numeroPourProspect`) :
// - son numéro attitré s'il est encore dans la réserve ;
// - BLOQUÉ si son numéro attitré est sorti de la réserve : on n'appelle jamais
//   en douce avec un autre numéro (l'agence doit toujours voir le même) ;
// - sinon le moins attribué, à enregistrer sur la fiche.
export function numeroEmissionPour(
  agence: Pick<Agence, "numeroEmission">,
  reserve: string[],
  toutes: Pick<Agence, "numeroEmission">[],
): AttributionNumero {
  const actuel = agence.numeroEmission ?? ""
  if (actuel && estDansLaReserve(actuel, reserve)) return { numero: actuel, aEnregistrer: false, bloque: false }
  if (actuel) return { numero: actuel, aEnregistrer: false, bloque: true }
  const choisi = numeroLeMoinsAttribue(reserve, toutes)
  return { numero: choisi, aEnregistrer: Boolean(choisi), bloque: false }
}

// ── La jauge du jour ─────────────────────────────────────────────────────────

export type Jauge = { utilises: number; quota: number; part: number; depasse: boolean; texte: string }

// `compteurs` est indexé par les chiffres du numéro (voir compterAppelsDuJourParNumero).
// Un quota à 0 = aucun plafond réglé : on compte, sans barre.
export function jaugeDuJour(numero: string, compteurs: Map<string, number>, quota: number): Jauge {
  const utilises = compteurs.get(chiffresTel(numero)) ?? 0
  const q = Math.max(0, Math.floor(quota))
  const part = q > 0 ? Math.min(1, utilises / q) : 0
  const depasse = q > 0 && utilises >= q
  const texte = q > 0 ? `${utilises} / ${q} appels aujourd'hui` : `${utilises} appel${utilises > 1 ? "s" : ""} aujourd'hui, pas de plafond réglé`
  return { utilises, quota: q, part, depasse, texte }
}

// ── Les numéros à afficher ───────────────────────────────────────────────────

export type LigneNumero = {
  cle: string
  numero: string
  libelle: string // « Standard », « Sophie Martin »
  detail: string // « ligne directe · Gestionnaire locatif · principal »
  contactId: string | null
  parDefaut: boolean
  valide: boolean
}

// Une ligne par numéro : le standard, puis la ligne directe et le mobile de chaque
// contact encore en poste. Un même numéro n'apparaît qu'une fois (le premier gagne).
export function lignesNumeros(agence: Pick<Agence, "telephone">, contacts: Contact[]): LigneNumero[] {
  const defaut = numeroParDefaut(agence, contacts)
  const cleDefaut = chiffresTel(defaut.numero)
  const vus = new Set<string>()
  const out: LigneNumero[] = []
  const ajouter = (numero: string, libelle: string, detail: string, contactId: string | null, cle: string) => {
    const n = (numero || "").trim()
    if (!n) return
    const c = chiffresTel(n)
    if (c && vus.has(c)) return
    if (c) vus.add(c)
    const parDefaut = Boolean(c) && c === cleDefaut
    out.push({ cle, numero: n, libelle, detail, contactId: parDefaut && defaut.contactId ? defaut.contactId : contactId, parDefaut, valide: c.length >= 10 && c.length <= 15 })
  }
  ajouter(agence.telephone, "Standard", "le numéro de l'agence", null, "standard")
  for (const k of contacts) {
    if (k.parti) continue
    const role = libelleRole(k.role)
    const principal = k.principal ? " · principal" : ""
    ajouter(k.ligneDirecte, nomContact(k), `ligne directe · ${role}${principal}`, k.id, `${k.id}:directe`)
    ajouter(k.mobile, nomContact(k), `mobile · ${role}${principal}`, k.id, `${k.id}:mobile`)
  }
  return out
}

// ── Après l'appel : raccourcis et choix ──────────────────────────────────────

export type TypeRdv = "telephone" | "visio" | "sur_place"
export const TYPES_RDV: { code: TypeRdv; libelle: string }[] = [
  { code: "telephone", libelle: "Téléphone" },
  { code: "visio", libelle: "Visio" },
  { code: "sur_place", libelle: "Sur place" },
]

export type ChoixResultat = {
  resultat: Resultat
  issue: Issue | ""
  motif: Motif | ""
  contactId: string | null
  rappelLe: string | null // ISO
  rdvLe: string | null // ISO
  rdvType: TypeRdv
}

export function resultatPourTouche(touche: string): Resultat | null {
  return RESULTATS.find((r) => r.touche === touche)?.code ?? null
}
export function issuePourTouche(touche: string): Issue | null {
  return ISSUES.find((r) => r.touche === touche)?.code ?? null
}

// Les raccourcis se taisent quand on tape dans un champ.
export function estChampDeSaisie(tag: string | undefined, editable: boolean): boolean {
  const t = (tag || "").toUpperCase()
  return editable || t === "INPUT" || t === "TEXTAREA" || t === "SELECT"
}

// Le résultat est obligatoire, et chaque issue a sa pièce jointe (date, motif).
export function choixComplet(c: { resultat: Resultat | null; issue: Issue | ""; motif: Motif | ""; rappelLe: string | null; rdvLe: string | null }): boolean {
  if (!c.resultat) return false
  if (c.resultat !== "joint") return true
  if (!c.issue) return false
  if (c.issue === "a_rappeler") return Boolean(c.rappelLe)
  if (c.issue === "rdv") return Boolean(c.rdvLe)
  if (c.issue === "pas_interesse") return Boolean(c.motif)
  return true
}

// ── La surveillance d'un appel Ringover (machine à états pure) ──────────────
//
// Toutes les 4 s on demande « cet appel est-il en ligne ? ». Une fois vu en
// ligne, deux tours de suite à « non » = raccroché (anti-hoquet, mise en
// attente passagère). Jamais vu en ligne après 7 tours (≈ 28 s) = pas de
// réponse. Huit vérifications ratées d'affilée = on cesse de prétendre suivre.

export const INTERVALLE_SURVEILLANCE_MS = 4000
export const TOURS_SANS_DEMARRAGE = 7
export const TOURS_A_ZERO_POUR_RACCROCHE = 2
export const ECHECS_AVANT_ABANDON = 8
export const DELAI_ANTI_DOUBLE_APPEL_MS = 1500
export const ESSAIS_DETAIL = 15 // × 6 s ≈ 90 s : le relevé Ringover met du temps à s'écrire
export const PAUSE_DETAIL_MS = 6000

export type Surveillance = { vuActif: boolean; zeros: number; sansDemarrage: number; echecs: number }
export const SURVEILLANCE_INITIALE: Surveillance = { vuActif: false, zeros: 0, sansDemarrage: 0, echecs: 0 }
export type Verdict = "continuer" | "raccroche" | "pas_de_reponse" | "indisponible"

export function observerAppel(s: Surveillance, obs: { ok: boolean; actif: boolean }): { suite: Surveillance; verdict: Verdict } {
  if (!obs.ok) {
    const echecs = s.echecs + 1
    return { suite: { ...s, echecs }, verdict: echecs >= ECHECS_AVANT_ABANDON ? "indisponible" : "continuer" }
  }
  if (obs.actif) return { suite: { ...s, vuActif: true, zeros: 0, sansDemarrage: 0, echecs: 0 }, verdict: "continuer" }
  if (s.vuActif) {
    const zeros = s.zeros + 1
    return { suite: { ...s, zeros, echecs: 0 }, verdict: zeros >= TOURS_A_ZERO_POUR_RACCROCHE ? "raccroche" : "continuer" }
  }
  const sansDemarrage = s.sansDemarrage + 1
  return { suite: { ...s, sansDemarrage, echecs: 0 }, verdict: sansDemarrage >= TOURS_SANS_DEMARRAGE ? "pas_de_reponse" : "continuer" }
}

// Le relevé final de Ringover (last_state / is_failed) → un résultat à proposer.
export function suggestionDepuisDetail(lastState: string | null | undefined, isFailed: boolean | null | undefined): { resultat: Resultat | null; texte: string } {
  const st = String(lastState || "").toUpperCase()
  if (isFailed || st === "FAILED" || st === "FAX_FAILED") return { resultat: "faux_numero", texte: "Ringover dit : numéro injoignable ou invalide." }
  if (st === "VOICEMAIL") return { resultat: "pas_de_reponse", texte: "Ringover dit : répondeur." }
  if (st === "MISSED" || st === "NOANSWER_TRANSFERED" || st === "QUEUE_TIMEOUT") return { resultat: "pas_de_reponse", texte: "" }
  return { resultat: null, texte: "" }
}

// Durée d'un appel en secondes, jamais négative.
export function dureeAppel(debutMs: number, finMs: number): number {
  return Math.max(0, Math.round((finMs - debutMs) / 1000))
}

// Le compte à rebours affiché (null = pas de compte en cours).
export function compteARebours(finMs: number | null, maintenantMs: number): number | null {
  if (finMs === null) return null
  return Math.max(0, Math.ceil((finMs - maintenantMs) / 1000))
}

// ── Les dates ────────────────────────────────────────────────────────────────

const deux = (n: number) => String(n).padStart(2, "0")

// « 2026-10-10T10:00 » : la valeur d'un champ datetime-local.
export function dateHeureLocale(d: Date): string {
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}`
}
export function plusJours(d: Date, jours: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + jours, d.getHours(), d.getMinutes())
}
// Le défaut de « À rappeler le… » et d'un RDV : demain 10 h.
export function demainDixHeures(maintenant: Date): string {
  return dateHeureLocale(new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1, 10, 0))
}
// « 2026-10-10T10:00 » (heure locale) → ISO, ou null si ce n'est pas une date.
export function versIso(local: string): string | null {
  const m = (local || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
// « 16/10 »
export function dateCourte(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}`
}
// « 16/10 10:00 »
export function dateHeureCourte(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `${dateCourte(iso)} ${deux(d.getHours())}:${deux(d.getMinutes())}`
}
// Nombre de jours (en jours civils) entre une date et maintenant ; null si pas de date.
export function depuisJours(iso: string | null | undefined, maintenant: Date): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const debut = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  return Math.max(0, Math.round((debut(maintenant) - debut(d)) / 86_400_000))
}
// « jamais appelée », « appelée aujourd'hui », « dernier appel il y a 3 j »
export function texteDernierAppel(a: Pick<Agence, "dernierAppelLe">, maintenant: Date): string {
  const j = depuisJours(a.dernierAppelLe, maintenant)
  if (j === null) return "jamais appelée"
  if (j === 0) return "appelée aujourd'hui"
  if (j === 1) return "dernier appel hier"
  return `dernier appel il y a ${j} j`
}

// ── Le résumé de ce que la validation a écrit ────────────────────────────────

export function resumeEcriture(bilan: Pick<BilanAppel, "etape" | "tacheId" | "tentatives">, choix: ChoixResultat, maintenant: Date): string {
  const parts = [`Étape → ${libelleEtape(bilan.etape)}`]
  if (choix.resultat === "pas_de_reponse" || choix.resultat === "standard") parts.push(`tentative ${bilan.tentatives}`)
  if (choix.resultat === "joint") {
    if (choix.issue === "rdv") parts.push(`RDV le ${dateHeureCourte(choix.rdvLe)}`)
    else if (choix.issue === "a_rappeler") parts.push(`tâche Rappeler le ${dateHeureCourte(choix.rappelLe)}`)
    else if (choix.issue === "interesse") parts.push(`tâche Relancer le ${dateCourte(plusJours(maintenant, RELANCE_JOURS).toISOString())}`)
    else if (choix.issue === "pas_interesse") parts.push(`motif « ${libelleMotif(choix.motif)} »`)
    if (bilan.tacheId && !["rdv", "a_rappeler", "interesse"].includes(choix.issue)) parts.push("une tâche créée")
  }
  return parts.join(" · ")
}

// ── L'e-mail : le Prospect qu'attend EnvoyerEmailModal ──────────────────────

export function prospectDepuisAgence(agence: Agence, contact: Contact | null): Prospect {
  return {
    id: agence.id,
    entreprise: agence.nom,
    contact: contact ? nomContact(contact) : "",
    telephone: contact?.ligneDirecte || contact?.mobile || agence.telephone,
    email: contact?.email || agence.email,
    adresse: agence.adresse,
    arrondissement: agence.secteurLibelle,
    commentaire: "",
    type: "",
    statut: "",
    priorite: "—",
    prochaineRelance: "",
    numeroEmission: agence.numeroEmission,
  }
}

// ── Le fil ───────────────────────────────────────────────────────────────────

export type DescriptionActivite = { titre: string; detail: string; etat: "fait" | "ouvert" | "" }

// Une activité en deux lignes : ce qui s'est passé, puis les précisions.
export function decrireActivite(a: Activite): DescriptionActivite {
  const qui = a.compteNom ? ` · ${a.compteNom}` : ""
  switch (a.type) {
    case "appel": {
      if (a.sens === "entrant") return { titre: "Appel entrant", detail: `${a.numeroUtilise ? formaterTelephone(a.numeroUtilise) : ""}${qui}`.replace(/^ · /, ""), etat: "" }
      const issue = a.issue ? ` → ${libelleIssue(a.issue)}` : ""
      const motif = a.motif ? ` (${libelleMotif(a.motif)})` : ""
      const duree = a.dureeS ? `${Math.floor(a.dureeS / 60)} min ${deux(a.dureeS % 60)}` : ""
      const numero = a.numeroUtilise ? `depuis le ${formaterTelephone(a.numeroUtilise)}` : ""
      const detail = [duree, numero, a.compteNom].filter(Boolean).join(" · ")
      return { titre: `Appel · ${libelleResultat(a.resultat || "appel")}${issue}${motif}`, detail, etat: "" }
    }
    case "email":
      return { titre: `E-mail${a.sens === "entrant" ? " reçu" : " envoyé"}${a.titre ? ` · ${a.titre}` : ""}`, detail: a.compteNom, etat: "" }
    case "rdv":
      return { titre: `RDV${a.titre ? ` · ${a.titre}` : ""}`, detail: [a.echeance ? `le ${dateHeureCourte(a.echeance)}` : "", a.rdvType ? TYPES_RDV.find((t) => t.code === a.rdvType)?.libelle ?? a.rdvType : "", a.compteNom].filter(Boolean).join(" · "), etat: a.faitLe ? "fait" : "ouvert" }
    case "tache":
      return { titre: `Tâche · ${a.titre || "sans titre"}`, detail: [a.echeance ? `pour le ${dateHeureCourte(a.echeance)}` : "", a.faitLe ? `faite le ${dateCourte(a.faitLe)}` : "ouverte", a.compteNom].filter(Boolean).join(" · "), etat: a.faitLe ? "fait" : "ouvert" }
    case "note":
      return { titre: "Note", detail: a.compteNom, etat: "" }
    case "etape":
      return { titre: `Étape · ${a.etapeDe ? `${libelleEtape(a.etapeDe)} → ` : ""}${libelleEtape(a.etapeVers)}`, detail: [a.source, a.compteNom].filter(Boolean).join(" · "), etat: "" }
    default:
      return { titre: a.titre || a.type, detail: a.compteNom, etat: "" }
  }
}
