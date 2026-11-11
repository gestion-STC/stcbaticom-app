// LinkedIn (Mahdi, 11/11/2026) : le compte branché par Unipile, ses réglages, et les réponses depuis la boîte de réception.
import { supabase } from "./supabase"
import { ecrireParametre, lireParametre } from "./parametresDb"
import { LINKEDIN_DEPART, type CompteLinkedIn, type ReglageLinkedIn } from "../prospection/linkedin"

const sb = () => { if (!supabase) throw new Error("Supabase n'est pas configuré."); return supabase }
async function appeler<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().functions.invoke("linkedin", { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const lu = ctx && typeof ctx.json === "function" ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null
    throw new Error(lu?.error ?? error.message)
  }
  if ((data as { error?: string } | null)?.error) throw new Error(String((data as { error: string }).error))
  return data as T
}

/** Les comptes branchés, avec leur état chez Unipile (OK, CREDENTIALS = à reconnecter…). */
export const etatLinkedIn = () => appeler<{ branche: boolean; comptes: CompteLinkedIn[] }>({ action: "etat" })
/** La page Unipile où le titulaire du compte se connecte lui-même à LinkedIn. */
export const lienConnexionLinkedIn = async () => (await appeler<{ url: string }>({ action: "lien" })).url
/** Répondre dans la conversation LinkedIn d'un message reçu. */
export const repondreLinkedIn = (message: string, corps: string) => appeler<{ ok: boolean }>({ action: "repondre", message, corps })

export async function lireReglageLinkedIn(): Promise<ReglageLinkedIn> {
  try { return { ...LINKEDIN_DEPART, ...JSON.parse((await lireParametre("linkedin_reglage")) || "{}") } } catch { return LINKEDIN_DEPART }
}
export const ecrireReglageLinkedIn = (r: ReglageLinkedIn) => ecrireParametre("linkedin_reglage", JSON.stringify(r))
export async function nombreComptesLinkedIn(): Promise<number> {
  try { const l = JSON.parse((await lireParametre("linkedin_comptes")) || "[]"); return Array.isArray(l) ? l.length : 0 } catch { return 0 }
}
