// Les retours DocuSign (Connect) — 11/10/2026.
//
// DocuSign appelle cette adresse à chaque mouvement d'une enveloppe (envoyée,
// livrée, signée par l'artisan, terminée, refusée, annulée). On relit
// l'enveloppe à la source, on met `st_contrats` à jour, et quand tout est signé :
//   · le PDF signé est rangé dans le bucket `contrats/signes/<artisan>/<enveloppe>.pdf` ;
//   · il rejoint les PIÈCES du dossier déposé de l'artisan (bucket `dossiers-st`),
//     et le dossier passe « complet » (Mahdi, 11/10 : le dossier final de la personne).
// L'adresse porte une clé (`?cle=`) : sans elle, on ne traite rien.
// Déployée SANS vérification de JWT (DocuSign n'a pas notre jeton), d'où la clé.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { configDepuisEnv, hmacValide, jetonDocusign } from "../_shared/docusign.ts"
import { traiterEnveloppe } from "../_shared/contratSigne.ts"

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })

Deno.serve(async (req: Request) => {
  if (req.method === "GET") return json({ ok: true, service: "docusign-evenements" })
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405)
  const secret = Deno.env.get("DOCUSIGN_CONNECT_SECRET") || ""
  const url = new URL(req.url)
  const corpsBrut = await req.text()
  const signature = req.headers.get("x-docusign-signature-1") || ""
  const cleOk = !!secret && url.searchParams.get("cle") === secret
  const hmacOk = signature ? await hmacValide(secret, corpsBrut, signature) : false
  if (!cleOk && !hmacOk) return json({ error: "clé absente ou fausse" }, 401)

  let message: { event?: string; data?: { envelopeId?: string } } = {}
  try { message = JSON.parse(corpsBrut) } catch { return json({ error: "JSON attendu" }, 400) }
  const envelopeId = message.data?.envelopeId
  if (!envelopeId) return json({ ok: true, ignore: "pas d'enveloppe" })

  const base = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const sb = createClient(base, service)
  try {
    // Le traitement (statut, PDF, dossier, lien d'accès) est commun avec le bouton « Relire » : _shared/contratSigne.ts (lot 8).
    const config = configDepuisEnv((k) => Deno.env.get(k))
    const jeton = await jetonDocusign(config)
    const r = await traiterEnveloppe(sb, config, jeton, envelopeId, (k) => Deno.env.get(k))
    return json({ ...r, event: message.event })
  } catch (err) {
    // Une enveloppe qui n'existe pas (ou plus) chez DocuSign : rien à faire, et surtout pas de nouvel essai.
    if (/ENVELOPE_DOES_NOT_EXIST/.test(String(err))) return json({ ok: true, ignore: "enveloppe inconnue chez DocuSign" })
    console.error("[DOCUSIGN-EVENEMENTS]", err)
    await sb.from("st_contrats").update({ erreur: String(err).slice(0, 500), maj_le: new Date().toISOString() }).eq("envelope_id", envelopeId)
    return json({ error: String(err) }, 500)
  }
})
