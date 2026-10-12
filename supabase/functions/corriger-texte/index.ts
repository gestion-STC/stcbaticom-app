// Corriger l'orthographe d'un e-mail (Mahdi, 12/10/2026) : le composeur envoie l'objet et le
// message, STC Bâtiment les corrige par IA (la clé Anthropic est là-bas), on renvoie le résultat.
// Réservée aux comptes connectés de Baticom ; STC Bâtiment est appelé avec la clé partagée.
// Secrets : STC_BATIMENT_URL, STC_BATIMENT_ANON, PASSERELLE_CLE (déjà posés).
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

async function utilisateurConnecte(req: Request, base: string, anon: string): Promise<boolean> {
  const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
  if (!jeton) return false
  const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${jeton}` } })
  if (!r.ok) return false
  const u = await r.json().catch(() => null)
  return !!u?.id
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405)
  const base = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!
  if (!(await utilisateurConnecte(req, base, anon))) return json({ error: "Connexion requise" }, 401)

  const stc = (Deno.env.get("STC_BATIMENT_URL") || "").replace(/\/$/, ""), stcAnon = Deno.env.get("STC_BATIMENT_ANON") || "", cle = Deno.env.get("PASSERELLE_CLE") || ""
  if (!stc || !stcAnon || !cle) return json({ error: "Secrets STC_BATIMENT_URL / STC_BATIMENT_ANON / PASSERELLE_CLE manquants" }, 500)
  let corps: { objet?: string; corps?: string } = {}
  try { corps = await req.json() } catch { return json({ error: "JSON attendu" }, 400) }
  try {
    const r = await fetch(`${stc}/functions/v1/corriger-texte`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: stcAnon, Authorization: `Bearer ${stcAnon}`, "x-passerelle-cle": cle },
      body: JSON.stringify({ objet: corps.objet ?? "", corps: corps.corps ?? "" }), signal: AbortSignal.timeout(45000),
    })
    const j = await r.json().catch(() => ({})) as { ok?: boolean; objet?: string; corps?: string; error?: string }
    if (!r.ok || !j.ok) return json({ error: j.error || `STC Bâtiment répond ${r.status}` }, r.status === 401 ? 502 : r.status)
    return json({ ok: true, objet: j.objet ?? corps.objet ?? "", corps: j.corps ?? corps.corps ?? "" })
  } catch (e) {
    return json({ error: `Correction impossible : ${String(e).slice(0, 200)}` }, 502)
  }
})
