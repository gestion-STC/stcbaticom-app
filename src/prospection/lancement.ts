// LA VÉRIFICATION AVANT DE LANCER (25/11/2026) : une seule, pour les trois boutons qui lancent ou reprennent une campagne
// (« Lancer » de l'éditeur, interrupteur de la liste, « Lancer / Reprendre » du suivi). Avant, seuls l'éditeur vérifiait
// et demandait confirmation ; les deux autres passaient la campagne « active » directement. Fichier PUR.
import type { Campagne } from "./modele"
import { avecLinkedInAuto, messageVide, type ConfigCampagne } from "./configCampagne"
import { PHRASE_SUIVI, corpsAvecMentions } from "./instantlyOutils"

export type ControleLancement = {
  /** Le récapitulatif : chaque point, vérifié ou non. */
  lignes: [string, boolean][]
  /** Ce qui empêche de lancer ; null : on peut lancer. */
  bloquant: string | null
}

export type EntreeControle = {
  cfg: ConfigCampagne
  /** Ceux qui recevront (filtres + exclusions, comme le moteur). */
  eligibles: number
  /** Contacts déjà en séquence : une campagne en pause peut reprendre même si plus personne de nouveau n'entre. */
  enCours?: number
  unite: string
  avis: boolean
  comptesLinkedIn: number
  /** Le refus d'Instantly au dernier passage (forfait, clé) ; null : il répond. */
  refusInstantly?: string | null
}

const fr = (n: number) => n.toLocaleString("fr-FR")

export function controleLancement(p: EntreeControle): ControleLancement {
  const nb = (t: string) => p.cfg.actions.filter((a) => a.type === t).length
  const mails = p.cfg.actions.filter((a) => a.type === "mail" || a.type === "newsletter").flatMap((a) => p.cfg.creatifs.find((k) => k.id === a.creatifId)?.variantes ?? [])
  const avecPhrase = mails.every((x) => corpsAvecMentions(x.corps, "https://x", true).includes(PHRASE_SUIVI))
  const vide = messageVide(p.cfg)
  const enCours = p.enCours ?? 0
  const lignes: [string, boolean][] = [
    ...(avecLinkedInAuto(p.cfg) ? [["Un compte LinkedIn est branché", p.comptesLinkedIn > 0] as [string, boolean]] : []),
    [`${fr(p.eligibles)} ${p.unite} dans l'audience${enCours ? ` (${fr(enCours)} déjà en séquence)` : ""}`, p.eligibles > 0 || enCours > 0],
    [[nb("mail") + nb("newsletter") ? `${nb("mail") + nb("newsletter")} mail(s)` : "", nb("sms") ? `${nb("sms")} SMS` : "", nb("appel") ? `${nb("appel")} appel(s)` : ""].filter(Boolean).join(", ") || "Aucune action", p.cfg.actions.length > 0],
    ["Tous les textes sont remplis", !vide],
    ...(p.avis ? [] : [["La phrase sur le suivi des clics est dans chaque mail", avecPhrase] as [string, boolean], ["Le lien de désinscription est dans chaque mail", true] as [string, boolean]]),
    ...(!p.avis && mails.length ? [[p.refusInstantly ? `Instantly refuse les envois : ${p.refusInstantly}` : "Instantly accepte les envois", !p.refusInstantly] as [string, boolean]] : []),
  ]
  const bloquant = vide ? "Un message est vide" : !p.eligibles && !enCours ? "Personne dans l'audience" : null
  return { lignes, bloquant }
}

/** Peut-on proposer de (re)lancer cette campagne ? Une campagne terminée ne se relance pas : on la duplique. */
export const relancable = (c: Pick<Campagne, "statut">) => c.statut === "brouillon" || c.statut === "pause"
