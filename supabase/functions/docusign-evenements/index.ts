// Les retours DocuSign (Connect) — 11/10/2026.
//
// DocuSign appelle cette adresse à chaque mouvement d'une enveloppe (envoyée,
// livrée, signée par l'artisan, terminée, refusée, annulée). On relit
// l'enveloppe à la source, on met `st_contrats` à jour, et quand tout est signé :
//   · le PDF signé est rangé dans le bucket `contrats/signes/<artisan>/<enveloppe>.pdf` ;
//   · il rejoint les PIÈCES du dossier déposé de l'artisan (bucket `dossiers-st`),
//     et le dossier passe « complet » (Mahdi, 11/10 : le dossier final de la personne).
// L'adresse porte une clé (`?cle=`) : sans elle, on ne traite rien.
// Déployée SANS vérification de JWT (DocuSign n'a pas notre jeton), d'où la clé.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { api, apiJson, configDepuisEnv, hmacValide, jetonDocusign } from "../_shared/docusign.ts"

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })
type Enveloppe = { envelopeId: string; status: string; recipients?: { signers?: { recipientId: string; status: string; signedDateTime?: string }[] } }
type Piece = { slot?: string; path: string; nom?: string }

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
  if (req.method === "GET") return json({ ok: true, service: "docusign-evenements" })
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405)
  const secret = Deno.env.get("DOCUSIGN_CONNECT_SECRET") || ""
  const url = new URL(req.url)
  const corpsBrut = await req.text()
  const signature = req.headers.get("x-docusign-signature-1") || ""
  const cleOk = !!secret && url.searchParams.get("cle") === secret
  const hmacOk = signature ? await hmacValide(secret, corpsBrut, signature) : false
  if (!cleOk && !hmacOk) return json({ error: "clé absente ou fausse" }, 401)

  let message: { event?: string; data?: { envelopeId?: string } } = {}
  try { message = JSON.parse(corpsBrut) } catch { return json({ error: "JSON attendu" }, 400) }
  const envelopeId = message.data?.envelopeId
  if (!envelopeId) return json({ ok: true, ignore: "pas d'enveloppe" })

  const base = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const sb = createClient(base, service)
  try {
    let { data: contrat } = await sb.from("st_contrats").select("id, sous_traitant_id, statut, pdf_path, documents").eq("envelope_id", envelopeId).maybeSingle()
    const config = configDepuisEnv((k) => Deno.env.get(k))
    const jeton = await jetonDocusign(config)
    const e = await apiJson<Enveloppe & { customFields?: { textCustomFields?: { name: string; value: string }[] }; envelopeDocuments?: { name: string; documentId: string }[] }>(config, jeton, "GET", `/envelopes/${envelopeId}?include=recipients,custom_fields,documents`)
    if (!contrat) {
      // Inconnue ici : si c'est bien une enveloppe du logiciel (champ caché sous_traitant_id), on la rattrape.
      const stId = e.customFields?.textCustomFields?.find((f) => f.name === "sous_traitant_id")?.value
      if (!stId) return json({ ok: true, ignore: "enveloppe inconnue ici" })
      const documents = (e.envelopeDocuments ?? []).filter((d) => d.documentId !== "certificate").map((d) => ({ nom: d.name }))
      const { data: cree, error: eC } = await sb.from("st_contrats").insert({ sous_traitant_id: stId, envelope_id: envelopeId, statut: "envoye", compte_nom: "rattrapé par DocuSign", documents }).select("id, sous_traitant_id, statut, pdf_path, documents").single()
      if (eC) return json({ ok: true, ignore: `enveloppe inconnue et fiche ${stId} introuvable` })
      contrat = cree
    }
    const etat = statutDepuisEnveloppe(e)
    const maj: Record<string, unknown> = { statut: etat.statut, signe_artisan_le: etat.signeArtisanLe, maj_le: new Date().toISOString() }
    let dossierComplet = false
    if (etat.statut === "signe") {
      maj.signe_le = etat.signeLe
      if (!contrat.pdf_path) {
        const r = await api(config, jeton, "GET", `/envelopes/${envelopeId}/documents/combined`)
        if (!r.ok) throw new Error(`PDF signé introuvable (${r.status})`)
        const octets = new Uint8Array(await r.arrayBuffer())
        const chemin = `signes/${contrat.sous_traitant_id}/${envelopeId}.pdf`
        const { error: eU } = await sb.storage.from("contrats").upload(chemin, octets, { contentType: "application/pdf", upsert: true })
        if (eU) throw eU
        maj.pdf_path = chemin

        // Dans les pièces du dossier déposé de l'artisan, et le dossier devient « complet ».
        const { data: dossier } = await sb.from("dossiers_st").select("id, fichiers").eq("sous_traitant_id", contrat.sous_traitant_id).order("created_at", { ascending: false }).limit(1).maybeSingle()
        if (dossier) {
          const cheminDossier = `contrats/${dossier.id}/${envelopeId}.pdf`
          const { error: eD } = await sb.storage.from("dossiers-st").upload(cheminDossier, octets, { contentType: "application/pdf", upsert: true })
          if (eD) throw eD
          const noms = ((contrat.documents ?? []) as { nom: string }[]).map((d) => d.nom).filter(Boolean).join(", ")
          const pieces: Piece[] = Array.isArray(dossier.fichiers) ? (dossier.fichiers as Piece[]) : []
          const sansDoublon = pieces.filter((p) => p.path !== cheminDossier)
          sansDoublon.push({ slot: "contrat_signe", path: cheminDossier, nom: `Contrats signés${noms ? ` · ${noms}` : ""} (DocuSign).pdf` })
          const { error: eM } = await sb.from("dossiers_st").update({ fichiers: sansDoublon, complet_le: new Date().toISOString() }).eq("id", dossier.id)
          if (eM) throw eM
          dossierComplet = true
        }
      }
    }
    const { error } = await sb.from("st_contrats").update(maj).eq("id", contrat.id)
    if (error) throw error
    return json({ ok: true, event: message.event, statut: etat.statut, dossier_complet: dossierComplet })
  } catch (err) {
    // Une enveloppe qui n'existe pas (ou plus) chez DocuSign : rien à faire, et surtout pas de nouvel essai.
    if (/ENVELOPE_DOES_NOT_EXIST/.test(String(err))) return json({ ok: true, ignore: "enveloppe inconnue chez DocuSign" })
    console.error("[DOCUSIGN-EVENEMENTS]", err)
    await sb.from("st_contrats").update({ erreur: String(err).slice(0, 500), maj_le: new Date().toISOString() }).eq("envelope_id", envelopeId)
    return json({ error: String(err) }, 500)
  }
})
