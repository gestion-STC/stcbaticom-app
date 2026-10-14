// Les petits outils de la session de call (sans écran) : types, constantes, règles d'une ligne.
import { RESULTAT_LANCE, type Activite, type Agence, type File, type RoleContact } from "../../../demarchage/modele"
import type { TypeRdv } from "../../../demarchage/sessionOutils"

// ── La dictée vocale du navigateur (Chrome / Edge), typée sans `any` ──
type ResultatDictee = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }
export type Dictee = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: ResultatDictee) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}
type FabriqueDictee = new () => Dictee
export const FABRIQUE_DICTEE: FabriqueDictee | null = (() => {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: FabriqueDictee; webkitSpeechRecognition?: FabriqueDictee }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
})()

// ── L'appel en cours ──
export type EtapeAppel = "attente" | "en_cours" | "termine" | "sans_suivi"
export type AppelEnCours = {
  agenceId: string
  numeroAppele: string
  contactId: string | null
  numeroEmission: string
  callId: string
  debut: number // lancement
  enLigneDepuis: number | null // première fois vu en ligne (la durée part de là)
  fin: number | null
  etape: EtapeAppel
  manuel: boolean // « Noter un appel sans Ringover »
  appelId?: string // la ligne écrite au clic (appelLance), que le résultat complète
}
export const TEXTES_APPEL: Record<EtapeAppel, string> = {
  attente: "Appel lancé : décroche sur ton poste Ringover, l'agence est composée ensuite.",
  en_cours: "En ligne",
  termine: "Appel terminé : note le résultat ci-dessous.",
  sans_suivi: "Suivi indisponible : note le résultat à la main.",
}

export const CONTACT_VIDE = { prenom: "", nom: "", role: "gestionnaire" as RoleContact, ligneDirecte: "", mobile: "", email: "" }
export type NouveauContact = typeof CONTACT_VIDE
export type Action = "tache" | "rdv" | "note" | "passer"
export type FormAction = { titre: string; quand: string; type: TypeRdv; note: string }
export const messageDe = (e: unknown) => (e instanceof Error ? e.message : String(e))

// Une agence qui n'a plus sa place dans la pile affichée (modifiée depuis sa fiche) : sortie,
// client, apporteur, ou une intéressée dans « À prospecter » (Mahdi, 13/10).
export function horsDeLaPile(a: Pick<Agence, "etape" | "type">, pile: File, etapeFiltre: string): boolean {
  if (a.type === "apporteur") return true
  if (etapeFiltre) return a.etape !== etapeFiltre
  if (["pas_interesse", "hors_cible", "client"].includes(a.etape)) return true
  return pile === "a_prospecter" && (a.etape === "interesse" || a.etape === "rdv_planifie")
}

// L'appel lancé dont le résultat n'a pas été noté (la ligne « lance » du fil), hors l'appel en cours.
export function appelNonNote(activites: Activite[], saufId?: string): Activite | null {
  return activites.find((x) => x.type === "appel" && x.sens !== "entrant" && x.resultat === RESULTAT_LANCE && x.id !== saufId) ?? null
}

// L'onglet « Sessions de call » ouvert deux fois : deux sessions composeraient le même numéro.
export const CANAL_SESSION = "baticom-session-call"
