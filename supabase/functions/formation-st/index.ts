// LA FORMATION D'UN SOUS-TRAITANT, DEPUIS SON LIEN PERSONNEL (10/11/2026). Il n'a pas encore de compte : le jeton du lien fait foi.
// Les bonnes réponses restent ici : la page ne les reçoit qu'après avoir répondu.
import Anthropic from "npm:@anthropic-ai/sdk@0.137.0"
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { blocageEssai, melanger, regles, scoreSur, tirerQuestions, type EtatFormation, type ReglesFormation } from "../_shared/formationST.ts"

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })
type Question = { id: string; theme: string; texte: string; bonne: string; fausses: string[]; explication: string; actif: boolean; posee: number; ratee: number }
type Essai = { ids: string[]; ordres: Record<string, string[]>; reponses: Record<string, { reponse: string; juste: boolean }> }
type Fiche = { sous_traitant_id: string; etat: EtatFormation; score: number | null; essais: number; vues: string[]; essai: Essai | null; journal: unknown[]; termine_le: string | null; scenario_le?: string | null; scenario_score?: number | null }
const APPLICATION = "https://stcbatiment.com/"

async function reglesDe(sb: SupabaseClient): Promise<ReglesFormation> {
  const { data } = await sb.from("parametres").select("valeur").eq("cle", "formation_regles").maybeSingle()
  try { return regles(JSON.parse(String((data as { valeur?: string } | null)?.valeur ?? "{}"))) } catch { return regles(null) }
}
const SCHEMA = { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: { texte: { type: "string" }, bonne: { type: "string" }, fausses: { type: "array", items: { type: "string" } }, explication: { type: "string" } }, required: ["texte", "bonne", "fausses", "explication"], additionalProperties: false } } }, required: ["questions"], additionalProperties: false }

async function proposer(sb: SupabaseClient, theme: string, nombre: number) {
  const { data } = await sb.from("st_formation_questions").select("theme, texte, bonne, explication").limit(400)
  const connues = (data ?? []) as { theme: string; texte: string; bonne: string; explication: string }[]
  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "" })
  const reponse = await client.beta.messages.create({
    model: "claude-opus-5-5", max_tokens: 16000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: "Tu rédiges des questions de contrôle pour former des artisans sous-traitants à l'application de STC Bâtiment. En français, tutoiement, phrases courtes et concrètes, sous forme de situations de chantier. Une seule bonne réponse, et deux mauvaises réponses crédibles. N'utilise que les faits présents dans les questions existantes : n'invente aucune règle, aucun chiffre, aucun écran. Ne répète aucune question existante.",
    messages: [{ role: "user", content: `Propose ${nombre} nouvelles questions sur le thème « ${theme} ».\n\nQuestions existantes, qui contiennent les faits autorisés :\n${connues.map((q) => `- [${q.theme}] ${q.texte} → ${q.bonne} (${q.explication})`).join("\n")}` }],
  } as never) as { stop_reason?: string; content?: Array<{ type: string; text?: string }> }
  if (reponse.stop_reason !== "end_turn") throw new Error("Proposition impossible pour le moment.")
  return JSON.parse((reponse.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("")).questions
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  try {
    const b = await req.json().catch(() => ({})) as { action?: string; jeton?: string; questionId?: string; reponse?: string; theme?: string; nombre?: number; score?: number; journal?: unknown[]; reflexes?: unknown[] }
    if (b.action === "proposer") {
      const { data: u } = await sb.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim())
      if (u.user?.app_metadata?.role !== "admin") return json({ error: "Réservé aux administrateurs." }, 403)
      return json({ questions: await proposer(sb, String(b.theme ?? ""), Math.min(Math.max(b.nombre ?? 5, 1), 10)) })
    }
    if (!/^[0-9a-f]{32}$/i.test(b.jeton ?? "")) return json({ error: "Ce lien n'est pas valide." }, 400)
    const { data: ligne } = await sb.from("st_formations").select("*").eq("jeton", b.jeton).maybeSingle()
    if (!ligne) return json({ error: "Ce lien n'est pas valide." }, 404)
    const f = ligne as unknown as Fiche
    const r = await reglesDe(sb)
    const maintenant = new Date(), iso = maintenant.toISOString()
    const maj = async (p: Record<string, unknown>) => { const { error } = await sb.from("st_formations").update({ ...p, maj_le: iso }).eq("sous_traitant_id", f.sous_traitant_id); if (error) throw new Error(error.message) }
    const bloque = () => blocageEssai(r, { essais: f.essais, termineLe: f.termine_le, etat: f.etat }, maintenant)

    if (b.action === "scenario") {
      const score = Math.min(100, Math.max(0, Math.round(Number(b.score) || 0)))
      await maj({ scenario_score: score, scenario_journal: (Array.isArray(b.journal) ? b.journal : []).slice(0, 80), scenario_reflexes: (Array.isArray(b.reflexes) ? b.reflexes : []).slice(0, 20), scenario_le: iso, ...(f.etat === "a_envoyer" || f.etat === "envoye" ? { etat: "en_cours" } : {}) })
      return json({ ok: true })
    }
    if (b.action === "charger") {
      const { data: st } = await sb.from("st_sous_traitants").select("entreprise, contact").eq("id", f.sous_traitant_id).maybeSingle()
      const s = st as { entreprise?: string; contact?: string } | null
      return json({ nom: s?.contact || s?.entreprise || "", etat: f.etat, score: f.score, scenarioFait: Boolean(f.scenario_le), scenarioScore: f.scenario_score ?? null, lienScenario: `${APPLICATION}?formation=${b.jeton}`, essais: f.essais, essaisMax: r.essais, questions: r.questions, seuil: r.seuil, enCours: Boolean(f.essai), blocage: f.essai ? "" : bloque() })
    }
    const banque = async (ids?: string[]) => {
      let q = sb.from("st_formation_questions").select("id, theme, texte, bonne, fausses, explication, actif, posee, ratee").limit(2000)
      if (ids) q = q.in("id", ids)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data ?? []) as Question[]
    }
    const vue = (e: Essai, l: Question[]) => e.ids.flatMap((id) => { const q = l.find((x) => x.id === id); return q ? [{ id, theme: q.theme, texte: q.texte, reponses: e.ordres[id], deja: e.reponses[id] ? { ...e.reponses[id], bonne: q.bonne, explication: q.explication } : null }] : [] })

    if (b.action === "commencer") {
      if (f.essai) return json({ questions: vue(f.essai, await banque(f.essai.ids)) })
      if (!f.scenario_le) return json({ error: "Commence par ta mission d'entraînement." }, 400)
      const blocage = bloque()
      if (blocage) return json({ error: blocage }, 400)
      const toutes = await banque()
      const tirees = tirerQuestions(toutes, f.vues ?? [], r)
      if (!tirees.length) return json({ error: "La formation n'est pas encore prête." }, 400)
      const essai: Essai = { ids: tirees.map((q) => q.id), ordres: Object.fromEntries(tirees.map((q) => [q.id, r.desordre ? melanger([q.bonne, ...q.fausses]) : [q.bonne, ...q.fausses]])), reponses: {} }
      await maj({ essai, etat: "en_cours", vues: [...new Set([...(f.vues ?? []), ...essai.ids])] })
      return json({ questions: vue(essai, tirees) })
    }
    if (!f.essai) return json({ error: "Aucun essai en cours." }, 400)

    if (b.action === "repondre") {
      const id = String(b.questionId ?? "")
      if (!f.essai.ids.includes(id)) return json({ error: "Question inconnue." }, 400)
      const [q] = await banque([id])
      if (!q) return json({ error: "Question inconnue." }, 400)
      if (f.essai.reponses[id]) return json({ juste: f.essai.reponses[id].juste, bonne: q.bonne, explication: q.explication })
      const juste = String(b.reponse ?? "") === q.bonne
      await maj({ essai: { ...f.essai, reponses: { ...f.essai.reponses, [id]: { reponse: String(b.reponse ?? ""), juste } } } })
      await sb.from("st_formation_questions").update({ posee: q.posee + 1, ratee: q.ratee + (juste ? 0 : 1) }).eq("id", id)
      return json({ juste, bonne: q.bonne, explication: q.explication })
    }
    if (b.action === "terminer") {
      if (f.essai.ids.some((id) => !f.essai!.reponses[id])) return json({ error: "Il reste des questions." }, 400)
      const bonnes = f.essai.ids.filter((id) => f.essai!.reponses[id].juste).length
      const score = scoreSur(bonnes, f.essai.ids.length), reussi = score >= r.seuil
      const liste = await banque(f.essai.ids)
      const ratees = f.essai.ids.filter((id) => !f.essai!.reponses[id].juste).flatMap((id) => liste.find((q) => q.id === id)?.texte ?? [])
      const etat: EtatFormation = reussi ? "reussi" : "a_refaire", essais = f.essais + 1
      await maj({ etat, score, essais, essai: null, termine_le: iso, journal: [...(f.journal ?? []), { le: iso, score, ratees }] })
      return json({ score, reussi, seuil: r.seuil, blocage: blocageEssai(r, { essais, termineLe: iso, etat }, maintenant) })
    }
    return json({ error: "Action inconnue." }, 400)
  } catch (e) {
    console.error("[FORMATION-ST]", e)
    return json({ error: "Une erreur est survenue, merci de réessayer." }, 500)
  }
})
