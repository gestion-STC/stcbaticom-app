// Relais Resend UNIFIÉ — accepte les DEUX contrats :
//  A) contrat de l'interface : { to, subject, html, reply_to?, agence_id?, pieces? }
//     (composition côté client : variables + signature ; `pieces` [{nom, url, taille}] en vraies
//     pièces jointes depuis le 05/11/2026) → journalisé dans `messages`.
//  B) contrat de la boîte de réception : { agence_id?, email_id | modele_nom | objet+corps, to?,
//     in_reply_to?, signature_html?, commercial?, pieces? } → composition côté serveur (variables,
//     signature, PJ du modèle + `pieces` en vraies pièces jointes) + journalisé dans `messages`.
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
import { estServeur, jetonDe, membre } from "../_shared/acces.ts";
import { ADRESSE_GENERALE, adresseAncree, compteQuiEnvoie, expediteurDemarchage, signatureAvecAdresse } from "../_shared/boitesMail.ts";
import { cheminDuJournal, citationTransfert, enteteDeFil, listeAdresses } from "../_shared/fil.ts";
import { espaceAutorise, espacesDeLAppelant } from "../_shared/perimetre.ts";
//  11/11/2026 — UNE ADRESSE PAR COMMERCIAL (comme STC Bâtiment) : un mail du démarchage part de l'adresse
//  dédiée de la personne qui envoie (table equipe, colonne email_reception) : « Prénom Nom — STC Bâtiment
//  <prenom@crm.stcbatiment.fr> », réponses à la même adresse, et la signature la montre. La personne qui
//  envoie : le compte connecté (le jeton) ; un envoi du serveur sans compte : le commercial de l'agence
//  (agences.commercial_id), ou le `compte_id` que le serveur donne. Sans adresse dédiée : contact@, inchangé.
//  Le recrutement garde son adresse commune. Le journal porte le propriétaire (messages.compte_id).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const adresse = (raw: unknown) => { const s = String(raw ?? "").trim(); const m = s.match(/<([^>]+)>/); return (m ? m[1] : s).toLowerCase().trim(); };

// Les documents partent en VRAIES pièces jointes, jamais en liens (Mahdi, 05/11/2026 : une agence
// a demandé deux fois le Kbis qu'elle avait « reçu » en lien sous la signature). Resend va chercher
// chaque fichier à son adresse ; le nom du fichier porte l'extension (« Kbis » → « Kbis.pdf »),
// sinon la messagerie ne sait pas l'ouvrir. Total plafonné sous la limite Resend (40 Mo).
type Piece = { url?: unknown; nom?: unknown; taille?: unknown };
const PLAFOND_PIECES = 35 * 1024 * 1024;
function enPiecesJointes(...listes: unknown[]): Array<{ filename: string; path: string }> {
  const vues = new Set<string>();
  const out: Array<{ filename: string; path: string }> = [];
  for (const l of listes) for (const p of (Array.isArray(l) ? l : []) as Piece[]) {
    const url = typeof p?.url === "string" ? p.url : "";
    if (!/^https:\/\//.test(url) || vues.has(url)) continue;
    vues.add(url);
    const nom = (typeof p?.nom === "string" && p.nom.trim()) || "document";
    const extUrl = (url.split("?")[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? "").toLowerCase();
    const filename = /\.[a-z0-9]{2,5}$/i.test(nom) ? nom : `${nom}.${extUrl && extUrl !== "bin" ? extUrl : "pdf"}`;
    out.push({ filename, path: url });
  }
  return out;
}
const tailleTotale = (...listes: unknown[]) => listes.flatMap((l) => (Array.isArray(l) ? l : []) as Piece[]).reduce((s, p) => s + (Number(p?.taille) || 0), 0);

// Signature STC Bâtiment (même format que src/lib/signatureStc.ts côté interface) :
// sert aux envois AUTOMATIQUES, qui n'ont pas de compte connecté. Nom = paramètre
// « commercial », sinon « L'équipe STC ». Le fixe toujours, jamais de mobile.
const F = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const prenomDe = (nom: string) => nom.trim().split(/\s+/)[0] || "";
function signatureStc(nomBrut: string, email = ADRESSE_GENERALE): string {
  const nom = nomBrut.trim() || "L'équipe STC";
  return `
<div style="margin-top:30px;border-top:1px solid #ececec;padding-top:16px;font-family:${F};">
  <img src="https://stcbatiment.com/stc-logo-email.png" alt="STC B&acirc;timent - r&eacute;nover | innover" width="128" style="display:block;margin:0 0 12px;max-width:128px;height:auto;" />
  <p style="margin:0;font-size:13.5px;color:#1a1a1a;font-weight:600;font-family:${F};">${nom} <span style="font-weight:400;color:#b0b0b0;">&middot;</span> <span style="font-weight:400;color:#6b6b6b;">Gestion</span></p>
  <p style="margin:4px 0 0;font-size:12.5px;color:#444;line-height:1.7;font-family:${F};">
    <a href="tel:+33184806128" style="color:#444;text-decoration:none;">01 84 80 61 28</a><br>
    <a href="mailto:${email}" style="color:#444;text-decoration:none;">${email}</a>
    &nbsp;&middot;&nbsp;
    <a href="https://stcbatiment.fr" style="color:#D32F2F;text-decoration:none;">stcbatiment.fr</a>
  </p>
  <p style="margin:14px 0 0;font-size:11px;color:#b0b0b0;font-family:${F};">STC B&acirc;timent &middot; 7 rue Oscar Niemeyer, 78280 Guyancourt</p>
</div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);
  // Sécurité (11/11/2026) : seuls un membre de l'équipe ou le serveur envoient un mail depuis notre domaine.
  const jetonAppel = jetonDe(req);
  const serveur = await estServeur(jetonAppel);
  const appelant = serveur ? null : await membre(jetonAppel);
  if (!serveur && !appelant) return json({ error: "non autorisé" }, 401);
  try {
    const cle = Deno.env.get("RESEND_API_KEY");
    if (!cle) return json({ error: "Clé Resend non configurée (secret RESEND_API_KEY)." }, 500);
    const corps = await req.json();
    // DEUX ESPACES (08/10/2026) : le recrutement écrit depuis SA propre adresse,
    // sur le même domaine ; les réponses lui reviennent dans sa propre boîte.
    const espace: "demarchage" | "recrutement" = corps?.espace === "recrutement" ? "recrutement" : "demarchage";
    const fromParDefaut = espace === "recrutement"
      ? (Deno.env.get("RESEND_FROM_RECRUTEMENT") || "STC Bâtiment <recrutement@crm.stcbatiment.fr>")
      : (Deno.env.get("RESEND_FROM") || "STC Bâtiment <contact@crm.stcbatiment.fr>");
    // LE PÉRIMÈTRE (26/11/2026, D6) : un téléprospecteur n'écrit que depuis une boîte que l'écran lui offre
    // (un « Commercial » n'a pas la boîte Sous-traitants, donc pas recrutement@). La base fait foi (mes_espaces()).
    if (appelant && appelant.role !== "admin" && !espaceAutorise(appelant.role, await espacesDeLAppelant(jetonAppel), espace)) {
      return json({ error: `La boîte ${espace === "recrutement" ? "Sous-traitants" : "Gestionnaires"} n'est pas dans votre périmètre.` }, 403);
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let payload: Record<string, unknown>;
    let joints: Array<{ filename: string; path: string }> = [];
    // L'agence de la fiche d'où part le mail (démarchage) : le message est rangé sur elle.
    const agenceId: string | null = typeof corps?.agence_id === "string" && corps.agence_id ? corps.agence_id : null;

    // ── QUI ENVOIE (démarchage, 11/11/2026) : son adresse dédiée, son nom ──
    let compteExpediteur: string | null = null;
    let nomExpediteur = "";
    let exp = { from: fromParDefaut, replyTo: null as string | null, adresseSignature: ADRESSE_GENERALE };
    if (espace === "demarchage") {
      let commercialAgence: string | null = null;
      if (!appelant && agenceId) {
        const { data: g } = await admin.from("agences").select("commercial_id").eq("id", agenceId).maybeSingle();
        commercialAgence = (g as { commercial_id?: string | null } | null)?.commercial_id ?? null;
      }
      const demande = serveur && typeof corps?.compte_id === "string" && corps.compte_id ? String(corps.compte_id) : null;
      compteExpediteur = compteQuiEnvoie({ appelantId: appelant?.id ?? demande, commercialAgence });
      if (compteExpediteur) {
        const { data: eq, error: errEq } = await admin.from("equipe").select("email_reception").eq("compte_id", compteExpediteur).maybeSingle();
        if (errEq) console.warn(`[ENVOYER-EMAIL] adresse dédiée illisible : ${errEq.message}`);
        const { data: u } = await admin.auth.admin.getUserById(compteExpediteur);
        nomExpediteur = String(u?.user?.user_metadata?.nom ?? "").trim();
        exp = expediteurDemarchage({ adresseDediee: (eq as { email_reception?: string | null } | null)?.email_reception ?? null, nom: nomExpediteur, parDefaut: fromParDefaut });
      }
    }
    const from = exp.from;
    let sousTraitantIdPourMessage: string | null = null;
    let objetFinal = "", corpsTextFinal = "", corpsHtmlFinal = "", destinataire = "", aPourMessage = "";

    if (typeof corps?.subject === "string" || typeof corps?.html === "string") {
      // ── Contrat A (interface) : déjà composé côté client ──
      const to = corps?.to;
      if (!to || (Array.isArray(to) && to.length === 0)) return json({ error: "Destinataire (to) manquant." }, 400);
      objetFinal = String(corps.subject ?? "");
      // La signature STC composée par l'écran porte contact@ : elle prend l'adresse dédiée de qui envoie.
      corpsHtmlFinal = signatureAvecAdresse(String(corps.html ?? ""), exp.adresseSignature);
      if (!objetFinal && !corpsHtmlFinal) return json({ error: "Email vide (ni objet ni contenu)." }, 400);
      // PLUSIEURS DESTINATAIRES (08/10/2026) : un seul e-mail, tous en « À »,
      // journalisé une fois avec toutes les adresses.
      // Une adresse enregistrée qui est une liste (« a@x, b@y ») est découpée (26/11/2026).
      const tous = listeAdresses(to);
      if (tous.length === 0) return json({ error: "Aucune adresse de destinataire valide." }, 400);
      destinataire = tous[0];
      // Cc et Cci (Mahdi, 09/10/2026) : des listes d'adresses, journalisées avec le message.
      const cc = listeAdresses(corps?.cc).filter((a) => !tous.includes(a));
      const bcc = listeAdresses(corps?.bcc).filter((a) => !tous.includes(a) && !cc.includes(a));
      aPourMessage = tous.join(", ") + (cc.length ? " · cc : " + cc.join(", ") : "") + (bcc.length ? " · cci : " + bcc.join(", ") : "");
      if (tailleTotale(corps?.pieces) > PLAFOND_PIECES) return json({ error: "Pièces jointes trop lourdes (35 Mo au total au maximum)." }, 400);
      const attachments = enPiecesJointes(corps?.pieces);
      joints = attachments;
      payload = { from, to: tous, subject: objetFinal, html: corpsHtmlFinal, ...(cc.length ? { cc } : {}), ...(bcc.length ? { bcc } : {}), ...(attachments.length ? { attachments } : {}) };
      if (typeof corps?.reply_to === "string" && corps.reply_to) payload.reply_to = corps.reply_to;
      else if (exp.replyTo) payload.reply_to = exp.replyTo;
      // En-têtes (désinscription en un clic) et étiquettes, posés par le moteur de recrutement.
      if (corps?.headers && typeof corps.headers === "object") payload.headers = corps.headers;
      if (Array.isArray(corps?.tags)) payload.tags = corps.tags;
      if (espace === "recrutement") {
        const { data: s } = await admin.from("st_sous_traitants").select("id").ilike("email", destinataire).limit(1).maybeSingle();
        sousTraitantIdPourMessage = s?.id ?? null;
      }
    } else {
      // ── Contrat B (moteur / boîte) : composition serveur ──
      const { to, email_id, modele_nom, objet, corps: corpsDirect, in_reply_to, references, signature_html, commercial, citation } = corps ?? {};
      // Les variables des modèles : l'agence et son contact principal, s'ils sont connus.
      type Fiche = { contact: string; entreprise: string; email: string; telephone: string; arrondissement: string };
      let fiche: Fiche | null = null;
      if (agenceId) {
        const { data: a } = await admin.from("agences_liste").select("nom, email, telephone, secteur_libelle, contact_principal").eq("id", agenceId).maybeSingle();
        if (a) fiche = { contact: a.contact_principal ?? "", entreprise: a.nom ?? "", email: a.email ?? "", telephone: a.telephone ?? "", arrondissement: a.secteur_libelle ?? "" };
      }
      // Plusieurs destinataires, Cc et Cci en réponse (26/11/2026) ; une adresse enregistrée « a@x, b@y » ou
      // « h2i@… · cc : … » est découpée proprement (avant : envoi refusé).
      const tousB = listeAdresses(to || fiche?.email || "");
      destinataire = tousB[0] ?? "";
      if (!destinataire) return json({ error: "Destinataire manquant ou invalide." }, 400);
      const ccB = listeAdresses(corps?.cc).filter((a) => !tousB.includes(a));
      const bccB = listeAdresses(corps?.bcc).filter((a) => !tousB.includes(a) && !ccB.includes(a));
      aPourMessage = tousB.join(", ") + (ccB.length ? " · cc : " + ccB.join(", ") : "") + (bccB.length ? " · cci : " + bccB.join(", ") : "");
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
      // Un transfert peut partir sans mot d'accompagnement : le message transféré suffit, même quand il n'a que des
      // pièces jointes (26/11/2026, D73 : refusé avant, avec un message incompréhensible).
      const avecPieces = Array.isArray(corps?.pieces) && corps.pieces.length > 0;
      if (!objetFinal) return json({ error: "Objet requis." }, 400);
      if (!corpsTextFinal && !citationTransfert(citation, avecPieces)) {
        return json({ error: citation ? "Le message transféré est vide et sans pièce jointe : écrivez un mot pour l'accompagner." : "Message vide : écrivez un texte." }, 400);
      }
      const { data: params } = await admin.from("parametres").select("cle, valeur").in("cle", ["signature", "commercial"]);
      const param = (k: string) => (params as Array<{ cle: string; valeur: string }> | null)?.find((x) => x.cle === k)?.valeur ?? "";
      // Le compte connecté l'emporte (boîte de réception : signature_html + commercial).
      // Sans lui (moteur de règles) : la signature STC Bâtiment au nom du paramètre
      // « commercial ». Le HTML collé « signature » n'est plus lu (07/10/2026).
      // Un envoi du serveur pour un commercial connu (11/11/2026) : signé de SON nom.
      const nomAuto = nomExpediteur || String(param("commercial")).trim();
      const prenomCommercial = typeof commercial === "string" && commercial.trim() ? commercial.trim() : prenomDe(nomAuto);
      const signature = signatureAvecAdresse(typeof signature_html === "string" && signature_html.trim() ? signature_html : signatureStc(nomAuto, exp.adresseSignature), exp.adresseSignature);
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
      // Un TRANSFERT (26/11/2026) : le message choisi suit, avec sa mise en page (HTML nettoyé), sous la signature.
      const cite = citationTransfert(citation, avecPieces);
      if (cite) { corpsHtmlFinal += cite.html; corpsTextFinal += cite.texte; }
      // Les pièces du modèle, plus celles ajoutées à la main (réponse depuis la boîte de réception).
      if (tailleTotale(modele?.pieces_jointes, corps?.pieces) > PLAFOND_PIECES) return json({ error: "Pièces jointes trop lourdes (35 Mo au total au maximum)." }, 400);
      const attachments = enPiecesJointes(modele?.pieces_jointes, corps?.pieces);
      joints = attachments;
      // Le fil (26/11/2026) : seul un VRAI Message-ID (avec « @ », celui d'un mail reçu) va dans les en-têtes ; un
      // identifiant Resend (notre propre envoi) n'y va plus : la relance après notre réponse cassait le fil.
      const fil = enteteDeFil(in_reply_to, references);
      // RECRUTEMENT (26/11/2026, D70) : une réponse depuis la boîte est rangée sur l'artisan, comme un envoi de la
      // fiche (contrat A) : celui de la conversation (envoyé par l'écran, vérifié), sinon celui de l'adresse.
      if (espace === "recrutement") {
        const demande = typeof corps?.sous_traitant_id === "string" && /^[0-9a-f-]{36}$/i.test(corps.sous_traitant_id) ? corps.sous_traitant_id : null;
        if (demande) {
          const { data: s } = await admin.from("st_sous_traitants").select("id").eq("id", demande).maybeSingle();
          sousTraitantIdPourMessage = (s as { id?: string } | null)?.id ?? null;
        }
        if (!sousTraitantIdPourMessage) {
          const { data: s } = await admin.from("st_sous_traitants").select("id").ilike("email", destinataire).limit(1).maybeSingle();
          sousTraitantIdPourMessage = (s as { id?: string } | null)?.id ?? null;
        }
      }
      payload = { from, to: tousB, subject: objetFinal, html: corpsHtmlFinal, text: corpsTextFinal, ...(ccB.length ? { cc: ccB } : {}), ...(bccB.length ? { bcc: bccB } : {}), ...(attachments.length ? { attachments } : {}), ...(exp.replyTo ? { reply_to: exp.replyTo } : {}), ...(fil ? { headers: fil } : {}) };
    }

    // L'ADRESSE DE RÉPONSE PORTE LE MESSAGE (26/11/2026) : Resend remplace notre Message-ID par celui d'Amazon, une
    // réponse ne pouvait donc jamais être rattachée par le fil. L'identifiant de la ligne du journal (fixé ici, avant
    // l'envoi) passe dans l'adresse de réponse : « prenom-r-<id>@crm.stcbatiment.fr » ; recevoir-email le relit.
    // Une adresse de réponse hors de notre domaine n'est jamais touchée.
    const idJournal = crypto.randomUUID();
    {
      const porte = typeof payload.reply_to === "string" ? payload.reply_to : adresse(from);
      const ancree = adresseAncree(porte, idJournal);
      if (ancree) payload.reply_to = ancree;
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
      id: idJournal, sens: "sortant", de: adresse(from), a: aPourMessage || destinataire, objet: objetFinal,
      corps_text: corpsTextFinal, corps_html: corpsHtmlFinal, message_id: id || null,
      in_reply_to: typeof corps?.in_reply_to === "string" && corps.in_reply_to ? corps.in_reply_to : null, lu: true,
      // Les pièces envoyées, visibles dans le fil : l'adresse publique du fichier, ou — pièce d'un mail reçu
      // (transfert) — son chemin dans le stockage privé : le lien d'une heure expirait (26/11/2026).
      ...(joints.length ? { pieces_jointes: joints.map((j) => ({ nom: j.filename, chemin: cheminDuJournal(j.path), taille: 0, type: "" })) } : {}),
      espace, sous_traitant_id: sousTraitantIdPourMessage, ...(agenceId && espace === "demarchage" ? { agence_id: agenceId } : {}),
      // Le propriétaire du message (la boîte de qui) ; sans lui, la base le déduit (déclencheur messages_vers_proprietaire).
      ...(compteExpediteur && espace === "demarchage" ? { compte_id: compteExpediteur } : {}),
    });
    if (errJournal) console.error(`[ENVOYER-EMAIL] journal: ${errJournal.message}`);

    console.log(`[ENVOYER-EMAIL] ok → ${destinataire} objet="${objetFinal.slice(0, 60)}"`);
    return json({ ok: true, id, resend_id: id });
  } catch (e) {
    console.error("[ENVOYER-EMAIL] erreur:", e);
    return json({ error: "Erreur du relais email : " + String(e) }, 500);
  }
});
