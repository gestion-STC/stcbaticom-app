// RÉPONDRE À UN PROSPECT DEPUIS LA BOÎTE DE RÉCEPTION (09/11/2026) : la réponse repart de la boîte Instantly qui a reçu
// son message, dans le même fil. Déployée sans vérification de JWT par la passerelle : l'utilisateur est vérifié ici.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { appelInstantly } from "../_shared/campagnes/instantly.ts"

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } })
const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405)
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  const { data: u } = await sb.auth.getUser(jeton)
  if (!u?.user || !["admin", "telepro"].includes(String(u.user.app_metadata?.role ?? ""))) return json({ error: "Connexion requise." }, 401)
  const cle = Deno.env.get("INSTANTLY_API_KEY") ?? ""
  if (!cle) return json({ error: "Instantly n'est pas configuré." }, 500)
  try {
    const b = await req.json().catch(() => ({})) as { message?: string; objet?: string; corps?: string; signature_html?: string }
    const corps = String(b.corps ?? "").trim(), objet = String(b.objet ?? "").trim()
    if (!b.message || !corps) return json({ error: "Message vide." }, 400)
    const { data: m, error } = await sb.from("messages").select("sens, de, a, objet, message_id, espace, agence_id, sous_traitant_id").eq("id", b.message).maybeSingle()
    if (error) throw new Error(error.message)
    if (!m || m.sens !== "entrant" || !m.message_id || !m.a) return json({ error: "Ce message ne peut pas recevoir de réponse par cette boîte." }, 400)
    const html = `${echapper(corps).replace(/\n/g, "<br/>")}${b.signature_html ? `<br/><br/>${b.signature_html}` : ""}`
    const sujet = objet || String(m.objet ?? "")
    const r = await appelInstantly(cle, "/emails/reply", { corps: { reply_to_uuid: m.message_id, eaccount: m.a, subject: sujet, body: { html, text: corps } } })
    if (!r.ok) return json({ error: `Instantly a refusé la réponse (${r.status}). ${String(r.data?.message ?? "").slice(0, 160)}` }, 502)
    const { error: e2 } = await sb.from("messages").insert({ sens: "sortant", de: m.a, a: m.de, objet: sujet, corps_text: corps, corps_html: html, message_id: String(r.data?.id ?? "") || null, in_reply_to: m.message_id, lu: true, espace: m.espace, agence_id: m.agence_id, sous_traitant_id: m.sous_traitant_id })
    if (e2) console.error("[INSTANTLY-REPONDRE] journal", e2.message) // la réponse est partie : on ne la renvoie pas
    return json({ ok: true })
  } catch (e) {
    console.error("[INSTANTLY-REPONDRE]", e)
    return json({ error: "La réponse n'a pas pu partir." }, 500)
  }
})
