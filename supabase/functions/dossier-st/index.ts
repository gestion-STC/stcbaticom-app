// ════════════════════════════════════════════════════════════════════════════
// LE DOSSIER D'UN ARTISAN, RENDU À STC BÂTIMENT (13/10/2026)
//
// Quand un sous-traitant ouvre son accès à l'Espace Partenaire, STC Bâtiment
// vient chercher ici son dossier de recrutement pour ranger ses pièces dans
// sa fiche (Kbis, URSSAF, fiscale, RIB, décennale, RC pro, contrats signés).
//
// POST { baticom_st_id?, email? }, clé partagée dans l'en-tête x-passerelle-cle
// (ou ?cle=), comparée au secret PASSERELLE_CLE. Rend :
//   identite   ce que le dossier dit de l'entreprise (SIRET, forme, dirigeant,
//              adresse, effectif) et des assurances (compagnie, police, fin)
//   pieces     chaque pièce typée avec un lien de téléchargement d'UNE heure
//              et son chemin d'origine (STC s'en sert pour ne rien importer deux fois)
//
// Rien n'est modifié ici : la fonction lit et signe des liens, c'est tout.
// Déployée sans vérification de JWT (l'appel vient d'un autre projet), d'où la clé.
// ════════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })
const SLOTS = ["kbis", "urssaf", "fiscale", "rib", "decennale", "rcpro", "sipsi", "photos"] as const
type Ligne = { label: string; valeur: string }

/** « 31/12/2026 » → « 2026-12-31 » ; rien d'autre n'est accepté. */
function dateIso(v: string): string | null {
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

/** Ce que les cinq volets du dossier disent de l'entreprise et de ses assurances. */
export function lireIdentite(sections: { lignes?: Ligne[] }[] | null | undefined): Record<string, string | null> {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
  const out: Record<string, string | null> = {}
  for (const sec of sections ?? []) for (const l of sec.lignes ?? []) {
    const k = norm(l.label), v = (l.valeur || "").trim()
    if (!v || v === "—") continue
    if (k === "raison sociale") out.entreprise = v
    else if (k === "siret") out.siret = v.replace(/\s+/g, "")
    else if (k === "forme juridique") out.forme_juridique = v
    else if (k === "dirigeant") out.dirigeant = v
    else if (k === "adresse") out.adresse = v
    else if (k === "effectif") out.effectif = v
    else if (k === "telephone") out.telephone = v
    else if (k === "e mail" || k === "email") out.email = v
    else if (k.startsWith("corps d etat")) out.corps = v
    else if (k === "decennale compagnie") out.decennale_compagnie = v
    else if (k === "decennale n police") out.decennale_police = v
    else if (k === "decennale valable jusqu au") out.decennale_fin = dateIso(v)
    else if (k === "rc pro compagnie") out.rcpro_compagnie = v
    else if (k === "rc pro n police") out.rcpro_police = v
    else if (k === "rc pro valable jusqu au") out.rcpro_fin = dateIso(v)
  }
  if (out.adresse && !out.code_postal) { const m = String(out.adresse).match(/\b(\d{5})\b/); if (m) out.code_postal = m[1] }
  return out
}

/** Le type d'une pièce se lit dans son chemin : « <dossier>/<type>-<n>-<nom> » ; le contrat signé a son dossier à lui. */
function typeDePiece(chemin: string, slot: string): string {
  if (slot === "contrat_signe" || chemin.startsWith("contrats/")) return "contrat"
  const nom = chemin.split("/").pop() ?? ""
  const t = nom.split("-")[0]
  return (SLOTS as readonly string[]).includes(t) ? t : "autre"
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405)
  const cle = Deno.env.get("PASSERELLE_CLE") || ""
  const donnee = (req.headers.get("x-passerelle-cle") || new URL(req.url).searchParams.get("cle") || "").trim()
  if (!cle || donnee !== cle) return json({ error: "clé absente ou fausse" }, 401)
  let corps: { baticom_st_id?: string; email?: string } = {}
  try { corps = await req.json() } catch { return json({ error: "JSON attendu" }, 400) }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } })
  // La fiche : par son identifiant, sinon par l'e-mail (un artisan créé à la main côté STC).
  let fiche: { id: string; entreprise: string; email: string } | null = null
  if (corps.baticom_st_id) {
    const { data } = await sb.from("st_sous_traitants").select("id, entreprise, email").eq("id", corps.baticom_st_id).maybeSingle()
    fiche = data
  }
  const email = String(corps.email || "").trim().toLowerCase()
  if (!fiche && email) {
    const { data } = await sb.from("st_sous_traitants").select("id, entreprise, email").ilike("email", email).limit(1).maybeSingle()
    fiche = data
  }
  // Le dossier : celui de la fiche, sinon un dossier déposé avec cette adresse.
  let dossier: { id: string; raison_sociale: string; email: string; donnees: { sections?: { lignes?: Ligne[] }[] } | null; fichiers: { slot: string; path: string; nom: string }[] | null; created_at: string } | null = null
  if (fiche) {
    const { data } = await sb.from("dossiers_st").select("id, raison_sociale, email, donnees, fichiers, created_at").eq("sous_traitant_id", fiche.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    dossier = data
  }
  if (!dossier && (email || fiche?.email)) {
    const { data } = await sb.from("dossiers_st").select("id, raison_sociale, email, donnees, fichiers, created_at").ilike("email", email || fiche!.email).order("created_at", { ascending: false }).limit(1).maybeSingle()
    dossier = data
  }
  if (!dossier) return json({ ok: true, trouve: false, fiche: fiche?.id ?? null })

  const pieces: { type: string; nom: string; chemin: string; url: string | null }[] = []
  for (const f of dossier.fichiers ?? []) {
    if (!f?.path) continue
    const { data } = await sb.storage.from("dossiers-st").createSignedUrl(f.path, 3600)
    pieces.push({ type: typeDePiece(f.path, f.slot), nom: f.nom || f.path.split("/").pop() || "piece", chemin: `dossiers-st/${f.path}`, url: data?.signedUrl ?? null })
  }
  // Le contrat signé par les deux parties, s'il n'est pas déjà dans les pièces du dossier.
  if (fiche) {
    const { data: contrats } = await sb.from("st_contrats").select("pdf_path, envelope_id, signe_le").eq("sous_traitant_id", fiche.id).eq("statut", "signe").neq("pdf_path", "").order("signe_le", { ascending: false })
    for (const c of contrats ?? []) {
      if (pieces.some((p) => p.type === "contrat" && p.chemin.endsWith(`${c.envelope_id}.pdf`))) continue
      const { data } = await sb.storage.from("contrats").createSignedUrl(c.pdf_path, 3600)
      pieces.push({ type: "contrat", nom: "Contrats signés (DocuSign).pdf", chemin: `contrats/${c.pdf_path}`, url: data?.signedUrl ?? null })
    }
  }
  return json({
    ok: true, trouve: true, fiche: fiche?.id ?? null, dossier: dossier.id, depose_le: dossier.created_at,
    identite: { entreprise: dossier.raison_sociale, ...lireIdentite(dossier.donnees?.sections) },
    pieces,
  })
})
