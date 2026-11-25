// Ce que le moteur des campagnes lit pour ses exclusions, hors des tables cmp_* (25/11/2026) : les mêmes lectures que
// campagnes-moteur (contactsBloques), pour que l'audience affichée soit celle de l'envoi (src/prospection/audience.ts).
import { supabase } from "./supabase"
import { lireParLots } from "./pagination"
import { REBOND_AGENCE } from "../prospection/exclusions"
import type { FaitsExclusion } from "../prospection/audience"

type Lot<T> = { data: T[] | null; error: { message: string } | null }

export async function chargerFaitsExclusion(baseId: string): Promise<FaitsExclusion> {
  if (!supabase) return { rebondsAgences: new Set(), pasInteresses: new Map() }
  const sb = supabase
  if (baseId === "artisans") {
    const st = await lireParLots<{ id: string; suivi_le: string | null }>((d, f) => sb.from("st_sous_traitants").select("id, suivi_le").eq("suivi", "pas_interesse").order("id").range(d, f) as unknown as PromiseLike<Lot<{ id: string; suivi_le: string | null }>>)
    return { rebondsAgences: new Set(), pasInteresses: new Map(st.map((r) => [String(r.id), r.suivi_le])) }
  }
  const [rebonds, agences] = await Promise.all([
    lireParLots<{ agence_id: string }>((d, f) => sb.from("activites").select("agence_id").eq("type", "note").eq("source", "site").eq("titre", REBOND_AGENCE).order("id").range(d, f) as unknown as PromiseLike<Lot<{ agence_id: string }>>),
    lireParLots<{ id: string; etape_depuis: string | null }>((d, f) => sb.from("agences").select("id, etape_depuis").eq("etape", "pas_interesse").order("id").range(d, f) as unknown as PromiseLike<Lot<{ id: string; etape_depuis: string | null }>>),
  ])
  return { rebondsAgences: new Set(rebonds.map((r) => String(r.agence_id))), pasInteresses: new Map(agences.map((r) => [String(r.id), r.etape_depuis])) }
}
