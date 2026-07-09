// Relais sécurisé « Resend » — envoie un email via l'API Resend.
//
// Pourquoi un relais ? La clé API Resend est SECRÈTE : si elle était dans le logiciel
// (navigateur), n'importe qui pourrait envoyer des emails à ta place. Elle vit donc ici,
// côté serveur, dans un secret Supabase (RESEND_API_KEY). Le logiciel appelle cette
// fonction ; la fonction, elle, parle à Resend avec la clé.
//
// Secrets à configurer dans Supabase → Edge Functions → Secrets :
//   • RESEND_API_KEY = ta clé API Resend (obligatoire)
//   • RESEND_FROM    = expéditeur, ex. « STC Bâtiment <service-travaux@stcbatiment.fr> »
//                      (doit être sur un domaine VÉRIFIÉ dans Resend ; à défaut, l'envoi
//                       n'est possible que vers ta propre adresse via onboarding@resend.dev)

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  try {
    const corps = await req.json()

    const cle = Deno.env.get("RESEND_API_KEY")
    if (!cle) return reponse({ error: "Clé Resend non configurée (secret RESEND_API_KEY)." }, 500)

    // Expéditeur imposé côté serveur (le navigateur ne peut pas usurper l'adresse d'envoi).
    // Repli sur l'adresse de test Resend tant que le domaine n'est pas vérifié.
    const from = Deno.env.get("RESEND_FROM") || "STC Bâtiment <onboarding@resend.dev>"

    const to = corps?.to
    const subject = typeof corps?.subject === "string" ? corps.subject : ""
    const html = typeof corps?.html === "string" ? corps.html : ""
    if (!to || (Array.isArray(to) && to.length === 0)) {
      return reponse({ error: "Destinataire (to) manquant." }, 400)
    }
    if (!subject && !html) return reponse({ error: "Email vide (ni objet ni contenu)." }, 400)

    const payload: Record<string, unknown> = {
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }
    // reply_to facultatif (par défaut, les réponses reviennent sur l'adresse « from »).
    if (typeof corps?.reply_to === "string" && corps.reply_to) payload.reply_to = corps.reply_to

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + cle, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const texte = await r.text()
    if (r.status === 429) {
      return reponse({ error: "Trop d'envois rapprochés — patiente quelques secondes puis réessaie." }, 429)
    }
    if (!r.ok) {
      // Resend renvoie un message d'erreur clair (ex. domaine non vérifié) → on le remonte.
      let detail = texte
      try {
        const j = JSON.parse(texte)
        detail = j?.message || j?.error || texte
      } catch {
        /* on garde le texte brut */
      }
      return reponse({ error: `Resend a refusé l'envoi (code ${r.status}).`, detail }, 502)
    }

    // Succès : Resend renvoie { id: "..." }.
    let id = ""
    try {
      id = JSON.parse(texte)?.id ?? ""
    } catch {
      /* pas grave */
    }
    return reponse({ ok: true, id })
  } catch (e) {
    return reponse({ error: "Erreur du relais email : " + String(e) }, 500)
  }
})
