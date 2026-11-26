// LE COCKPIT (26/11/2026) : ce que les deux tableaux de bord lisent en commun, et le prévisionnel. Lecture seule.
import { appelsSortants, leadsBilanLignes } from "../../demarchage/db"
import type { AppelLu, LeadBilan } from "../../demarchage/tableauOutils"
import { listerComptes } from "../../lib/comptes"
import { chargerFonctions, estAuClassement } from "../../lib/fonctionsComptes"
import { baseDesAgences, lireReglageEtStc, premiersOsDepuis } from "../../lib/cockpitDb"
import { lireReelStc, type ReglageCockpit } from "../../lib/croissance"
import { lundisRecents } from "../../lib/cockpitTelepro"
import { calculerPrevision, type PrevisionCockpit } from "../../lib/prevision"
import { lireObjectif } from "../../demarchage/aujourdhuiOutils"

export type Commun = {
  maintenant: Date
  appels: AppelLu[]
  os: { agenceId: string; nom: string; date: string; commercialId: string | null }[]
  base: { lignes: { etape: string; commercialId: string | null }[]; contactees: number; clients: number }
  leads: LeadBilan[]
  reglage: ReglageCockpit
  brut: string | null
  objectifOs: number
  /** Les commerciaux au classement (hors recrutement et direction), et les noms de tous les comptes. */
  commerciaux: { id: string; nom: string }[]
  noms: Map<string, string>
  prevision: PrevisionCockpit
}

/** Depuis quand lire les appels : le 1er janvier, et au moins 8 semaines, le mois d'avant et 28 jours en arrière. */
export function debutLecture(m: Date): Date {
  return new Date(Math.min(new Date(m.getFullYear(), 0, 1).getTime(), lundisRecents(m, 12)[0].getTime(), new Date(m.getFullYear(), m.getMonth() - 1, 1).getTime()))
}

/** Le début du démarchage : les écrans comptent les premiers OS « depuis juillet 2026 » (barres, cumul, objectif). */
export const DEBUT_PREMIERS_OS = new Date(2026, 6, 1)
/** Depuis quand lire les premiers OS : jamais après le 01/07/2026 (27/11/2026 : en janvier, juillet à octobre disparaissaient). */
export const debutPremiersOs = (m: Date): Date => new Date(Math.min(debutLecture(m).getTime(), DEBUT_PREMIERS_OS.getTime()))

export async function chargerCommun(maintenant: Date): Promise<Commun> {
  const de = debutLecture(maintenant)
  const [appels, os, base, leads, rs, comptes, fonctions] = await Promise.all([
    appelsSortants(de, new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1)),
    premiersOsDepuis(debutPremiersOs(maintenant)),
    baseDesAgences(),
    leadsBilanLignes(),
    lireReglageEtStc(),
    listerComptes().then((l) => l.map((c) => ({ id: c.id, nom: c.nom || c.email }))).catch(() => [] as { id: string; nom: string }[]),
    chargerFonctions().catch(() => ({}) as Record<string, never>),
  ])
  const hors = new Set(Object.entries(fonctions).filter(([, f]) => !estAuClassement(f)).map(([id]) => id))
  const noms = new Map(comptes.map((c) => [c.id, c.nom]))
  for (const a of appels) if (a.compteId && !noms.has(a.compteId)) noms.set(a.compteId, a.compteNom || "(compte inconnu)")
  const ids = new Set([...comptes.map((c) => c.id), ...appels.flatMap((a) => (a.compteId ? [a.compteId] : []))])
  const commerciaux = [...ids].filter((id) => !hors.has(id)).map((id) => ({ id, nom: noms.get(id) ?? "" }))
  const vingtHuit = maintenant.getTime() - 28 * 86_400_000
  // Le levier « Agences appelées » et le ratio appels / premier OS : hors apporteurs, comme la cible et les premiers OS (27/11/2026).
  const a28 = appels.filter((a) => new Date(a.date).getTime() >= vingtHuit && !a.apporteur)
  const debut28 = new Date(vingtHuit)
  const prevision = calculerPrevision({
    reglage: rs.reglage, reel: lireReelStc(rs.brut, { factureMin: rs.reglage.factureMin, osMin: rs.reglage.osMin, chutePct: rs.reglage.chutePct }),
    premiersOsDates: os.map((o) => o.date), entonnoir: { contactees: base.contactees, clients: base.clients },
    fenetre28j: { agencesDistinctes: new Set(a28.map((a) => a.agenceId)).size, appels: a28.length, joints: a28.filter((a) => a.resultat === "joint").length, premiersOs: os.filter((o) => o.date >= `${debut28.getFullYear()}-${String(debut28.getMonth() + 1).padStart(2, "0")}-${String(debut28.getDate()).padStart(2, "0")}`).length },
  }, maintenant)
  return { maintenant, appels, os, base, leads, reglage: rs.reglage, brut: rs.brut, objectifOs: lireObjectif(rs.objectifOs), commerciaux, noms, prevision }
}
