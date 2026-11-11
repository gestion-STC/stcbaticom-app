// LINKEDIN PAR UNIPILE, API v2 (Mahdi, 11/11/2026) : le compte LinkedIn d'Horlann, branché chez Unipile, envoie les
// invitations et les messages des campagnes. Un seul secret : UNIPILE_API_KEY (la v2 n'a plus de DSN).
// Adresses : https://api.unipile.com/v2/{account_id}/… ; en-tête X-API-KEY.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import type { CompteLinkedIn, ReglageLinkedIn } from "./linkedin.ts"
import { LINKEDIN_DEPART } from "./linkedin.ts"

export type RetourUnipile = { ok: boolean; status: number; type: string; data: Record<string, unknown> }
export const API_UNIPILE = "https://api.unipile.com/v2"

export const unipileBranche = () => Boolean(Deno.env.get("UNIPILE_API_KEY"))

export async function appelUnipile(chemin: string, o: { methode?: string; json?: unknown } = {}): Promise<RetourUnipile> {
  const headers: Record<string, string> = { "X-API-KEY": Deno.env.get("UNIPILE_API_KEY") ?? "", accept: "application/json" }
  if (o.json !== undefined) headers["Content-Type"] = "application/json"
  try {
    const r = await fetch(`${API_UNIPILE}${chemin}`, { method: o.methode ?? (o.json !== undefined ? "POST" : "GET"), headers, body: o.json !== undefined ? JSON.stringify(o.json) : undefined })
    const data = await r.json().catch(() => ({})) as Record<string, unknown>
    return { ok: r.ok, status: r.status, type: String(data?.type ?? data?.code ?? ""), data }
  } catch (e) { return { ok: false, status: 503, type: "network_down", data: { detail: String(e) } } }
}

/** La clé que porte l'adresse de nos webhooks Unipile (?hook=…) : dérivée de la clé API, jamais saisie. */
export async function cleWebhookLinkedIn(): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`baticom-linkedin:${Deno.env.get("UNIPILE_API_KEY") ?? ""}`))
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("")
}

/** Les comptes LinkedIn branchés chez Unipile (lus chez eux : rien à tenir à jour ici). */
export async function comptesLinkedIn(): Promise<CompteLinkedIn[]> {
  const r = await appelUnipile("/accounts?limit=100")
  if (!r.ok) { console.error("[LINKEDIN] liste des comptes", r.status, r.type, JSON.stringify(r.data).slice(0, 200)); return [] }
  console.log("[LINKEDIN] comptes Unipile lus", r.status)
  const liste = (Array.isArray(r.data.data) ? r.data.data : Array.isArray(r.data.items) ? r.data.items : []) as Record<string, unknown>[]
  return liste
    .filter((a) => /linkedin/i.test(String(a.provider ?? a.type ?? "")))
    .map((a) => ({ id: String(a.id ?? ""), nom: String(a.name ?? a.display_name ?? "Compte LinkedIn"), branche_le: String(a.created_at ?? ""), statut: String(a.status ?? (a as { connection_status?: string }).connection_status ?? "") }))
    .filter((a) => a.id)
}

export async function reglageLinkedIn(sb: SupabaseClient): Promise<ReglageLinkedIn> {
  const { data } = await sb.from("parametres").select("valeur").eq("cle", "linkedin_reglage").maybeSingle()
  try { return { ...LINKEDIN_DEPART, ...JSON.parse(String((data as { valeur?: string } | null)?.valeur ?? "{}")) } } catch { return LINKEDIN_DEPART }
}

/** Le profil : son identifiant LinkedIn, et s'il est déjà en relation. Un identifiant Sales Navigator (ACw…) se lit en Sales Navigator. */
export async function profilLinkedIn(compte: string, identifiant: string): Promise<{ ok: true; providerId: string; enRelation: boolean; nom: string } | { ok: false; r: RetourUnipile }> {
  const variante = /^ACw/.test(identifiant) ? "linkedin_sales_navigator" : "linkedin_classic"
  const r = await appelUnipile(`/${encodeURIComponent(compte)}/users/${encodeURIComponent(identifiant)}?variant=${variante}`)
  if (!r.ok) return { ok: false, r }
  const d = r.data as { id?: string; display_name?: string; specifics?: { network_distance?: string } }
  return { ok: true, providerId: String(d.id ?? ""), enRelation: d.specifics?.network_distance === "FIRST_DEGREE", nom: String(d.display_name ?? "") }
}

/** Nos webhooks chez Unipile : messages reçus et invitations acceptées, une seule fois. */
export async function assurerWebhooks(sb: SupabaseClient, url: string): Promise<void> {
  const { data } = await sb.from("parametres").select("valeur").eq("cle", "linkedin_webhooks").maybeSingle()
  if ((data as { valeur?: string } | null)?.valeur) return
  const r = await appelUnipile("/webhooks/endpoints/", { json: { url: `${url}?hook=${await cleWebhookLinkedIn()}`, trigger_events: ["message.new", "relation.new"], description: "Baticom · LinkedIn des campagnes" } })
  if (r.ok) await sb.from("parametres").upsert({ cle: "linkedin_webhooks", valeur: JSON.stringify({ id: r.data.id ?? "" }) }, { onConflict: "cle" })
  else console.error("[LINKEDIN] webhook", r.status, r.type, JSON.stringify(r.data).slice(0, 300))
}
