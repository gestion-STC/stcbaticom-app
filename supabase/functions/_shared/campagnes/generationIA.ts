// La génération des textes par l'IA, partagée par le moteur et par l'écran d'essai.
import Anthropic from "npm:@anthropic-ai/sdk@0.137.0"
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { CONSIGNES_APPRIS, CONSIGNES_TRI, SCHEMA_APPRIS, SCHEMA_IA, SCHEMA_TRI, avecAppels, consignesIA, coutIA, messageAppris, messageIA, type AppelAnalyse, type ReglageIA } from "./ia.ts"
import { valeursDe } from "./instantlyOutils.ts"

export const MODELE_IA = "claude-opus-5-5"
type Contact = { id: string; baseId: string; nom: string; personne: string; champs: Record<string, string> }

export async function offreSTC(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.from("parametres").select("valeur").eq("cle", "script_appel").maybeSingle()
  return String((data as { valeur?: unknown } | null)?.valeur ?? "")
}

export type Appris = { texte: string; nb: number; le: string }
const CLE_APPRIS = "ia_ce_qui_marche"

/** Ce que l'IA a retenu des appels, tel qu'enregistré. */
export async function lireAppris(sb: SupabaseClient): Promise<Appris | null> {
  const { data } = await sb.from("parametres").select("valeur").eq("cle", CLE_APPRIS).maybeSingle()
  try { return JSON.parse(String((data as { valeur?: unknown } | null)?.valeur ?? "")) as Appris } catch { return null }
}

/** Le texte à donner à l'IA des mails, si la campagne le veut. */
export async function ceQuiMarche(sb: SupabaseClient, baseId: string, r: ReglageIA): Promise<string> {
  return avecAppels(baseId, r) ? (await lireAppris(sb))?.texte ?? "" : ""
}

/** Relit les appels analysés (les intéressés d'abord, quelques refus pour les objections) et en tire la fiche. */
export async function apprendreDesAppels(sb: SupabaseClient): Promise<Appris & { cout: number }> {
  const colonnes = "interet, resume, analyse_detail"
  const [bons, refus] = await Promise.all([
    sb.from("appels_ia").select(colonnes).in("interet", ["moyen", "fort"]).not("analyse_detail", "is", null).order("cree_le", { ascending: false }).limit(60),
    sb.from("appels_ia").select(colonnes).in("interet", ["nul", "faible"]).eq("resultat", "joint").not("analyse_detail", "is", null).order("cree_le", { ascending: false }).limit(25),
  ])
  if (bons.error) throw new Error(bons.error.message)
  if (!(bons.data ?? []).length) throw new Error("Aucun appel intéressé n'a encore été analysé.")
  const lus = ([...(bons.data ?? []), ...(refus.data ?? [])] as { interet: string | null; resume: string | null; analyse_detail: Record<string, unknown> | null }[]).map((x): AppelAnalyse => ({ interet: x.interet, resume: x.resume, detail: x.analyse_detail }))
  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "" })
  const reponse = await client.beta.messages.create({
    model: MODELE_IA, max_tokens: 16000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA_APPRIS } },
    system: CONSIGNES_APPRIS,
    messages: [{ role: "user", content: messageAppris(lus) }],
  } as never) as { stop_reason?: string; content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } }
  if (reponse.stop_reason !== "end_turn") throw new Error("La fiche n'a pas pu être écrite.")
  const texte = String((JSON.parse((reponse.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("")) as { texte?: string }).texte ?? "").trim()
  const appris: Appris = { texte, nb: (bons.data ?? []).length, le: new Date().toISOString() }
  const { error } = await sb.from("parametres").upsert({ cle: CLE_APPRIS, valeur: JSON.stringify(appris), maj_le: appris.le }, { onConflict: "cle" })
  if (error) throw new Error(error.message)
  return { ...appris, cout: coutIA(reponse.usage?.input_tokens ?? 0, reponse.usage?.output_tokens ?? 0) }
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

export async function genererTexteIA(a: { baseId: string; reglage: ReglageIA; campagneNom: string; objet: string; corps: string; fiche: Record<string, string>; offre: string; appels?: string }): Promise<{ texte: string; cout: number }> {
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
