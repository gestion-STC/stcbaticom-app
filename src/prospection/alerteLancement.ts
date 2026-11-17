// Contrôle après lancement (17/11/2026) : si les derniers envois d'une campagne active partent tous en erreur,
// le suivi le dit tout de suite, avec la cause la plus fréquente. Avant, on ne le voyait qu'en ouvrant le journal.
import type { Campagne, Envoi } from "./modele"

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
