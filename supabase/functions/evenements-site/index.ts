// Les signaux du site (11/10/2026) : ce qu'une agence fait après notre mail.
//
// Deux portes :
//   · GET  /evenements-site?l=<jeton>      — un lien suivi cliqué (plaquette, créer un compte, site) :
//                                            on note le clic sur l'agence, puis on redirige vers la vraie adresse.
//   · POST /evenements-site?cle=<clé>      — STC Bâtiment prévient (page « Créer un compte » ouverte,
//                                            compte ouvert) : on retrouve l'agence (jeton source, sinon e-mail,
//                                            sinon nom) et on pose le signal.
// Déployée SANS vérification de JWT (liens dans des e-mails, appels d'un autre projet) : clé et jetons.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })
const APP_URL = (Deno.env.get("STC_BATIMENT_APP_URL") || "https://www.stcbatiment.com").replace(/\/$/, "")
const LIBELLES: Record<string, string> = { creer_compte: "Page « Créer un compte » ouverte", plaquette: "Plaquette ouverte", site: "Site ouvert", bareme: "Barème ouvert" }

async function poserSignal(sb: SupabaseClient, agenceId: string, contactId: string | null, titre: string, note: string, quand: string, compte?: { email: string }): Promise<void> {
  await sb.from("activites").insert({ agence_id: agenceId, contact_id: contactId, type: "note", titre, note, date: quand, compte_nom: "Site STC Bâtiment", source: "site" })
  const maj: Record<string, unknown> = { dernier_signal_le: quand, dernier_signal: titre }
  if (compte) { maj.compte_ouvert_le = quand; maj.compte_email = compte.email }
  await sb.from("agences").update(maj).eq("id", agenceId)
}

/** Le nom d'une pièce jointe d'un modèle d'e-mail, retrouvé par son adresse (pour dire QUELLE plaquette a été ouverte). */
async function nomDocument(sb: SupabaseClient, url: string): Promise<string> {
  if (!url) return ""
  const { data } = await sb.from("emails").select("pieces_jointes")
  for (const e of (data ?? []) as { pieces_jointes: unknown }[]) {
    const pieces = Array.isArray(e.pieces_jointes) ? (e.pieces_jointes as { nom?: string; url?: string }[]) : []
    const p = pieces.find((x) => x?.url === url)
    if (p?.nom) return p.nom.replace(/.pdf$/i, "").replace(/ (d+)$/, "")
  }
  return ""
}

/** L'agence derrière un événement : le jeton du lien, sinon l'e-mail (contact ou agence), sinon le nom. */
async function retrouverAgence(sb: SupabaseClient, e: { jeton_source?: string; email?: string; agence?: string }): Promise<{ agenceId: string; contactId: string | null } | null> {
  if (e.jeton_source) {
    const { data } = await sb.from("liens_suivis").select("agence_id, contact_id").eq("jeton", e.jeton_source).maybeSingle()
    if (data?.agence_id) return { agenceId: data.agence_id as string, contactId: (data.contact_id as string | null) ?? null }
  }
  const email = (e.email || "").toLowerCase().trim()
  if (email) {
    const { data: c } = await sb.from("contacts").select("id, agence_id").ilike("email", email).limit(1).maybeSingle()
    if (c?.agence_id) return { agenceId: c.agence_id as string, contactId: c.id as string }
    const { data: a } = await sb.from("agences").select("id").ilike("email", email).limit(1).maybeSingle()
    if (a?.id) return { agenceId: a.id as string, contactId: null }
    const domaine = email.split("@")[1] || ""
    if (domaine && !/gmail|hotmail|outlook|yahoo|orange|free|sfr|laposte|wanadoo|icloud/.test(domaine)) {
      const { data: d } = await sb.from("agences").select("id").ilike("email", `%@${domaine}`).neq("type", "apporteur").limit(2)
      if (d?.length === 1) return { agenceId: d[0].id as string, contactId: null }
    }
  }
  const nom = (e.agence || "").trim()
  if (nom.length >= 4) {
    const { data: n } = await sb.from("agences").select("id").ilike("nom", nom).neq("type", "apporteur").limit(2)
    if (n?.length === 1) return { agenceId: n[0].id as string, contactId: null }
  }
  return null
}

Deno.serve(async (req: Request) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const url = new URL(req.url)

  // ── Un lien suivi cliqué ──
  if (req.method === "GET") {
    const jeton = url.searchParams.get("l") || ""
    if (!jeton) return json({ ok: true, service: "evenements-site" })
    const { data: lien } = await sb.from("liens_suivis").select("id, agence_id, contact_id, cible, url, nb_clics").eq("jeton", jeton).maybeSingle()
    if (!lien) return Response.redirect(`${APP_URL}/creer-mon-compte`, 302)
    const quand = new Date().toISOString()
    const cible = lien.cible as string
    const destination = cible === "creer_compte" ? `${APP_URL}/creer-mon-compte?src=${encodeURIComponent(jeton)}` : (lien.url as string) || APP_URL
    try {
      await sb.from("liens_suivis").update({ nb_clics: ((lien.nb_clics as number) || 0) + 1, dernier_clic_le: quand }).eq("id", lien.id)
      const doc = cible === "plaquette" ? await nomDocument(sb, (lien.url as string) || "") : ""
      if (lien.agence_id) await poserSignal(sb, lien.agence_id as string, (lien.contact_id as string | null) ?? null, LIBELLES[cible] || `Lien ouvert · ${cible}`, doc ? `Document : ${doc}. Depuis un e-mail de prospection.` : `Depuis un e-mail de prospection.`, quand)
    } catch (e) { console.error("[EVENEMENTS-SITE] clic non noté :", e) }
    return Response.redirect(destination, 302)
  }

  // ── STC Bâtiment prévient ──
  if (req.method !== "POST") return json({ error: "GET ou POST" }, 405)
  const cle = Deno.env.get("PASSERELLE_CLE") || ""
  if (!cle || url.searchParams.get("cle") !== cle) return json({ error: "clé absente ou fausse" }, 401)
  let e: { type?: string; email?: string; agence?: string; nom?: string; forme?: string; nb_gestionnaires?: number; nb_emails?: number; jeton_source?: string; quand?: string; page?: string } = {}
  try { e = await req.json() } catch { return json({ error: "JSON attendu" }, 400) }
  const quand = e.quand || new Date().toISOString()
  try {
    const cible = await retrouverAgence(sb, e)
    if (!cible) return json({ ok: true, ignore: "agence inconnue dans la base de prospection", type: e.type })
    if (e.type === "page_ouverte") {
      await poserSignal(sb, cible.agenceId, cible.contactId, "Page « Créer un compte » ouverte", "Sur www.stcbatiment.com, depuis notre e-mail.", quand)
    } else if (e.type === "compte_ouvert") {
      const forme = e.forme === "equipe" ? `une équipe, ${e.nb_gestionnaires ?? 0} gestionnaire${(e.nb_gestionnaires ?? 0) > 1 ? "s" : ""} invité${(e.nb_gestionnaires ?? 0) > 1 ? "s" : ""}` : `un seul compte${e.nb_emails ? `, ${e.nb_emails} adresse${e.nb_emails > 1 ? "s" : ""} rattachée${e.nb_emails > 1 ? "s" : ""}` : ""}`
      await poserSignal(sb, cible.agenceId, cible.contactId, "Compte ouvert sur STC Bâtiment", `${e.nom || ""} · ${e.email || ""} · ${forme}. À confirmer : passe-t-elle « Client » ?`, quand, { email: e.email || "" })
    } else {
      return json({ ok: true, ignore: "type inconnu" })
    }
    return json({ ok: true, agence_id: cible.agenceId })
  } catch (err) {
    console.error("[EVENEMENTS-SITE]", err)
    return json({ error: String(err) }, 500)
  }
})
