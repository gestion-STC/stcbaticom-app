// La vérification des adresses avant l'envoi (Mahdi, 11/11/2026) : les verdicts gardés, et la vérification à la demande.
import { supabase } from "./supabase"

export type Verdict = { email: string; statut: "valide" | "douteux" | "invalide" | "attente"; source: string; motif: string }
const sb = () => { if (!supabase) throw new Error("Supabase n'est pas configuré."); return supabase }

/** Les verdicts connus pour ces adresses (en minuscules). */
export async function chargerVerdicts(emails: string[]): Promise<Map<string, Verdict>> {
  const out = new Map<string, Verdict>()
  const liste = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  for (let i = 0; i < liste.length; i += 200) {
    const { data, error } = await sb().from("cmp_verifications").select("email, statut, source, motif").in("email", liste.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const v of (data ?? []) as Verdict[]) out.set(v.email, v)
  }
  return out
}

/** Vérifie tout de suite un lot de 25 adresses au plus. */
export async function verifierMaintenant(emails: string[]): Promise<Verdict[]> {
  const { data, error } = await sb().functions.invoke("campagnes-ia", { body: { action: "verifier", emails: emails.slice(0, 25) } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const lu = ctx && typeof ctx.json === "function" ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null
    throw new Error(lu?.error ?? error.message)
  }
  return ((data as { verdicts?: Verdict[] }).verdicts ?? [])
}
