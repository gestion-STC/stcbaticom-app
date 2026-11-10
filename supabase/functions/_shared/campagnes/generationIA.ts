// La génération des textes par l'IA, partagée par le moteur et par l'écran d'essai.
import Anthropic from "npm:@anthropic-ai/sdk@0.137.0"
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { CONSIGNES_TRI, SCHEMA_IA, SCHEMA_TRI, consignesIA, coutIA, messageIA, type ReglageIA } from "./ia.ts"
import { valeursDe } from "./instantlyOutils.ts"

export const MODELE_IA = "claude-opus-5-5"
type Contact = { id: string; baseId: string; nom: string; personne: string; champs: Record<string, string> }

export async function offreSTC(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.from("parametres").select("valeur").eq("cle", "script_appel").maybeSingle()
  return String((data as { valeur?: unknown } | null)?.valeur ?? "")
}

/** La fiche telle que l'IA la voit, notes d'appel comprises si la campagne les autorise. */
export async function ficheIA(sb: SupabaseClient, k: Contact, r: ReglageIA): Promise<Record<string, string>> {
  const fiche = valeursDe(k)
  if (!r.champs.includes("notes")) return fiche
  const { data } = k.baseId === "artisans"
    ? await sb.from("st_appels").select("note").eq("sous_traitant_id", k.id).neq("note", "").order("date", { ascending: false }).limit(3)
    : await sb.from("activites").select("note").eq("agence_id", k.id).eq("type", "appel").neq("note", "").order("date", { ascending: false }).limit(3)
  return { ...fiche, notes: ((data ?? []) as { note: string }[]).map((x) => x.note).join(" / ") }
}

export async function genererTexteIA(a: { baseId: string; reglage: ReglageIA; campagneNom: string; objet: string; corps: string; fiche: Record<string, string>; offre: string }): Promise<{ texte: string; cout: number }> {
  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "" })
  const reponse = await client.beta.messages.create({
    model: MODELE_IA,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA_IA } },
    system: consignesIA(a.reglage.mode),
    messages: [{ role: "user", content: messageIA(a) }],
  } as never) as { stop_reason?: string; content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } }
  if (reponse.stop_reason === "refusal") throw new Error("texte refusé par le modèle")
  if (reponse.stop_reason === "max_tokens") throw new Error("texte coupé")
  const brut = (reponse.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("")
  return { texte: String((JSON.parse(brut) as { texte?: string }).texte ?? "").trim(), cout: coutIA(reponse.usage?.input_tokens ?? 0, reponse.usage?.output_tokens ?? 0) }
}

/** Le tri d'une réponse. En cas d'échec : null, et la règle simple prend le relais. */
export async function trierReponse(objet: string, texte: string): Promise<string | null> {
  try {
    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "" })
    const reponse = await client.beta.messages.create({
      model: MODELE_IA, max_tokens: 2000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA_TRI } },
      system: CONSIGNES_TRI,
      messages: [{ role: "user", content: `Objet : ${objet.slice(0, 200)}\n\n${texte.slice(0, 2000)}` }],
    } as never) as { stop_reason?: string; content?: Array<{ type: string; text?: string }> }
    if (reponse.stop_reason !== "end_turn") return null
    return (JSON.parse((reponse.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("")) as { tri?: string }).tri ?? null
  } catch (e) { console.error("[TRI-REPONSE]", e); return null }
}
