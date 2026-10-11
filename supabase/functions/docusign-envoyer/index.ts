// Contrats sous-traitants par DocuSign (11/10/2026).
//
// Depuis la fiche artisan, « Envoyer les contrats » : une enveloppe avec tous
// les modèles actifs (bucket `contrats/modeles`), deux signataires dans l'ordre
// (l'artisan, puis STC), et une trace dans `st_contrats`. Les retours (signé,
// refusé…) arrivent par `docusign-evenements` ; `action: "statut"` relit une
// enveloppe à la main ; `action: "installer_connect"` pose l'abonnement DocuSign
// Connect qui appelle `docusign-evenements`.
//
// Appelée par le logiciel avec le jeton de l'utilisateur connecté (vérifié).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { apiJson, compterPagesPdf, configDepuisEnv, jetonDocusign, octetsVersBase64 } from "../_shared/docusign.ts"

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })
type Fiche = { id: string; entreprise: string; contact: string; email: string; statut: string; depose_le: string | null }
type Modele = { id: string; nom: string; chemin: string; ordre: number }
type Enveloppe = { envelopeId: string; status: string; recipients?: { signers?: { recipientId: string; status: string; signedDateTime?: string; email?: string }[] } }

async function utilisateurConnecte(req: Request, base: string, anon: string): Promise<{ id: string; email: string } | null> {
  const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
  if (!jeton) return null
  const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${jeton}` } })
  if (!r.ok) return null
  const u = await r.json()
  return u?.id ? { id: u.id, email: u.email ?? "" } : null
}

/** L'état d'une enveloppe, traduit pour `st_contrats`. */
export function statutDepuisEnveloppe(e: Enveloppe): { statut: string; signeArtisanLe: string | null; signeLe: string | null } {
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
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405)
  const base = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const qui = await utilisateurConnecte(req, base, anon)
  if (!qui) return json({ error: "Connexion requise" }, 401)

  let corps: { action?: string; sous_traitant_id?: string; compte_nom?: string; envelope_id?: string; forcer?: boolean } = {}
  try { corps = await req.json() } catch { /* corps vide */ }
  const sb = createClient(base, service)

  try {
    const config = configDepuisEnv((k) => Deno.env.get(k))
    const jeton = await jetonDocusign(config)

    // ── Poser l'abonnement Connect (une fois) ──
    if (corps.action === "installer_connect") {
      const secret = Deno.env.get("DOCUSIGN_CONNECT_SECRET") || ""
      if (!secret) return json({ error: "Secret DOCUSIGN_CONNECT_SECRET manquant" }, 500)
      const url = `${base}/functions/v1/docusign-evenements?cle=${encodeURIComponent(secret)}`
      const existants = await apiJson<{ configurations?: { connectId: string; name: string; urlToPublishTo: string }[] }>(config, jeton, "GET", "/connect")
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
      return json({ ok: true, connectId: r.connectId ?? deja?.connectId, url: url.replace(secret, "…") })
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
    if (!f.email) return json({ error: "Cette fiche n'a pas d'adresse e-mail : impossible d'envoyer les contrats." }, 400)
    if (!corps.forcer) {
      const { data: enCours } = await sb.from("st_contrats").select("id, statut, envoye_le").eq("sous_traitant_id", f.id).in("statut", ["envoye", "livre", "signe_artisan", "signe"]).order("envoye_le", { ascending: false }).limit(1)
      if (enCours?.length) return json({ error: enCours[0].statut === "signe" ? "Les contrats sont déjà signés." : "Des contrats sont déjà en cours de signature pour cette fiche.", statut: enCours[0].statut }, 409)
    }
    const { data: modeles, error: eM } = await sb.from("st_contrats_modeles").select("id, nom, chemin, ordre").eq("actif", true).order("ordre")
    if (eM) throw eM
    if (!modeles?.length) return json({ error: "Aucun modèle de contrat : dépose les PDF dans Réglages › Contrats." }, 400)

    const documents: { documentId: string; name: string; fileExtension: string; documentBase64: string; pages: number }[] = []
    for (const [i, m] of (modeles as Modele[]).entries()) {
      const { data, error } = await sb.storage.from("contrats").download(m.chemin)
      if (error || !data) throw new Error(`Modèle « ${m.nom} » introuvable dans le bucket (${m.chemin})`)
      const octets = new Uint8Array(await data.arrayBuffer())
      documents.push({ documentId: String(i + 1), name: m.nom, fileExtension: "pdf", documentBase64: octetsVersBase64(octets), pages: compterPagesPdf(octets) })
    }
    // Les cases à signer : bas de la dernière page de chaque document, l'artisan à gauche, STC à droite.
    const tabs = (x: number) => ({
      signHereTabs: documents.map((d) => ({ documentId: d.documentId, pageNumber: String(d.pages), xPosition: String(x), yPosition: "690" })),
      dateSignedTabs: documents.map((d) => ({ documentId: d.documentId, pageNumber: String(d.pages), xPosition: String(x), yPosition: "750", fontSize: "size9" })),
    })
    const nomArtisan = (f.contact || f.entreprise || "Artisan").trim()
    const stcEmail = Deno.env.get("DOCUSIGN_SIGNATAIRE_STC_EMAIL") || "gestion@stcbatiment.fr"
    const stcNom = Deno.env.get("DOCUSIGN_SIGNATAIRE_STC_NOM") || "STC Bâtiment"
    const enveloppe = {
      emailSubject: `Vos contrats STC Bâtiment à signer${f.entreprise ? ` · ${f.entreprise}` : ""}`,
      emailBlurb: `Bonjour ${nomArtisan},\n\nVoici les contrats de partenariat STC Bâtiment. Merci de les signer : nous signerons ensuite, et vous recevrez l'exemplaire signé par les deux parties.\n\nL'équipe STC Bâtiment`,
      status: "sent",
      documents: documents.map(({ pages: _p, ...d }) => d),
      recipients: {
        signers: [
          { recipientId: "1", routingOrder: "1", roleName: "Artisan", name: nomArtisan, email: f.email.trim(), tabs: tabs(60) },
          { recipientId: "2", routingOrder: "2", roleName: "STC", name: stcNom, email: stcEmail, tabs: tabs(340) },
        ],
      },
      customFields: { textCustomFields: [{ name: "sous_traitant_id", value: f.id, show: "false" }] },
    }
    const r = await apiJson<{ envelopeId: string; status: string }>(config, jeton, "POST", "/envelopes", enveloppe)
    const { error: eI } = await sb.from("st_contrats").insert({
      sous_traitant_id: f.id, envelope_id: r.envelopeId, statut: "envoye", compte_nom: corps.compte_nom ?? qui.email,
      documents: (modeles as Modele[]).map((m) => ({ nom: m.nom, chemin: m.chemin })),
    })
    if (eI) throw eI
    return json({ ok: true, envelopeId: r.envelopeId, documents: documents.length, destinataire: f.email })
  } catch (e) {
    console.error("[DOCUSIGN-ENVOYER]", e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
