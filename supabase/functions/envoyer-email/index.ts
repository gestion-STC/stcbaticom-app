// Relais Resend UNIFIÉ — accepte les DEUX contrats :
//  A) contrat de l'interface : { to, subject, html, reply_to? }
//     (composition côté client : variables + signature + PJ en liens ; le front
//      journalise lui-même emails_envoyes) → on journalise ici SEULEMENT `messages`.
//  B) contrat du moteur de règles / boîte de réception : { prospect_id, email_id |
//     modele_nom | objet+corps, to?, in_reply_to?, signature_html?, commercial? }
//     → composition côté serveur (variables, signature, PJ en vraies pièces
//     jointes) + journalise messages ET emails_envoyes.
//     · signature_html / commercial (07/10/2026) : la boîte de réception envoie la
//       signature STC Bâtiment AU NOM DU COMPTE CONNECTÉ et son prénom ; sans eux
//       (moteur de règles, automatique), on garde la signature et le commercial
//       des paramètres, comme avant.
// Expéditeur : secret RESEND_FROM sinon contact@crm.stcbatiment.fr.
//
// ⚠ Ce fichier est LA version déployée (v4 du 09/07/2026 + le point ci-dessus).
// L'ancienne copie du dépôt (contrat A seul) ne correspondait plus à la prod.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const adresse = (raw: unknown) => { const s = String(raw ?? "").trim(); const m = s.match(/<([^>]+)>/); return (m ? m[1] : s).toLowerCase().trim(); };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);
  try {
    const cle = Deno.env.get("RESEND_API_KEY");
    if (!cle) return json({ error: "Clé Resend non configurée (secret RESEND_API_KEY)." }, 500);
    const from = Deno.env.get("RESEND_FROM") || "STC Bâtiment <contact@crm.stcbatiment.fr>";
    const corps = await req.json();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let payload: Record<string, unknown>;
    let journalEmailsEnvoyes: { prospect_id: string; modele_nom: string; objet: string } | null = null;
    let prospectIdPourMessage: string | null = null;
    let objetFinal = "", corpsTextFinal = "", corpsHtmlFinal = "", destinataire = "";

    if (typeof corps?.subject === "string" || typeof corps?.html === "string") {
      // ── Contrat A (interface) : déjà composé côté client ──
      const to = corps?.to;
      if (!to || (Array.isArray(to) && to.length === 0)) return json({ error: "Destinataire (to) manquant." }, 400);
      objetFinal = String(corps.subject ?? "");
      corpsHtmlFinal = String(corps.html ?? "");
      if (!objetFinal && !corpsHtmlFinal) return json({ error: "Email vide (ni objet ni contenu)." }, 400);
      destinataire = adresse(Array.isArray(to) ? to[0] : to);
      payload = { from, to: Array.isArray(to) ? to : [to], subject: objetFinal, html: corpsHtmlFinal };
      if (typeof corps?.reply_to === "string" && corps.reply_to) payload.reply_to = corps.reply_to;
      const { data: p } = await admin.from("prospects").select("id").ilike("email", destinataire).limit(1).maybeSingle();
      prospectIdPourMessage = p?.id ?? null;
    } else {
      // ── Contrat B (moteur / boîte) : composition serveur ──
      const { prospect_id, to, email_id, modele_nom, objet, corps: corpsDirect, in_reply_to, signature_html, commercial } = corps ?? {};
      type ProspectLu = { id: string; contact: string | null; entreprise: string | null; email: string | null; telephone: string | null; arrondissement: string | null };
      let prospect: ProspectLu | null = null;
      if (prospect_id) {
        const { data } = await admin.from("prospects").select("id, contact, entreprise, email, telephone, arrondissement").eq("id", prospect_id).maybeSingle();
        prospect = data;
        if (!prospect) return json({ error: "Prospect introuvable" }, 404);
      }
      destinataire = adresse(to || prospect?.email || "");
      if (!destinataire.includes("@")) return json({ error: "Destinataire manquant ou invalide." }, 400);
      type ModeleLu = { nom: string; objet: string; corps: string; pieces_jointes: unknown };
      let modele: ModeleLu | null = null;
      if (email_id || modele_nom) {
        const q = admin.from("emails").select("nom, objet, corps, pieces_jointes");
        const { data } = email_id ? await q.eq("id", email_id).maybeSingle() : await q.eq("nom", modele_nom).maybeSingle();
        modele = data;
        if (!modele) return json({ error: "Modèle d'e-mail introuvable" }, 404);
      }
      objetFinal = String(modele?.objet ?? objet ?? "").trim();
      corpsTextFinal = String(modele?.corps ?? corpsDirect ?? "").trim();
      if (!objetFinal || !corpsTextFinal) return json({ error: "Objet et corps requis (directs ou via modèle)." }, 400);
      const { data: params } = await admin.from("parametres").select("cle, valeur").in("cle", ["signature", "commercial"]);
      const param = (k: string) => (params as Array<{ cle: string; valeur: string }> | null)?.find((x) => x.cle === k)?.valeur ?? "";
      // Le compte connecté l'emporte sur les paramètres communs (boîte de réception) ;
      // sans lui (moteur de règles), les paramètres s'appliquent comme avant.
      const prenomCommercial = typeof commercial === "string" && commercial.trim() ? commercial.trim() : String(param("commercial"));
      const signature = typeof signature_html === "string" && signature_html.trim() ? signature_html : String(param("signature"));
      const subst = (s: string) => s
        .split("{{contact}}").join(prospect?.contact || "")
        .split("{{entreprise}}").join(prospect?.entreprise || "")
        .split("{{telephone}}").join(prospect?.telephone || "")
        .split("{{email}}").join(prospect?.email || "")
        .split("{{arrondissement}}").join(prospect?.arrondissement || "")
        .split("{{commercial}}").join(prenomCommercial);
      objetFinal = subst(objetFinal);
      corpsTextFinal = subst(corpsTextFinal);
      corpsHtmlFinal = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${escHtml(corpsTextFinal).replace(/\n/g, "<br>")}</div>` + (signature ? `<br><br>${subst(signature)}` : "");
      const pieces = (Array.isArray(modele?.pieces_jointes) ? modele.pieces_jointes : []) as Array<{ url?: string; nom?: string }>;
      const attachments = pieces.filter((x) => x?.url).map((x) => ({ filename: x.nom || "document.pdf", path: x.url }));
      payload = { from, to: [destinataire], subject: objetFinal, html: corpsHtmlFinal, text: corpsTextFinal, ...(attachments.length ? { attachments } : {}), ...(in_reply_to ? { headers: { "In-Reply-To": in_reply_to, References: in_reply_to } } : {}) };
      prospectIdPourMessage = prospect?.id ?? null;
      if (prospect?.id) journalEmailsEnvoyes = { prospect_id: prospect.id, modele_nom: modele?.nom ?? "(libre)", objet: objetFinal };
    }

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + cle, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const texte = await r.text();
    if (r.status === 429) return json({ error: "Trop d'envois rapprochés — patiente quelques secondes puis réessaie." }, 429);
    if (!r.ok) {
      let detail = texte;
      try { const j = JSON.parse(texte); detail = j?.message || j?.error || texte; } catch { /* brut */ }
      console.error(`[ENVOYER-EMAIL] Resend ${r.status}: ${String(detail).slice(0, 300)}`);
      return json({ error: `Resend a refusé l'envoi (code ${r.status}).`, detail }, 502);
    }
    let id = "";
    try { id = JSON.parse(texte)?.id ?? ""; } catch { /* ok */ }

    // Journal de la boîte (les 2 contrats) + suivi des envois (contrat B uniquement,
    // le front journalise lui-même emails_envoyes en contrat A).
    await admin.from("messages").insert({
      sens: "sortant", de: adresse(from), a: destinataire, objet: objetFinal,
      corps_text: corpsTextFinal, corps_html: corpsHtmlFinal, message_id: id || null,
      in_reply_to: (corps?.in_reply_to as string) ?? null, prospect_id: prospectIdPourMessage, lu: true,
    });
    if (journalEmailsEnvoyes) await admin.from("emails_envoyes").insert(journalEmailsEnvoyes);

    console.log(`[ENVOYER-EMAIL] ok → ${destinataire} objet="${objetFinal.slice(0, 60)}"`);
    return json({ ok: true, id, resend_id: id });
  } catch (e) {
    console.error("[ENVOYER-EMAIL] erreur:", e);
    return json({ error: "Erreur du relais email : " + String(e) }, 500);
  }
});
