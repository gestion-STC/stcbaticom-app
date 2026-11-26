// La machine de recrutement vue depuis l'écran : ses passages, son journal
// d'envois et de clics, les dossiers déposés, la liste d'exclusion, et les
// quelques ordres qu'on lui donne (rejouer, lancer un passage, relancer une
// fiche, envoyer un test).
import { supabase } from "./supabase"
import type { ClicST, DossierST, EnvoiST, EtapeST, ExclusionST, PassageST, SousTraitant } from "../recrutement"

const JOUR_MS = 86_400_000
function client() {
  if (!supabase) throw new Error("Supabase non configuré")
  return supabase
}

// ── Passages du moteur ───────────────────────────────────────────────────────
type LignePassage = { id: string; debut: string; fin: string | null; bilan: Record<string, number | string | null>; erreur: string }
export async function chargerPassages(n = 24): Promise<PassageST[]> {
  const { data, error } = await client().from("st_passages").select("*").order("debut", { ascending: false }).limit(n)
  if (error) throw new Error(error.message)
  return (data as LignePassage[]).map((p) => ({ id: p.id, debut: p.debut, fin: p.fin, bilan: p.bilan ?? {}, erreur: p.erreur ?? "" }))
}

// ── Journal des envois et des clics ──────────────────────────────────────────
type LigneEnvoi = {
  id: string; sous_traitant_id: string; etape_id: string | null; etape_libelle?: string | null; canal: "email" | "sms"; envoye_le: string
  statut: EnvoiST["statut"]; erreur: string; cause: string | null; tentative: number | null
  rejouer_apres: string | null; resend_id: string | null; delivre_le: string | null; ouvert_le: string | null
}
const versEnvoi = (e: LigneEnvoi): EnvoiST => ({
  id: e.id, sousTraitantId: e.sous_traitant_id, etapeId: e.etape_id, etapeLibelle: e.etape_libelle ?? "", canal: e.canal, envoyeLe: e.envoye_le,
  statut: e.statut, erreur: e.erreur ?? "", cause: e.cause ?? "", tentative: e.tentative ?? 1,
  rejouerApres: e.rejouer_apres, resendId: e.resend_id, delivreLe: e.delivre_le, ouvertLe: e.ouvert_le,
})
// « * » plutôt que la liste : etape_libelle (lot 5, le nom d'une étape supprimée) se lit dès qu'il existe en base,
// sans casser la lecture tant que la mise à jour SQL n'est pas passée.
const COLONNES_ENVOI = "*"

/** Les envois depuis une date (paginés : la machine en fait des milliers). */
export async function chargerEnvoisDepuis(depuis: string): Promise<EnvoiST[]> {
  const PAS = 1000
  const tout: EnvoiST[] = []
  for (let debut = 0; ; debut += PAS) {
    const { data, error } = await client().from("st_envois").select(COLONNES_ENVOI)
      .gte("envoye_le", depuis).order("envoye_le", { ascending: false }).order("id").range(debut, debut + PAS - 1)
    if (error) throw new Error(error.message)
    const lot = (data ?? []) as LigneEnvoi[]
    tout.push(...lot.map(versEnvoi))
    if (lot.length < PAS) break
  }
  return tout
}
export const chargerEnvoisSurJours = (jours: number) => chargerEnvoisDepuis(new Date(Date.now() - jours * JOUR_MS).toISOString())

export async function chargerEnvoisDe(sousTraitantId: string): Promise<EnvoiST[]> {
  const { data, error } = await client().from("st_envois").select(COLONNES_ENVOI).eq("sous_traitant_id", sousTraitantId).order("envoye_le", { ascending: true })
  if (error) throw new Error(error.message)
  return (data as LigneEnvoi[]).map(versEnvoi)
}

type LigneClic = { id: string; sous_traitant_id: string; clique_le: string; destination: string }
const versClic = (c: LigneClic): ClicST => ({ id: c.id, sousTraitantId: c.sous_traitant_id, cliqueLe: c.clique_le, destination: (c.destination === "bareme" || c.destination === "stop" ? c.destination : "candidature") })
export async function chargerClicsDepuis(depuis: string): Promise<ClicST[]> {
  // Hors robots (26/11/2026) : la règle unique posée par la base sur chaque clic (colonne robot).
  const { data, error } = await client().from("st_clics").select("id, sous_traitant_id, clique_le, destination").eq("robot", false).gte("clique_le", depuis).order("clique_le", { ascending: false }).limit(5000)
  if (error) throw new Error(error.message)
  return (data as LigneClic[]).map(versClic)
}
export async function chargerClicsDe(sousTraitantId: string): Promise<ClicST[]> {
  const { data, error } = await client().from("st_clics").select("id, sous_traitant_id, clique_le, destination").eq("sous_traitant_id", sousTraitantId).eq("robot", false).order("clique_le", { ascending: true })
  if (error) throw new Error(error.message)
  return (data as LigneClic[]).map(versClic)
}

/** Les messages échangés avec une fiche (boîte de réception, espace recrutement). */
export type MessageDeFiche = { id: string; sens: "entrant" | "sortant"; objet: string; date: string; lu: boolean; extrait: string }
export async function chargerMessagesDe(sousTraitantId: string): Promise<MessageDeFiche[]> {
  const { data, error } = await client().from("messages").select("id, sens, objet, created_at, lu, corps_text")
    .eq("sous_traitant_id", sousTraitantId).order("created_at", { ascending: true }).limit(100)
  if (error) throw new Error(error.message)
  return (data as { id: string; sens: "entrant" | "sortant"; objet: string; created_at: string; lu: boolean; corps_text: string }[])
    .map((m) => ({ id: m.id, sens: m.sens, objet: m.objet ?? "", date: m.created_at, lu: m.lu, extrait: (m.corps_text ?? "").replace(/\s+/g, " ").slice(0, 160) }))
}

// ── Dossiers déposés ─────────────────────────────────────────────────────────
type LigneDossier = {
  id: string; created_at: string; raison_sociale: string; email: string; donnees: DossierST["donnees"] | null
  fichiers: DossierST["fichiers"] | null; email_envoye: boolean; token_ref: string | null; sous_traitant_id: string | null
  vu_le: string | null; traite_le: string | null; complet_le?: string | null
}
const versDossier = (d: LigneDossier): DossierST => ({
  id: d.id, creeLe: d.created_at, raisonSociale: d.raison_sociale ?? "", email: d.email ?? "", donnees: d.donnees ?? {},
  fichiers: Array.isArray(d.fichiers) ? d.fichiers : [], emailEnvoye: !!d.email_envoye, tokenRef: d.token_ref, sousTraitantId: d.sous_traitant_id, vuLe: d.vu_le, traiteLe: d.traite_le, completLe: d.complet_le ?? null,
})
export async function chargerDossiers(): Promise<DossierST[]> {
  const { data, error } = await client().from("dossiers_st").select("*").order("created_at", { ascending: false }).limit(500)
  if (error) throw new Error(error.message)
  return (data as LigneDossier[]).map(versDossier)
}
export async function marquerDossier(id: string, champs: { vu?: boolean; traite?: boolean }): Promise<void> {
  const maj: Record<string, unknown> = {}
  const now = new Date().toISOString()
  if (champs.vu !== undefined) maj.vu_le = champs.vu ? now : null
  if (champs.traite !== undefined) maj.traite_le = champs.traite ? now : null
  const { error } = await client().from("dossiers_st").update(maj).eq("id", id)
  if (error) throw new Error(error.message)
}
/**
 * Le statut d'une fiche qui perd son dossier (rattaché par erreur, lot 5 du 26/11/2026) :
 * celui qu'elle aurait sans ce dépôt. Désinscrite, injoignable ou terminée, elle le
 * redevient ; démarrée dans une séquence, elle y reprend (la machine saute d'elle-même
 * les étapes trop anciennes) ; jamais démarrée, elle redevient « à contacter ».
 */
export function statutSansDossier(f: { desinscritLe?: string | null; injoignableLe?: string | null; termineLe?: string | null; demarreLe?: string | null; sequenceId?: string | null }): SousTraitant["statut"] {
  if (f.desinscritLe) return "desinscrit"
  if (f.injoignableLe) return "injoignable"
  if (f.termineLe) return "termine"
  if (f.demarreLe) return f.sequenceId ? "en_sequence" : "termine"
  return "a_contacter"
}

/** Rattache un dossier à une fiche (ou détache avec `null`) ; la fiche passe en « déposé ».
 *  La fiche quittée (détachement ou changement de fiche) retrouve son statut : elle
 *  restait « Déposé » pour toujours, séquence arrêtée, sans aucun dossier. */
export async function rattacherDossier(dossier: DossierST, sousTraitantId: string | null): Promise<void> {
  const sb = client()
  // detache_le : la machine ne le rattache plus d'office à la fiche qu'on vient de quitter (lot 5).
  const { error } = await sb.from("dossiers_st").update({ sous_traitant_id: sousTraitantId, detache_le: sousTraitantId ? null : new Date().toISOString() }).eq("id", dossier.id)
  if (error) throw new Error(error.message)
  if (sousTraitantId) {
    const { error: e2 } = await sb.from("st_sous_traitants")
      .update({ statut: "depose", depose_le: dossier.creeLe, dossier_id: dossier.id, statut_motif: "dossier rattaché depuis l'écran" })
      .eq("id", sousTraitantId).neq("statut", "depose")
    if (e2) throw new Error(e2.message)
  }
  const quittee = dossier.sousTraitantId
  if (quittee && quittee !== sousTraitantId) await recalculerApresDetachement(quittee, dossier.id)
}

async function recalculerApresDetachement(ficheId: string, dossierId: string): Promise<void> {
  const sb = client()
  const { data: fiche, error } = await sb.from("st_sous_traitants")
    .select("statut, dossier_id, desinscrit_le, injoignable_le, termine_le, demarre_le, sequence_id").eq("id", ficheId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!fiche) return
  // Un autre dossier lui reste : elle garde « déposé », pointée sur celui-là.
  const { data: autres, error: e1 } = await sb.from("dossiers_st").select("id, created_at")
    .eq("sous_traitant_id", ficheId).order("created_at", { ascending: false }).limit(1)
  if (e1) throw new Error(e1.message)
  const autre = (autres ?? [])[0] as { id: string; created_at: string } | undefined
  if (autre) {
    if (fiche.dossier_id === dossierId) {
      const { error: e2 } = await sb.from("st_sous_traitants").update({ dossier_id: autre.id, depose_le: autre.created_at }).eq("id", ficheId)
      if (e2) throw new Error(e2.message)
    }
    return
  }
  if (fiche.statut !== "depose" && !fiche.dossier_id) return
  const maj: Record<string, unknown> = { depose_le: null, dossier_id: null, statut_motif: "dossier détaché depuis l'écran" }
  if (fiche.statut === "depose") {
    maj.statut = statutSansDossier({ desinscritLe: fiche.desinscrit_le, injoignableLe: fiche.injoignable_le, termineLe: fiche.termine_le, demarreLe: fiche.demarre_le, sequenceId: fiche.sequence_id })
  }
  const { error: e3 } = await sb.from("st_sous_traitants").update(maj).eq("id", ficheId)
  if (e3) throw new Error(e3.message)
}
/** Lien de lecture temporaire (10 min) d'une pièce d'un dossier. */
export async function lienPieceDossier(path: string): Promise<string> {
  const { data, error } = await client().storage.from("dossiers-st").createSignedUrl(path, 600)
  if (error || !data?.signedUrl) throw new Error(error?.message || "Lien indisponible")
  return data.signedUrl
}

// ── Liste d'exclusion ────────────────────────────────────────────────────────
type LigneExclusion = { id: string; email: string; telephone: string; motif: string; cree_le: string }
export async function chargerExclusions(): Promise<ExclusionST[]> {
  const { data, error } = await client().from("st_exclusions").select("*").order("cree_le", { ascending: false }).limit(2000)
  if (error) throw new Error(error.message)
  return (data as LigneExclusion[]).map((x) => ({ id: x.id, email: x.email ?? "", telephone: x.telephone ?? "", motif: x.motif ?? "", creeLe: x.cree_le }))
}
/** Ajoute une adresse et/ou un numéro (27/11/2026) : une adresse déjà exclue est complétée par le numéro, au lieu de
 *  refuser l'ajout (« doublon ») ; un numéro déjà exclu n'est pas ajouté deux fois. */
export async function ajouterExclusion(x: { email?: string; telephone?: string; motif: string }): Promise<void> {
  const { error } = await client().rpc("st_exclure", { p_email: x.email ?? "", p_telephone: x.telephone ?? "", p_motif: x.motif })
  if (error) throw new Error(error.message)
}
export async function supprimerExclusion(id: string): Promise<void> {
  const { error } = await client().from("st_exclusions").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// ── Les ordres donnés à la machine ───────────────────────────────────────────
/** Les erreurs en attente seront rejouées au prochain passage, sans attendre leur délai. */
export async function rejouerErreursMaintenant(): Promise<number> {
  const { data, error } = await client().from("st_envois").update({ rejouer_apres: new Date().toISOString() })
    .eq("statut", "erreur").gt("rejouer_apres", new Date().toISOString()).select("id")
  if (error) throw new Error(error.message)
  return (data as { id: string }[]).length
}

/** Un passage du moteur, tout de suite (il respecte ses propres règles : plage, plafonds). */
export async function lancerPassage(): Promise<Record<string, number | string | null>> {
  const { data, error } = await client().functions.invoke("sequenceur-st", { body: {} })
  if (error) throw new Error(error.message)
  return (data ?? {}) as Record<string, number | string | null>
}

/** Mettre une fiche en pause jusqu'à une date (ou lever la pause avec `null`). */
export async function mettreEnPause(id: string, jusquAu: string | null): Promise<void> {
  const { error } = await client().from("st_sous_traitants").update({ pause_jusqu_au: jusquAu }).eq("id", id)
  if (error) throw new Error(error.message)
}

/**
 * Relancer une fiche maintenant : son calendrier est décalé pour que sa
 * prochaine étape non faite soit due tout de suite (les suivantes gardent
 * leurs écarts). Si elle était arrêtée (terminé, injoignable), elle repart
 * en séquence. Une fiche désinscrite ou déposée ne se relance pas.
 */
export async function relancerMaintenant(st: SousTraitant, etapes: EtapeST[]): Promise<void> {
  if (!st.id) throw new Error("fiche sans identifiant")
  if (st.statut === "desinscrit" || st.statut === "depose") throw new Error("Cette fiche ne se relance pas.")
  const envois = await chargerEnvoisDe(st.id)
  const faits = new Set(envois.filter((e) => e.statut === "envoye" || e.statut === "saute" || e.statut === "abandonne").map((e) => e.etapeId))
  const actives = etapes.filter((e) => e.actif).sort((a, b) => a.ordre - b.ordre)
  const prochaine = actives.find((e) => !faits.has(e.id ?? ""))
  if (!prochaine) throw new Error("Toutes les étapes ont déjà été envoyées à cette fiche.")
  const demarreLe = new Date(Date.now() - prochaine.delaiJours * JOUR_MS).toISOString()
  const { error } = await client().from("st_sous_traitants").update({
    statut: "en_sequence", demarre_le: demarreLe, recale_le: new Date().toISOString(), pause_jusqu_au: null,
    sequence_id: prochaine.sequenceId, statut_motif: "relancé depuis l'écran",
  }).eq("id", st.id)
  if (error) throw new Error(error.message)
}

/** Un e-mail de test, envoyé depuis l'adresse du recrutement (espace recrutement). */
export async function envoyerEmailTest(to: string, subject: string, html: string): Promise<void> {
  const { data, error } = await client().functions.invoke("envoyer-email", { body: { espace: "recrutement", to, subject, html } })
  if (error) throw new Error(error.message)
  if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error)
}
export async function envoyerSmsTest(to: string, message: string): Promise<void> {
  const { data, error } = await client().functions.invoke("envoyer-sms", { body: { to, message } })
  if (error) throw new Error(error.message)
  if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error)
}

/**
 * « Sous-traitant hors base » (12/10/2026) : le dossier vient d'un artisan
 * absent de la base. On crée sa fiche depuis le dossier, déjà « déposé », et on
 * la rattache : contrats et lien d'accès se débloquent sans autre geste.
 */
export async function creerFicheHorsBase(dossier: DossierST): Promise<SousTraitant> {
  const { ficheDepuisDossier } = await import("./ficheHorsBase")
  const { creerSousTraitant } = await import("./sousTraitantsDb")
  const brouillon = ficheDepuisDossier(dossier)
  if (!brouillon.entreprise && !brouillon.email) throw new Error("Le dossier n'a ni raison sociale ni e-mail : impossible de créer la fiche.")
  const fiche = await creerSousTraitant(brouillon)
  const sb = client()
  const { error: e1 } = await sb.from("st_sous_traitants")
    .update({ depose_le: dossier.creeLe, dossier_id: dossier.id }).eq("id", fiche.id!)
  if (e1) throw new Error(e1.message)
  const { error: e2 } = await sb.from("dossiers_st").update({ sous_traitant_id: fiche.id }).eq("id", dossier.id)
  if (e2) throw new Error(e2.message)
  return { ...fiche, deposeLe: dossier.creeLe, dossierId: dossier.id }
}
