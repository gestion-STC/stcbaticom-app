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
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { lireReponse } from "../_shared/campagnes/generationIA.ts";
import { adresseSeule, espaceDuMailRecu, estDuDomaine, estUneReponse, identifiantsCites, repondAUnSujet } from "../_shared/boitesMail.ts";

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
const nomSur = (n: string) => (n || "fichier").replace(/[^\w.\-éèêàçùïöüâîôû ]+/gi, "_").slice(0, 120);

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

    const pourLeCrm = tous.filter(estDuDomaine);
    if (pourLeCrm.length === 0) return json({ ok: true, ignore: "hors domaine crm" });

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

    // ── L'ESPACE (11/11/2026) : la règle pure de _shared/boitesMail.ts ──
    let sousTraitantId: string | null = null;
    let statutSt: string | null = null;
    if (de) {
      const { data: st } = await admin.from("st_sous_traitants").select("id, statut").ilike("email", de).limit(1).maybeSingle();
      sousTraitantId = st?.id ?? null;
      statutSt = st?.statut ?? null;
    }
    // Répond-il à un de nos mails du recrutement ? Par les en-têtes (In-Reply-To, References), sinon par
    // le sujet (« Re: » + un sujet que le recrutement a envoyé à cette adresse).
    const inReplyTo: string | null = String(d.in_reply_to ?? d.inReplyTo ?? entete(d.headers, "in-reply-to")).trim() || null;
    let repondAuRecrutement = false;
    const cites = identifiantsCites(inReplyTo, entete(d.headers, "references"));
    if (cites.length) {
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

    const pieces: { nom: string; chemin: string; taille: number; type: string }[] = [];
    const attachs = Array.isArray(d.attachments) ? d.attachments : [];
    if (attachs.length && emailId && cleResend) {
      const dossier = crypto.randomUUID();
      for (const a of attachs) {
        try {
          const meta = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments/${a.id}`,
            { headers: { Authorization: "Bearer " + cleResend } }).then((r) => (r.ok ? r.json() : null));
          if (!meta?.download_url) continue;
          if (Number(meta.size) > MAX_PJ_OCTETS) continue;
          const contenu = await fetch(meta.download_url).then((r) => (r.ok ? r.arrayBuffer() : null));
          if (!contenu) continue;
          const nom = nomSur(String(a.filename || meta.filename || "fichier"));
          const chemin = `${dossier}/${nom}`;
          const { error: errUp } = await admin.storage.from("mails-recus").upload(chemin, contenu, {
            contentType: String(a.content_type || meta.content_type || "application/octet-stream"), upsert: true,
          });
          if (errUp) continue;
          pieces.push({ nom, chemin, taille: contenu.byteLength, type: String(a.content_type || "") });
        } catch (e) { console.warn(`[RECEVOIR-EMAIL] PJ: ${String(e)}`); }
      }
    }

    const lu = espace === "demarchage" ? await lireReponse(objet, corpsText || corpsHtml.replace(/<[^>]+>/g, " ")) : { tri: null, detail: null };
    const { data: insere, error } = await admin.from("messages").insert({
      sens: "entrant", de, a: pourLeCrm.join(", "), objet,
      corps_text: corpsText, corps_html: corpsHtml,
      message_id: messageId, in_reply_to: inReplyTo,
      sous_traitant_id: sousTraitantId, espace, lu: false, brut: payload, pieces_jointes: pieces,
      // Le tri de l'IA, comme pour les réponses venues d'Instantly : il décide lead ou dead (11/11/2026).
      tri: lu.tri, tri_detail: lu.detail,
    }).select("agence_id").single();
    if (error) throw error;
    const agenceId: string | null = insere?.agence_id ?? null;

    // ── LA DÉSINSCRIPTION PAR RÉPONSE ──
    let desinscrit = false;
    if (sousTraitantId && statutSt !== "desinscrit" && demandeArret(objet, corpsText)) {
      const now = new Date().toISOString();
      await admin.from("st_sous_traitants").update({ statut: "desinscrit", desinscrit_le: now, desinscrit_canal: "reponse_email", statut_motif: `réponse : ${objet.slice(0, 80)}` }).eq("id", sousTraitantId);
      await admin.from("st_exclusions").upsert({ email: de || null, telephone: null, motif: "désinscription par réponse e-mail" }, { onConflict: "email", ignoreDuplicates: true });
      desinscrit = true;
    }

    console.log(`[RECEVOIR-EMAIL] de=${de} espace=${espace} (${raison}) corps=${corpsText.length}t/${corpsHtml.length}h pj=${pieces.length}/${attachs.length}${desinscrit ? " DÉSINSCRIT" : ""}`);
    return json({ ok: true, espace, raison, agence_id: agenceId, sous_traitant_id: sousTraitantId, desinscrit, corps: corpsText.length + corpsHtml.length, pieces_jointes: pieces.length });
  } catch (e) {
    console.error("[RECEVOIR-EMAIL] erreur:", e);
    return json({ error: "Erreur de traitement" }, 500);
  }
});
