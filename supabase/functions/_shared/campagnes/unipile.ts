// LINKEDIN PAR UNIPILE (Mahdi, 11/11/2026) : le compte LinkedIn d'Horlann, branché chez Unipile, envoie les invitations
// et les messages des campagnes. Secrets : UNIPILE_DSN (ex. api8.unipile.com:13851) et UNIPILE_API_KEY.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import type { CompteLinkedIn, ReglageLinkedIn } from "./linkedin.ts"
import { LINKEDIN_DEPART } from "./linkedin.ts"

export type RetourUnipile = { ok: boolean; status: number; type: string; data: Record<string, unknown> }

export const unipileBranche = () => Boolean(Deno.env.get("UNIPILE_DSN") && Deno.env.get("UNIPILE_API_KEY"))
const racine = () => { const d = (Deno.env.get("UNIPILE_DSN") ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, ""); return `https://${d}` }

export async function appelUnipile(chemin: string, o: { methode?: string; json?: unknown; form?: Record<string, string | string[]> } = {}): Promise<RetourUnipile> {
  const cle = Deno.env.get("UNIPILE_API_KEY") ?? ""
  let body: BodyInit | undefined
  const headers: Record<string, string> = { "X-API-KEY": cle, accept: "application/json" }
  if (o.json !== undefined) { body = JSON.stringify(o.json); headers["Content-Type"] = "application/json" }
  else if (o.form) { const f = new FormData(); for (const [k, v] of Object.entries(o.form)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x); body = f }
  try {
    const r = await fetch(`${racine()}${chemin}`, { method: o.methode ?? (body ? "POST" : "GET"), headers, body })
    const data = await r.json().catch(() => ({})) as Record<string, unknown>
    return { ok: r.ok, status: r.status, type: String(data?.type ?? ""), data }
  } catch (e) { return { ok: false, status: 503, type: "errors/network_down", data: { detail: String(e) } } }
}

/** La clé que nos webhooks Unipile portent dans l'en-tête x-baticom-cle : dérivée de la clé API, jamais saisie. */
export async function cleWebhookLinkedIn(): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`baticom-linkedin:${Deno.env.get("UNIPILE_API_KEY") ?? ""}`))
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("")
}

/** Les comptes branchés et les réglages, gardés dans les paramètres. */
export async function comptesLinkedIn(sb: SupabaseClient): Promise<CompteLinkedIn[]> {
  const { data } = await sb.from("parametres").select("valeur").eq("cle", "linkedin_comptes").maybeSingle()
  try { const l = JSON.parse(String((data as { valeur?: string } | null)?.valeur ?? "[]")); return Array.isArray(l) ? l : [] } catch { return [] }
}
export async function reglageLinkedIn(sb: SupabaseClient): Promise<ReglageLinkedIn> {
  const { data } = await sb.from("parametres").select("valeur").eq("cle", "linkedin_reglage").maybeSingle()
  try { return { ...LINKEDIN_DEPART, ...JSON.parse(String((data as { valeur?: string } | null)?.valeur ?? "{}")) } } catch { return LINKEDIN_DEPART }
}

/** Le profil : son identifiant interne, et s'il est déjà en relation. */
export async function profilLinkedIn(compte: string, identifiant: string): Promise<{ ok: true; providerId: string; enRelation: boolean; nom: string } | { ok: false; r: RetourUnipile }> {
  const r = await appelUnipile(`/api/v1/users/${encodeURIComponent(identifiant)}?account_id=${encodeURIComponent(compte)}`)
  if (!r.ok) return { ok: false, r }
  const d = r.data as { provider_id?: string; is_relationship?: boolean; network_distance?: string; first_name?: string; last_name?: string }
  return { ok: true, providerId: String(d.provider_id ?? ""), enRelation: Boolean(d.is_relationship) || d.network_distance === "FIRST_DEGREE", nom: [d.first_name, d.last_name].filter(Boolean).join(" ") }
}
