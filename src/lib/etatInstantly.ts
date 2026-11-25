// L'état des boîtes d'envoi, tel que le moteur l'a relu chez Instantly (toutes les 10 minutes).
import { supabase } from "./supabase"
import { boitePrete } from "../prospection/instantlyOutils"

export type BoiteEnvoi = { email: string; depuis: string | null; /** La limite par jour réglée dans Instantly. */ limite?: number | null }
/** Ce qu'Instantly a répondu au dernier passage : ses boîtes prêtes, ou son refus (25/11/2026 : un refus — 402, forfait
 *  non payé — était ignoré, et les mails attendaient sans que personne ne le voie). */
export type EtatInstantly = { boites: BoiteEnvoi[]; erreur: string | null; le: string | null }

type Brut = { le?: string; erreur?: string; detail?: string; boites?: (BoiteEnvoi & { status?: number; setup_pending?: boolean })[] }

/** Le message à afficher quand Instantly refuse ; null s'il répond normalement. Fonction PURE. */
export function refusInstantly(etat: Pick<Brut, "erreur" | "detail">): string | null {
  if (!etat.erreur) return null
  const detail = String(etat.detail ?? "").trim()
  const forfait = /402|paid plan/i.test(`${etat.erreur} ${detail}`)
  return `${etat.erreur}${detail ? ` : « ${detail} »` : ""}.${forfait ? " Le forfait Instantly n'est pas actif : aucun mail de prospection ne part tant qu'il n'est pas réglé." : " Les mails de prospection attendent."}`
}

export async function chargerEtatInstantly(): Promise<EtatInstantly> {
  if (!supabase) return { boites: [], erreur: null, le: null }
  const { data, error } = await supabase.from("parametres").select("valeur").eq("cle", "instantly_etat").maybeSingle()
  if (error) throw new Error(error.message)
  let etat: Brut
  try { etat = JSON.parse(String((data as { valeur?: string } | null)?.valeur ?? "{}")) as Brut } catch { etat = {} }
  return { boites: (etat.boites ?? []).filter(boitePrete).map((b) => ({ email: b.email, depuis: b.depuis ?? null, limite: b.limite ?? null })), erreur: refusInstantly(etat), le: etat.le ?? null }
}

export async function chargerBoites(): Promise<BoiteEnvoi[]> {
  return (await chargerEtatInstantly()).boites
}
