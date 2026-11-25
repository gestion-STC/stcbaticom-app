// Contrôle après lancement (17/11/2026) : si les derniers envois d'une campagne active partent tous en erreur,
// le suivi le dit tout de suite, avec la cause la plus fréquente. Avant, on ne le voyait qu'en ouvrant le journal.
import type { Campagne, Envoi, Inscription } from "./modele"
import { dansLaPlage } from "./moteur"

export const ENVOIS_ALERTE = 3

export function alerteLancement(c: Pick<Campagne, "id" | "statut">, envois: Envoi[], maintenant: string): string | null {
  if (c.statut !== "active") return null
  const depuis = new Date(maintenant).getTime() - 24 * 3600 * 1000
  const recents = envois.filter((e) => e.campagneId === c.id && e.statut !== "saute" && e.statut !== "en_cours" && new Date(e.le).getTime() >= depuis)
  if (recents.length < ENVOIS_ALERTE || recents.some((e) => e.statut === "envoye")) return null
  const causes = new Map<string, number>()
  for (const e of recents) { const k = e.cause?.trim() || "cause inconnue"; causes.set(k, (causes.get(k) ?? 0) + 1) }
  const [cause] = [...causes.entries()].sort((a, b) => b[1] - a[1])[0]
  return `Les ${recents.length} envois des dernières 24 h sont tous en erreur. Cause la plus fréquente : ${cause}.`
}

/** Heures d'ouverture de la plage d'envoi qu'il faut au moins avoir eues avant de s'inquiéter. */
export const HEURES_PLAGE_ALERTE = 2
const QUART = 15 * 60_000

/** Le silence (25/11/2026) : une campagne active avec des mails n'a rien confié depuis 24 h alors que des contacts attendent
 *  leur mail. C'est ce qui arrive quand Instantly refuse tout (forfait non payé, 402) : les mails sont reportés, rien n'est
 *  écrit en erreur, et l'alerte du dessus ne voit rien. On ne s'inquiète qu'après au moins 2 h de plage d'envoi ouverte
 *  dans ces 24 h (depuis le lancement s'il est plus récent) : pas d'alerte la nuit, le week-end ou le lundi à 9 h 05. */
export function alerteSansEnvoi(c: Campagne, envois: Envoi[], inscriptions: Inscription[], maintenant: string): string | null {
  if (c.statut !== "active" || !c.etapes.some((e) => e.type === "mail" || e.type === "newsletter")) return null
  const fin = new Date(maintenant).getTime()
  const debut = Math.max(fin - 24 * 3600_000, c.lanceeLe ? new Date(c.lanceeLe).getTime() : 0)
  const mail = (canal: string) => canal === "mail" || canal === "newsletter"
  if (envois.some((e) => e.campagneId === c.id && mail(e.canal) && e.statut === "envoye" && new Date(e.le).getTime() >= fin - 24 * 3600_000)) return null
  const dues = inscriptions.filter((i) => i.campagneId === c.id && i.statut === "en_cours" && new Date(i.prochaineLe).getTime() <= fin && mail(c.etapes[i.etapeIndex]?.type ?? ""))
  if (!dues.length) return null
  let ouvert = 0
  for (let t = debut; t < fin; t += QUART) if (dansLaPlage(c, new Date(t))) ouvert += QUART
  if (ouvert < HEURES_PLAGE_ALERTE * 3600_000) return null
  return `Aucun mail n'a été confié depuis 24 h alors que ${dues.length} contact${dues.length > 1 ? "s attendent" : " attend"} son mail.`
}
