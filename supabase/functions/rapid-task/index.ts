// Relais sécurisé « Ringover » — déclenche un appel (click-to-call / callback).
//
// ⚠️ Le slug DÉPLOYÉ de cette fonction Edge est « rapid-task » (nom donné à la
// création dans Supabase, non modifiable ensuite). C'est ce nom qui est appelé
// côté client dans src/lib/ringover.ts (supabase.functions.invoke("rapid-task")).
//
// Pourquoi un relais ? La clé API Ringover ne doit JAMAIS être dans le logiciel
// (navigateur). Elle vit ici, côté serveur, dans un « secret » Supabase
// (RINGOVER_API_KEY). Le logiciel appelle cette fonction ; la fonction, elle,
// parle à Ringover avec la clé.
//
// Callback Ringover (POST /callback) : Ringover fait d'abord sonner l'appli/softphone
// de l'utilisateur (from_number, si Monitoring ON), puis quand il décroche, compose
// le prospect (to_number). device="ALL" = tous les appareils sonnent.

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

// Normalise un numéro en chiffres au format international (ex. 0698… -> 3369…, 0033… -> 33…).
// Renvoie une CHAÎNE de chiffres (vide si rien). On valide la longueur avant d'appeler.
function normaliser(n: string): string {
  let d = String(n || "").replace(/\D/g, "")
  if (d.startsWith("00")) d = d.slice(2) // préfixe international 00 → on l'enlève
  if (d.length === 12 && d.startsWith("330")) d = "33" + d.slice(3) // double préfixe « +33 0X… »
  else if (d.length === 10 && d.startsWith("0")) d = "33" + d.slice(1) // numéro FR
  return d
}
// Vrai si le nombre de chiffres est plausible pour un vrai numéro (E.164 : 10 à 15).
const numeroOk = (d: string) => d.length >= 10 && d.length <= 15

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  try {
    const corps = await req.json()

    const cle = Deno.env.get("RINGOVER_API_KEY")
    if (!cle) return reponse({ error: "Clé API Ringover non configurée (secret RINGOVER_API_KEY)." }, 500)

    // --- Action "statut" : quels appels sont EN COURS ? -----------------------
    // Sert au log à savoir quand l'utilisateur a raccroché pour enchaîner au suivant.
    // Si `callId` est fourni, on répond aussi `actif` = CET appel précis est-il en ligne ?
    // (fiable même en équipe : un compte admin voit les appels de tout le monde dans le total).
    if (corps && corps.action === "statut") {
      const s = await fetch("https://public-api.ringover.com/v2/calls/current", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: cle },
        body: "{}",
      })
      if (s.status === 204) return reponse({ total: 0, actif: false }) // aucun appel en cours
      if (s.status === 429) return reponse({ error: "Trop de requêtes vers Ringover — patiente." }, 429)
      if (!s.ok) return reponse({ error: `Statut refusé (code ${s.status}).`, detail: await s.text() }, 502)
      const texte = await s.text()
      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(texte)
      } catch {
        /* réponse illisible → total 0 */
      }
      // deno-lint-ignore no-explicit-any
      const d = data as any
      const total =
        typeof d?.total_current_calls_count === "number"
          ? d.total_current_calls_count
          : Array.isArray(d?.current_calls_list)
            ? d.current_calls_list.length
            : 0
      // Recherche du callId dans le TEXTE BRUT : les call_id dépassent la précision des
      // nombres JS, on ne les compare jamais après un JSON.parse.
      const actif = corps.callId ? texte.includes(String(corps.callId)) : total > 0
      // Appels ENTRANTS en cours (direction IN) : qui appelle, et l'état (RINGING/ANSWERED).
      const liste = Array.isArray(d?.current_calls_list) ? d.current_calls_list : []
      // deno-lint-ignore no-explicit-any
      const entrants = liste
        .filter((c: any) => String(c?.direction || "").toUpperCase() === "IN")
        // deno-lint-ignore no-explicit-any
        .map((c: any) => ({
          callId: String(c?.call_id ?? ""),
          from: String(c?.from_number ?? ""),
          to: String(c?.to_number ?? ""),
          status: String(c?.status ?? ""),
        }))
      return reponse({ total, actif, entrants })
    }

    // --- Action "detail" : comment s'est terminé un appel ? ------------------
    // Renvoie last_state (ANSWERED / FAILED / MISSED / VOICEMAIL…) + is_failed,
    // pour prévenir l'utilisateur si le numéro est injoignable / invalide.
    if (corps && corps.action === "detail" && corps.callId) {
      const d = await fetch(
        "https://public-api.ringover.com/v2/calls/" + encodeURIComponent(String(corps.callId)),
        { headers: { Authorization: cle } },
      )
      if (d.status === 404 || d.status === 204) return reponse({ trouve: false }) // pas encore dispo
      if (!d.ok) return reponse({ error: `Détail indisponible (code ${d.status}).` }, 502)
      const data = await d.json().catch(() => ({}))
      // Réponse Ringover : { list_count, list: [ { last_state, is_failed, is_answered, ... } ] }.
      const c = Array.isArray(data?.list)
        ? data.list[0]
        : data && data.last_state !== undefined
          ? data
          : data
      return reponse({
        trouve: true,
        last_state: c?.last_state ?? null,
        is_failed: c?.is_failed ?? null,
        is_answered: c?.is_answered ?? null,
        // Numéros de l'appel : le détail est souvent renseigné même quand /calls/current
        // masque l'appelant (« Unknown ») → sert à reconnaître un appel entrant.
        from: String(c?.from_number ?? ""),
        to: String(c?.to_number ?? ""),
      })
    }

    // --- Action par défaut : lancer l'appel (callback) ------------------------
    const { to, from } = corps
    if (!to) return reponse({ error: "Numéro du prospect (to) manquant." }, 400)

    // Validation : un numéro vide/non numérique donnerait to_number:0 → on refuse AVANT d'appeler.
    const dTo = normaliser(to)
    if (!numeroOk(dTo)) return reponse({ error: "Numéro du prospect invalide (après normalisation)." }, 400)

    // device (obligatoire) : "ALL" = fait sonner tous les appareils Ringover de l'utilisateur.
    // from_number (optionnel) : n'est pris en compte que si "Monitoring" est ON côté Ringover ;
    // sinon Ringover appelle depuis le numéro par défaut de l'utilisateur (ignoré silencieusement).
    const corpsAppel: Record<string, number | string> = { to_number: Number(dTo), device: "ALL" }
    const dFrom = normaliser(from || "")
    if (numeroOk(dFrom)) corpsAppel.from_number = Number(dFrom)

    const r = await fetch("https://public-api.ringover.com/v2/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: cle },
      body: JSON.stringify(corpsAppel),
    })

    const texte = await r.text()
    if (r.status === 429) {
      return reponse({ error: "Trop d'appels rapprochés — patiente quelques secondes puis réessaie." }, 429)
    }
    if (!r.ok) {
      return reponse({ error: `Ringover a refusé l'appel (code ${r.status}).`, detail: texte }, 502)
    }
    return reponse({ ok: true, ringover: texte || "callback lancé" })
  } catch (e) {
    return reponse({ error: "Erreur du relais : " + String(e) }, 500)
  }
})
