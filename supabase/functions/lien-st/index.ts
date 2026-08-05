// Lien tracké du recrutement sous-traitants.
//
// Chaque sous-traitant reçoit dans ses SMS/e-mails des liens de la forme :
//   https://<projet>.supabase.co/functions/v1/lien-st?t=<token>&d=candidature
//   https://<projet>.supabase.co/functions/v1/lien-st?t=<token>&d=bareme
// Quand il clique, cette fonction :
//   1) enregistre le clic (table st_clics) AVEC la destination (candidature | bareme),
//   2) met à jour le sous-traitant (dernier_clic_le, nb_clics + drapeau de la destination :
//      candidature_clic_le OU bareme_vu_le),
//   3) le redirige (302) vers la page de dépôt du site OU vers le PDF du barème.
//
// Objectif métier : identifier les INTÉRESSÉS →
//   • a cliqué "bareme"      = a consulté le barème,
//   • a cliqué "candidature" mais n'a PAS déposé de dossier = intéressé à relancer.
//
// ⚠️ Fonction PUBLIQUE : dans Supabase → Edge Functions, DÉSACTIVER « Verify JWT ».
//
// Secrets optionnels :
//   SITE_SOUS_TRAITANTS_URL = page de dépôt (défaut https://www.stcbatiment.fr/sous-traitants)
//   SITE_BAREME_URL         = URL publique du PDF barème (défaut = storage Supabase public)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const DEST_CANDIDATURE_DEFAUT = "https://www.stcbatiment.fr/sous-traitants"
const DEST_BAREME_DEFAUT =
  "https://ifvrmsiwlwppinfdmeao.supabase.co/storage/v1/object/public/campagne/bareme_STC.pdf"

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const token = url.searchParams.get("t") || ""
  // Destination : "bareme" pour le PDF, sinon (défaut) la page de candidature.
  const destination = url.searchParams.get("d") === "bareme" ? "bareme" : "candidature"

  const cibleCandidature = Deno.env.get("SITE_SOUS_TRAITANTS_URL") || DEST_CANDIDATURE_DEFAUT
  const cibleBareme = Deno.env.get("SITE_BAREME_URL") || DEST_BAREME_DEFAUT

  let cible: string
  if (destination === "bareme") {
    cible = cibleBareme
  } else {
    // On garde ?ref=<token> pour attribuer le dépôt de dossier au bon artisan.
    cible = token
      ? `${cibleCandidature}${cibleCandidature.includes("?") ? "&" : "?"}ref=${encodeURIComponent(token)}`
      : cibleCandidature
  }

  // Redirection quoi qu'il arrive : mieux vaut renvoyer l'artisan sur la cible que
  // de lui montrer une erreur si le tracking échoue.
  const redirection = () => new Response(null, { status: 302, headers: { Location: cible } })

  if (!token) return redirection()

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const { data: st } = await supabase
      .from("st_sous_traitants")
      .select("id, nb_clics")
      .eq("token", token)
      .maybeSingle()

    if (st?.id) {
      const now = new Date().toISOString()
      await supabase.from("st_clics").insert({
        sous_traitant_id: st.id,
        destination,
        user_agent: req.headers.get("user-agent") || "",
      })
      // Drapeau daté selon la destination (première fois surtout) + compteur global.
      const maj: Record<string, unknown> = { dernier_clic_le: now, nb_clics: (st.nb_clics ?? 0) + 1 }
      if (destination === "bareme") maj.bareme_vu_le = now
      else maj.candidature_clic_le = now
      await supabase.from("st_sous_traitants").update(maj).eq("id", st.id)
    }
  } catch {
    // On avale l'erreur : la redirection prime sur le tracking.
  }

  return redirection()
})
