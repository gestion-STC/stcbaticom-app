// Contrats sous-traitants par DocuSign (11/10/2026).
//
// Les contrats sont des MODÈLES DocuSign (Mahdi : « déjà enregistrés dans
// DocuSign »). Depuis un dossier déposé, on remplit les informations du
// sous-traitant (les champs texte des modèles), et l'enveloppe part avec tous
// les modèles du pack : l'artisan signe, puis STC. Les retours arrivent par
// `docusign-evenements`.
//
// Actions (POST, jeton de l'utilisateur connecté vérifié) :
//   · modeles          → les modèles du compte DocuSign, avec rôles et champs
//   · envoyer          → { sous_traitant_id, compte_nom, valeurs, signataire_nom, signataire_email, forcer }
//   · statut           → { envelope_id } relit une enveloppe
//   · installer_connect→ pose l'abonnement Connect vers docusign-evenements
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { apiJson, configDepuisEnv, jetonDocusign } from "../_shared/docusign.ts"

// Appelée depuis le navigateur : les en-têtes CORS sur chaque réponse, et la pré-requête OPTIONS.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })
type Fiche = { id: string; entreprise: string; contact: string; email: string; statut: string; depose_le: string | null }
type Pack = { id: string; nom: string; template_id: string; ordre: number }
type Signer = { roleName?: string; routingOrder?: string; recipientId?: string; name?: string; email?: string; status?: string; signedDateTime?: string; tabs?: { textTabs?: { tabLabel: string; required?: string; value?: string }[] } }
type ModeleDetail = { templateId: string; name: string; recipients?: { signers?: Signer[] } }
type Enveloppe = { envelopeId: string; status: string; recipients?: { signers?: Signer[] } }
export type RoleModele = { roleName: string; routingOrder: number; champs: string[]; requis: string[] }
export type ModeleResume = { templateId: string; nom: string; roles: RoleModele[] }

async function utilisateurConnecte(req: Request, base: string, anon: string): Promise<{ id: string; email: string } | null> {
  const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
  if (!jeton) return null
  const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${jeton}` } })
  if (!r.ok) return null
  const u = await r.json()
  return u?.id ? { id: u.id, email: u.email ?? "" } : null
}

/** Les rôles d'un modèle : qui signe, dans quel ordre, avec quels champs texte. */
export function resumerModele(d: ModeleDetail): ModeleResume {
  const roles = (d.recipients?.signers ?? []).map((s) => ({
    roleName: s.roleName ?? "", routingOrder: Number(s.routingOrder ?? 1),
    champs: (s.tabs?.textTabs ?? []).map((t) => t.tabLabel).filter(Boolean),
    requis: (s.tabs?.textTabs ?? []).filter((t) => t.required === "true").map((t) => t.tabLabel),
  })).sort((a, b) => a.routingOrder - b.routingOrder)
  return { templateId: d.templateId, nom: d.name, roles }
}
/** Quel rôle est l'artisan, quel rôle est STC : par le nom, sinon par l'ordre de signature. */
export function rolesSignataires(roles: RoleModele[]): { artisan: RoleModele | null; stc: RoleModele | null } {
  const estStc = (r: RoleModele) => /stc|donneur|client|ma[iî]tre|soci[eé]t[eé] ?principale/i.test(r.roleName)
  const estArtisan = (r: RoleModele) => /artisan|sous.?trait|prestataire|entreprise|fournisseur|signataire/i.test(r.roleName)
  let stc = roles.find(estStc) ?? null
  let artisan = roles.find((r) => r !== stc && estArtisan(r)) ?? null
  if (!artisan) artisan = roles.find((r) => r !== stc) ?? null
  if (!stc) stc = roles.find((r) => r !== artisan) ?? null
  return { artisan, stc }
}
function statutDepuisEnveloppe(e: Enveloppe): { statut: string; signeArtisanLe: string | null; signeLe: string | null } {
  const artisan = e.recipients?.signers?.find((s) => s.recipientId === "1")
  const signeArtisanLe = artisan?.status === "completed" ? artisan.signedDateTime ?? new Date().toISOString() : null
  const s = (e.status || "").toLowerCase()
  if (s === "completed") return { statut: "signe", signeArtisanLe, signeLe: new Date().toISOString() }
  if (s === "declined") return { statut: "refuse", signeArtisanLe, signeLe: null }
  if (s === "voided") return { statut: "annule", signeArtisanLe, signeLe: null }
  if (signeArtisanLe) return { statut: "signe_artisan", signeArtisanLe, signeLe: null }
  if (s === "delivered") return { statut: "livre", signeArtisanLe: null, signeLe: null }
  return { statut: "envoye", signeArtisanLe: null, signeLe: null }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405)
  const base = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const qui = await utilisateurConnecte(req, base, anon)
  if (!qui) return json({ error: "Connexion requise" }, 401)

  let corps: { action?: string; sous_traitant_id?: string; compte_nom?: string; envelope_id?: string; forcer?: boolean; valeurs?: Record<string, string>; signataire_nom?: string; signataire_email?: string; template_ids?: string[] } = {}
  try { corps = await req.json() } catch { /* corps vide */ }
  const sb = createClient(base, service)

  try {
    const config = configDepuisEnv((k) => Deno.env.get(k))
    const jeton = await jetonDocusign(config)
    const detailModele = (id: string) => apiJson<ModeleDetail>(config, jeton, "GET", `/templates/${id}?include=recipients,tabs`)

    // ── Les modèles du compte ──
    if (corps.action === "modeles") {
      const liste = await apiJson<{ envelopeTemplates?: { templateId: string; name: string }[] }>(config, jeton, "GET", "/templates?count=100&order_by=name&order=asc")
      const modeles: ModeleResume[] = []
      for (const m of (liste.envelopeTemplates ?? []).slice(0, 40)) modeles.push(resumerModele(await detailModele(m.templateId)))
      return json({ ok: true, modeles, compte: config.baseUri.includes("demo") ? "bac à sable" : "réel" })
    }

    // ── Poser l'abonnement Connect (une fois) ──
    if (corps.action === "installer_connect") {
      const secret = Deno.env.get("DOCUSIGN_CONNECT_SECRET") || ""
      if (!secret) return json({ error: "Secret DOCUSIGN_CONNECT_SECRET manquant" }, 500)
      const url = `${base}/functions/v1/docusign-evenements?cle=${encodeURIComponent(secret)}`
      const existants = await apiJson<{ configurations?: { connectId: string; name: string }[] }>(config, jeton, "GET", "/connect")
      const deja = (existants.configurations ?? []).find((c) => c.name === "STC Baticom")
      const conf = {
        name: "STC Baticom", urlToPublishTo: url, configurationType: "custom", deliveryMode: "SIM", allUsers: "true", allowEnvelopePublish: "true", enableLog: "true",
        includeDocuments: "false", includeEnvelopeVoidReason: "true", includeTimeZone: "true", requiresAcknowledgement: "true", requireMutualTls: "false",
        envelopeEvents: ["sent", "delivered", "completed", "declined", "voided"], recipientEvents: ["completed", "declined"],
        eventData: { version: "restv2.1", format: "json", includeData: ["recipients"] },
      }
      const r = deja
        ? await apiJson<{ connectId: string }>(config, jeton, "PUT", "/connect", { ...conf, connectId: deja.connectId })
        : await apiJson<{ connectId: string }>(config, jeton, "POST", "/connect", conf)
      return json({ ok: true, connectId: r.connectId ?? deja?.connectId })
    }

    // ── Relire une enveloppe ──
    if (corps.action === "statut") {
      if (!corps.envelope_id) return json({ error: "envelope_id manquant" }, 400)
      const e = await apiJson<Enveloppe>(config, jeton, "GET", `/envelopes/${corps.envelope_id}?include=recipients`)
      const etat = statutDepuisEnveloppe(e)
      const { error } = await sb.from("st_contrats").update({ statut: etat.statut, signe_artisan_le: etat.signeArtisanLe, signe_le: etat.signeLe, maj_le: new Date().toISOString() }).eq("envelope_id", corps.envelope_id)
      if (error) throw error
      return json({ ok: true, ...etat })
    }

    // ── Envoyer les contrats ──
    if (!corps.sous_traitant_id) return json({ error: "sous_traitant_id manquant" }, 400)
    const { data: fiche, error: eF } = await sb.from("st_sous_traitants").select("id, entreprise, contact, email, statut, depose_le").eq("id", corps.sous_traitant_id).single()
    if (eF || !fiche) return json({ error: "Fiche introuvable" }, 404)
    const f = fiche as Fiche
    const emailArtisan = (corps.signataire_email || f.email || "").trim()
    const nomArtisan = (corps.signataire_nom || f.contact || f.entreprise || "Artisan").trim()
    if (!emailArtisan) return json({ error: "Pas d'adresse e-mail pour le signataire." }, 400)
    if (!corps.forcer) {
      const { data: enCours } = await sb.from("st_contrats").select("id, statut").eq("sous_traitant_id", f.id).in("statut", ["envoye", "livre", "signe_artisan", "signe"]).order("envoye_le", { ascending: false }).limit(1)
      if (enCours?.length) return json({ error: enCours[0].statut === "signe" ? "Les contrats sont déjà signés." : "Des contrats sont déjà en cours de signature pour cette fiche.", statut: enCours[0].statut }, 409)
    }
    const { data: packComplet, error: eP } = await sb.from("st_contrats_modeles").select("id, nom, template_id, ordre").eq("actif", true).neq("template_id", "").order("ordre")
    if (eP) throw eP
    if (!packComplet?.length) return json({ error: "Aucun modèle dans le pack : Réglages › Recrutement › Contrats à faire signer." }, 400)
    // Mahdi, 11/10 : trois contrats (cadre, conditions particulières intervention, remise en état) ; on peut n'en envoyer qu'une partie.
    const choisis = Array.isArray(corps.template_ids) && corps.template_ids.length ? corps.template_ids : null
    const pack = choisis ? packComplet.filter((m) => choisis.includes(m.template_id)) : packComplet
    if (!pack.length) return json({ error: "Aucun contrat coché." }, 400)

    const stcEmail = Deno.env.get("DOCUSIGN_SIGNATAIRE_STC_EMAIL") || "gestion@stcbatiment.fr"
    const stcNom = Deno.env.get("DOCUSIGN_SIGNATAIRE_STC_NOM") || "STC Bâtiment"
    const valeurs = corps.valeurs ?? {}
    const textTabs = (champs: string[]) => champs.filter((c) => valeurs[c] !== undefined && valeurs[c] !== "").map((c) => ({ tabLabel: c, value: valeurs[c] }))
    const compositeTemplates = []
    for (const [i, m] of (pack as Pack[]).entries()) {
      const resume = resumerModele(await detailModele(m.template_id))
      const { artisan, stc } = rolesSignataires(resume.roles)
      if (!artisan) throw new Error(`Le modèle « ${resume.nom} » n'a aucun signataire : ajoute un rôle dans DocuSign.`)
      const signers = [{ roleName: artisan.roleName, recipientId: "1", routingOrder: "1", name: nomArtisan, email: emailArtisan, tabs: { textTabs: textTabs(artisan.champs) } }]
      if (stc) signers.push({ roleName: stc.roleName, recipientId: "2", routingOrder: "2", name: stcNom, email: stcEmail, tabs: { textTabs: textTabs(stc.champs) } })
      compositeTemplates.push({
        compositeTemplateId: String(i + 1),
        serverTemplates: [{ sequence: "1", templateId: m.template_id }],
        inlineTemplates: [{ sequence: "1", recipients: { signers } }],
      })
    }
    const enveloppe = {
      emailSubject: `Vos contrats STC Bâtiment à signer${f.entreprise ? ` · ${f.entreprise}` : ""}`,
      emailBlurb: `Bonjour ${nomArtisan},\n\nVoici les contrats de partenariat STC Bâtiment. Merci de les signer : nous signerons ensuite, et vous recevrez l'exemplaire signé par les deux parties.\n\nL'équipe STC Bâtiment`,
      status: "sent",
      compositeTemplates,
      customFields: { textCustomFields: [{ name: "sous_traitant_id", value: f.id, show: "false" }] },
    }
    const r = await apiJson<{ envelopeId: string; status: string }>(config, jeton, "POST", "/envelopes", enveloppe)
    const { error: eI } = await sb.from("st_contrats").insert({
      sous_traitant_id: f.id, envelope_id: r.envelopeId, statut: "envoye", compte_nom: corps.compte_nom ?? qui.email,
      documents: (pack as Pack[]).map((m) => ({ nom: m.nom, template_id: m.template_id })), valeurs, signataire_nom: nomArtisan, signataire_email: emailArtisan,
    })
    if (eI) throw eI
    return json({ ok: true, envelopeId: r.envelopeId, documents: pack.length, destinataire: emailArtisan })
  } catch (e) {
    console.error("[DOCUSIGN-ENVOYER]", e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
