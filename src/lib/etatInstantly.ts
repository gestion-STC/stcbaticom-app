// L'état des boîtes d'envoi, tel que le moteur l'a relu chez Instantly (toutes les 10 minutes).
import { supabase } from "./supabase"
import { boitePrete } from "../prospection/instantlyOutils"

export type BoiteEnvoi = { email: string; depuis: string | null; /** La limite par jour réglée dans Instantly. */ limite?: number | null }

export async function chargerBoites(): Promise<BoiteEnvoi[]> {
  if (!supabase) return []
  const { data } = await supabase.from("parametres").select("valeur").eq("cle", "instantly_etat").maybeSingle()
  const etat = JSON.parse(String((data as { valeur?: string } | null)?.valeur ?? "{}")) as { boites?: (BoiteEnvoi & { status?: number; setup_pending?: boolean })[] }
  return (etat.boites ?? []).filter(boitePrete).map((b) => ({ email: b.email, depuis: b.depuis ?? null, limite: b.limite ?? null }))
}
