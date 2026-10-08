// Réception des dossiers de qualification sous-traitants depuis le site vitrine.
// Stocke le dossier (table dossiers_st), signe les URLs des pièces déposées dans
// le bucket dossiers-st, puis notifie service-travaux@ par e-mail (Resend).
//
// ⚠ Rapatriée dans le dépôt le 08/10/2026 (elle ne vivait que dans Supabase).
// Ajout du même jour : le JETON de l'artisan (`ref`, posé dans le lien tracké
// par lien-st) est enregistré dans dossiers_st.token_ref — c'est lui qui
// rattache le dépôt à la bonne fiche de la base de recrutement, même quand
// l'artisan dépose avec une autre adresse e-mail que celle de la base.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const DESTINATAIRE = "service-travaux@stcbatiment.fr";
const EXPEDITEUR = "STC Bâtiment <notifications@os.stcbatiment.fr>";
const BUCKET = "dossiers-st";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Ligne = { label: string; valeur: string };
type Section = { titre: string; lignes: Ligne[] };
type Fichier = { slot: string; path: string; nom: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST attendu" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  try {
    const body = await req.json();
    // Honeypot anti-spam : un humain ne remplit jamais ce champ caché.
    if (body.site) return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, "Content-Type": "application/json" } });

    const raisonSociale = String(body.raisonSociale || "").trim().slice(0, 200);
    const email = String(body.email || "").trim().slice(0, 200);
    // Le jeton du lien tracké (32 caractères hexadécimaux), s'il a été transmis.
    const tokenRef = /^[0-9a-f]{32}$/i.test(String(body.ref || "")) ? String(body.ref).toLowerCase() : "";
    const sections: Section[] = Array.isArray(body.sections) ? body.sections.slice(0, 12) : [];
    const fichiers: Fichier[] = (Array.isArray(body.fichiers) ? body.fichiers : [])
      .filter((f: Fichier) => typeof f.path === "string" && /^[0-9a-f-]{36}\//.test(f.path))
      .slice(0, 40);

    if (!raisonSociale || !email || sections.length === 0) {
      return new Response(JSON.stringify({ error: "Dossier incomplet (raison sociale, e-mail et contenu requis)." }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Rattachement à la fiche de recrutement : par jeton d'abord, sinon par e-mail.
    let sousTraitantId: string | null = null;
    if (tokenRef) {
      const { data } = await admin.from("st_sous_traitants").select("id").eq("token", tokenRef).maybeSingle();
      sousTraitantId = data?.id ?? null;
    }
    if (!sousTraitantId) {
      const { data } = await admin.from("st_sous_traitants").select("id").ilike("email", email).limit(1).maybeSingle();
      sousTraitantId = data?.id ?? null;
    }

    const { data: rangee, error: errInsert } = await admin
      .from("dossiers_st")
      .insert({ raison_sociale: raisonSociale, email, donnees: { sections }, fichiers, token_ref: tokenRef || null, sous_traitant_id: sousTraitantId })
      .select("id")
      .single();
    if (errInsert) throw errInsert;

    // La fiche passe en « déposé » tout de suite : la séquence s'arrête, sans
    // attendre le prochain passage du moteur (et même machine à l'arrêt).
    if (sousTraitantId) {
      await admin
        .from("st_sous_traitants")
        .update({ statut: "depose", depose_le: new Date().toISOString(), dossier_id: rangee.id })
        .eq("id", sousTraitantId)
        .neq("statut", "depose");
    }

    // URLs signées 30 jours pour consulter les pièces depuis l'e-mail.
    const liens: { nom: string; slot: string; url: string }[] = [];
    for (const f of fichiers) {
      const { data } = await admin.storage.from(BUCKET).createSignedUrl(f.path, 60 * 60 * 24 * 30);
      if (data?.signedUrl) liens.push({ nom: f.nom || f.path.split("/").pop() || "pièce", slot: f.slot || "", url: data.signedUrl });
    }

    let emailEnvoye = false;
    const cle = Deno.env.get("RESEND_API_KEY");
    if (cle) {
      const sectionsHtml = sections.map((s) => `
        <h3 style="margin:24px 0 8px;font-size:15px;color:#111">${esc(s.titre)}</h3>
        <table style="border-collapse:collapse;width:100%">${(s.lignes || []).slice(0, 60).map((l) => `
          <tr><td style="padding:4px 12px 4px 0;color:#666;font-size:13px;vertical-align:top;white-space:nowrap">${esc(l.label)}</td>
          <td style="padding:4px 0;font-size:13px;color:#111">${esc(l.valeur).replace(/\n/g, "<br>")}</td></tr>`).join("")}
        </table>`).join("");
      const liensHtml = liens.length
        ? `<h3 style="margin:24px 0 8px;font-size:15px;color:#111">Pièces déposées (liens valables 30 jours)</h3><ul>${liens.map((l) => `<li style="font-size:13px"><a href="${l.url}">${esc(l.slot ? `${l.slot} — ${l.nom}` : l.nom)}</a></li>`).join("")}</ul>`
        : `<p style="font-size:13px;color:#b3261e">Aucune pièce jointe déposée.</p>`;
      const reponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: EXPEDITEUR,
          to: [DESTINATAIRE],
          reply_to: email,
          subject: `Nouveau dossier sous-traitant — ${raisonSociale}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:640px">
            <h2 style="color:#b3261e">Dossier de qualification sous-traitant</h2>
            <p style="font-size:13px;color:#666">Déposé depuis le site — référence interne ${rangee.id}${sousTraitantId ? " · fiche de recrutement rattachée" : ""}</p>
            ${sectionsHtml}${liensHtml}</div>`,
        }),
      });
      emailEnvoye = reponse.ok;
      if (emailEnvoye) await admin.from("dossiers_st").update({ email_envoye: true }).eq("id", rangee.id);
    }

    return new Response(JSON.stringify({ ok: true, id: rangee.id, emailEnvoye }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("soumettre-dossier-st", e);
    return new Response(JSON.stringify({ error: "Erreur lors de l'enregistrement du dossier." }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
