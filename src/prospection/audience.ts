// L'audience réelle d'une campagne (lot 4, 17/11/2026) : qui recevra, et pourquoi les autres non. Les mêmes règles que le
// moteur (campagnes-moteur, contactsBloques), qui fait foi, pour que le chiffre de l'écran soit celui de l'envoi. Fichier PUR.
//
// 25/11/2026 : l'écran s'aligne sur le moteur, avec les fonctions partagées d'exclusions.ts :
//   · « Déjà client » retiré des exclusions : les clients entrent (avecDejaClients, à appliquer avant estEligible) ;
//   · « Adresse en erreur » : aussi les agences dont un mail Resend a rebondi (note « E-mail rebondi » sur la fiche) ;
//   · « Pas intéressé » : lu là où le moteur le lit (agences.etape, st_sous_traitants.suivi), avec sa date et le délai
//     « Le recontacter après » ; avant, l'écran lisait l'étape affichée de la fiche, sans date, et rien pour les artisans.
import type { Contact, Envoi, Evenement, Inscription } from "./modele"
import type { Garde } from "./configCampagne"
import { exclusionLibre, pasInteresseExclu } from "./exclusions"

const JOUR = 86_400_000

/** Ce que le moteur lit hors des tables de campagne (chargé par src/lib/exclusionsCampagne.ts). */
export type FaitsExclusion = { rebondsAgences: Set<string>; pasInteresses: Map<string, string | null> }

export type Contexte = {
  campagneId: string; garde: Garde; ecartCommun: number | null; envois: Envoi[]; evenements: Evenement[]; inscriptions: Inscription[]; maintenant: string
  /** La base de la campagne : les rebonds Resend ne valent que pour les agences. */
  baseId?: string
  /** « Le recontacter après » (mois) ; 0 : un « pas intéressé » n'est jamais repris. */
  relanceMois?: number
  /** Absent (pas encore lu) : « Pas intéressé » est lu dans l'étape de la fiche, comme avant. */
  faits?: FaitsExclusion | null
}

/** La raison pour laquelle ce contact (déjà éligible par ses filtres) ne recevra rien ; null : il recevra. */
export function raisonsExclusion(ctx: Contexte): (k: Contact) => string | null {
  const retires = new Set(ctx.garde.retires ?? [])
  const dedans = new Set(ctx.inscriptions.filter((i) => i.campagneId === ctx.campagneId).map((i) => i.contactId))
  const exclusions = ctx.garde.exclusions ?? []
  const ecart = ctx.ecartCommun ?? ctx.garde.ecartCampagnes ?? 0
  const maintenant = new Date(ctx.maintenant)
  const depuis = new Date(maintenant.getTime() - ecart * JOUR).toISOString()
  const recus = new Set(ecart > 0 ? ctx.envois.filter((e) => e.campagneId !== ctx.campagneId && e.statut === "envoye" && !e.test && e.le >= depuis).map((e) => e.contactId) : [])
  const enErreur = exclusions.includes("Adresse en erreur")
  const rebonds = new Set(enErreur ? ctx.evenements.filter((e) => e.type === "rebond").map((e) => e.contactId) : [])
  if (enErreur && ctx.baseId !== "artisans" && ctx.faits) for (const id of ctx.faits.rebondsAgences) rebonds.add(id)
  const relance = ctx.relanceMois ?? 0
  const pasInteresse = (k: Contact) => {
    if (!exclusions.includes("Pas intéressé")) return false
    if (!ctx.faits) return /pas int[ée]ress[ée]/i.test(k.champs.etape ?? "")
    return ctx.faits.pasInteresses.has(k.id) && pasInteresseExclu(ctx.faits.pasInteresses.get(k.id) ?? null, relance, maintenant)
  }
  return (k) => {
    if (retires.has(k.id)) return "Retiré de cette campagne"
    if (dedans.has(k.id)) return null // déjà entré : les garde-fous ne valent que pour les nouvelles entrées
    if (recus.has(k.id)) return `Une autre campagne lui a écrit il y a moins de ${ecart} j`
    if (rebonds.has(k.id)) return "Adresse en erreur"
    if (pasInteresse(k)) return "Pas intéressé"
    const libre = exclusionLibre(k.champs, exclusions)
    if (libre) return `Exclusion « ${libre} »`
    return null
  }
}

/** Retirer ou remettre une fiche dans cette campagne seulement. */
export function basculerRetire(garde: Garde, id: string): Garde {
  const l = garde.retires ?? []
  return { ...garde, retires: l.includes(id) ? l.filter((x) => x !== id) : [...l, id] }
}
