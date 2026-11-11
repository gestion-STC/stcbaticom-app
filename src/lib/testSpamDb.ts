// Le test « boîte de réception ou spam » (Mahdi, 11/11/2026) : lancé et lu par la fonction campagnes-ia, chez Instantly.
import { supabase } from "./supabase"
import type { Mentions, PlacementMesure } from "../prospection/instantlyOutils"

export type TestSpam = { id: string; nom: string; le: string; statut: number | null; tout: PlacementMesure | null; google: PlacementMesure | null; outlook: PlacementMesure | null }
const sb = () => { if (!supabase) throw new Error("Supabase n'est pas configuré."); return supabase }

async function appeler<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().functions.invoke("campagnes-ia", { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const lu = ctx && typeof ctx.json === "function" ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null
    throw new Error(lu?.error ?? error.message)
  }
  return data as T
}

export const lancerTestSpam = (a: { campagneId: string; baseId: string; nom: string; objet: string; corps: string; mentions: Mentions; suivi: boolean }) => appeler<{ id: string }>({ action: "spam_lancer", ...a })
export const resultatsTestSpam = async (campagneId: string) => (await appeler<{ tests: TestSpam[] }>({ action: "spam_resultats", campagneId })).tests
