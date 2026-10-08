// Lien tracké du recrutement sous-traitants.
//
// Chaque artisan reçoit dans ses SMS/e-mails des liens de la forme :
//   https://<projet>.supabase.co/functions/v1/lien-st?t=<token>&d=candidature
//   https://<projet>.supabase.co/functions/v1/lien-st?t=<token>&d=bareme
//   https://<projet>.supabase.co/functions/v1/lien-st?t=<token>&d=stop
// Quand il clique, cette fonction :
//   1) enregistre le clic (table st_clics) AVEC la destination,
//   2) met à jour la fiche (dernier_clic_le, nb_clics + drapeau daté de la destination),
//   3) le redirige (302) vers la page de dépôt du site OU vers le PDF du barème.
//
// « stop » (08/10/2026) = LA DÉSINSCRIPTION EN UN CLIC. Jusque-là le lien
// ouvrait un e-mail vers gestion@, à traiter à la main, et rien n'arrêtait la
// séquence. Ici : statut « désinscrit » posé à l'instant, l'adresse et le
// numéro vont dans la liste d'exclusion (plus jamais recontactés, même
// réimportés), et l'artisan voit une page qui le lui confirme. Les messageries
// l'appellent aussi en POST (en-tête List-Unsubscribe en un clic, RFC 8058).
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

function pageConfirmation(titre: string, texte: string): Response {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titre}</title>
<style>body{margin:0;background:#f6f6f8;font-family:Montserrat,'Segoe UI',Arial,sans-serif;color:#171717;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
.c{background:#fff;border:1px solid #e8e8e8;border-radius:14px;padding:32px 28px;max-width:440px}h1{font-size:20px;margin:0 0 10px}p{margin:0;color:#525252;line-height:1.55}small{display:block;margin-top:18px;color:#a3a3a3;font-size:12px}</style></head>
<body><div class="c"><h1>${titre}</h1><p>${texte}</p><small>STC Bâtiment · 7 rue Oscar Niemeyer, 78280 Guyancourt</small></div></body></html>`
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
    const { data: st } = await supabase.from("st_sous_traitants").select("id, nb_clics, email, telephone, statut").eq("token", token).maybeSingle()

    if (destination === "stop") {
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
      if (req.method === "POST") return new Response("ok", { status: 200 })
      return pageConfirmation("C'est noté", "Vous ne recevrez plus de message de STC Bâtiment concernant le recrutement d'artisans partenaires. Si c'est une erreur, écrivez-nous à recrutement@crm.stcbatiment.fr.")
    }

    if (st?.id) {
      const now = new Date().toISOString()
      await supabase.from("st_clics").insert({ sous_traitant_id: st.id, destination, user_agent: req.headers.get("user-agent") || "" })
      const maj: Record<string, unknown> = { dernier_clic_le: now, nb_clics: (st.nb_clics ?? 0) + 1 }
      if (destination === "bareme") maj.bareme_vu_le = now
      else maj.candidature_clic_le = now
      await supabase.from("st_sous_traitants").update(maj).eq("id", st.id)
    }
  } catch {
    // La redirection prime sur le tracking.
  }

  return redirection()
})
