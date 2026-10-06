// Pont entre le téléphone Ringover embarqué et le reste du logiciel.
//
// Le téléphone vit dans TelephoneRingover (monté une fois, en bas à droite).
// Les sessions de call, elles, ont besoin de LUI demander de composer, et de
// savoir quand on décroche ou raccroche. Ce module les met en relation sans
// les faire dépendre l'un de l'autre.
//
// Intérêt par rapport au relais serveur : l'appel part DANS le logiciel, et
// Ringover prévient en temps réel (décroché / raccroché) au lieu d'être
// interrogé toutes les 3 secondes.

import { chiffresTel } from "./telephone"

export type EvenementAppel = {
  type: "sonne" | "decroche" | "raccroche"
  callId: string
  direction: "in" | "out"
}

type Composeur = (numeroE164: string, fromE164?: string | null) => boolean

let composeur: Composeur | null = null
let montrer: (() => void) | null = null
const abonnes = new Set<(e: EvenementAppel) => void>()

// Appelé par TelephoneRingover une fois le téléphone prêt.
export function brancherTelephone(c: Composeur, afficher: () => void): void {
  composeur = c
  montrer = afficher
}

export function debrancherTelephone(): void {
  composeur = null
  montrer = null
}

export function telephonePret(): boolean {
  return composeur !== null
}

// Met un numéro au format international attendu par Ringover (« +33783092347 »).
// Rend "" si le numéro est inexploitable — l'appelant se rabat alors sur le relais.
export function versE164(tel: string, paysParDefaut = "33"): string {
  const brut = (tel || "").trim()
  let d = chiffresTel(brut)
  if (!d) return ""
  if (d.startsWith("00")) d = d.slice(2) // 0033… → 33…
  else if (d.startsWith("0")) d = paysParDefaut + d.slice(1) // 0X… → 33X…
  else if (!brut.startsWith("+") && d.length === 9) d = paysParDefaut + d // X… sans 0 ni +
  if (d.length < 10 || d.length > 15) return ""
  return "+" + d
}

// Demande au téléphone embarqué de composer. Faux = téléphone indisponible ou
// numéro inexploitable : l'appelant doit se rabattre sur le relais serveur.
export function composerDepuisLogiciel(tel: string, from?: string): boolean {
  if (!composeur) return false
  const numero = versE164(tel)
  if (!numero) return false
  const depuis = from ? versE164(from) : ""
  const ok = composeur(numero, depuis || null)
  if (ok) montrer?.() // on ouvre le panneau : l'appel se passe sous ses yeux
  return ok
}

export function surEvenementAppel(cb: (e: EvenementAppel) => void): () => void {
  abonnes.add(cb)
  return () => abonnes.delete(cb)
}

// Appelé par TelephoneRingover à chaque événement du SDK.
export function diffuserEvenementAppel(e: EvenementAppel): void {
  for (const cb of abonnes) cb(e)
}
