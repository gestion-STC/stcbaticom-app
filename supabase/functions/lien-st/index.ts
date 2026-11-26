// Lien tracké du recrutement sous-traitants.
//
// Chaque artisan reçoit dans ses SMS/e-mails des liens de la forme :
//   https://<projet>.supabase.co/functions/v1/lien-st?t=<token>&d=candidature
//   https://<projet>.supabase.co/functions/v1/lien-st?t=<token>&d=bareme
//   https://<projet>.supabase.co/functions/v1/lien-st?t=<token>&d=stop
// Quand il clique, cette fonction :
//   1) enregistre le clic (table st_clics) AVEC la destination,
//   2) met à jour la fiche (dernier_clic_le + drapeau daté de la destination ; nb_clics est recompté par la base),
//   3) le redirige (302) vers la page de dépôt du site OU vers le PDF du barème.
//
// « stop » (08/10/2026) = LA DÉSINSCRIPTION. Statut « désinscrit », l'adresse et le numéro vont dans la liste
// d'exclusion (plus jamais recontactés, même réimportés).
// EN DEUX TEMPS depuis le 26/11/2026, comme pour les agences (evenements-site) : les robots de sécurité des messageries
// ouvrent tous les liens d'un mail (cas réels : SOC PEINTURE INTERIEURE le 19/10, DALEOS le 23/10, le lien « stop » et
// trois liens « candidature » ouverts dans la même seconde). L'ouverture (GET) ne fait qu'afficher une page avec un
// bouton ; seul un POST désinscrit : le bouton de la page, ou le bouton « Se désinscrire » de Gmail/Yahoo (en-tête
// List-Unsubscribe en un clic, RFC 8058). Un robot ne poste pas de formulaire.
//
// ⚠️ Fonction PUBLIQUE : dans Supabase → Edge Functions, « Verify JWT » désactivé.
//
// Secrets optionnels :
//   SITE_SOUS_TRAITANTS_URL = page de dépôt (défaut https://www.stcbatiment.fr/sous-traitants)
//   SITE_BAREME_URL         = URL publique du PDF barème (défaut = storage Supabase public)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const DEST_CANDIDATURE_DEFAUT = "https://www.stcbatiment.fr/sous-traitants"
const DEST_BAREME_DEFAUT =
  "https://ifvrmsiwlwppinfdmeao.supabase.co/storage/v1/object/public/campagne/bareme_STC.pdf"

function pageConfirmation(titre: string, texte: string, bouton = ""): Response {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${titre}</title>
<style>body{margin:0;background:#f6f6f8;font-family:Montserrat,'Segoe UI',Arial,sans-serif;color:#171717;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
.c{background:#fff;border:1px solid #e8e8e8;border-radius:14px;padding:32px 28px;max-width:440px}h1{font-size:20px;margin:0 0 10px}p{margin:0;color:#525252;line-height:1.55}small{display:block;margin-top:18px;color:#a3a3a3;font-size:12px}button{margin-top:20px;background:#17181a;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-size:15px;cursor:pointer}</style></head>
<body><div class="c"><h1>${titre}</h1><p>${texte}</p>${bouton}<small>STC Bâtiment · 7 rue Oscar Niemeyer, 78280 Guyancourt</small></div></body></html>`
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const token = url.searchParams.get("t") || ""
  const d = url.searchParams.get("d")
  const destination = d === "bareme" ? "bareme" : d === "stop" ? "stop" : "candidature"

  const cibleCandidature = Deno.env.get("SITE_SOUS_TRAITANTS_URL") || DEST_CANDIDATURE_DEFAUT
  const cibleBareme = Deno.env.get("SITE_BAREME_URL") || DEST_BAREME_DEFAUT

  let cible: string
  if (destination === "bareme") {
    cible = cibleBareme
  } else {
    // ?ref=<token> : le site le renvoie avec le dossier, pour rattacher le dépôt à la bonne fiche.
    cible = token
      ? `${cibleCandidature}${cibleCandidature.includes("?") ? "&" : "?"}ref=${encodeURIComponent(token)}`
      : cibleCandidature
  }
  const redirection = () => new Response(null, { status: 302, headers: { Location: cible } })

  if (!token) return destination === "stop" ? pageConfirmation("Lien incomplet", "Ce lien de désinscription n'est pas valide. Répondez simplement « stop » à l'e-mail reçu.") : redirection()

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    const { data: st } = await supabase.from("st_sous_traitants").select("id, nb_clics, email, telephone, statut, suivi").eq("token", token).maybeSingle()

    if (destination === "stop") {
      // L'ouverture du lien : la page et son bouton, rien d'autre (ni désinscription, ni clic noté : un clic « stop »
      // compterait une désinscription dans la campagne).
      if (req.method !== "POST") {
        if (!st?.id) return pageConfirmation("Lien expiré", "Répondez simplement « stop » à notre message et nous ne vous écrirons plus.")
        const action = `?t=${encodeURIComponent(token)}&d=stop`
        return pageConfirmation("Ne plus recevoir nos messages ?", "Confirmez pour ne plus recevoir les messages de STC Bâtiment concernant le recrutement d'artisans partenaires.", `<form method="post" action="${action}"><button type="submit">Confirmer ma désinscription</button></form>`)
      }
      if (st?.id) {
        const now = new Date().toISOString()
        await supabase.from("st_clics").insert({ sous_traitant_id: st.id, destination: "stop", user_agent: req.headers.get("user-agent") || "" })
        if (st.statut !== "desinscrit") {
          await supabase.from("st_sous_traitants").update({ statut: "desinscrit", desinscrit_le: now, desinscrit_canal: "lien", statut_motif: "désinscription par le lien" }).eq("id", st.id)
          await supabase.from("st_exclusions").upsert(
            { email: String(st.email || "").toLowerCase().trim() || null, telephone: String(st.telephone || "").trim() || null, motif: "désinscription par le lien" },
            { onConflict: "email", ignoreDuplicates: true },
          )
        }
      }
      // Le bouton de la page comme celui de la messagerie (RFC 8058) reçoivent la page de confirmation.
      return pageConfirmation("C'est noté", "Vous ne recevrez plus de message de STC Bâtiment concernant le recrutement d'artisans partenaires. Si c'est une erreur, écrivez-nous à recrutement@crm.stcbatiment.fr.")
    }

    if (st?.id) {
      const now = new Date().toISOString()
      // Le clic d'abord, dans le journal : c'est LA preuve. Un échec est retenté une fois, puis signalé dans les journaux.
      const clic = { sous_traitant_id: st.id, destination, user_agent: req.headers.get("user-agent") || "" }
      let { error: eClic } = await supabase.from("st_clics").insert(clic)
      if (eClic) ({ error: eClic } = await supabase.from("st_clics").insert(clic))
      if (eClic) console.error("[lien-st] clic NON enregistré", st.id, destination, eClic.message)
      // ⚠ nb_clics n'est plus écrit ici (12/10/2026) : lu puis écrit +1, il perdait les clics simultanés.
      // La base le recompte depuis le journal à chaque clic (déclencheur st_clics_vers_fiche).
      const maj: Record<string, unknown> = { dernier_clic_le: now }
      // Une fiche rangée « archive » (appelée sous l'ancienne version) qui reclique est un lead frais : elle revient dans « Leads à appeler » (12/10/2026).
      if (st.suivi === "archive") Object.assign(maj, { suivi: "", suivi_le: null, suivi_motif: "" })
      if (destination === "bareme") maj.bareme_vu_le = now
      else maj.candidature_clic_le = now
      await supabase.from("st_sous_traitants").update(maj).eq("id", st.id)
    }
  } catch {
    // La redirection prime sur le tracking.
  }

  return redirection()
})
