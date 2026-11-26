// ════════════════════════════════════════════════════════════════════════════
// LES CALCULS DU DASHBOARD DES GESTIONNAIRES QUI RESTENT ICI (26/11/2026 : le reste est dans lib/cockpitTelepro.ts).
// Purs et testés (tableauOutils.test.ts) ; les lectures sont dans db.ts.
// ════════════════════════════════════════════════════════════════════════════
import { heureDeParis } from "./analyseOutils"

/** Un appel sortant tel que la page le lit. */
export type AppelLu = { id: string; date: string; compteId: string | null; compteNom: string; resultat: string; issue: string; agenceId: string; agenceNom: string }

// ── Quand joindre un gestionnaire : le taux de « joint » par heure de Paris ──
export type LigneHeure = { heure: number; appels: number; joints: number; taux: number }
export const HEURES_OUVREES = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
/** Les heures ouvrées qui ont assez d'appels pour dire quelque chose (MIN_APPELS_HEURE). */
export const MIN_APPELS_HEURE = 10
export function tauxJointParHeure(appels: Pick<AppelLu, "date" | "resultat">[]): LigneHeure[] {
  const par = new Map<number, { appels: number; joints: number }>()
  for (const a of appels) {
    if (a.resultat === "" || a.resultat === "lance") continue
    const h = heureDeParis(a.date)
    const l = par.get(h) ?? { appels: 0, joints: 0 }
    l.appels++
    if (a.resultat === "joint") l.joints++
    par.set(h, l)
  }
  return HEURES_OUVREES.flatMap((heure) => {
    const l = par.get(heure)
    return l && l.appels >= MIN_APPELS_HEURE ? [{ heure, appels: l.appels, joints: l.joints, taux: Math.round((l.joints / l.appels) * 100) }] : []
  })
}

// ── Ma base de prospection : où en est chaque agence, et combien sont devenues clientes ──
export type BilanProspection = { total: number; parEtape: Record<string, number>; travaillees: number; clients: number; tauxSignature: number | null }
/** « Travaillées » = sorties de « À prospecter » (on les a jointes au moins une fois, ou classées). */
export function bilanProspection(lignes: { etape: string }[]): BilanProspection {
  const parEtape: Record<string, number> = {}
  for (const l of lignes) parEtape[l.etape] = (parEtape[l.etape] ?? 0) + 1
  const total = lignes.length
  const travaillees = total - (parEtape.a_prospecter ?? 0)
  const clients = parEtape.client ?? 0
  return { total, parEtape, travaillees, clients, tauxSignature: travaillees > 0 ? Math.round((clients / travaillees) * 1000) / 10 : null }
}

// ── Ma base de leads : reçus, traités, devenus RDV, devenus clients ──
export type LeadBilan = { statut: "a_traiter" | "traite" | "retombe"; resultat: string; creeLe: string; traiteLe: string | null; etapeAgence: string; commercialId: string | null }
