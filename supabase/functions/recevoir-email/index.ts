// Réception des e-mails du CRM (webhook Resend Inbound) → table messages.
//
// ⚠ Rapatriée dans le dépôt le 08/10/2026 (elle ne vivait que dans Supabase).
//
// Le compte Resend est PARTAGÉ avec le logiciel principal : on ignore tout
// e-mail dont aucun destinataire n'est @crm.stcbatiment.fr (voir la note
// « resend compte partagé »).
//
// DEUX ESPACES (08/10/2026, renforcé le 11/11/2026) : chaque message reçu est rangé dans son espace,
//   · « recrutement » si l'adresse de recrutement est destinataire, si l'expéditeur est un artisan
//     de la base de recrutement, s'il répond à un de nos mails du recrutement, ou si son texte dit
//     clairement qu'un artisan propose ses services (la règle : _shared/boitesMail.ts, testée) ;
//   · « démarchage » sinon (les prospects commerciaux).
// UNE ADRESSE PAR COMMERCIAL (11/11/2026) : prenom@crm.stcbatiment.fr est gardée comme toute adresse
// du domaine ; c'est la BASE qui donne le mail à son propriétaire (déclencheur messages_vers_proprietaire :
// l'adresse dédiée parmi les destinataires, sinon le commercial de l'agence, sinon personne = administrateurs).
// Et une réponse d'artisan qui dit « stop », « désinscription », « ne plus me
// contacter »… DÉSINSCRIT la fiche à l'instant (séquence arrêtée, adresse
// exclue), sauf si c'est une réponse automatique d'absence.
// Une AGENCE (ou un client gestionnaire) qui répond la même chose est désinscrite de la même façon (26/11/2026,
// obligation légale) : « ne plus écrire » posé sur sa fiche, comme par instantly-evenements.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { lireReponse } from "../_shared/campagnes/generationIA.ts";
import { estDefiAntiSpam, nomDeStockage, texteDuHtml } from "../_shared/fil.ts";
import { adresseSeule, espaceDuMailRecu, estDuDomaine, estUneReponse, identifiantsCites, messageDeLAncre, porteSansAncre, repondAUnSujet } from "../_shared/boitesMail.ts";

const MAX_PJ_OCTETS = 15 * 1024 * 1024;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const adresse = adresseSeule;

/** Un en-tête lu chez Resend, qu'il vienne en objet ({ nom: valeur }) ou en liste ([{ name, value }]). */
function entete(headers: unknown, nom: string): string {
  const n = nom.toLowerCase();
  if (Array.isArray(headers)) {
    const h = headers.find((x) => String((x as { name?: string })?.name ?? (x as { key?: string })?.key ?? "").toLowerCase() === n) as { value?: unknown } | undefined;
    return String(h?.value ?? "");
  }
  if (headers && typeof headers === "object") {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) if (k.toLowerCase() === n) return String(Array.isArray(v) ? v.join(" ") : v ?? "");
  }
  return "";
}
/** Le nom affiché : celui d'origine, sans caractère de contrôle. */
const nomAffiche = (n: string) => String(n || "fichier").replace(/[\u0000-\u001f/\\]+/g, " ").trim().slice(0, 200) || "fichier";

/** Une réponse envoyée par un automate (absence, accusé de réception) : jamais une demande d'arrêt (RFC 3834). */
export function reponseAutomatique(headers: unknown): boolean {
  const auto = entete(headers, "auto-submitted").trim().toLowerCase();
  return (auto !== "" && auto !== "no") || entete(headers, "x-autoreply") !== "" || entete(headers, "x-autorespond") !== "";
}

/** Une demande d'arrêt, dans l'objet ou le début du corps. */
export function demandeArret(objet: string, corps: string): boolean {
  const t = `${objet}\n${corps.slice(0, 400)}`.toLowerCase();
  if (/r[ée]ponse automatique|automatic reply|out of office|absent|absence du bureau|en cong[ée]s/.test(t)) return false;
  return /d[ée]sinscri|d[ée]sabonn|unsubscribe|ne plus (me |nous )?(contacter|recevoir|[ée]crire|solliciter|envoyer)|retirez[- ]moi|supprimez[- ]moi|\bstop\b/.test(t);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);
  try {
    const payload = await req.json();
    const recu = payload?.data ?? payload ?? {};
    if (payload?.type && payload.type !== "email.received") return json({ ok: true, ignore: payload.type });
    // Sécurité (11/11/2026) : le mail doit exister chez Resend (identifiant impossible à deviner). L'expéditeur, les
    // destinataires, l'objet et le corps sont relus chez Resend : un faux appel ne peut rien inventer.
    const idResend = String(recu.email_id ?? "");
    const cleVerif = Deno.env.get("RESEND_API_KEY");
    if (!idResend || !cleVerif) return json({ error: "non autorisé" }, 401);
    const vrai = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(idResend)}`, { headers: { Authorization: "Bearer " + cleVerif } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const v = (vrai?.data ?? vrai) as Record<string, unknown> | null;
    if (!v || (v.id && String(v.id) !== idResend)) return json({ error: "mail inconnu" }, 401);
    const d: Record<string, any> = { ...recu };
    for (const k of ["from", "to", "cc", "subject", "message_id", "text", "html", "attachments", "in_reply_to", "headers", "received_for"]) if (v[k] !== undefined && v[k] !== null) d[k] = v[k];
    d.email_id = idResend;
    {
      const { count } = await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!).from("messages").select("id", { count: "exact", head: true }).eq("brut->data->>email_id", idResend);
      if ((count ?? 0) > 0) return json({ ok: true, ignore: "déjà reçu" });
    }

    const de = adresse(d.from?.address ?? d.from);
    // « received_for » : les vrais destinataires (une adresse dédiée en copie cachée n'est que là).
    const tous = [...new Set([
      ...(Array.isArray(d.to) ? d.to : [d.to]),
      ...(Array.isArray(d.cc) ? d.cc : []),
      ...(Array.isArray(d.received_for) ? d.received_for : []),
    ].map((t: unknown) => adresse((t as { address?: string })?.address ?? t)).filter(Boolean))];

    const pourLeCrmBrut = tous.filter(estDuDomaine);
    if (pourLeCrmBrut.length === 0) return json({ ok: true, ignore: "hors domaine crm" });
    // L'ADRESSE DE RÉPONSE PORTE LE MESSAGE (26/11/2026) : « prenom-r-<id>@ » désigne le mail que nous avions envoyé.
    // On garde la porte (« prenom@ ») comme destinataire : la boîte de qui et l'espace se lisent comme avant.
    const idAncre = pourLeCrmBrut.map(messageDeLAncre).find(Boolean) ?? null;
    const pourLeCrm = [...new Set(pourLeCrmBrut.map(porteSansAncre))];

    const objet = String(d.subject ?? "");
    const messageId = d.message_id ?? d.messageId ?? null;
    const emailId = d.email_id ?? null;
    const cleResend = Deno.env.get("RESEND_API_KEY");

    // ── CORPS : absent du webhook → on récupère l'e-mail complet via l'API Resend ──
    let corpsText = String(d.text ?? "");
    let corpsHtml = String(d.html ?? "");
    if (emailId && cleResend && !corpsText && !corpsHtml) {
      try {
        const full = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
          headers: { Authorization: "Bearer " + cleResend },
        }).then((r) => (r.ok ? r.json() : null));
        const e = full?.data ?? full;
        if (e) { corpsText = String(e.text ?? ""); corpsHtml = String(e.html ?? ""); }
        else console.warn(`[RECEVOIR-EMAIL] corps introuvable (id=${emailId})`);
      } catch (err) { console.warn(`[RECEVOIR-EMAIL] corps: ${String(err)}`); }
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Le mail envoyé auquel on répond, lu dans l'adresse de réponse : son agence, son artisan, sa boîte.
    type Origine = { id: string; espace: string | null; agence_id: string | null; sous_traitant_id: string | null; compte_id: string | null; message_id: string | null };
    let origine: Origine | null = null;
    if (idAncre) {
      const { data: o } = await admin.from("messages").select("id, espace, agence_id, sous_traitant_id, compte_id, message_id").eq("id", idAncre).eq("sens", "sortant").maybeSingle();
      origine = (o as Origine | null) ?? null;
    }

    // ── L'ESPACE (11/11/2026) : la règle pure de _shared/boitesMail.ts ──
    let sousTraitantId: string | null = null;
    let statutSt: string | null = null;
    if (de) {
      const { data: st } = await admin.from("st_sous_traitants").select("id, statut").ilike("email", de).limit(1).maybeSingle();
      sousTraitantId = st?.id ?? null;
      statutSt = st?.statut ?? null;
    }
    // Un collègue de l'artisan répond à notre mail : la fiche est celle du mail d'origine (jamais une désinscription
    // de l'artisan sur le mot d'un autre : statutSt reste vide, voir plus bas).
    const artisanDeLOrigine = !sousTraitantId && origine?.espace === "recrutement" ? origine.sous_traitant_id : null;
    // Répond-il à un de nos mails du recrutement ? Par les en-têtes (In-Reply-To, References), sinon par
    // le sujet (« Re: » + un sujet que le recrutement a envoyé à cette adresse).
    const inReplyTo: string | null = String(d.in_reply_to ?? d.inReplyTo ?? entete(d.headers, "in-reply-to")).trim() || null;
    let repondAuRecrutement = origine?.espace === "recrutement";
    const cites = identifiantsCites(inReplyTo, entete(d.headers, "references"));
    if (!repondAuRecrutement && cites.length) {
      const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("espace", "recrutement").in("message_id", cites.slice(0, 50));
      repondAuRecrutement = (count ?? 0) > 0;
    }
    if (!repondAuRecrutement && de && estUneReponse(objet)) {
      const { data: envoyes } = await admin.from("messages").select("objet").eq("espace", "recrutement").eq("sens", "sortant")
        .ilike("a", `%${de.replace(/[%_\\]/g, "")}%`).order("created_at", { ascending: false }).limit(30);
      repondAuRecrutement = repondAUnSujet(objet, ((envoyes ?? []) as { objet: string | null }[]).map((m) => m.objet ?? ""));
    }
    const { espace, raison } = espaceDuMailRecu({
      destinataires: pourLeCrm, expediteurEstArtisan: !!sousTraitantId, repondAuRecrutement,
      objet, corps: corpsText || corpsHtml.replace(/<[^>]+>/g, " "),
    });

    // L'agence : la base range le mail sur sa fiche (déclencheur messages_rattacher_agence, par
    // l'adresse du contact puis celle de l'agence). L'ancienne table « prospects » n'est plus lue (14/10).

    // Les pièces jointes. Une pièce qui ne peut pas être gardée n'est plus perdue en silence (26/11/2026) : elle reste
    // dans la liste du message, sans fichier, avec la raison (« nonGardee ») ; l'écran la montre « non reçue ».
    type Piece = { nom: string; chemin: string; taille: number; type: string; nonGardee?: string };
    const pieces: Piece[] = [];
    const attachs = Array.isArray(d.attachments) ? d.attachments : [];
    if (attachs.length) {
      const dossier = crypto.randomUUID();
      const noms = new Set<string>();
      for (const a of attachs) {
        const nom = nomAffiche(String(a?.filename || "fichier"));
        const type = String(a?.content_type || "");
        const perdue = (raison: string, taille = 0) => {
          console.warn(`[RECEVOIR-EMAIL] PJ non gardée « ${nom} » : ${raison}`);
          pieces.push({ nom, chemin: "", taille, type, nonGardee: raison });
        };
        try {
          if (!emailId || !cleResend) { perdue("pièce illisible chez le fournisseur"); continue; }
          const meta = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments/${a.id}`,
            { headers: { Authorization: "Bearer " + cleResend } }).then((r) => (r.ok ? r.json() : null));
          if (!meta?.download_url) { perdue("pièce illisible chez le fournisseur"); continue; }
          if (Number(meta.size) > MAX_PJ_OCTETS) { perdue(`trop lourde (${Math.round(Number(meta.size) / 1024 / 1024)} Mo, 15 Mo au maximum)`, Number(meta.size)); continue; }
          const contenu = await fetch(meta.download_url).then((r) => (r.ok ? r.arrayBuffer() : null));
          if (!contenu) { perdue("téléchargement impossible"); continue; }
          // Deux pièces au même nom ne s'écrasent pas.
          let fichier = nomDeStockage(String(a.filename || meta.filename || "fichier"));
          for (let i = 2; noms.has(fichier); i++) fichier = `${i}-${nomDeStockage(String(a.filename || meta.filename || "fichier"))}`;
          noms.add(fichier);
          const chemin = `${dossier}/${fichier}`;
          const { error: errUp } = await admin.storage.from("mails-recus").upload(chemin, contenu, {
            contentType: String(a.content_type || meta.content_type || "application/octet-stream"), upsert: true,
          });
          if (errUp) { perdue(`stockage refusé : ${errUp.message}`, contenu.byteLength); continue; }
          pieces.push({ nom, chemin, taille: contenu.byteLength, type: type || String(meta.content_type || "") });
        } catch (e) { perdue(`erreur : ${String(e).slice(0, 120)}`); }
      }
    }

    // L'ANTI-SPAM D'UNE AGENCE (26/11/2026, D75) : « Mailinblack » nous demande de prouver qu'on est humain ; notre mail
    // attend chez l'agence. Ce n'est pas une réponse : tri « anti_spam » (pas d'IA, pas de lead, pas de réponse de
    // campagne) ; la base le range sur l'agence du mail retenu (déclencheur messages_anti_spam_agence) et il arrive
    // non lu dans la boîte du chargé d'affaires, avec un bandeau.
    const antiSpam = espace === "demarchage" && estDefiAntiSpam(de);
    const lu = antiSpam ? { tri: "anti_spam", detail: null } : espace === "demarchage" ? await lireReponse(objet, corpsText || corpsHtml.replace(/<[^>]+>/g, " ")) : { tri: null, detail: null };
    const { data: insere, error } = await admin.from("messages").insert({
      sens: "entrant", de, a: pourLeCrm.join(", "), objet,
      corps_text: corpsText, corps_html: corpsHtml,
      message_id: messageId, in_reply_to: inReplyTo,
      sous_traitant_id: sousTraitantId ?? artisanDeLOrigine, espace, lu: false, brut: payload, pieces_jointes: pieces,
      // Réponse à un mail connu (adresse de réponse) : sa fiche et sa boîte, sans rien deviner par l'adresse de l'expéditeur.
      ...(origine && espace === "demarchage" && origine.agence_id ? { agence_id: origine.agence_id } : {}),
      ...(origine && espace === "demarchage" && origine.compte_id ? { compte_id: origine.compte_id } : {}),
      // Le tri de l'IA, comme pour les réponses venues d'Instantly : il décide lead ou dead (11/11/2026).
      tri: lu.tri, tri_detail: lu.detail,
    }).select("agence_id").single();
    if (error) throw error;
    const agenceId: string | null = insere?.agence_id ?? null;

    // ── LA DÉSINSCRIPTION PAR RÉPONSE ──
    let desinscrit = false;
    // Le corps lu : la version texte, sinon celle du HTML (26/11/2026, D72 : un « stop » écrit dans un mail en HTML seul
    // était ignoré — 2 mails reçus sur 37 n'ont pas de version texte). Jamais sur une demande d'anti-spam.
    const arret = !antiSpam && !reponseAutomatique(d.headers) && demandeArret(objet, corpsText.trim() ? corpsText : texteDuHtml(corpsHtml));
    if (sousTraitantId && statutSt !== "desinscrit" && arret) {
      const now = new Date().toISOString();
      await admin.from("st_sous_traitants").update({ statut: "desinscrit", desinscrit_le: now, desinscrit_canal: "reponse_email", statut_motif: `réponse : ${objet.slice(0, 80)}` }).eq("id", sousTraitantId);
      await admin.from("st_exclusions").upsert({ email: de || null, telephone: null, motif: "désinscription par réponse e-mail" }, { onConflict: "email", ignoreDuplicates: true });
      desinscrit = true;
    }
    // Une agence ou un client gestionnaire (la base a rangé le mail sur sa fiche) : « ne plus écrire », une seule fois.
    if (!sousTraitantId && agenceId && arret) {
      const { data: faite } = await admin.from("agences").update({ ne_plus_ecrire_le: new Date().toISOString() }).eq("id", agenceId).is("ne_plus_ecrire_le", null).select("id");
      desinscrit = (faite ?? []).length > 0;
    }

    console.log(`[RECEVOIR-EMAIL] de=${de} espace=${espace} (${raison}) corps=${corpsText.length}t/${corpsHtml.length}h pj=${pieces.filter((p) => !p.nonGardee).length}/${attachs.length}${idAncre ? ` ancre=${idAncre}${origine ? "" : "(inconnue)"}` : ""}${desinscrit ? " DÉSINSCRIT" : ""}`);
    return json({ ok: true, espace, raison, agence_id: agenceId, sous_traitant_id: sousTraitantId, desinscrit, corps: corpsText.length + corpsHtml.length, pieces_jointes: pieces.filter((p) => !p.nonGardee).length, pieces_non_gardees: pieces.filter((p) => p.nonGardee).length });
  } catch (e) {
    console.error("[RECEVOIR-EMAIL] erreur:", e);
    return json({ error: "Erreur de traitement" }, 500);
  }
});
