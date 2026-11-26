// LE TRAITEMENT D'UNE ENVELOPPE DOCUSIGN, COMMUN AUX RETOURS (docusign-evenements) ET AU BOUTON « RELIRE »
// (docusign-envoyer, action `statut`) — lot 8, 27/11/2026.
//
// Avant, « Relire » posait « signé » sans ranger le PDF ni envoyer le lien, et le retour DocuSign arrivé ensuite
// croyait le travail fait (D81). Deux retours simultanés envoyaient deux liens d'accès, le premier annulé par le
// second (D80). Une erreur passée restait affichée après la réussite, et la date de signature bougeait à chaque
// retour (D83). Maintenant :
//   · le passage à « signé » est une mise à jour CONDITIONNELLE (statut ≠ signé) : une seule passe la gagne, et c'est
//     elle seule qui range le PDF, complète le dossier et envoie le lien ; si elle échoue, le contrat revient à son
//     statut d'avant et l'erreur est notée, pour que le retour suivant refasse tout ;
//   · la date de signature est celle de DocuSign (`completedDateTime`), posée une seule fois ;
//   · chaque passe réussie vide l'erreur.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { api, apiJson, estDemo, type ConfigDocusign } from "./docusign.ts"
import { envoyerLienAcces } from "./acces-partenaire.ts"
import { alerterBureau } from "./alerteBureau.ts"
import { statutDepuisEnveloppe, type EnveloppeStatut } from "./contratsPurs.ts"

type Enveloppe = EnveloppeStatut & {
  envelopeId: string; customFields?: { textCustomFields?: { name: string; value: string }[] }; envelopeDocuments?: { name: string; documentId: string }[]
}
type Piece = { slot?: string; path: string; nom?: string }
type Contrat = { id: string; sous_traitant_id: string; statut: string; pdf_path: string; documents: unknown }

export type Resultat = { ok: true; statut?: string; ignore?: string; deja?: boolean; dossier_complet?: boolean; lien?: { ok: boolean; detail: string } | null }

/** Relit l'enveloppe chez DocuSign et en tire tout ce qui doit suivre. Lève une erreur si une étape échoue. */
export async function traiterEnveloppe(sb: SupabaseClient, config: ConfigDocusign, jeton: string, envelopeId: string, env: (k: string) => string | undefined): Promise<Resultat> {
  const colonnes = "id, sous_traitant_id, statut, pdf_path, documents"
  let { data: contrat } = await sb.from("st_contrats").select(colonnes).eq("envelope_id", envelopeId).maybeSingle() as { data: Contrat | null }
  const e = await apiJson<Enveloppe>(config, jeton, "GET", `/envelopes/${envelopeId}?include=recipients,custom_fields,documents`)
  if (!contrat) {
    // Inconnue ici : si c'est bien une enveloppe du logiciel (champ caché sous_traitant_id), on la rattrape.
    const stId = e.customFields?.textCustomFields?.find((f) => f.name === "sous_traitant_id")?.value
    if (!stId) return { ok: true, ignore: "enveloppe inconnue ici" }
    const documents = (e.envelopeDocuments ?? []).filter((d) => d.documentId !== "certificate").map((d) => ({ nom: d.name }))
    const { data: cree, error: eC } = await sb.from("st_contrats").insert({ sous_traitant_id: stId, envelope_id: envelopeId, statut: "envoye", compte_nom: "rattrapé par DocuSign", documents }).select(colonnes).single()
    if (eC) return { ok: true, ignore: `enveloppe inconnue et fiche ${stId} introuvable` }
    contrat = cree as Contrat
  }
  const maintenant = new Date().toISOString()
  const etat = statutDepuisEnveloppe(e, maintenant)

  // Pas (encore) signé des deux côtés : on suit l'enveloppe, sans jamais redescendre un contrat déjà signé.
  if (etat.statut !== "signe") {
    const { error } = await sb.from("st_contrats").update({ statut: etat.statut, signe_artisan_le: etat.signeArtisanLe, maj_le: maintenant, erreur: "" }).eq("id", contrat.id).neq("statut", "signe")
    if (error) throw error
    return { ok: true, statut: etat.statut }
  }

  // Signé : une seule passe gagne le passage à « signé » (D80).
  const { data: gagne, error: eG } = await sb.from("st_contrats")
    .update({ statut: "signe", signe_artisan_le: etat.signeArtisanLe, signe_le: etat.signeLe, maj_le: maintenant, erreur: "" })
    .eq("id", contrat.id).neq("statut", "signe").select("id")
  if (eG) throw eG
  if (!gagne?.length) {
    // Déjà signé (une autre passe s'en occupe, ou s'en est occupée) : rien à refaire, l'ancienne erreur s'efface.
    await sb.from("st_contrats").update({ erreur: "", maj_le: maintenant }).eq("id", contrat.id)
    return { ok: true, statut: "signe", deja: true }
  }

  let dossierComplet = false
  try {
    if (!contrat.pdf_path) {
      const r = await api(config, jeton, "GET", `/envelopes/${envelopeId}/documents/combined`)
      if (!r.ok) throw new Error(`PDF signé introuvable (${r.status})`)
      const octets = new Uint8Array(await r.arrayBuffer())
      const chemin = `signes/${contrat.sous_traitant_id}/${envelopeId}.pdf`
      const { error: eU } = await sb.storage.from("contrats").upload(chemin, octets, { contentType: "application/pdf", upsert: true })
      if (eU) throw eU
      // Dans les pièces du dossier déposé de l'artisan, et le dossier devient « complet ».
      const { data: dossier } = await sb.from("dossiers_st").select("id, fichiers").eq("sous_traitant_id", contrat.sous_traitant_id).order("created_at", { ascending: false }).limit(1).maybeSingle()
      if (dossier) {
        const cheminDossier = `contrats/${dossier.id}/${envelopeId}.pdf`
        const { error: eD } = await sb.storage.from("dossiers-st").upload(cheminDossier, octets, { contentType: "application/pdf", upsert: true })
        if (eD) throw eD
        const noms = ((contrat.documents ?? []) as { nom: string }[]).map((d) => d.nom).filter(Boolean).join(", ")
        const pieces: Piece[] = Array.isArray(dossier.fichiers) ? (dossier.fichiers as Piece[]) : []
        const sansDoublon = pieces.filter((p) => p.path !== cheminDossier)
        sansDoublon.push({ slot: "contrat_signe", path: cheminDossier, nom: `Contrats signés${noms ? ` · ${noms}` : ""} (DocuSign).pdf` })
        const { error: eM } = await sb.from("dossiers_st").update({ fichiers: sansDoublon, complet_le: maintenant }).eq("id", dossier.id)
        if (eM) throw eM
        dossierComplet = true
      }
      const { error: eP } = await sb.from("st_contrats").update({ pdf_path: chemin }).eq("id", contrat.id)
      if (eP) throw eP
    }
  } catch (err) {
    // La passe gagnante a échoué : le contrat revient à son statut d'avant, pour que le prochain retour refasse tout.
    await sb.from("st_contrats").update({ statut: contrat.statut, signe_le: null, erreur: String(err).slice(0, 500), maj_le: new Date().toISOString() }).eq("id", contrat.id)
    throw err
  }

  // Signé par les deux parties → le lien « ouvrir mon accès » part, une seule fois (seule la passe gagnante arrive ici).
  // Un lien parti AVANT la signature complète (à la main, expiré depuis : il ne vit que 7 jours) ne compte pas.
  let lien: { ok: boolean; detail: string } | null = null
  const { data: fiche } = await sb.from("st_sous_traitants").select("id, entreprise, contact, email, telephone, metier, zone, acces_ouvert_le").eq("id", contrat.sous_traitant_id).maybeSingle()
  const f = fiche as { id: string; entreprise: string; contact: string; email: string; telephone: string; metier: string; zone: string; acces_ouvert_le: string | null } | null
  if (f && !f.acces_ouvert_le) {
    if (estDemo(config)) {
      // Contrats signés sur le compte de DÉMONSTRATION : sans valeur, pas de lien automatique (il s'envoie à la main si on le veut).
      lien = { ok: false, detail: "compte DocuSign de démonstration : lien d'accès non envoyé automatiquement" }
    } else {
      const r = await envoyerLienAcces(sb, { ...f, contrat_statut: "signe" }, env)
      lien = r.ok ? { ok: true, detail: r.dejaOuvert ? `accès déjà ouvert (${r.destinataire})` : r.destinataire } : { ok: false, detail: r.erreur }
      if (!r.ok) {
        console.error("[CONTRAT-SIGNE] lien d'accès non envoyé :", r.erreur)
        await alerterBureau(sb, `acces-non-envoye:${envelopeId}`, `Lien d'accès non envoyé — ${f.entreprise || f.email}`,
          `Les contrats de ${f.entreprise || f.contact || f.email} sont signés par les deux parties, mais le lien « ouvrir mon accès » n'est pas parti.\n\nRaison : ${r.erreur}\n\nÀ faire : ouvrir sa fiche de recrutement et renvoyer le lien à la main.`)
      }
    }
  }
  return { ok: true, statut: "signe", dossier_complet: dossierComplet, lien }
}
