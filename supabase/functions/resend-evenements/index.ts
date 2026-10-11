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
// signature à poser dans les secrets Supabase. Ré-exécutable : si un webhook
// pointe déjà sur cette fonction, il est réutilisé, pas dupliqué.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const EVENEMENTS = ["email.delivered", "email.opened", "email.bounced", "email.complained"]
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })

// La clé serveur est-elle celle qui frappe ? Soit elle est identique à celle de
// l'environnement, soit c'est un JWT de rôle service_role que la base accepte
// (la signature est vérifiée par PostgREST, pas par nous).
async function estCleServeur(jeton: string, base: string, service: string): Promise<boolean> {
  if (!jeton) return false
  if (jeton === service) return true
  try {
    const payload = JSON.parse(atob(jeton.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    if (payload?.role !== "service_role") return false
    const r = await fetch(`${base}/rest/v1/st_pilotage?select=id&limit=1`, { headers: { apikey: jeton, Authorization: `Bearer ${jeton}` } })
    return r.ok
  } catch {
    return false
  }
}

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
    if (!(await estCleServeur(jeton, base, service))) return json({ error: "réservé au serveur" }, 403)
    const cle = Deno.env.get("RESEND_API_KEY")
    if (!cle) return json({ error: "RESEND_API_KEY manquante" }, 500)
    const endpoint = `${base}/functions/v1/resend-evenements`
    const entetes = { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" }
    // Déjà installé ? On réutilise plutôt que de doubler.
    const liste = await fetch("https://api.resend.com/webhooks", { headers: entetes })
    const existants: { id?: string; endpoint?: string }[] = liste.ok ? ((await liste.json())?.data ?? []) : []
    const deja = existants.find((w) => w.endpoint === endpoint)
    let id = deja?.id ?? ""
    let cree = false
    if (!id) {
      const r = await fetch("https://api.resend.com/webhooks", { method: "POST", headers: entetes, body: JSON.stringify({ endpoint, events: EVENEMENTS }) })
      const corpsR = await r.json().catch(() => ({}))
      if (!r.ok) return json({ ok: false, status: r.status, reponse: corpsR, endpoint }, 502)
      id = corpsR.id ?? ""
      cree = true
    }
    // Le secret de signature (whsec_…) vient de la fiche du webhook.
    const fiche = id ? await fetch(`https://api.resend.com/webhooks/${id}`, { headers: entetes }) : null
    const detail = fiche?.ok ? await fiche.json() : {}
    return json({ ok: true, cree, id, endpoint, events: detail?.events ?? EVENEMENTS, status: detail?.status ?? "", signing_secret: detail?.signing_secret ?? "" })
  }

  // ── Les domaines du compte et leur suivi (ouvertures, clics), lus chez Resend — réservé au serveur ──
  if (req.method === "GET" && url.searchParams.get("action") === "domaines") {
    const jeton = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim()
    if (!(await estCleServeur(jeton, base, service))) return json({ error: "réservé au serveur" }, 403)
    const cle = Deno.env.get("RESEND_API_KEY")
    if (!cle) return json({ error: "RESEND_API_KEY manquante" }, 500)
    const entetes = { Authorization: "Bearer " + cle }
    const liste = await fetch("https://api.resend.com/domains", { headers: entetes })
    const doms: { id: string; name: string }[] = liste.ok ? ((await liste.json())?.data ?? []) : []
    const domaines = []
    for (const d of doms) {
      const r = await fetch("https://api.resend.com/domains/" + d.id, { headers: entetes })
      const j = r.ok ? await r.json() : {}
      domaines.push({ id: d.id, name: d.name, status: j.status ?? null, open_tracking: j.open_tracking ?? null, click_tracking: j.click_tracking ?? null, champs: Object.keys(j) })
    }
    return json({ ok: true, domaines })
  }
  // ── Régler le suivi d'UN domaine chez Resend — réservé au serveur. Resend n'applique open_tracking qu'une fois un
  // sous-domaine de suivi (tracking_subdomain) posé en DNS et vérifié ; on renvoie donc l'état et les enregistrements DNS.
  // Jamais le click_tracking : il réécrirait tous les liens, nos clics sont suivis par liens_suivis.
  // GET ?action=maj_domaine&domaine=crm.stcbatiment.fr[&sous_domaine=liens.crm.stcbatiment.fr][&ouvertures=1]
  if (req.method === "GET" && url.searchParams.get("action") === "maj_domaine") {
    const jeton = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim()
    if (!(await estCleServeur(jeton, base, service))) return json({ error: "réservé au serveur" }, 403)
    const cle = Deno.env.get("RESEND_API_KEY")
    if (!cle) return json({ error: "RESEND_API_KEY manquante" }, 500)
    const nom = url.searchParams.get("domaine") || ""
    const entetes = { Authorization: "Bearer " + cle, "Content-Type": "application/json" }
    const liste = await fetch("https://api.resend.com/domains", { headers: entetes })
    const doms: { id: string; name: string }[] = liste.ok ? ((await liste.json())?.data ?? []) : []
    const d = doms.find((x) => x.name === nom)
    if (!d) return json({ error: "domaine inconnu chez Resend : " + nom }, 404)
    const maj: Record<string, unknown> = {}
    const sous = url.searchParams.get("sous_domaine")
    if (sous) maj.tracking_subdomain = sous
    if (url.searchParams.get("ouvertures") === "1") maj.open_tracking = true
    let patch: unknown = null
    if (Object.keys(maj).length) {
      const r = await fetch("https://api.resend.com/domains/" + d.id, { method: "PATCH", headers: entetes, body: JSON.stringify(maj) })
      patch = { status: r.status, reponse: await r.json().catch(() => ({})) }
    }
    let verif: unknown = null
    if (url.searchParams.get("verifier") === "1") {
      const r = await fetch("https://api.resend.com/domains/" + d.id + "/verify", { method: "POST", headers: entetes })
      verif = { status: r.status, reponse: await r.json().catch(() => ({})) }
    }
    const det = await fetch("https://api.resend.com/domains/" + d.id, { headers: entetes })
    const j = det.ok ? await det.json() : {}
    return json({ ok: true, domaine: nom, patch, verif, open_tracking: j.open_tracking ?? null, click_tracking: j.click_tracking ?? null, tracking_subdomain: j.tracking_subdomain ?? null, records: j.records ?? [] })
  }
  // ── Le sort d'e-mails envoyés (délivré, rebondi…), lu chez Resend ──
  // GET ?action=statut&id=<id resend>,<id resend>… avec la clé serveur.
  if (req.method === "GET" && url.searchParams.get("action") === "statut") {
    const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
    if (!(await estCleServeur(jeton, base, service))) return json({ error: "réservé au serveur" }, 403)
    const cle = Deno.env.get("RESEND_API_KEY")
    if (!cle) return json({ error: "RESEND_API_KEY manquante" }, 500)
    const ids = (url.searchParams.get("id") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20)
    const resultats = []
    for (const id of ids) {
      const r = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${cle}` } })
      const d = r.ok ? await r.json().catch(() => null) : null
      resultats.push({ id, ok: r.ok, status: r.status, dernier_evenement: d?.last_event ?? null, a: d?.to ?? null, envoye_le: d?.created_at ?? null })
    }
    return json({ ok: true, resultats })
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
    // Recrutement : l'envoi journalisé (st_envois) ; démarchage : le message de la boîte (plus bas).
    let stId: string | null = envoi?.sous_traitant_id ?? null
    if (!stId && !envoi && destinataire) {
      const { data: st } = await sb.from("st_sous_traitants").select("id").ilike("email", destinataire).limit(1).maybeSingle()
      stId = st?.id ?? null
    }
    // ── Démarchage (11/10/2026) : un e-mail envoyé depuis une fiche agence (messages.message_id = identifiant Resend).
    // Ouvert → signal « E-mail ouvert » sur la fiche ; rebondi → note « adresse injoignable ». Un seul signal par
    // message et par type (Resend prévient à chaque ouverture).
    if (!envoi && resendId && (type === "email.opened" || type === "email.bounced")) {
      const { data: m } = await sb.from("messages").select("id, agence_id, objet").eq("message_id", resendId).eq("espace", "demarchage").maybeSingle()
      if (m) {
        let agenceId: string | null = (m.agence_id as string | null) ?? null
        if (!agenceId && destinataire) {
          const { data: c } = await sb.from("contacts").select("agence_id").ilike("email", destinataire).limit(1).maybeSingle()
          agenceId = (c?.agence_id as string | null) ?? null
          if (!agenceId) {
            const { data: a } = await sb.from("agences").select("id").ilike("email", "%" + destinataire + "%").limit(1).maybeSingle()
            agenceId = (a?.id as string | null) ?? null
          }
        }
        if (!agenceId) return json({ ok: true, ignore: "message de démarchage sans agence" })
        const titre = type === "email.opened" ? "E-mail ouvert" : "E-mail rebondi (adresse injoignable)"
        const { data: deja } = await sb.from("activites").select("id").eq("message_id", m.id).eq("titre", titre).limit(1).maybeSingle()
        if (!deja) {
          const note = String(m.objet || "") + (type === "email.bounced" ? " · " + String(d.bounce?.message || d.bounce?.subType || "") : "")
          await sb.from("activites").insert({ agence_id: agenceId, type: "note", titre, note: note.trim(), date: quand, compte_nom: "Resend", source: "site", message_id: m.id })
          if (type === "email.opened") await sb.from("agences").update({ dernier_signal_le: quand, dernier_signal: "E-mail ouvert" }).eq("id", agenceId)
        }
        return json({ ok: true, type, demarchage: true, agence_id: agenceId })
      }
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
