// LINKEDIN (Mahdi, 11/11/2026) : le compte LinkedIn d'Horlann, branché par Unipile (API v2).
//  · l'écran (admin) : « lien » ouvre la page Unipile où le titulaire se connecte lui-même (aucun mot de passe ne passe
//    par Baticom) ; « etat » liste les comptes branchés chez Unipile et pose nos webhooks ;
//  · l'écran (équipe) : « repondre » répond dans la conversation LinkedIn, depuis la boîte de réception ;
//  · Unipile (?hook=…) : un message reçu arrive dans la boîte de réception, trié par l'IA comme un mail ;
//    une invitation acceptée devient l'événement « connexion » de la campagne.
// Déployée sans vérification de JWT : chaque entrée est vérifiée ici.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { jetonDe, membre } from "../_shared/acces.ts"
import { appelUnipile, assurerWebhooks, cleWebhookLinkedIn, comptesLinkedIn, unipileBranche } from "../_shared/campagnes/unipile.ts"
import { identifiantLinkedIn } from "../_shared/campagnes/linkedin.ts"
import { lireReponse } from "../_shared/campagnes/generationIA.ts"

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-passage-cle", "Access-Control-Allow-Methods": "POST, OPTIONS" }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } })
const ADRESSE_APP = "https://gestion-stc.github.io/stcbaticom-app/"

/** Le dernier envoi LinkedIn vers ce profil (l'identifiant LinkedIn est gardé dans fournisseur_id : « profil|id »). */
async function dernierEnvoi(sb: SupabaseClient, providerId: string) {
  if (!providerId) return null
  const { data } = await sb.from("cmp_envois").select("id, campagne_id, contact_ref").eq("canal", "linkedin").like("fournisseur_id", `${providerId}|%`).order("le", { ascending: false }).limit(1)
  return (data?.[0] ?? null) as { id: string; campagne_id: string; contact_ref: string } | null
}

type Evenement = { type?: string; account_id?: string; payload?: Record<string, any> }

/** Ce qu'Unipile nous apprend : traité après la réponse (Unipile attend un 200 en moins de 5 secondes). */
async function traiter(sb: SupabaseClient, ev: Evenement): Promise<void> {
  const p = ev.payload ?? {}
  if (ev.type === "relation.new") {
    const e = await dernierEnvoi(sb, String(p.user?.id ?? p.id ?? ""))
    if (!e) return
    const { count } = await sb.from("cmp_evenements").select("id", { count: "exact", head: true }).eq("envoi_id", e.id).eq("type", "connexion")
    if (!count) await sb.from("cmp_evenements").insert({ campagne_id: e.campagne_id, envoi_id: e.id, contact_ref: e.contact_ref, type: "connexion", le: new Date().toISOString() })
    return
  }
  if (ev.type !== "message.new" || p.is_sender) return
  const envoyeur = String(p.sender_id ?? p.sender?.id ?? "")
  if (!envoyeur) return
  const { count: deja } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("message_id", `linkedin:${p.id}`)
  if (deja) return
  // Qui écrit : le contact de la campagne (par l'envoi), sinon un contact dont la fiche porte ce profil.
  const e = await dernierEnvoi(sb, envoyeur)
  let baseId = ""
  if (e) { const { data } = await sb.from("cmp_campagnes").select("base_id").eq("id", e.campagne_id).maybeSingle(); baseId = String((data as { base_id?: string } | null)?.base_id ?? "") }
  const profil = String(p.sender?.profile_url ?? "")
  const ident = String(p.sender?.public_identifier ?? "") || identifiantLinkedIn(profil)
  type Fiche = { id: string; agence_id: string }
  let contact: Fiche | null = null
  if (ident) { const { data } = await sb.from("contacts").select("id, agence_id").ilike("linkedin", `%${ident}%`).limit(1); contact = (data?.[0] as Fiche | undefined) ?? null }
  const artisan = baseId === "artisans"
  const nom = String(p.sender?.display_name ?? "Contact LinkedIn")
  const objet = `Message LinkedIn de ${nom}`
  const texte = String(p.text ?? "")
  const lu = artisan ? { tri: null, detail: null } : await lireReponse(objet, texte)
  const { error } = await sb.from("messages").insert({
    sens: "entrant", de: profil || `LinkedIn · ${nom}`, a: "LinkedIn", objet, corps_text: texte, corps_html: "", message_id: `linkedin:${p.id}`,
    espace: artisan ? "recrutement" : "demarchage", agence_id: artisan ? null : (e?.contact_ref ?? contact?.agence_id ?? null), sous_traitant_id: artisan ? e?.contact_ref ?? null : null, contact_id: contact?.id ?? null,
    lu: false, brut: { linkedin: true, chat_id: p.chat_id, account_id: ev.account_id, message_id: p.id, nom }, tri: lu.tri, tri_detail: lu.detail,
  })
  if (error) console.error("[LINKEDIN] message", error.message)
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405)
  const base = Deno.env.get("SUPABASE_URL")!
  const sb = createClient(base, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const url = new URL(req.url)
  const moi = `${base}/functions/v1/linkedin`
  try {
    // ── Unipile : un message reçu, une invitation acceptée ──
    if (url.searchParams.has("hook")) {
      if (!unipileBranche() || url.searchParams.get("hook") !== (await cleWebhookLinkedIn())) return json({ error: "non autorisé" }, 401)
      const ev = await req.json().catch(() => ({})) as Evenement
      const tache = traiter(sb, ev).catch((e) => console.error("[LINKEDIN] webhook", e))
      const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime
      if (runtime) runtime.waitUntil(tache); else await tache
      return json({ ok: true })
    }

    // ── L'écran ──
    // La clé interne (essais depuis la base) vaut un administrateur.
    let qui = await membre(jetonDe(req))
    const passage = req.headers.get("x-passage-cle") ?? ""
    if (!qui && passage) {
      const { data } = await sb.from("parametres").select("valeur").eq("cle", "analyse_passage_cle").maybeSingle()
      const attendue = String((data as { valeur?: string } | null)?.valeur ?? "")
      if (attendue.length >= 20 && passage === attendue) qui = { id: "essai", role: "admin" }
    }
    if (!qui) return json({ error: "Connexion requise." }, 401)
    const b = await req.json().catch(() => ({})) as { action?: string; message?: string; corps?: string }
    if (b.action === "repondre") {
      const corps = String(b.corps ?? "").trim()
      if (!b.message || !corps) return json({ error: "Message vide." }, 400)
      if (!unipileBranche()) return json({ error: "LinkedIn n'est pas branché." }, 400)
      const { data: m } = await sb.from("messages").select("de, espace, agence_id, sous_traitant_id, contact_id, brut").eq("id", b.message).maybeSingle()
      const brut = (m as { brut?: { chat_id?: string; account_id?: string; nom?: string } } | null)?.brut
      if (!m || !brut?.chat_id || !brut.account_id) return json({ error: "Ce message ne vient pas de LinkedIn." }, 400)
      const r = await appelUnipile(`/${encodeURIComponent(brut.account_id)}/chats/${encodeURIComponent(brut.chat_id)}/messages/send`, { json: { text: corps } })
      if (!r.ok) return json({ error: `LinkedIn a refusé la réponse (${r.status}) ${r.type}` }, 502)
      const x = m as { de: string; espace: string; agence_id: string | null; sous_traitant_id: string | null; contact_id: string | null }
      const idMessage = Array.isArray(r.data.message_id) ? r.data.message_id[0] : r.data.message_id
      await sb.from("messages").insert({ sens: "sortant", de: "LinkedIn", a: x.de, objet: `Réponse LinkedIn à ${brut.nom ?? ""}`.trim(), corps_text: corps, corps_html: "", message_id: `linkedin:${String(idMessage ?? crypto.randomUUID())}`, espace: x.espace, agence_id: x.agence_id, sous_traitant_id: x.sous_traitant_id, contact_id: x.contact_id, lu: true, brut: { linkedin: true, chat_id: brut.chat_id, account_id: brut.account_id, nom: brut.nom } })
      return json({ ok: true })
    }
    if (qui.role !== "admin") return json({ error: "Réservé aux administrateurs." }, 403)
    if (!unipileBranche()) return json({ branche: false, comptes: [] })
    if (b.action === "lien") {
      const r = await appelUnipile("/auth/link", { json: { providers: ["linkedin"], expires_on: new Date(Date.now() + 3_600_000).toISOString(), redirect_uri: ADRESSE_APP, state: qui.id } })
      const lien = String(r.data.url ?? r.data.link ?? "")
      if (!r.ok || !lien) return json({ error: `Unipile a refusé (${r.status}) ${r.type} ${String(r.data.detail ?? r.data.title ?? "").slice(0, 160)}`.trim() }, 502)
      return json({ url: lien })
    }
    // « etat » : les comptes LinkedIn branchés chez Unipile ; nos webhooks sont posés dès qu'il y en a un.
    const comptes = await comptesLinkedIn()
    if (comptes.length) await assurerWebhooks(sb, moi)
    return json({ branche: true, comptes })
  } catch (e) {
    console.error("[LINKEDIN]", e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
