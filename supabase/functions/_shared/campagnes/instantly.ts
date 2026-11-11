// La porte vers Instantly (09/11/2026) : les mails de prospection partent par là, jamais par Resend (son règlement
// l'interdit, et le compte Resend fait tourner STC Bâtiment).
//
// Instantly n'envoie que par campagnes : chaque variante d'un mail du moteur a sa petite campagne d'un seul mail, créée
// la première fois. Ajouter un contact à cette campagne, c'est demander l'envoi. Le texte, déjà personnalisé par le
// moteur (liens signés), voyage dans les variables du contact. Baticom reste le seul à décider qui reçoit quoi et quand.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { boitePrete, boitesDe, corpsAvecMentions, horaireInstantly, type Mentions } from "./instantlyOutils.ts"

const API = "https://api.instantly.ai/api/v2"
const CLE_CARTE = "instantly_campagnes"
const CLE_ETAT = "instantly_etat"

export type Boite = { email: string; status: number; warmup_status: number; setup_pending: boolean; stat_warmup_score: number | null }
export type ContexteInstantly = { cle: string; boites: Boite[]; pretes: string[]; carte: Record<string, string> }
export type RetourInstantly = { ok: boolean; status: number; data: Record<string, unknown> }

export async function appelInstantly(cle: string, chemin: string, options: { methode?: string; corps?: unknown } = {}): Promise<RetourInstantly> {
  const avecCorps = options.corps !== undefined
  const r = await fetch(`${API}${chemin}`, { method: options.methode ?? (avecCorps ? "POST" : "GET"), headers: { Authorization: `Bearer ${cle}`, ...(avecCorps ? { "Content-Type": "application/json" } : {}) }, body: avecCorps ? JSON.stringify(options.corps) : undefined })
  const data = await r.json().catch(() => ({})) as Record<string, unknown>
  return { ok: r.ok, status: r.status, data }
}

/** La clé qui prouve qu'un retour vient bien de notre branchement : Instantly la renvoie dans un en-tête. */
export async function cleRetours(cle: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`baticom-retours:${cle}`))
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("")
}

async function lireParametre(sb: SupabaseClient, cle: string): Promise<string> {
  const { data } = await sb.from("parametres").select("valeur").eq("cle", cle).maybeSingle()
  return String((data as { valeur?: string } | null)?.valeur ?? "")
}
async function ecrireParametre(sb: SupabaseClient, cle: string, valeur: string) {
  await sb.from("parametres").upsert({ cle, valeur, maj_le: new Date().toISOString() }, { onConflict: "cle" })
}

/** Installe le retour des événements. Refusé tant que le forfait ne le permet pas : on réessaiera au passage suivant. */
async function installerRetours(base: string, cle: string): Promise<string> {
  const cible = `${base}/functions/v1/instantly-evenements`
  const liste = await appelInstantly(cle, "/webhooks?limit=100")
  if (!liste.ok) return `lecture refusée (${liste.status})`
  if (((liste.data.items ?? []) as { target_hook_url?: string }[]).some((w) => w.target_hook_url === cible)) return "installés"
  const r = await appelInstantly(cle, "/webhooks", { corps: { name: "Baticom", target_hook_url: cible, event_type: "all_events", headers: { "x-baticom-cle": await cleRetours(cle) } } })
  if (r.ok) return "installés"
  return r.status === 402 ? "forfait payant requis" : `refusés (${r.status})`
}

/** L'état du compte, relu à chaque passage et gardé en base pour pouvoir le vérifier sans ouvrir Instantly. */
export async function preparerInstantly(sb: SupabaseClient, base: string, maintenant: string): Promise<ContexteInstantly> {
  const cle = Deno.env.get("INSTANTLY_API_KEY") ?? ""
  const vide: ContexteInstantly = { cle, boites: [], pretes: [], carte: {} }
  if (!cle) return vide
  const r = await appelInstantly(cle, "/accounts?limit=100")
  if (!r.ok) {
    await ecrireParametre(sb, CLE_ETAT, JSON.stringify({ le: maintenant, erreur: `Instantly a répondu ${r.status}`, detail: String(r.data?.message ?? "").slice(0, 200) }))
    return vide
  }
  // Depuis quand chaque boîte chauffe : ce que dit Instantly, sinon la première fois qu'on l'a vue.
  let anciennes: { email?: string; depuis?: string }[] = []
  try { anciennes = (JSON.parse(await lireParametre(sb, CLE_ETAT) || "{}") as { boites?: { email?: string; depuis?: string }[] }).boites ?? [] } catch { anciennes = [] }
  const boites = ((r.data.items ?? []) as (Boite & { timestamp_warmup_start?: string | null; timestamp_created?: string | null })[]).map((b) => ({ email: b.email, status: b.status, warmup_status: b.warmup_status, setup_pending: Boolean(b.setup_pending), stat_warmup_score: b.stat_warmup_score ?? null, limite: Number((b as { daily_limit?: number }).daily_limit ?? 0) || null, depuis: b.timestamp_warmup_start ?? b.timestamp_created ?? anciennes.find((x) => x.email === b.email)?.depuis ?? maintenant }))
  const retours = await installerRetours(base, cle)
  await ecrireParametre(sb, CLE_ETAT, JSON.stringify({ le: maintenant, boites, retours }))
  let carte: Record<string, string> = {}
  try { carte = JSON.parse(await lireParametre(sb, CLE_CARTE) || "{}") } catch { carte = {} }
  return { cle, boites, pretes: boites.filter(boitePrete).map((b) => b.email), carte }
}

type Rythme = { jours: number[]; heureMin: number; heureMax: number }
async function campagneDeLaVariante(sb: SupabaseClient, ins: ContexteInstantly, c: { id: string; nom: string; baseId: string; rythme: Rythme; plafond: number; suiviOuvertures: boolean; mentions?: Mentions }, cleVariante: string): Promise<{ id?: string; erreur?: string }> {
  const cleCarte = `${c.id}:${cleVariante}`
  if (ins.carte[cleCarte]) return { id: ins.carte[cleCarte] }
  const cree = await appelInstantly(ins.cle, "/campaigns", { corps: {
    name: `Baticom · ${c.nom} · ${cleVariante.slice(0, 8)}`, campaign_schedule: horaireInstantly(c.rythme),
    sequences: [{ steps: [{ type: "email", delay: 0, variants: [{ subject: "{{bt_objet}}", body: "{{bt_corps}}" }] }] }],
    email_list: boitesDe(c.baseId, ins.pretes), daily_limit: c.plafond, stop_on_reply: true, link_tracking: false, open_tracking: c.suiviOuvertures, text_only: false, stop_on_auto_reply: false, email_gap: 10, insert_unsubscribe_header: true,
  } })
  const id = String(cree.data?.id ?? "")
  if (!cree.ok || !id) return { erreur: `création de campagne refusée (${cree.status}) ${String(cree.data?.message ?? "").slice(0, 120)}` }
  const active = await appelInstantly(ins.cle, `/campaigns/${id}/activate`, { methode: "POST" })
  if (!active.ok) return { erreur: `activation refusée (${active.status}) ${String(active.data?.message ?? "").slice(0, 120)}` }
  ins.carte[cleCarte] = id
  await ecrireParametre(sb, CLE_CARTE, JSON.stringify(ins.carte))
  return { id }
}

/** Confie un mail à Instantly. Il part dans la plage horaire de la campagne. */
export async function envoyerParInstantly(sb: SupabaseClient, ins: ContexteInstantly, c: { id: string; nom: string; baseId: string; rythme: Rythme; plafond: number; suiviOuvertures: boolean; mentions?: Mentions }, k: { id: string; nom: string; personne: string }, to: string, objet: string, texte: string, varianteId: string, test: boolean, desinscription?: string): Promise<{ ok: boolean; erreur?: string; fournisseurId?: string }> {
  if (!ins.cle) return { ok: false, erreur: "Instantly n'est pas configuré" }
  const camp = await campagneDeLaVariante(sb, ins, c, varianteId)
  if (!camp.id) return { ok: false, erreur: camp.erreur }
  const r = await appelInstantly(ins.cle, "/leads", { corps: {
    campaign: camp.id, email: to, first_name: k.personne || null, company_name: k.nom || null, skip_if_in_campaign: !test, verify_leads_on_import: false, // l'adresse est déjà vérifiée par Baticom (verification.ts)
    custom_variables: { bt_objet: objet, bt_corps: corpsAvecMentions(texte, desinscription, true, c.mentions), bt_contact: k.id, bt_campagne: c.id, bt_base: c.baseId, bt_test: test ? "1" : "0" },
  } })
  if (!r.ok) return { ok: false, erreur: `Instantly a refusé le contact (${r.status}) ${String(r.data?.message ?? "").slice(0, 120)}` }
  return { ok: true, fournisseurId: String(r.data?.id ?? "") }
}

/** Une relance : une réponse au dernier mail envoyé à ce contact, dans le même fil. Rien à quoi répondre : null, et le mail part normalement. */
export async function envoyerDansLeFil(sb: SupabaseClient, ins: ContexteInstantly, c: { id: string; baseId: string; mentions?: Mentions }, contact: string, to: string, objet: string, texte: string, desinscription?: string): Promise<{ ok: boolean; erreur?: string; fournisseurId?: string } | null> {
  if (!ins.cle) return null
  const { data: envois } = await sb.from("cmp_envois").select("fournisseur_id").eq("campagne_id", c.id).eq("contact_ref", contact).eq("statut", "envoye").eq("test", false).not("fournisseur_id", "is", null).order("le", { ascending: false }).limit(1)
  const id = (envois?.[0] as { fournisseur_id?: string } | undefined)?.fournisseur_id
  if (!id) return null
  const { data: mail } = await sb.from("messages").select("de, objet").eq("sens", "sortant").eq("message_id", id).maybeSingle()
  const m = mail as { de?: string; objet?: string } | null
  if (!m?.de) return null
  const sujet = m.objet ? (/^re\s*:/i.test(m.objet) ? m.objet : `Re: ${m.objet}`) : objet
  const html = corpsAvecMentions(texte, desinscription, true, c.mentions)
  const r = await appelInstantly(ins.cle, "/emails/reply", { corps: { reply_to_uuid: id, eaccount: m.de, subject: sujet, body: { html, text: texte } } })
  if (!r.ok) return { ok: false, erreur: `Instantly a refusé la relance (${r.status}) ${String(r.data?.message ?? "").slice(0, 120)}` }
  const nouveau = String(r.data?.id ?? "")
  const lien = c.baseId === "artisans" ? { sous_traitant_id: contact, espace: "recrutement" } : { agence_id: contact, espace: "demarchage" }
  const { error } = await sb.from("messages").insert({ sens: "sortant", de: m.de, a: to, objet: sujet, corps_text: texte, corps_html: html, message_id: nouveau || null, in_reply_to: id, lu: true, ...lien })
  if (error) console.error("[INSTANTLY] journal de la relance", error.message)
  return { ok: true, fournisseurId: nouveau }
}
