// LE COCKPIT (26/11/2026) : les lectures qui manquaient aux deux tableaux de bord. Lecture seule, paginée au-delà de
// 1 000 lignes. Les autres lectures sont celles du logiciel (demarchage/db.ts, parametresDb, tachesCampagne…).
import { supabase } from "./supabase"
import { lireParLots } from "./pagination"
import { lireParametre } from "./parametresDb"
import { COCKPIT_DEPART, entonnoirDemarchage, type ReglageCockpit } from "./croissance"
import type { OsDate, SignalSite } from "./cockpitTelepro"
import { lignesCampagnesCockpit, type CampagneCockpit } from "./cockpitCampagnes"
import { BASES, creerDepotSupabase } from "../prospection/depotSupabase"

type Lot<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>
const sb = () => { if (!supabase) throw new Error("Supabase n'est pas configuré."); return supabase }
const jour = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/** Les premiers OS datés depuis `de` (hors apporteurs), avec l'agence et son commercial. */
export async function premiersOsDepuis(de: Date): Promise<(OsDate & { nom: string })[]> {
  type L = { id: string; nom: string; premier_os_le: string; commercial_id: string | null }
  const l = await lireParLots<L>((d, f) => sb().from("agences").select("id, nom, premier_os_le, commercial_id").neq("type", "apporteur").gte("premier_os_le", jour(de)).order("id").range(d, f) as unknown as Lot<L>)
  return l.map((x) => ({ agenceId: x.id, nom: x.nom, date: x.premier_os_le, commercialId: x.commercial_id })).sort((a, b) => a.date.localeCompare(b.date))
}

/** Toute la base (hors apporteurs) : l'étape et le commercial (portefeuille), et l'entonnoir (taux de la base). */
export async function baseDesAgences(): Promise<{ lignes: { etape: string; commercialId: string | null }[]; contactees: number; clients: number }> {
  type L = { id: string; etape: string; tentatives: number | null; joint_fois: number | null; premier_os_le: string | null; commercial_id: string | null }
  const l = await lireParLots<L>((d, f) => sb().from("agences").select("id, etape, tentatives, joint_fois, premier_os_le, commercial_id").neq("type", "apporteur").order("id").range(d, f) as unknown as Lot<L>)
  const e = entonnoirDemarchage(l)
  return { lignes: l.map((x) => ({ etape: x.etape, commercialId: x.commercial_id })), contactees: e[1].valeur, clients: e[5].valeur }
}

/** Les agences clientes de Baticom, pour ouvrir la fiche d'une agence de STC Bâtiment (rapprochées par le nom). */
export async function agencesClientes(): Promise<{ id: string; nom: string }[]> {
  type L = { id: string; nom: string }
  return lireParLots<L>((d, f) => sb().from("agences").select("id, nom").neq("type", "apporteur").or("etape.eq.client,premier_os_le.not.is.null").order("id").range(d, f) as unknown as Lot<L>)
}

/** Plaquettes et mails ouverts depuis `de` (désinscriptions et rebonds exclus), avec l'agence et son étape. */
export async function signauxDepuis(de: Date): Promise<(SignalSite & { commercialId: string | null })[]> {
  type L = { id: string; date: string; titre: string; agence_id: string; agences: { nom: string; etape: string; type: string; commercial_id: string | null } | null }
  const l = await lireParLots<L>((d, f) => sb().from("activites").select("id, date, titre, agence_id, agences(nom, etape, type, commercial_id)").eq("type", "note").eq("source", "site")
    .in("titre", ["Plaquette ouverte", "E-mail ouvert"]).gte("date", de.toISOString()).order("id").range(d, f) as unknown as Lot<L>)
  return l.filter((x) => x.agences?.type !== "apporteur").map((x) => ({ date: x.date, titre: x.titre, agenceId: x.agence_id, agenceNom: x.agences?.nom ?? "", etape: x.agences?.etape ?? "", commercialId: x.agences?.commercial_id ?? null }))
}

export type { CampagneCockpit } from "./cockpitCampagnes"
/** Les campagnes en cours, comptées EXACTEMENT comme la liste des campagnes et le Suivi (lib/cockpitCampagnes.ts) : le
 *  même chargement (depotSupabase) et le même calcul (indicateurs). */
export async function campagnesEnCours(): Promise<CampagneCockpit[]> {
  const depot = creerDepotSupabase({ id: "", nom: "", role: "gerant" }, () => {})
  await depot.charger()
  return lignesCampagnesCockpit(depot.lire(), (id) => BASES.find((b) => b.id === id))
}

/** Le réglage de l'objectif (Campagnes › Dashboard) et les chiffres bruts de STC Bâtiment. */
export async function lireReglageEtStc(): Promise<{ reglage: ReglageCockpit; brut: string | null; objectifOs: string | null }> {
  const [r, brut, objectifOs] = await Promise.all([lireParametre("cockpit_croissance").catch(() => null), lireParametre("chiffres_stc").catch(() => null), lireParametre("objectif_os_mensuel").catch(() => null)])
  let reglage = COCKPIT_DEPART
  try { reglage = { ...COCKPIT_DEPART, ...JSON.parse(r || "{}") } as ReglageCockpit } catch { /* réglage par défaut */ }
  return { reglage, brut, objectifOs }
}
