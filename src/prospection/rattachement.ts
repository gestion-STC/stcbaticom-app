// À quelle campagne revient un lead ou un appel (25/11/2026). Fichier PUR.
// Un contact peut passer par plusieurs campagnes. Avant, tout allait à sa DERNIÈRE inscription : un lead d'octobre passait
// à la campagne de novembre, ou disparaissait (« avant son entrée »). Désormais : l'inscription la plus récente dont
// l'entrée précède le lead ou l'appel.
import type { Inscription } from "./modele"

/** Les inscriptions de chaque contact, de la plus ancienne à la plus récente. */
export function inscriptionsParContact(inscriptions: Inscription[]): Map<string, Inscription[]> {
  const m = new Map<string, Inscription[]>()
  for (const i of [...inscriptions].sort((a, b) => (a.entreeLe < b.entreeLe ? -1 : a.entreeLe > b.entreeLe ? 1 : 0))) m.set(i.contactId, [...(m.get(i.contactId) ?? []), i])
  return m
}

/** L'inscription du contact en cours au moment `quand` : la plus récente entrée avant (ou à) cet instant ; aucune : null. */
export function inscriptionAu(parContact: Map<string, Inscription[]>, contactId: string, quand: string): Inscription | null {
  const l = parContact.get(contactId) ?? []
  const t = new Date(quand).getTime()
  for (let k = l.length - 1; k >= 0; k--) if (new Date(l[k].entreeLe).getTime() <= t) return l[k]
  return null
}
