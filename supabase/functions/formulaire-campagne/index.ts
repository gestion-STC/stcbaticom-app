// LES FORMULAIRES ET PAGES DE CAMPAGNE, CÔTÉ PROSPECT (09/11/2026). Déployée SANS vérification de JWT (liens dans des
// mails) : chaque lien porte une signature, qui prouve le contact. Deux actions :
//   · lire    : ce que le prospect doit voir (jamais le réglage complet de la campagne) ; note le clic.
//   · envoyer : enregistre les réponses ; pour une agence, pose le lead dans la session de call.
// En mode test, rien n'est enregistré : le formulaire s'affiche et répond, c'est tout.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { signer } from "../_shared/campagnes/lien.ts"

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } })
const MAX_REPONSE = 2000

type Question = { id: string; libelle: string; type: string; requis: boolean; options?: string }
type Creatif = { id: string; type: string; nom: string; variantes: { objet: string; corps: string }[]; video: boolean; videoUrl?: string; versId: string; remplirPar: string; questions: Question[] }

async function clePassage(sb: SupabaseClient): Promise<string> {
  const { data } = await sb.from("parametres").select("valeur").eq("cle", "analyse_passage_cle").maybeSingle()
  return String((data as { valeur?: string } | null)?.valeur ?? "")
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405)
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  try {
    const b = await req.json().catch(() => ({})) as { action?: string; c?: string; f?: string; k?: string; s?: string; t?: string; reponses?: Record<string, unknown> }
    const c = String(b.c ?? ""), f = String(b.f ?? ""), k = String(b.k ?? ""), test = b.t === "1"
    if (!/^[0-9a-f-]{36}$/i.test(c) || !f || !k || !b.s) return json({ error: "Lien incomplet." }, 400)
    const cle = await clePassage(sb)
    if (!cle || (await signer(cle, c, k, test)) !== b.s) return json({ error: "Ce lien n'est pas valide." }, 403)

    const { data: camp } = await sb.from("cmp_campagnes").select("id, base_id, config").eq("id", c).maybeSingle()
    const config = (camp as { config?: { creatifs?: Creatif[] } } | null)?.config
    const creatif = config?.creatifs?.find((x) => x.id === f)
    if (!camp || !creatif || (creatif.type !== "formulaire" && creatif.type !== "page")) return json({ error: "Ce contenu n'existe plus." }, 404)

    if (b.action === "lire") {
      if (!test) {
        // Une page avec vidéo ouverte compte pour « A regardé la vidéo » (on ne sait pas mesurer jusqu'où).
        const lien = creatif.video && creatif.videoUrl ? "video" : "formulaire"
        const { count } = await sb.from("cmp_evenements").select("id", { count: "exact", head: true }).eq("campagne_id", c).eq("contact_ref", k).eq("type", "clic").eq("lien", lien)
        if (!count) await sb.from("cmp_evenements").insert({ campagne_id: c, contact_ref: k, type: "clic", le: new Date().toISOString(), lien })
      }
      const { count: deja } = test ? { count: 0 } : await sb.from("cmp_reponses").select("id", { count: "exact", head: true }).eq("campagne_id", c).eq("contact_ref", k).eq("creatif_id", f)
      return json({ type: creatif.type, titre: creatif.variantes?.[0]?.objet || creatif.nom, texte: creatif.variantes?.[0]?.corps ?? "", videoUrl: creatif.video ? creatif.videoUrl ?? "" : "", versId: creatif.versId ?? "", questions: (creatif.questions ?? []).map((q) => ({ id: q.id, libelle: q.libelle, type: q.type, requis: q.requis, options: q.options ?? "" })), dejaRepondu: (deja ?? 0) > 0 })
    }

    if (b.action === "envoyer") {
      if (creatif.type !== "formulaire" || creatif.remplirPar !== "prospect") return json({ error: "Ce formulaire ne se remplit pas ici." }, 400)
      const propres: Record<string, string> = {}
      for (const q of creatif.questions ?? []) {
        const v = String(b.reponses?.[q.id] ?? "").trim().slice(0, MAX_REPONSE)
        if (q.requis && !v) return json({ error: `Merci de répondre : ${q.libelle}` }, 400)
        if (v) propres[q.id] = v
      }
      if (test) return json({ ok: true, test: true })
      const { error } = await sb.from("cmp_reponses").insert({ campagne_id: c, creatif_id: f, contact_ref: k, reponses: propres, rempli_par: "prospect" })
      if (error) throw new Error(error.message)
      if ((camp as { base_id: string }).base_id === "agences") {
        const detail = (creatif.questions ?? []).filter((q) => propres[q.id]).map((q) => `${q.libelle} : ${propres[q.id]}`).join("\n").slice(0, 1500)
        const { error: e2 } = await sb.rpc("lead_poser", { p_agence: k, p_contact: null, p_source: "formulaire", p_signal: "A rempli le formulaire", p_detail: detail, p_quand: new Date().toISOString() })
        if (e2) console.error("lead_poser", e2.message) // la réponse est gardée : elle compte dans le parcours
      }
      return json({ ok: true })
    }
    return json({ error: "Action inconnue." }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: "Une erreur est survenue, merci de réessayer." }, 500)
  }
})
