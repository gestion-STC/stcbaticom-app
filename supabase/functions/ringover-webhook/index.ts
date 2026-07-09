// Webhook Ringover — reçoit les événements d'appel poussés PAR Ringover (sonnerie
// entrante, décroché…) et les écrit dans la table « appels_entrants ». Le logiciel
// est abonné à cette table en temps réel (Supabase Realtime) : il voit l'appel
// entrant À LA SECONDE, avec le VRAI numéro (pas de masquage comme /calls/current).
//
// ⚠️ Cette fonction doit être déployée avec « Verify JWT » DÉSACTIVÉ (Ringover ne
// sait pas s'authentifier auprès de Supabase). En échange, l'URL est protégée par
// un jeton secret : Ringover doit appeler .../ringover-webhook?cle=JETON.
//
// URL à coller dans le dashboard Ringover (Développeurs → Webhooks) :
//   https://<ref-projet>.supabase.co/functions/v1/ringover-webhook?cle=stc-wh-7k2m9x4qv8

const JETON = "stc-wh-7k2m9x4qv8"

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok")
  try {
    const url = new URL(req.url)
    if (url.searchParams.get("cle") !== JETON) {
      return new Response("non autorisé", { status: 401 })
    }

    const texte = await req.text()
    // call_id > 2^53 : on l'extrait en CHAÎNE depuis le texte brut (jamais un nombre
    // sorti de JSON.parse, qui perdrait la précision).
    const callId = texte.match(/"call_id"\s*:\s*"?(\d+)/)?.[1] ?? ""
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(texte)
    } catch {
      /* payload illisible : on enregistre quand même le call_id si trouvé */
    }
    // Extraction TOLÉRANTE : selon l'événement, Ringover met les champs à la racine
    // ou sous « data ». On garde aussi le payload complet (brut) pour diagnostiquer.
    // deno-lint-ignore no-explicit-any
    const racine = data as any
    const d = racine?.data && typeof racine.data === "object" ? racine.data : racine
    const ligne = {
      call_id: callId,
      evenement: String(racine?.event ?? racine?.type ?? d?.event ?? d?.status ?? ""),
      de: String(d?.from_number ?? d?.from ?? ""),
      vers: String(d?.to_number ?? d?.to ?? ""),
      direction: String(d?.direction ?? ""),
      brut: data,
    }

    // Écrit dans la table via l'API interne (identifiants fournis automatiquement
    // par Supabase aux fonctions Edge — rien à configurer).
    const supaUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const entetes = { apikey: srk, Authorization: "Bearer " + srk, "Content-Type": "application/json" }
    const ins = await fetch(supaUrl + "/rest/v1/appels_entrants", {
      method: "POST",
      headers: { ...entetes, Prefer: "return=minimal" },
      body: JSON.stringify(ligne),
    })
    if (!ins.ok) {
      return new Response(JSON.stringify({ error: "insertion refusée", detail: await ins.text() }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }
    // Ménage : on efface les événements de plus de 7 jours (la table reste petite).
    const limite = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    await fetch(supaUrl + "/rest/v1/appels_entrants?cree_le=lt." + encodeURIComponent(limite), {
      method: "DELETE",
      headers: entetes,
    }).catch(() => {})

    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: "Erreur webhook : " + String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
