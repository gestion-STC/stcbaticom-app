// LES RETOURS D'INSTANTLY (09/11/2026). Déployée SANS vérification de JWT : Instantly prouve qui il est par l'en-tête
// x-baticom-cle, posé par notre branchement à l'installation.
//   · email_sent       → le mail est rangé sur la fiche ;
//   · email_opened     → ouverture dans la campagne ;
//   · reply_received   → la réponse arrive dans la boîte de réception (les déclencheurs posent l'événement et le lead) ;
//   · email_bounced    → rebond, l'adresse n'est plus utilisée ;
//   · lead_unsubscribed → désinscription, définitive.
// Les contacts de test sont ignorés. Un événement sans nos variables ne vient pas du moteur : ignoré aussi.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cleRetours } from "../_shared/campagnes/instantly.ts"
import { trierReponse } from "../_shared/campagnes/generationIA.ts"

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })
type Corps = Record<string, unknown>

// Même règle que recevoir-email : « stop » dans une réponse vaut désinscription, sauf réponse automatique.
function demandeArret(objet: string, corps: string): boolean {
  const t = `${objet}\n${corps.slice(0, 400)}`.toLowerCase()
  if (/r[ée]ponse automatique|automatic reply|out of office|absent|absence du bureau|en cong[ée]s/.test(t)) return false
  return /d[ée]sinscri|d[ée]sabonn|unsubscribe|ne plus (me |nous )?(contacter|recevoir|[ée]crire|solliciter|envoyer)|retirez[- ]moi|supprimez[- ]moi|\bstop\b/.test(t)
}

async function dernierEnvoi(sb: SupabaseClient, campagneId: string, contact: string): Promise<string | null> {
  const { data } = await sb.from("cmp_envois").select("id").eq("campagne_id", campagneId).eq("contact_ref", contact).eq("statut", "envoye").order("le", { ascending: false }).limit(1)
  return (data?.[0] as { id?: string } | undefined)?.id ?? null
}
async function dejaRange(sb: SupabaseClient, sens: string, messageId: string): Promise<boolean> {
  const { count } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("sens", sens).eq("message_id", messageId)
  return (count ?? 0) > 0
}
async function desinscrire(sb: SupabaseClient, base: string, contact: string, email: string, canal: string, le: string) {
  if (base === "artisans") {
    await sb.from("st_sous_traitants").update({ statut: "desinscrit", desinscrit_le: le, desinscrit_canal: canal, statut_motif: "désinscription via Instantly" }).eq("id", contact)
    if (email) await sb.from("st_exclusions").upsert({ email, telephone: null, motif: "désinscription via Instantly" }, { onConflict: "email", ignoreDuplicates: true })
  } else await sb.from("agences").update({ ne_plus_ecrire_le: le }).eq("id", contact)
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405)
  const cle = Deno.env.get("INSTANTLY_API_KEY") ?? ""
  if (!cle || req.headers.get("x-baticom-cle") !== await cleRetours(cle)) return json({ error: "non autorisé" }, 401)
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  try {
    const b = await req.json().catch(() => ({})) as Corps
    const type = String(b.event_type ?? ""), contact = String(b.bt_contact ?? ""), campagneId = String(b.bt_campagne ?? ""), baseId = String(b.bt_base ?? "")
    if (!contact || !campagneId || b.bt_test === "1") return json({ ok: true, ignore: true })
    const le = String(b.timestamp ?? new Date().toISOString()), email = String(b.lead_email ?? ""), messageId = String(b.email_id ?? "")
    const artisan = baseId === "artisans"
    const lien = artisan ? { sous_traitant_id: contact, espace: "recrutement" } : { agence_id: contact, espace: "demarchage" }
    const evenement = async (t: string) => {
      const { error } = await sb.from("cmp_evenements").insert({ campagne_id: campagneId, envoi_id: await dernierEnvoi(sb, campagneId, contact), contact_ref: contact, type: t, le })
      if (error) throw new Error(error.message)
    }

    if (type === "email_sent" && messageId && !(await dejaRange(sb, "sortant", messageId))) {
      const { error } = await sb.from("messages").insert({ sens: "sortant", de: String(b.email_account ?? ""), a: email, objet: String(b.email_subject ?? ""), corps_text: String(b.email_text ?? ""), corps_html: String(b.email_html ?? ""), message_id: messageId, lu: true, ...lien })
      if (error) throw new Error(error.message)
      const envoi = await dernierEnvoi(sb, campagneId, contact)
      if (envoi) await sb.from("cmp_envois").update({ fournisseur_id: messageId }).eq("id", envoi)
    } else if (type === "email_opened") await evenement("ouvert")
    else if (type === "email_bounced") {
      await evenement("rebond")
      if (artisan) await sb.from("st_sous_traitants").update({ email_invalide: true }).eq("id", contact)
    } else if (type === "lead_unsubscribed") {
      await evenement("desinscription")
      await desinscrire(sb, baseId, contact, email, "instantly", le)
    } else if (type === "reply_received" && messageId && !(await dejaRange(sb, "entrant", messageId))) {
      const objet = String(b.reply_subject ?? ""), texte = String(b.reply_text ?? "")
      const tri = await trierReponse(objet, texte)
      const { error } = await sb.from("messages").insert({ sens: "entrant", de: email, a: String(b.email_account ?? ""), objet, corps_text: texte, corps_html: String(b.reply_html ?? ""), message_id: messageId, lu: false, brut: b, tri, ...lien })
      if (error) throw new Error(error.message)
      if (demandeArret(objet, texte)) await desinscrire(sb, baseId, contact, email, "reponse_email", le)
    }
    return json({ ok: true })
  } catch (e) {
    console.error("[INSTANTLY-EVENEMENTS]", e)
    return json({ error: "erreur de traitement" }, 500)
  }
})
