// Lien tracké du recrutement sous-traitants.
//
// Chaque sous-traitant reçoit dans ses SMS/e-mails un lien de la forme :
//   https://<projet>.supabase.co/functions/v1/lien-st?t=<token>
// Quand il clique, cette fonction :
//   1) enregistre le clic (table st_clics) = une « impression » du tunnel,
//   2) met à jour le sous-traitant (dernier_clic_le, nb_clics),
//   3) le redirige (302) vers la page de dépôt de dossier du SITE VITRINE.
//
// ⚠️ Cette fonction est PUBLIQUE : dans Supabase → Edge Functions, il faut
//    DÉSACTIVER « Verify JWT » (sinon le lien exige un jeton et ne s'ouvre pas).
//    Elle utilise la clé service_role (fournie automatiquement) pour écrire malgré RLS.
//
// Secret optionnel : SITE_SOUS_TRAITANTS_URL = URL de la page de dépôt du site
//   (par défaut https://www.stcbatiment.fr/sous-traitants). Le token est ajouté en
//   « ?ref=<token> » pour permettre, plus tard, l'attribution précise du dépôt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const DESTINATION_DEFAUT = "https://www.stcbatiment.fr/sous-traitants"

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const token = url.searchParams.get("t") || ""

  const dest = Deno.env.get("SITE_SOUS_TRAITANTS_URL") || DESTINATION_DEFAUT
  const destAvecRef = token ? `${dest}${dest.includes("?") ? "&" : "?"}ref=${encodeURIComponent(token)}` : dest

  // Redirection quoi qu'il arrive : mieux vaut renvoyer l'artisan sur le site que
  // de lui montrer une erreur si le tracking échoue.
  const redirection = () =>
    new Response(null, { status: 302, headers: { Location: destAvecRef } })

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
        user_agent: req.headers.get("user-agent") || "",
      })
      await supabase
        .from("st_sous_traitants")
        .update({ dernier_clic_le: now, nb_clics: (st.nb_clics ?? 0) + 1 })
        .eq("id", st.id)
    }
  } catch (_e) {
    // On avale l'erreur : la redirection prime sur le tracking.
  }

  return redirection()
})
