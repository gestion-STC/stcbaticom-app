// Relance automatique « J+X » attachée à un état.
//
// Chaque état peut porter un délai `relanceJours` (réglé dans Paramétrage → États).
// Quand un prospect ENTRE dans cet état, on lui pose automatiquement une date de
// relance à J+X — SAUF s'il a déjà une relance future prévue (on n'écrase jamais une
// date posée à la main). Pas d'email ici : ça alimente juste la liste « À relancer »
// et le Calendrier.

import type { Statut } from "../statuts"

// Formate une date en « JJ/MM/AAAA » (le format stocké dans prochaineRelance).
function formatJJMMAAAA(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
}

// Vrai si `s` (« JJ/MM/AAAA [HH:MM] ») est aujourd'hui ou dans le futur.
function estFuture(s: string, base: Date): boolean {
  const m = (s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return false
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  const auj = new Date(base)
  auj.setHours(0, 0, 0, 0)
  return d.getTime() >= auj.getTime()
}

// Date de relance à POSER quand un prospect entre dans l'état `libelle`, ou null si :
//  - l'état n'a pas de délai `relanceJours`, OU
//  - une relance future est déjà prévue (on ne l'écrase pas).
export function relanceAutoEntreeEtat(
  libelle: string,
  statuts: Statut[],
  relanceActuelle: string,
  base: Date = new Date(),
): string | null {
  const st = statuts.find((s) => s.libelle === libelle)
  if (!st || st.relanceJours == null || st.relanceJours < 0) return null
  if (estFuture(relanceActuelle, base)) return null
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + st.relanceJours)
  return formatJJMMAAAA(d)
}
