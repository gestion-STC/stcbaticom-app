// Réception des e-mails du CRM (webhook Resend Inbound) → table messages.
//
// ⚠ Rapatriée dans le dépôt le 08/10/2026 (elle ne vivait que dans Supabase).
//
// Le compte Resend est PARTAGÉ avec le logiciel principal : on ignore tout
// e-mail dont aucun destinataire n'est @crm.stcbatiment.fr (voir la note
// « resend compte partagé »).
//
// DEUX ESPACES (08/10/2026) : chaque message reçu est rangé dans son espace,
//   · « recrutement » si l'adresse de recrutement est destinataire, ou si
//     l'expéditeur est un artisan de la base de recrutement ;
//   · « démarchage » sinon (les prospects commerciaux).
// Et une réponse d'artisan qui dit « stop », « désinscription », « ne plus me
// contacter »… DÉSINSCRIT la fiche à l'instant (séquence arrêtée, adresse
// exclue), sauf si c'est une réponse automatique d'absence.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const DOMAINE_CRM = "@crm.stcbatiment.fr";
const ADRESSES_RECRUTEMENT = ["recrutement@crm.stcbatiment.fr", "partenaires@crm.stcbatiment.fr"];
const MAX_PJ_OCTETS = 15 * 1024 * 1024;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const adresse = (raw: unknown): string => {
  const s = String(raw ?? "").trim();
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).toLowerCase().trim();
};
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
    const d = payload?.data ?? payload ?? {};
    if (payload?.type && payload.type !== "email.received") return json({ ok: true, ignore: payload.type });

    const de = adresse(d.from?.address ?? d.from);
    const tous = [
      ...(Array.isArray(d.to) ? d.to : [d.to]),
      ...(Array.isArray(d.cc) ? d.cc : []),
    ].map((t: unknown) => adresse((t as { address?: string })?.address ?? t)).filter(Boolean);

    const pourLeCrm = tous.filter((a) => a.endsWith(DOMAINE_CRM));
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

    // ── L'ESPACE : recrutement si l'adresse de recrutement est visée ou si l'expéditeur est un artisan de la base ──
    let sousTraitantId: string | null = null;
    let statutSt: string | null = null;
    if (de) {
      const { data: st } = await admin.from("st_sous_traitants").select("id, statut").ilike("email", de).limit(1).maybeSingle();
      sousTraitantId = st?.id ?? null;
      statutSt = st?.statut ?? null;
    }
    const espace = pourLeCrm.some((a) => ADRESSES_RECRUTEMENT.includes(a)) || sousTraitantId ? "recrutement" : "demarchage";

    let prospectId: string | null = null;
    if (de && espace === "demarchage") {
      const { data: p } = await admin.from("prospects").select("id").ilike("email", de).limit(1).maybeSingle();
      prospectId = p?.id ?? null;
    }

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

    const { error } = await admin.from("messages").insert({
      sens: "entrant", de, a: pourLeCrm.join(", "), objet,
      corps_text: corpsText, corps_html: corpsHtml,
      message_id: messageId, in_reply_to: d.in_reply_to ?? d.inReplyTo ?? null,
      prospect_id: prospectId, sous_traitant_id: sousTraitantId, espace, lu: false, brut: payload, pieces_jointes: pieces,
    });
    if (error) throw error;

    if (prospectId) {
      await admin.from("emails_envoyes").update({ a_repondu: true }).eq("prospect_id", prospectId).eq("a_repondu", false);
    }

    // ── LA DÉSINSCRIPTION PAR RÉPONSE ──
    let desinscrit = false;
    if (sousTraitantId && statutSt !== "desinscrit" && demandeArret(objet, corpsText)) {
      const now = new Date().toISOString();
      await admin.from("st_sous_traitants").update({ statut: "desinscrit", desinscrit_le: now, desinscrit_canal: "reponse_email", statut_motif: `réponse : ${objet.slice(0, 80)}` }).eq("id", sousTraitantId);
      await admin.from("st_exclusions").upsert({ email: de || null, telephone: null, motif: "désinscription par réponse e-mail" }, { onConflict: "email", ignoreDuplicates: true });
      desinscrit = true;
    }

    console.log(`[RECEVOIR-EMAIL] de=${de} espace=${espace} corps=${corpsText.length}t/${corpsHtml.length}h pj=${pieces.length}/${attachs.length}${desinscrit ? " DÉSINSCRIT" : ""}`);
    return json({ ok: true, espace, prospect_id: prospectId, sous_traitant_id: sousTraitantId, desinscrit, corps: corpsText.length + corpsHtml.length, pieces_jointes: pieces.length });
  } catch (e) {
    console.error("[RECEVOIR-EMAIL] erreur:", e);
    return json({ error: "Erreur de traitement" }, 500);
  }
});
