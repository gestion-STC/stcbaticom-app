// Les leads à l'écran (06/11/2026) : depuis quand l'agence attend, et la couleur de cette attente.
// Objectif : un lead s'appelle dans l'heure (vert jusqu'à 30 min, orange jusqu'à 1 h, rouge après).
export const OBJECTIF_LEAD_MINUTES = 60

export function minutesDepuis(iso: string, maintenant: Date): number {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((maintenant.getTime() - t) / 60_000))
}

/** « il y a 12 min », « il y a 2 h 05 », « il y a 3 j ». */
export function attenteLisible(minutes: number): string {
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  if (minutes < 24 * 60) return `il y a ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`
  return `il y a ${Math.floor(minutes / (24 * 60))} j`
}
/** La forme courte de la marge : « 12 min », « 2 h », « 3 j ». */
export function attenteCourte(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`
  return `${Math.floor(minutes / (24 * 60))} j`
}

export function couleurAttente(minutes: number): "text-ok" | "text-attention" | "text-alerte" {
  return minutes <= OBJECTIF_LEAD_MINUTES / 2 ? "text-ok" : minutes <= OBJECTIF_LEAD_MINUTES ? "text-attention" : "text-alerte"
}
