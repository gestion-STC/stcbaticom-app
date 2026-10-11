// STC Bâtiment prévient STC Baticom qu'un sous-traitant a ouvert son accès (11/10/2026).
// Appelée par la fonction `acces-partenaire` de STC Bâtiment avec la clé partagée (`?cle=`).
// Déployée SANS vérification de JWT (l'appel vient d'un autre projet), d'où la clé.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405)
  const cle = Deno.env.get("PASSERELLE_CLE") || ""
  if (!cle || new URL(req.url).searchParams.get("cle") !== cle) return json({ error: "clé absente ou fausse" }, 401)
  let corps: { baticom_st_id?: string | null; email?: string; user_id?: string; sous_traitant_id?: string; ouvert_le?: string } = {}
  try { corps = await req.json() } catch { return json({ error: "JSON attendu" }, 400) }
  if (!corps.baticom_st_id) return json({ ok: true, ignore: "sans fiche" })
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const { error } = await sb.from("st_sous_traitants").update({ acces_ouvert_le: corps.ouvert_le || new Date().toISOString(), acces_email: corps.email || "" }).eq("id", corps.baticom_st_id)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
})
