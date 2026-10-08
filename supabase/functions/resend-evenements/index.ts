// Les retours de Resend sur les e-mails ENVOYÉS (webhook) — 08/10/2026.
//
// Jusqu'ici « envoyé » voulait dire « accepté par Resend », pas « reçu » :
// les adresses mortes, les rebonds et les plaintes étaient invisibles, et la
// machine continuait de leur écrire. Ici :
//   · email.delivered → l'envoi est marqué délivré ;
//   · email.opened    → l'envoi est marqué ouvert ;
//   · email.bounced   → rebond DÉFINITIF : la fiche passe « injoignable »,
//                       l'adresse est marquée invalide et exclue ;
//   · email.complained → l'artisan a signalé l'e-mail comme indésirable :
//                       fiche « désinscrite », adresse exclue.
// L'envoi est retrouvé par son identifiant Resend (st_envois.resend_id) ; à
// défaut, la fiche par l'adresse destinataire.
//
// Signature : Resend signe chaque appel (en-têtes svix-*). Si le secret
// RESEND_WEBHOOK_SECRET est posé, un appel mal signé est refusé.
//
// Installation (une fois) : GET ?action=installer avec la clé service_role en
// Authorization crée le webhook chez Resend par l'API et renvoie le secret de
// signature à poser dans les secrets Supabase.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const EVENEMENTS = ["email.delivered", "email.opened", "email.bounced", "email.complained"]
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })

async function signatureValide(req: Request, corps: string, secret: string): Promise<boolean> {
  const id = req.headers.get("svix-id") || ""
  const ts = req.headers.get("svix-timestamp") || ""
  const sigs = (req.headers.get("svix-signature") || "").split(" ").map((s) => s.split(",")[1]).filter(Boolean)
  if (!id || !ts || sigs.length === 0) return false
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false
  const cle = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0))
  const k = await crypto.subtle.importKey("raw", cle, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${id}.${ts}.${corps}`))
  const attendu = btoa(String.fromCharCode(...new Uint8Array(sig)))
  return sigs.includes(attendu)
}

Deno.serve(async (req: Request) => {
  const base = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const url = new URL(req.url)

  // ── Installation du webhook chez Resend (réservée à la clé service_role) ──
  if (req.method === "GET" && url.searchParams.get("action") === "installer") {
    const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
    if (!jeton || jeton !== service) return json({ error: "réservé au serveur" }, 403)
    const cle = Deno.env.get("RESEND_API_KEY")
    if (!cle) return json({ error: "RESEND_API_KEY manquante" }, 500)
    const endpoint = `${base}/functions/v1/resend-evenements`
    const r = await fetch("https://api.resend.com/webhooks", {
      method: "POST",
      headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, events: EVENEMENTS }),
    })
    const texte = await r.text()
    return json({ ok: r.ok, status: r.status, reponse: texte, endpoint })
  }

  if (req.method !== "POST") return json({ error: "POST attendu" }, 405)
  try {
    const corps = await req.text()
    const secret = Deno.env.get("RESEND_WEBHOOK_SECRET")
    if (secret && !(await signatureValide(req, corps, secret))) return json({ error: "signature invalide" }, 401)

    const payload = JSON.parse(corps)
    const type = String(payload?.type || "")
    const d = payload?.data ?? {}
    if (!EVENEMENTS.includes(type)) return json({ ok: true, ignore: type })

    const sb = createClient(base, service)
    const resendId = String(d.email_id || "")
    const destinataire = String((Array.isArray(d.to) ? d.to[0] : d.to) || "").toLowerCase().trim()
    const quand = String(d.created_at || payload.created_at || new Date().toISOString())

    const { data: envoi } = resendId
      ? await sb.from("st_envois").select("id, sous_traitant_id").eq("resend_id", resendId).maybeSingle()
      : { data: null }
    // Seuls les e-mails du recrutement nous intéressent ici (ceux du démarchage n'ont pas d'envoi journalisé).
    let stId: string | null = envoi?.sous_traitant_id ?? null
    if (!stId && !envoi && destinataire) {
      const { data: st } = await sb.from("st_sous_traitants").select("id").ilike("email", destinataire).limit(1).maybeSingle()
      stId = st?.id ?? null
    }
    if (!envoi && !stId) return json({ ok: true, ignore: "hors recrutement" })

    if (type === "email.delivered" && envoi) {
      await sb.from("st_envois").update({ delivre_le: quand }).eq("id", envoi.id)
    } else if (type === "email.opened" && envoi) {
      await sb.from("st_envois").update({ ouvert_le: quand }).eq("id", envoi.id)
    } else if (type === "email.bounced" && stId) {
      const definitif = String(d.bounce?.type || "").toLowerCase() !== "transient"
      if (definitif) {
        const { data: st } = await sb.from("st_sous_traitants").select("email, statut").eq("id", stId).maybeSingle()
        const maj: Record<string, unknown> = { email_invalide: true, derniere_erreur: `rebond : ${d.bounce?.message || d.bounce?.subType || "adresse injoignable"}` }
        if (st && !["depose", "desinscrit", "exclu"].includes(st.statut)) {
          Object.assign(maj, { statut: "injoignable", injoignable_le: quand, statut_motif: "e-mail rebondi (adresse injoignable)" })
        }
        await sb.from("st_sous_traitants").update(maj).eq("id", stId)
        if (st?.email) await sb.from("st_exclusions").upsert({ email: String(st.email).toLowerCase().trim() || null, telephone: null, motif: "adresse e-mail injoignable (rebond)" }, { onConflict: "email", ignoreDuplicates: true })
      }
    } else if (type === "email.complained" && stId) {
      const { data: st } = await sb.from("st_sous_traitants").select("email, statut").eq("id", stId).maybeSingle()
      if (st && st.statut !== "desinscrit") {
        await sb.from("st_sous_traitants").update({ statut: "desinscrit", desinscrit_le: quand, desinscrit_canal: "plainte", statut_motif: "signalé comme indésirable" }).eq("id", stId)
      }
      if (st?.email) await sb.from("st_exclusions").upsert({ email: String(st.email).toLowerCase().trim() || null, telephone: null, motif: "signalé comme indésirable" }, { onConflict: "email", ignoreDuplicates: true })
    }
    return json({ ok: true, type, envoi: envoi?.id ?? null, sous_traitant_id: stId })
  } catch (e) {
    console.error("[RESEND-EVENEMENTS]", e)
    return json({ error: String(e) }, 500)
  }
})
