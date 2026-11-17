// L'audience réelle d'une campagne (lot 4, 17/11/2026) : qui recevra, et pourquoi les autres non. Les mêmes règles que le
// moteur (campagnes-moteur, contactsBloques) pour que le chiffre de l'écran soit celui de l'envoi. Fichier PUR.
//
// Écart de l'écran au moteur, assumé : « Pas intéressé » est lu dans l'étape de la fiche, sans sa date ; avec un délai
// « Le recontacter après », le moteur peut en reprendre quelques-uns que l'écran compte encore comme exclus.
import type { Contact, Envoi, Evenement, Inscription } from "./modele"
import type { Garde } from "./configCampagne"

const JOUR = 86_400_000
const CONNUES = ["Déjà client", "Désinscrit", "Adresse en erreur", "Pas intéressé"]

export type Contexte = { campagneId: string; garde: Garde; ecartCommun: number | null; envois: Envoi[]; evenements: Evenement[]; inscriptions: Inscription[]; maintenant: string }

/** La raison pour laquelle ce contact (déjà éligible par ses filtres) ne recevra rien ; null : il recevra. */
export function raisonsExclusion(ctx: Contexte): (k: Contact) => string | null {
  const retires = new Set(ctx.garde.retires ?? [])
  const dedans = new Set(ctx.inscriptions.filter((i) => i.campagneId === ctx.campagneId).map((i) => i.contactId))
  const exclusions = ctx.garde.exclusions ?? []
  const ecart = ctx.ecartCommun ?? ctx.garde.ecartCampagnes ?? 0
  const depuis = new Date(new Date(ctx.maintenant).getTime() - ecart * JOUR).toISOString()
  const recus = new Set(ecart > 0 ? ctx.envois.filter((e) => e.campagneId !== ctx.campagneId && e.statut === "envoye" && e.le >= depuis).map((e) => e.contactId) : [])
  const rebonds = new Set(exclusions.includes("Adresse en erreur") ? ctx.evenements.filter((e) => e.type === "rebond").map((e) => e.contactId) : [])
  const libres = exclusions.filter((x) => !CONNUES.includes(x)).map((x) => x.trim().toLowerCase()).filter(Boolean)
  return (k) => {
    if (retires.has(k.id)) return "Retiré de cette campagne"
    if (dedans.has(k.id)) return null // déjà entré : les garde-fous ne valent que pour les nouvelles entrées
    if (recus.has(k.id)) return `Une autre campagne lui a écrit il y a moins de ${ecart} j`
    if (rebonds.has(k.id)) return "Adresse en erreur"
    if (exclusions.includes("Pas intéressé") && /pas int[ée]ress[ée]/i.test(k.champs.etape ?? "")) return "Pas intéressé"
    const libre = libres.find((l) => Object.values(k.champs).some((v) => v.split(" / ").some((x) => x.trim().toLowerCase() === l)))
    if (libre) return `Exclusion « ${exclusions.find((x) => x.trim().toLowerCase() === libre) ?? libre} »`
    return null
  }
}

/** Retirer ou remettre une fiche dans cette campagne seulement. */
export function basculerRetire(garde: Garde, id: string): Garde {
  const l = garde.retires ?? []
  return { ...garde, retires: l.includes(id) ? l.filter((x) => x !== id) : [...l, id] }
}
