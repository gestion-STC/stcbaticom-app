// LINKEDIN (Mahdi, 11/11/2026) : le compte LinkedIn d'Horlann, branché par Unipile.
//  · l'écran (admin) : « lien » ouvre la page Unipile où le titulaire se connecte lui-même (aucun mot de passe ne passe
//    par Baticom) ; « etat » dit si le compte est bien branché ;
//  · l'écran (équipe) : « repondre » répond dans la conversation LinkedIn, depuis la boîte de réception ;
//  · Unipile (en-tête x-baticom-cle) : un message reçu arrive dans la boîte de réception, triée par l'IA comme un mail ;
//    une invitation acceptée devient l'événement « connexion » de la campagne ;
//  · Unipile, fin de connexion (?notify=…) : le compte rejoint la liste des comptes branchés.
// Déployée sans vérification de JWT : chaque entrée est vérifiée ici.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { jetonDe, membre } from "../_shared/acces.ts"
import { appelUnipile, cleWebhookLinkedIn, comptesLinkedIn, unipileBranche } from "../_shared/campagnes/unipile.ts"
import { identifiantLinkedIn } from "../_shared/campagnes/linkedin.ts"
import { lireReponse } from "../_shared/campagnes/generationIA.ts"

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } })
const ADRESSE_APP = "https://gestion-stc.github.io/stcbaticom-app/"

/** Le dernier envoi LinkedIn vers ce profil (l'identifiant interne est gardé dans fournisseur_id : « profil|id »). */
async function dernierEnvoi(sb: SupabaseClient, providerId: string) {
  if (!providerId) return null
  const { data } = await sb.from("cmp_envois").select("id, campagne_id, contact_ref").eq("canal", "linkedin").like("fournisseur_id", `${providerId}|%`).order("le", { ascending: false }).limit(1)
  return (data?.[0] ?? null) as { id: string; campagne_id: string; contact_ref: string } | null
}

async function lesWebhooks(sb: SupabaseClient, url: string) {
  const { data } = await sb.from("parametres").select("valeur").eq("cle", "linkedin_webhooks").maybeSingle()
  if ((data as { valeur?: string } | null)?.valeur) return
  const cle = await cleWebhookLinkedIn()
  const entetes = [{ key: "Content-Type", value: "application/json" }, { key: "x-baticom-cle", value: cle }]
  const m = await appelUnipile("/api/v1/webhooks", { json: { request_url: url, source: "messaging", name: "Baticom · messages LinkedIn", headers: entetes } })
  const u = await appelUnipile("/api/v1/webhooks", { json: { request_url: url, source: "users", name: "Baticom · invitations acceptées", headers: entetes } })
  if (m.ok && u.ok) await sb.from("parametres").upsert({ cle: "linkedin_webhooks", valeur: JSON.stringify({ messages: m.data.webhook_id ?? m.data.id ?? "", relations: u.data.webhook_id ?? u.data.id ?? "" }) }, { onConflict: "cle" })
  else console.error("[LINKEDIN] webhooks", m.status, m.type, u.status, u.type)
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405)
  const base = Deno.env.get("SUPABASE_URL")!
  const sb = createClient(base, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const url = new URL(req.url)
  const moi = `${base}/functions/v1/linkedin`
  try {
    // ── Unipile : la connexion d'un compte vient d'aboutir ──
    if (url.searchParams.has("notify")) {
      if (!unipileBranche() || url.searchParams.get("notify") !== (await cleWebhookLinkedIn())) return json({ error: "non autorisé" }, 401)
      const b = await req.json().catch(() => ({})) as { status?: string; account_id?: string; name?: string }
      if (!b.account_id || !/CREATION_SUCCESS|RECONNECTED/.test(String(b.status ?? ""))) return json({ ok: true })
      const a = await appelUnipile(`/api/v1/accounts/${encodeURIComponent(b.account_id)}`)
      const nom = String((a.data as { name?: string }).name ?? "Compte LinkedIn")
      const comptes = (await comptesLinkedIn(sb)).filter((x) => x.id !== b.account_id)
      comptes.push({ id: b.account_id, nom, branche_le: new Date().toISOString() })
      await sb.from("parametres").upsert({ cle: "linkedin_comptes", valeur: JSON.stringify(comptes) }, { onConflict: "cle" })
      await lesWebhooks(sb, moi)
      return json({ ok: true })
    }

    // ── Unipile : un message reçu, une invitation acceptée ──
    if (req.headers.get("x-baticom-cle")) {
      if (!unipileBranche() || req.headers.get("x-baticom-cle") !== (await cleWebhookLinkedIn())) return json({ error: "non autorisé" }, 401)
      const p = await req.json().catch(() => ({})) as Record<string, any>
      if (p.event === "new_relation") {
        const e = await dernierEnvoi(sb, String(p.user_provider_id ?? ""))
        if (e) {
          const { count } = await sb.from("cmp_evenements").select("id", { count: "exact", head: true }).eq("envoi_id", e.id).eq("type", "connexion")
          if (!count) await sb.from("cmp_evenements").insert({ campagne_id: e.campagne_id, envoi_id: e.id, contact_ref: e.contact_ref, type: "connexion", le: new Date().toISOString() })
        }
        return json({ ok: true })
      }
      if (p.event !== "message_received") return json({ ok: true, ignore: p.event })
      const envoyeur = String(p.sender?.attendee_provider_id ?? "")
      if (!envoyeur || envoyeur === String(p.account_info?.user_id ?? "")) return json({ ok: true, ignore: "envoyé par nous" })
      const { count: deja } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("message_id", `linkedin:${p.message_id}`)
      if (deja) return json({ ok: true, ignore: "déjà reçu" })
      // Qui écrit : le contact de la campagne (par l'envoi), sinon un contact dont la fiche porte ce profil.
      const e = await dernierEnvoi(sb, envoyeur)
      let baseId = ""
      if (e) { const { data } = await sb.from("cmp_campagnes").select("base_id").eq("id", e.campagne_id).maybeSingle(); baseId = String((data as { base_id?: string } | null)?.base_id ?? "") }
      const profil = String(p.sender?.attendee_profile_url ?? "")
      const ident = identifiantLinkedIn(profil)
      type Fiche = { id: string; agence_id: string }
      let contact: Fiche | null = null
      if (ident) { const { data } = await sb.from("contacts").select("id, agence_id").ilike("linkedin", `%${ident}%`).limit(1); contact = (data?.[0] as Fiche | undefined) ?? null }
      const artisan = baseId === "artisans"
      const agenceId = artisan ? null : (e?.contact_ref ?? contact?.agence_id ?? null)
      const nom = String(p.sender?.attendee_name ?? "Contact LinkedIn")
      const objet = `Message LinkedIn de ${nom}`
      const texte = String(p.message ?? "")
      const lu = artisan ? { tri: null, detail: null } : await lireReponse(objet, texte)
      const { error } = await sb.from("messages").insert({
        sens: "entrant", de: profil || `LinkedIn · ${nom}`, a: "LinkedIn", objet, corps_text: texte, corps_html: "", message_id: `linkedin:${p.message_id}`,
        espace: artisan ? "recrutement" : "demarchage", agence_id: agenceId, sous_traitant_id: artisan ? e?.contact_ref ?? null : null, contact_id: contact?.id ?? null,
        lu: false, brut: { linkedin: true, chat_id: p.chat_id, account_id: p.account_id, message_id: p.message_id, nom }, tri: lu.tri, tri_detail: lu.detail,
      })
      if (error) throw new Error(error.message)
      return json({ ok: true })
    }

    // ── L'écran ──
    const qui = await membre(jetonDe(req))
    if (!qui) return json({ error: "Connexion requise." }, 401)
    const b = await req.json().catch(() => ({})) as { action?: string; message?: string; corps?: string }
    if (b.action === "repondre") {
      const corps = String(b.corps ?? "").trim()
      if (!b.message || !corps) return json({ error: "Message vide." }, 400)
      if (!unipileBranche()) return json({ error: "LinkedIn n'est pas branché." }, 400)
      const { data: m } = await sb.from("messages").select("de, espace, agence_id, sous_traitant_id, contact_id, brut").eq("id", b.message).maybeSingle()
      const brut = (m as { brut?: { chat_id?: string; account_id?: string; nom?: string } } | null)?.brut
      if (!m || !brut?.chat_id) return json({ error: "Ce message ne vient pas de LinkedIn." }, 400)
      const r = await appelUnipile(`/api/v1/chats/${encodeURIComponent(brut.chat_id)}/messages`, { form: { text: corps } })
      if (!r.ok) return json({ error: `LinkedIn a refusé la réponse (${r.status}) ${r.type}` }, 502)
      const x = m as { de: string; espace: string; agence_id: string | null; sous_traitant_id: string | null; contact_id: string | null }
      await sb.from("messages").insert({ sens: "sortant", de: "LinkedIn", a: x.de, objet: `Réponse LinkedIn à ${brut.nom ?? ""}`.trim(), corps_text: corps, corps_html: "", message_id: `linkedin:${String(r.data.message_id ?? crypto.randomUUID())}`, espace: x.espace, agence_id: x.agence_id, sous_traitant_id: x.sous_traitant_id, contact_id: x.contact_id, lu: true, brut: { linkedin: true, chat_id: brut.chat_id, account_id: brut.account_id, nom: brut.nom } })
      return json({ ok: true })
    }
    if (qui.role !== "admin") return json({ error: "Réservé aux administrateurs." }, 403)
    if (!unipileBranche()) return json({ branche: false, comptes: [] })
    if (b.action === "lien") {
      const cle = await cleWebhookLinkedIn()
      const r = await appelUnipile("/api/v1/hosted/accounts/link", { json: {
        type: "create", providers: ["LINKEDIN"], api_url: `https://${(Deno.env.get("UNIPILE_DSN") ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "")}`,
        expiresOn: new Date(Date.now() + 3_600_000).toISOString(), name: qui.id, notify_url: `${moi}?notify=${cle}`, success_redirect_url: ADRESSE_APP,
      } })
      if (!r.ok) return json({ error: `Unipile a refusé (${r.status}) ${r.type}` }, 502)
      return json({ url: String(r.data.url ?? "") })
    }
    // « etat » : les comptes branchés, avec leur état du moment chez Unipile.
    const comptes = await comptesLinkedIn(sb)
    const etats = await Promise.all(comptes.map(async (c) => {
      const a = await appelUnipile(`/api/v1/accounts/${encodeURIComponent(c.id)}`)
      const src = (a.data as { sources?: { status?: string }[] }).sources?.[0]?.status
      return { ...c, statut: a.ok ? String(src ?? "OK") : a.status === 404 ? "SUPPRIME" : "INCONNU" }
    }))
    if (comptes.length) await lesWebhooks(sb, moi)
    return json({ branche: true, comptes: etats })
  } catch (e) {
    console.error("[LINKEDIN]", e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
