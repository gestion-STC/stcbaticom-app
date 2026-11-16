// Relais SMS — envoie un SMS par Twilio (Mahdi, 16/11/2026 : « à l'envoi, c'est STC Bâtiment et pas un numéro »).
//
// Ringover refusait l'envoi de SMS par l'API depuis le 19/10/2026 (403 « insufficient permissions »,
// droit SMS absent des clés). Les APPELS restent sur Ringover ; seuls les SMS passent par Twilio,
// comme dans STC Bâtiment (mêmes réglages, même nom d'expéditeur).
//
// Tous les SMS de Baticom passent ici : campagnes (campagnes-moteur), recrutement (sequenceur-st),
// boutons d'essai. La réponse garde la même forme : { ok: true } ou { error, code? }.
//
// Secrets nécessaires (projet STCBATICOM) : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM
// (le nom d'expéditeur, 11 caractères au plus, ou un numéro Twilio en +33…).
import { estServeur, jetonDe, membre } from "../_shared/acces.ts"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function reponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  })
}

// Normalise un numéro FR en chiffres internationaux (0698… -> 3369…). Chaîne vide si rien.
function normaliser(n: string): string {
  let d = String(n || "").replace(/\D/g, "")
  if (d.startsWith("00")) d = d.slice(2)
  if (d.length === 12 && d.startsWith("330")) d = "33" + d.slice(3)
  else if (d.length === 10 && d.startsWith("0")) d = "33" + d.slice(1)
  return d
}
const numeroOk = (d: string) => d.length >= 10 && d.length <= 15

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return reponse({ error: "POST attendu" }, 405)

  // Sécurité (16/11/2026) : seuls un membre de l'équipe ou le serveur envoient un SMS à nos frais.
  const jetonAppel = jetonDe(req)
  const serveur = await estServeur(jetonAppel)
  const appelant = serveur ? null : await membre(jetonAppel)
  if (!serveur && !appelant) return reponse({ error: "non autorisé" }, 401)

  try {
    const corps = await req.json()

    const sid = Deno.env.get("TWILIO_ACCOUNT_SID")
    const jeton = Deno.env.get("TWILIO_AUTH_TOKEN")
    const expediteur = (Deno.env.get("TWILIO_SMS_FROM") || "").trim()
    if (!sid || !jeton || !expediteur) {
      return reponse({ error: "Twilio non configuré (secrets TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM)." }, 500)
    }

    const to = corps?.to
    const message = typeof corps?.message === "string" ? corps.message : ""
    if (!to) return reponse({ error: "Destinataire (to) manquant." }, 400)
    if (!message.trim()) return reponse({ error: "Message SMS vide." }, 400)

    const dTo = normaliser(to)
    if (!numeroOk(dTo)) return reponse({ error: "Numéro du destinataire invalide (après normalisation)." }, 400)

    // GARDE-FOU (demande Mahdi 05/08/2026) : SMS uniquement vers les MOBILES
    // français (06/07 → 336/337). Un fixe ne recevra jamais le SMS mais l'envoi
    // serait facturé → refus propre, code "non_mobile", AVANT d'appeler Twilio.
    if (dTo.startsWith("33") && !/^33[67]\d{8}$/.test(dTo)) {
      return reponse({ error: "Numéro non mobile (fixe 01-05/09) — SMS non envoyé pour ne pas consommer un envoi perdu.", code: "non_mobile" }, 400)
    }

    const form = new URLSearchParams()
    form.append("To", "+" + dTo)
    form.append("From", expediteur)
    form.append("Body", message)

    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${sid}:${jeton}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    })

    const data = await r.json().catch(() => ({})) as { sid?: string; message?: string; code?: number }
    if (r.status === 429) return reponse({ error: "Trop de SMS rapprochés — patiente puis réessaie." }, 429)
    if (!r.ok) return reponse({ error: `Twilio a refusé le SMS (code ${data.code ?? r.status}) : ${data.message ?? ""}`.trim() }, 502)

    return reponse({ ok: true, sid: data.sid })
  } catch (e) {
    return reponse({ error: "Erreur du relais SMS : " + String(e) }, 500)
  }
})
