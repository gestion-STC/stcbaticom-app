// Relais Resend UNIFIÉ — accepte les DEUX contrats :
//  A) contrat de l'interface : { to, subject, html, reply_to?, agence_id? }
//     (composition côté client : variables + signature + PJ en liens) → journalisé dans `messages`.
//  B) contrat de la boîte de réception : { agence_id?, email_id | modele_nom | objet+corps, to?,
//     in_reply_to?, signature_html?, commercial? } → composition côté serveur (variables,
//     signature, PJ en vraies pièces jointes) + journalisé dans `messages`.
//  14/10/2026 : l'ancienne table « prospects » et le journal « emails_envoyes » ne sont plus
//  lus ni écrits. Le message est rangé sur l'AGENCE : celle envoyée (agence_id), sinon la base
//  la retrouve par l'adresse (déclencheur messages_rattacher_agence). Un ancien « prospect_id »
//  envoyé par une page restée ouverte est ignoré, jamais une erreur.
//     · signature_html / commercial (07/10/2026) : la boîte de réception envoie la
//       signature STC Bâtiment AU NOM DU COMPTE CONNECTÉ et son prénom ; sans eux
//       (moteur de règles, automatique), la signature STC Bâtiment au nom du
//       paramètre « commercial » (réglé dans Paramétrage › Emails).
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

// Signature STC Bâtiment (même format que src/lib/signatureStc.ts côté interface) :
// sert aux envois AUTOMATIQUES, qui n'ont pas de compte connecté. Nom = paramètre
// « commercial », sinon « L'équipe STC ». Le fixe toujours, jamais de mobile.
const F = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const prenomDe = (nom: string) => nom.trim().split(/\s+/)[0] || "";
function signatureStc(nomBrut: string): string {
  const nom = nomBrut.trim() || "L'équipe STC";
  return `
<div style="margin-top:30px;border-top:1px solid #ececec;padding-top:16px;font-family:${F};">
  <img src="https://stcbatiment.com/stc-logo-email.png" alt="STC B&acirc;timent - r&eacute;nover | innover" width="128" style="display:block;margin:0 0 12px;max-width:128px;height:auto;" />
  <p style="margin:0;font-size:13.5px;color:#1a1a1a;font-weight:600;font-family:${F};">${nom} <span style="font-weight:400;color:#b0b0b0;">&middot;</span> <span style="font-weight:400;color:#6b6b6b;">Gestion</span></p>
  <p style="margin:4px 0 0;font-size:12.5px;color:#444;line-height:1.7;font-family:${F};">
    <a href="tel:+33184806128" style="color:#444;text-decoration:none;">01 84 80 61 28</a><br>
    <a href="mailto:contact@crm.stcbatiment.fr" style="color:#444;text-decoration:none;">contact@crm.stcbatiment.fr</a>
    &nbsp;&middot;&nbsp;
    <a href="https://stcbatiment.fr" style="color:#D32F2F;text-decoration:none;">stcbatiment.fr</a>
  </p>
  <p style="margin:14px 0 0;font-size:11px;color:#b0b0b0;font-family:${F};">STC B&acirc;timent &middot; 7 rue Oscar Niemeyer, 78280 Guyancourt</p>
</div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);
  try {
    const cle = Deno.env.get("RESEND_API_KEY");
    if (!cle) return json({ error: "Clé Resend non configurée (secret RESEND_API_KEY)." }, 500);
    const corps = await req.json();
    // DEUX ESPACES (08/10/2026) : le recrutement écrit depuis SA propre adresse,
    // sur le même domaine ; les réponses lui reviennent dans sa propre boîte.
    const espace: "demarchage" | "recrutement" = corps?.espace === "recrutement" ? "recrutement" : "demarchage";
    const from = espace === "recrutement"
      ? (Deno.env.get("RESEND_FROM_RECRUTEMENT") || "STC Bâtiment <recrutement@crm.stcbatiment.fr>")
      : (Deno.env.get("RESEND_FROM") || "STC Bâtiment <contact@crm.stcbatiment.fr>");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let payload: Record<string, unknown>;
    // L'agence de la fiche d'où part le mail (démarchage) : le message est rangé sur elle.
    const agenceId: string | null = typeof corps?.agence_id === "string" && corps.agence_id ? corps.agence_id : null;
    let sousTraitantIdPourMessage: string | null = null;
    let objetFinal = "", corpsTextFinal = "", corpsHtmlFinal = "", destinataire = "", aPourMessage = "";

    if (typeof corps?.subject === "string" || typeof corps?.html === "string") {
      // ── Contrat A (interface) : déjà composé côté client ──
      const to = corps?.to;
      if (!to || (Array.isArray(to) && to.length === 0)) return json({ error: "Destinataire (to) manquant." }, 400);
      objetFinal = String(corps.subject ?? "");
      corpsHtmlFinal = String(corps.html ?? "");
      if (!objetFinal && !corpsHtmlFinal) return json({ error: "Email vide (ni objet ni contenu)." }, 400);
      // PLUSIEURS DESTINATAIRES (08/10/2026) : un seul e-mail, tous en « À »,
      // journalisé une fois avec toutes les adresses.
      const tous = (Array.isArray(to) ? to : [to]).map(adresse).filter((a) => a.includes("@"));
      if (tous.length === 0) return json({ error: "Aucune adresse de destinataire valide." }, 400);
      destinataire = tous[0];
      // Cc et Cci (Mahdi, 09/10/2026) : des listes d'adresses, journalisées avec le message.
      const cc = (Array.isArray(corps?.cc) ? corps.cc : []).map(adresse).filter((a: string) => a.includes("@") && !tous.includes(a));
      const bcc = (Array.isArray(corps?.bcc) ? corps.bcc : []).map(adresse).filter((a: string) => a.includes("@") && !tous.includes(a) && !cc.includes(a));
      aPourMessage = tous.join(", ") + (cc.length ? " · cc : " + cc.join(", ") : "") + (bcc.length ? " · cci : " + bcc.join(", ") : "");
      payload = { from, to: tous, subject: objetFinal, html: corpsHtmlFinal, ...(cc.length ? { cc } : {}), ...(bcc.length ? { bcc } : {}) };
      if (typeof corps?.reply_to === "string" && corps.reply_to) payload.reply_to = corps.reply_to;
      // En-têtes (désinscription en un clic) et étiquettes, posés par le moteur de recrutement.
      if (corps?.headers && typeof corps.headers === "object") payload.headers = corps.headers;
      if (Array.isArray(corps?.tags)) payload.tags = corps.tags;
      if (espace === "recrutement") {
        const { data: s } = await admin.from("st_sous_traitants").select("id").ilike("email", destinataire).limit(1).maybeSingle();
        sousTraitantIdPourMessage = s?.id ?? null;
      }
    } else {
      // ── Contrat B (moteur / boîte) : composition serveur ──
      const { to, email_id, modele_nom, objet, corps: corpsDirect, in_reply_to, signature_html, commercial } = corps ?? {};
      // Les variables des modèles : l'agence et son contact principal, s'ils sont connus.
      type Fiche = { contact: string; entreprise: string; email: string; telephone: string; arrondissement: string };
      let fiche: Fiche | null = null;
      if (agenceId) {
        const { data: a } = await admin.from("agences_liste").select("nom, email, telephone, secteur_libelle, contact_principal").eq("id", agenceId).maybeSingle();
        if (a) fiche = { contact: a.contact_principal ?? "", entreprise: a.nom ?? "", email: a.email ?? "", telephone: a.telephone ?? "", arrondissement: a.secteur_libelle ?? "" };
      }
      destinataire = adresse(to || fiche?.email || "");
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
      // Le compte connecté l'emporte (boîte de réception : signature_html + commercial).
      // Sans lui (moteur de règles) : la signature STC Bâtiment au nom du paramètre
      // « commercial ». Le HTML collé « signature » n'est plus lu (07/10/2026).
      const nomAuto = String(param("commercial")).trim();
      const prenomCommercial = typeof commercial === "string" && commercial.trim() ? commercial.trim() : prenomDe(nomAuto);
      const signature = typeof signature_html === "string" && signature_html.trim() ? signature_html : signatureStc(nomAuto);
      const subst = (s: string) => s
        .split("{{contact}}").join(fiche?.contact || "")
        .split("{{entreprise}}").join(fiche?.entreprise || "")
        .split("{{telephone}}").join(fiche?.telephone || "")
        .split("{{email}}").join(fiche?.email || "")
        .split("{{arrondissement}}").join(fiche?.arrondissement || "")
        .split("{{commercial}}").join(prenomCommercial);
      objetFinal = subst(objetFinal);
      corpsTextFinal = subst(corpsTextFinal);
      corpsHtmlFinal = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${escHtml(corpsTextFinal).replace(/\n/g, "<br>")}</div>` + (signature ? `<br><br>${subst(signature)}` : "");
      const pieces = (Array.isArray(modele?.pieces_jointes) ? modele.pieces_jointes : []) as Array<{ url?: string; nom?: string }>;
      const attachments = pieces.filter((x) => x?.url).map((x) => ({ filename: x.nom || "document.pdf", path: x.url }));
      payload = { from, to: [destinataire], subject: objetFinal, html: corpsHtmlFinal, text: corpsTextFinal, ...(attachments.length ? { attachments } : {}), ...(in_reply_to ? { headers: { "In-Reply-To": in_reply_to, References: in_reply_to } } : {}) };
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

    // Journal de la boîte (les 2 contrats), rangé sur l'agence quand on la connaît.
    const { error: errJournal } = await admin.from("messages").insert({
      sens: "sortant", de: adresse(from), a: aPourMessage || destinataire, objet: objetFinal,
      corps_text: corpsTextFinal, corps_html: corpsHtmlFinal, message_id: id || null,
      in_reply_to: (corps?.in_reply_to as string) ?? null, lu: true,
      espace, sous_traitant_id: sousTraitantIdPourMessage, ...(agenceId && espace === "demarchage" ? { agence_id: agenceId } : {}),
    });
    if (errJournal) console.error(`[ENVOYER-EMAIL] journal: ${errJournal.message}`);

    console.log(`[ENVOYER-EMAIL] ok → ${destinataire} objet="${objetFinal.slice(0, 60)}"`);
    return json({ ok: true, id, resend_id: id });
  } catch (e) {
    console.error("[ENVOYER-EMAIL] erreur:", e);
    return json({ error: "Erreur du relais email : " + String(e) }, 500);
  }
});
