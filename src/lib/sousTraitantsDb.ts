import { supabase } from "./supabase"
import type { SousTraitant, StatutST } from "../recrutement"

type LigneST = {
  id: string
  entreprise: string
  contact: string
  email: string
  telephone: string
  metier: string
  zone: string
  source: string | null
  statut: string
  statut_motif: string | null
  statut_le: string | null
  sequence_id: string | null
  etape_courante: number
  demarre_le: string | null
  token: string
  dernier_clic_le: string | null
  nb_clics: number
  bareme_vu_le: string | null
  candidature_clic_le: string | null
  depose_le: string | null
  dossier_id: string | null
  termine_le: string | null
  desinscrit_le: string | null
  desinscrit_canal: string | null
  injoignable_le: string | null
  pause_jusqu_au: string | null
  dernier_envoi_le: string | null
  derniere_erreur: string | null
  nb_envois_ok: number | null
  nb_envois_erreur: number | null
  email_invalide: boolean | null
  recale_le: string | null
  nb_appels?: number | null
  nb_joints?: number | null
  dernier_appel_le?: string | null
  dernier_resultat?: string | null
  rappel_le?: string | null
  suivi?: string | null
  suivi_le?: string | null
  suivi_motif?: string | null
  telephone_invalide?: boolean | null
  contrat_statut?: string | null
  contrat_le?: string | null
  contrat_signe_le?: string | null
  acces_envoye_le?: string | null
  acces_ouvert_le?: string | null
  acces_email?: string | null
  cree_le: string
}

function vers(r: LigneST): SousTraitant {
  return {
    id: r.id,
    entreprise: r.entreprise ?? "",
    contact: r.contact ?? "",
    email: r.email ?? "",
    telephone: r.telephone ?? "",
    metier: r.metier ?? "",
    zone: r.zone ?? "",
    source: r.source ?? "",
    statut: (r.statut ?? "a_contacter") as StatutST,
    statutMotif: r.statut_motif ?? "",
    statutLe: r.statut_le,
    sequenceId: r.sequence_id,
    etapeCourante: r.etape_courante ?? 0,
    demarreLe: r.demarre_le,
    token: r.token,
    dernierClicLe: r.dernier_clic_le,
    nbClics: r.nb_clics ?? 0,
    baremeVuLe: r.bareme_vu_le,
    candidatureClicLe: r.candidature_clic_le,
    deposeLe: r.depose_le,
    dossierId: r.dossier_id,
    termineLe: r.termine_le,
    desinscritLe: r.desinscrit_le,
    desinscritCanal: r.desinscrit_canal ?? "",
    injoignableLe: r.injoignable_le,
    pauseJusquAu: r.pause_jusqu_au,
    dernierEnvoiLe: r.dernier_envoi_le,
    derniereErreur: r.derniere_erreur ?? "",
    nbEnvoisOk: r.nb_envois_ok ?? 0,
    nbEnvoisErreur: r.nb_envois_erreur ?? 0,
    emailInvalide: r.email_invalide ?? false,
    recaleLe: r.recale_le,
    nbAppels: r.nb_appels ?? 0,
    nbJoints: r.nb_joints ?? 0,
    dernierAppelLe: r.dernier_appel_le ?? null,
    dernierResultat: r.dernier_resultat ?? "",
    rappelLe: r.rappel_le ?? null,
    suivi: (r.suivi ?? "") as SousTraitant["suivi"],
    suiviLe: r.suivi_le ?? null,
    suiviMotif: r.suivi_motif ?? "",
    telephoneInvalide: r.telephone_invalide ?? false,
    contratStatut: (r.contrat_statut ?? "") as SousTraitant["contratStatut"],
    contratLe: r.contrat_le ?? null,
    contratSigneLe: r.contrat_signe_le ?? null,
    accesEnvoyeLe: r.acces_envoye_le ?? null,
    accesOuvertLe: r.acces_ouvert_le ?? null,
    accesEmail: r.acces_email ?? "",
    creeLe: r.cree_le,
  }
}

// Lecture par lots d'un sous-ensemble : `requete(de, a)` reçoit les bornes du lot
// (tri stable sur l'id obligatoire). Sert aux files de la session de call.
export async function chargerSousTraitantsParLots(requete: (de: number, a: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<SousTraitant[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const PAS = 1000
  const tout: LigneST[] = []
  for (let debut = 0; ; debut += PAS) {
    const { data, error } = await requete(debut, debut + PAS - 1)
    if (error) throw new Error(error.message)
    const lot = (data ?? []) as LigneST[]
    tout.push(...lot)
    if (lot.length < PAS) break
  }
  return tout.map(vers)
}

// Champs modifiables depuis l'appli (on ne touche jamais au token ni aux compteurs
// alimentés par le serveur : clics, envois, dépôt).
function versLigne(st: Partial<SousTraitant>) {
  const l: Record<string, unknown> = {}
  if (st.entreprise !== undefined) l.entreprise = st.entreprise
  if (st.contact !== undefined) l.contact = st.contact
  if (st.email !== undefined) l.email = st.email
  if (st.telephone !== undefined) l.telephone = st.telephone
  if (st.metier !== undefined) l.metier = st.metier
  if (st.zone !== undefined) l.zone = st.zone
  if (st.source !== undefined) l.source = st.source
  if (st.statut !== undefined) l.statut = st.statut
  if (st.statutMotif !== undefined) l.statut_motif = st.statutMotif
  if (st.sequenceId !== undefined) l.sequence_id = st.sequenceId
  if (st.etapeCourante !== undefined) l.etape_courante = st.etapeCourante
  if (st.demarreLe !== undefined) l.demarre_le = st.demarreLe
  if (st.pauseJusquAu !== undefined) l.pause_jusqu_au = st.pauseJusquAu
  if (st.desinscritLe !== undefined) l.desinscrit_le = st.desinscritLe
  if (st.desinscritCanal !== undefined) l.desinscrit_canal = st.desinscritCanal
  if (st.emailInvalide !== undefined) l.email_invalide = st.emailInvalide
  return l
}

export async function chargerSousTraitants(): Promise<SousTraitant[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  // Supabase/PostgREST plafonne à 1000 lignes par requête. On pagine pour tout
  // récupérer, sinon la base semble bloquée à 1000 sous-traitants.
  const PAS = 1000
  const tout: LigneST[] = []
  for (let debut = 0; ; debut += PAS) {
    const { data, error } = await supabase
      .from("st_sous_traitants")
      .select("*")
      .order("cree_le", { ascending: false })
      .range(debut, debut + PAS - 1)
    if (error) throw new Error(error.message)
    const lot = (data ?? []) as LigneST[]
    tout.push(...lot)
    if (lot.length < PAS) break
  }
  return tout.map(vers)
}

export async function chargerSousTraitant(id: string): Promise<SousTraitant> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase.from("st_sous_traitants").select("*").eq("id", id).single()
  if (error) throw new Error(error.message)
  return vers(data as LigneST)
}

export async function creerSousTraitant(st: Partial<SousTraitant>): Promise<SousTraitant> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("st_sous_traitants")
    .insert(versLigne(st))
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return vers(data as LigneST)
}

// Import en lot (fichier Excel/CSV). Renvoie le nombre inséré.
export async function insererSousTraitants(liste: Partial<SousTraitant>[]): Promise<number> {
  if (!supabase) throw new Error("Supabase non configuré")
  if (liste.length === 0) return 0
  let total = 0
  for (let i = 0; i < liste.length; i += 500) {
    const { data, error } = await supabase
      .from("st_sous_traitants")
      .insert(liste.slice(i, i + 500).map(versLigne))
      .select("id")
    if (error) throw new Error(error.message)
    total += (data as { id: string }[]).length
  }
  return total
}

export async function majSousTraitant(id: string, st: Partial<SousTraitant>): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("st_sous_traitants").update(versLigne(st)).eq("id", id)
  if (error) throw new Error(error.message)
}

export async function supprimerSousTraitant(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("st_sous_traitants").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// « Ne plus contacter » depuis l'écran : la fiche est désinscrite à l'instant,
// et son adresse comme son numéro vont dans la liste d'exclusion — même
// réimportée, elle ne sera jamais redémarrée.
export async function nePlusContacter(st: SousTraitant, motif: string): Promise<void> {
  if (!supabase || !st.id) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("st_sous_traitants").update({
    statut: "desinscrit", desinscrit_le: new Date().toISOString(), desinscrit_canal: "ecran",
    statut_motif: motif || "ne plus contacter (depuis l'écran)", pause_jusqu_au: null,
  }).eq("id", st.id)
  if (error) throw new Error(error.message)
  const email = (st.email || "").toLowerCase().trim()
  const telephone = (st.telephone || "").trim()
  if (email || telephone) {
    await supabase.from("st_exclusions").upsert(
      { email: email || null, telephone: telephone || null, motif: motif || "ne plus contacter (depuis l'écran)" },
      { onConflict: "email", ignoreDuplicates: true },
    )
  }
}

// Remettre une fiche arrêtée dans le circuit (terminé, injoignable, exclu) :
// elle redevient « à contacter », et sera redémarrée par la machine si elle
// est complète. Un désinscrit ne revient jamais par ce chemin.
// Un lead archivé (appelé sous l'ancienne version) revient dans « Leads à appeler ».
export async function remettreDansLesLeads(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("st_sous_traitants").update({ suivi: "", suivi_le: null, suivi_motif: "" }).eq("id", id).eq("suivi", "archive")
  if (error) throw new Error(error.message)
}
export async function remettreAContacter(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("st_sous_traitants")
    .update({ statut: "a_contacter", statut_motif: "remis à contacter depuis l'écran", demarre_le: null, sequence_id: null, etape_courante: 0, pause_jusqu_au: null, email_invalide: false })
    .eq("id", id).neq("statut", "desinscrit")
  if (error) throw new Error(error.message)
}

// Liste des métiers présents dans la base (pour proposer des objectifs cohérents).
export async function metiersDistincts(): Promise<string[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const PAS = 1000
  const set = new Set<string>()
  for (let debut = 0; ; debut += PAS) {
    const { data, error } = await supabase
      .from("st_sous_traitants")
      .select("metier")
      .range(debut, debut + PAS - 1)
    if (error) throw new Error(error.message)
    const lot = (data as { metier: string }[]) ?? []
    for (const r of lot) {
      const m = (r.metier || "").trim()
      if (m) set.add(m)
    }
    if (lot.length < PAS) break
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"))
}
