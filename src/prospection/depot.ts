// ── LE DÉPÔT DE LA PROSPECTION : ce que les écrans lisent et les actions qu'ils déclenchent (07/11/2026) ──
// Les écrans ne parlent qu'à ce dépôt. En production, il est branché sur Supabase (tables et fonctions de la
// machine) ; dans la maquette, sur une base en mémoire qui simule le temps et les destinataires. Les écrans,
// eux, sont les mêmes.
import { createContext, useContext, useSyncExternalStore } from "react"
import type { Appel, Base, Campagne, Compte, Contact, Envoi, Equipe, Evenement, Id, Inscription, Lead, Message, Tache } from "./modele"

export type EtatProspection = {
  maintenant: string
  comptes: Compte[]; equipes: Equipe[]; bases: Base[]; contacts: Contact[]
  campagnes: Campagne[]; inscriptions: Inscription[]; envois: Envoi[]; evenements: Evenement[]
  leads: Lead[]; taches: Tache[]; appels: Appel[]; messages: Message[]
}

export type Depot = {
  lire: () => EtatProspection
  ecouter: (f: () => void) => () => void
  enregistrerCampagne: (c: Campagne) => void
  changerStatut: (id: Id, statut: Campagne["statut"]) => void
  dupliquerCampagne: (id: Id) => Id
  noterAppel: (a: Omit<Appel, "id" | "le">) => void
  traiterLead: (id: Id) => void
  faireTache: (id: Id) => void
  marquerGagne: (contactId: Id) => void
  repondre: (m: Omit<Message, "id" | "le" | "lu" | "sens">) => void
  lireMessage: (id: Id) => void
  attribuer: (contactIds: Id[], compteId: Id | null) => void
  majEquipe: (e: Equipe) => void
  majBase: (b: Base) => void
  importer: (baseId: Id, contacts: Omit<Contact, "id">[]) => number
  /** Maquette seulement : faire avancer le temps (le moteur passe toutes les heures). */
  avancer?: (heures: number) => void
}

export const ContexteDepot = createContext<Depot | null>(null)
export function useDepot(): Depot {
  const d = useContext(ContexteDepot)
  if (!d) throw new Error("Dépôt de la prospection absent")
  return d
}
export function useEtat(): EtatProspection {
  const d = useDepot()
  return useSyncExternalStore(d.ecouter, d.lire)
}
