// Les petits outils de la prospection (formats), et LA vue du compte : ce qu'il a le droit de voir.
import { createContext, useContext, useMemo } from "react"
import type { Base, Compte, Contact, Evenement, Id, Lead, Message } from "../../prospection/modele"
import { basesVisibles, contactVisible } from "../../prospection/modele"
import { useEtat, type EtatProspection } from "../../prospection/depot"

export const fr = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("fr-FR"))
export const pct = (t: number | null | undefined) => (t == null ? "—" : `${(Math.round(t * 1000) / 10).toLocaleString("fr-FR")} %`)
export const euros = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)
export const dateHeure = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
export const jourCourt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })

// ── La vue du compte : tout ce qu'un écran affiche passe par là (la cloison) ──
export type Vue = {
  compte: Compte; bases: Base[]; idsBases: Set<Id>
  contacts: Contact[]; leads: Lead[]; messages: Message[]
  /** Les événements déjà arrivés (la simulation en écrit d'avance, l'écran ne voit que le passé). */
  evenements: Evenement[]
  base: (id: Id) => Base | undefined; contact: (id: Id) => Contact | undefined
}
export const ContexteCompte = createContext<Id>("")
/** La base imposée par la page (null : toutes celles du compte). */
export const ContexteBaseUnique = createContext<Id | null>(null)
export function useVue(): Vue & { etat: EtatProspection } {
  const etat = useEtat()
  const compteId = useContext(ContexteCompte)
  const baseUnique = useContext(ContexteBaseUnique)
  return useMemo(() => {
    const compte = etat.comptes.find((c) => c.id === compteId) ?? etat.comptes[0]
    const bases = basesVisibles(compte, etat.equipes, etat.bases).filter((b) => !baseUnique || b.id === baseUnique)
    const idsBases = new Set(bases.map((b) => b.id))
    const contacts = etat.contacts.filter((k) => contactVisible(k, compte, idsBases))
    const ids = new Set(contacts.map((k) => k.id))
    const parId = new Map(etat.contacts.map((k) => [k.id, k]))
    return {
      etat, compte, bases, idsBases, contacts,
      leads: etat.leads.filter((l) => ids.has(l.contactId)),
      messages: etat.messages.filter((m) => m.le <= etat.maintenant && (!m.contactId || ids.has(m.contactId))),
      evenements: etat.evenements.filter((e) => e.le <= etat.maintenant),
      base: (id) => etat.bases.find((b) => b.id === id), contact: (id) => parId.get(id),
    }
  }, [etat, compteId, baseUnique])
}
