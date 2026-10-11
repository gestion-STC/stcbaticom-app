// Le lien « ouvrir mon accès » (11/10/2026) : quand les contrats sont signés par
// les deux parties, STC Baticom demande à STC Bâtiment de poser un jeton et
// d'envoyer le lien à l'artisan (e-mail STC Bâtiment, logo, copie à STC).
// Secrets : STC_BATIMENT_URL, STC_BATIMENT_ANON, PASSERELLE_CLE (déjà posés pour les clients signés).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

export type FicheST = { id: string; entreprise: string; contact: string; email: string; telephone: string; metier: string; zone: string }
type Ligne = { label: string; valeur: string }

/** Ce que le dossier déposé sait de l'entreprise (raison sociale, SIRET, adresse, dirigeant…). */
export function depuisDossier(sections: { lignes?: Ligne[] }[] | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()
  for (const sec of sections ?? []) for (const l of sec.lignes ?? []) {
    const k = norm(l.label), v = (l.valeur || "").trim()
    if (!v || v === "—") continue
    if (k === "raison sociale") out.entreprise = v
    else if (k === "siret") out.siret = v
    else if (k === "adresse") out.adresse = v
    else if (k === "dirigeant") out.responsable = v
    else if (k === "telephone") out.telephone = v
    else if (k === "e mail" || k === "email") out.email = v
    else if (k.startsWith("corps d etat")) out.corps_metier = v.split(/[,;/]/)[0].trim()
  }
  if (out.adresse && !out.code_postal) { const m = out.adresse.match(/\b(\d{5})\b/); if (m) out.code_postal = m[1] }
  return out
}

/** Demande le lien à STC Bâtiment (qui l'envoie lui-même par e-mail) et le note sur la fiche. */
export async function envoyerLienAcces(sb: SupabaseClient, fiche: FicheST, env: (k: string) => string | undefined): Promise<{ ok: true; destinataire: string; url: string } | { ok: false; erreur: string }> {
  const base = (env("STC_BATIMENT_URL") || "").replace(/\/$/, "")
  const anon = env("STC_BATIMENT_ANON") || ""
  const cle = env("PASSERELLE_CLE") || ""
  if (!base || !anon || !cle) return { ok: false, erreur: "Secrets STC_BATIMENT_URL / STC_BATIMENT_ANON / PASSERELLE_CLE manquants" }
  // Le dernier dossier déposé de la fiche complète ce qu'on sait.
  const { data: dossier } = await sb.from("dossiers_st").select("raison_sociale, email, donnees").eq("sous_traitant_id", fiche.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
  const d = depuisDossier((dossier as { donnees?: { sections?: { lignes?: Ligne[] }[] } } | null)?.donnees?.sections)
  const corps = {
    action: "creer", baticom_st_id: fiche.id,
    entreprise: d.entreprise || (dossier as { raison_sociale?: string } | null)?.raison_sociale || fiche.entreprise,
    siret: d.siret || "", adresse: d.adresse || "", code_postal: d.code_postal || (fiche.zone && /^\d{5}$/.test(fiche.zone) ? fiche.zone : ""),
    responsable: d.responsable || fiche.contact, email: (fiche.email || d.email || (dossier as { email?: string } | null)?.email || "").toLowerCase(),
    telephone: fiche.telephone || d.telephone || "", corps_metier: d.corps_metier || fiche.metier || "", envoyer: true,
  }
  if (!corps.email) return { ok: false, erreur: "La fiche n'a pas d'adresse e-mail : impossible d'envoyer le lien." }
  const r = await fetch(`${base}/functions/v1/acces-partenaire`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${anon}`, "x-passerelle-cle": cle }, body: JSON.stringify(corps),
  })
  const j = await r.json().catch(() => ({})) as { ok?: boolean; url?: string; destinataire?: string; envoye?: boolean; error?: string }
  if (!r.ok || !j.ok) return { ok: false, erreur: `STC Bâtiment répond ${r.status} : ${j.error || "?"}` }
  await sb.from("st_sous_traitants").update({ acces_envoye_le: new Date().toISOString(), acces_email: j.destinataire || corps.email }).eq("id", fiche.id)
  return { ok: true, destinataire: j.destinataire || corps.email, url: j.url || "" }
}
