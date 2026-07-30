// Relais sécurisé « Ringover SMS » — envoie un SMS via l'API Ringover.
//
// Même principe que rapid-task (appels) : la clé API Ringover reste côté serveur
// (secret RINGOVER_API_KEY), jamais dans le navigateur. Utilisée par le séquenceur
// de recrutement des sous-traitants (sequenceur-st) et testable à la main.
//
// Format CONFIRMÉ (OpenAPI Ringover) : POST /v2/push/sms, body JSON
// { from_number, to_number, content } avec les numéros en E.164 sous forme de
// CHAÎNE (« +33… »). L'API refuse les entiers ou les numéros sans « + » (« Bad body »).
//
// Secret nécessaire : RINGOVER_API_KEY (déjà en place, partagé avec rapid-task).
// Un numéro Ringover activé pour l'envoi de SMS est requis (côté compte Ringover).

const URL_SMS = "https://public-api.ringover.com/v2/push/sms" // ⚠️ à confirmer (voir en-tête)

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

  try {
    const corps = await req.json()

    const cle = Deno.env.get("RINGOVER_API_KEY")
    if (!cle) return reponse({ error: "Clé API Ringover non configurée (secret RINGOVER_API_KEY)." }, 500)

    const to = corps?.to
    const message = typeof corps?.message === "string" ? corps.message : ""
    if (!to) return reponse({ error: "Destinataire (to) manquant." }, 400)
    if (!message.trim()) return reponse({ error: "Message SMS vide." }, 400)

    const dTo = normaliser(to)
    if (!numeroOk(dTo)) return reponse({ error: "Numéro du destinataire invalide (après normalisation)." }, 400)

    // Numéro émetteur : imposé côté serveur via le secret RINGOVER_SMS_FROM si présent
    // (numéro Ringover activé pour le SMS), sinon celui fourni dans l'appel.
    const from = Deno.env.get("RINGOVER_SMS_FROM") || corps?.from || ""
    const dFrom = normaliser(String(from))

    // Format EXIGÉ par l'API Ringover (/push/sms) : numéros en E.164 (« + » + indicatif),
    // en CHAÎNE — pas en entier (sinon « Bad body »).
    const payload: Record<string, string> = { to_number: "+" + dTo, content: message }
    if (numeroOk(dFrom)) payload.from_number = "+" + dFrom

    const r = await fetch(URL_SMS, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: cle }, // clé BRUTE, pas de « Bearer »
      body: JSON.stringify(payload),
    })

    const texte = await r.text()
    if (r.status === 429) return reponse({ error: "Trop de SMS rapprochés — patiente puis réessaie." }, 429)
    if (!r.ok) return reponse({ error: `Ringover a refusé le SMS (code ${r.status}).`, detail: texte }, 502)

    return reponse({ ok: true, ringover: texte || "SMS envoyé" })
  } catch (e) {
    return reponse({ error: "Erreur du relais SMS : " + String(e) }, 500)
  }
})
