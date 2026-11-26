// RELAIS (fusion dans STC Bâtiment) : le dépôt de dossier du site vitrine transmis à commercial-soumettre-dossier-st.
// Le site dépose les pièces dans l'espace dossiers-st de l'ANCIEN projet : on les recopie d'abord chez STC (même
// chemin), puis on transmet le dossier tel quel. Si la copie échoue, rien n'est transmis et le site affiche
// « Le serveur a refusé le dossier. Réessayez… » : l'artisan peut renvoyer, les pièces restent dans l'ancien projet.
import { cheminsDesPieces, configDepuis, copierPieces, relayer } from "../_relais/relais.ts"

const cfg = configDepuis((k) => Deno.env.get(k))
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" }

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return relayer(req, "commercial-soumettre-dossier-st", cfg)
  const corps = await req.arrayBuffer()
  const chemins = cheminsDesPieces(new TextDecoder().decode(corps))
  const echec = await copierPieces(chemins, cfg, { url: Deno.env.get("SUPABASE_URL") ?? "", cleService: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "" })
    .catch((e) => (e instanceof Error ? e.message : String(e)))
  if (echec) {
    console.error("[RELAIS commercial-soumettre-dossier-st]", echec)
    return new Response(JSON.stringify({ error: "Dépôt momentanément impossible, réessayez." }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } })
  }
  return relayer(req, "commercial-soumettre-dossier-st", cfg, corps)
})
