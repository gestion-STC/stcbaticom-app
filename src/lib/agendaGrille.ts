// L'AGENDA FAÇON GOOGLE AGENDA (Mahdi, 11/11/2026, maquette validée) : les calculs de la grille, sans rien afficher.
// Une heure = 48 px ; la grille va de 7 h à 21 h ; deux événements qui se chevauchent se partagent la largeur.

export const HAUTEUR_HEURE = 48
export const HEURE_DEBUT = 7
export const HEURE_FIN = 21

export type EvenementGrille = { id: string; debut: Date; dureeMin: number }
export type Place = { top: number; hauteur: number; gauche: number; largeur: number }

/** Le haut et la hauteur d'un événement dans sa journée (bornés à la grille ; 22 px au moins pour se lire). */
export function placeVerticale(debut: Date, dureeMin: number): { top: number; hauteur: number } {
  const minutes = (debut.getHours() - HEURE_DEBUT) * 60 + debut.getMinutes()
  const haut = Math.max(0, Math.min((HEURE_FIN - HEURE_DEBUT) * 60 - 15, minutes))
  return { top: (haut / 60) * HAUTEUR_HEURE, hauteur: Math.max(22, (Math.max(15, dureeMin) / 60) * HAUTEUR_HEURE - 2) }
}

/** Les événements d'un jour placés en colonnes quand ils se chevauchent (comme Google Agenda). Gauche et largeur en %. */
export function placerJournee<T extends EvenementGrille>(evs: T[]): Map<string, Place> {
  const tries = [...evs].sort((a, b) => a.debut.getTime() - b.debut.getTime() || b.dureeMin - a.dureeMin)
  const places = new Map<string, Place>()
  // Des grappes d'événements qui se touchent ; dans chaque grappe, chacun prend la première colonne libre.
  let grappe: { ev: T; col: number; fin: number }[] = []
  let finGrappe = -Infinity
  const fermer = () => {
    const nbCol = Math.max(1, ...grappe.map((g) => g.col + 1))
    for (const g of grappe) {
      const v = placeVerticale(g.ev.debut, g.ev.dureeMin)
      places.set(g.ev.id, { ...v, gauche: (g.col / nbCol) * 100, largeur: 100 / nbCol })
    }
    grappe = []
  }
  for (const ev of tries) {
    const debut = ev.debut.getTime(), fin = debut + Math.max(15, ev.dureeMin) * 60_000
    if (debut >= finGrappe) { fermer(); finGrappe = -Infinity }
    const prises = new Set(grappe.filter((g) => g.fin > debut).map((g) => g.col))
    let col = 0
    while (prises.has(col)) col++
    grappe.push({ ev, col, fin })
    finGrappe = Math.max(finGrappe, fin)
  }
  fermer()
  return places
}

/** Les 42 jours (6 semaines, du lundi) qui montrent le mois d'un jour : le mini-calendrier et la vue Mois. */
export function joursDuMois(ancre: Date): Date[] {
  const premier = new Date(ancre.getFullYear(), ancre.getMonth(), 1)
  const decalage = (premier.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => new Date(premier.getFullYear(), premier.getMonth(), 1 - decalage + i))
}

/** La date au format AAAA-MM-JJ (heure de Paris de l'écran), pour les jours fériés. */
export const jourIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
export const memeJourDate = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** La ligne « maintenant » : sa hauteur dans la grille, ou null hors des heures affichées. */
export function hauteurMaintenant(maintenant: Date): number | null {
  const h = maintenant.getHours() + maintenant.getMinutes() / 60
  return h < HEURE_DEBUT || h > HEURE_FIN ? null : (h - HEURE_DEBUT) * HAUTEUR_HEURE
}

export type Vue = "jour" | "semaine" | "mois"
const debutJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const plusJours = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const lundi = (d: Date) => plusJours(debutJour(d), -((d.getDay() + 6) % 7))
/** La période à lire pour une vue : [de, a[. */
export function bornesVue(vue: Vue, ancre: Date): { de: Date; a: Date } {
  if (vue === "jour") return { de: debutJour(ancre), a: plusJours(debutJour(ancre), 1) }
  if (vue === "semaine") return { de: lundi(ancre), a: plusJours(lundi(ancre), 7) }
  const j = joursDuMois(ancre)
  return { de: j[0], a: plusJours(j[41], 1) }
}
