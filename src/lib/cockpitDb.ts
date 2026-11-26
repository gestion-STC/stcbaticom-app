// LE COCKPIT (26/11/2026) : les lectures qui manquaient aux deux tableaux de bord. Lecture seule, paginée au-delà de
// 1 000 lignes. Les autres lectures sont celles du logiciel (demarchage/db.ts, parametresDb, tachesCampagne…).
import { supabase } from "./supabase"
import { lireParLots } from "./pagination"
import { lireParametre } from "./parametresDb"
import { COCKPIT_DEPART, entonnoirDemarchage, type ReglageCockpit } from "./croissance"
import type { OsDate, SignalSite } from "./cockpitTelepro"

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

export type CampagneCockpit = { id: string; nom: string; base: string; envoyes: number; ouverts: number | null; clics: number; leads: number }
/** Les campagnes en cours : envoyés (hors tests), ouverts, clics et leads HORS ROBOTS (un lead compte s'il vient d'un vrai clic). */
export async function campagnesEnCours(): Promise<CampagneCockpit[]> {
  const { data, error } = await sb().from("cmp_campagnes").select("id, nom, base_id").eq("statut", "active").order("nom")
  if (error) throw new Error(error.message)
  const camps = (data ?? []) as { id: string; nom: string; base_id: string }[]
  if (!camps.length) return []
  const ids = camps.map((c) => c.id)
  type E = { id: string; campagne_id: string; canal: string }
  type V = { id: string; campagne_id: string; envoi_id: string | null; contact_ref: string; type: string }
  type I = { id: string; campagne_id: string; contact_ref: string }
  const [envois, evenements, inscriptions] = await Promise.all([
    lireParLots<E>((d, f) => sb().from("cmp_envois").select("id, campagne_id, canal").in("campagne_id", ids).eq("statut", "envoye").eq("test", false).order("id").range(d, f) as unknown as Lot<E>),
    lireParLots<V>((d, f) => sb().from("cmp_evenements").select("id, campagne_id, envoi_id, contact_ref, type").in("campagne_id", ids).in("type", ["ouvert", "clic"]).eq("robot", false).order("id").range(d, f) as unknown as Lot<V>),
    lireParLots<I>((d, f) => sb().from("cmp_inscriptions").select("id, campagne_id, contact_ref").in("campagne_id", ids).eq("statut", "lead").order("id").range(d, f) as unknown as Lot<I>),
  ])
  return camps.map((c) => {
    const env = envois.filter((e) => e.campagne_id === c.id)
    const ev = evenements.filter((e) => e.campagne_id === c.id)
    const cliqueurs = new Set(ev.filter((e) => e.type === "clic").map((e) => e.contact_ref))
    const mesurable = env.some((e) => e.canal !== "sms")
    return {
      id: c.id, nom: c.nom, base: c.base_id, envoyes: env.length,
      ouverts: mesurable ? new Set(ev.filter((e) => e.type === "ouvert").map((e) => e.envoi_id ?? e.contact_ref)).size : null,
      clics: ev.filter((e) => e.type === "clic").length,
      leads: inscriptions.filter((i) => i.campagne_id === c.id && cliqueurs.has(i.contact_ref)).length,
    }
  })
}

/** Le réglage de l'objectif (Campagnes › Dashboard) et les chiffres bruts de STC Bâtiment. */
export async function lireReglageEtStc(): Promise<{ reglage: ReglageCockpit; brut: string | null; objectifOs: string | null }> {
  const [r, brut, objectifOs] = await Promise.all([lireParametre("cockpit_croissance").catch(() => null), lireParametre("chiffres_stc").catch(() => null), lireParametre("objectif_os_mensuel").catch(() => null)])
  let reglage = COCKPIT_DEPART
  try { reglage = { ...COCKPIT_DEPART, ...JSON.parse(r || "{}") } as ReglageCockpit } catch { /* réglage par défaut */ }
  return { reglage, brut, objectifOs }
}
