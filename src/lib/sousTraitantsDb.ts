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
  statut: string
  sequence_id: string | null
  etape_courante: number
  demarre_le: string | null
  token: string
  dernier_clic_le: string | null
  nb_clics: number
  depose_le: string | null
  dossier_id: string | null
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
    statut: (r.statut ?? "a_contacter") as StatutST,
    sequenceId: r.sequence_id,
    etapeCourante: r.etape_courante ?? 0,
    demarreLe: r.demarre_le,
    token: r.token,
    dernierClicLe: r.dernier_clic_le,
    nbClics: r.nb_clics ?? 0,
    deposeLe: r.depose_le,
    dossierId: r.dossier_id,
    creeLe: r.cree_le,
  }
}

// Champs modifiables depuis l'appli (on ne touche jamais au token ni aux compteurs
// alimentés par le serveur : clics, dépôt).
function versLigne(st: Partial<SousTraitant>) {
  const l: Record<string, unknown> = {}
  if (st.entreprise !== undefined) l.entreprise = st.entreprise
  if (st.contact !== undefined) l.contact = st.contact
  if (st.email !== undefined) l.email = st.email
  if (st.telephone !== undefined) l.telephone = st.telephone
  if (st.metier !== undefined) l.metier = st.metier
  if (st.zone !== undefined) l.zone = st.zone
  if (st.statut !== undefined) l.statut = st.statut
  if (st.sequenceId !== undefined) l.sequence_id = st.sequenceId
  if (st.etapeCourante !== undefined) l.etape_courante = st.etapeCourante
  if (st.demarreLe !== undefined) l.demarre_le = st.demarreLe
  return l
}

export async function chargerSousTraitants(): Promise<SousTraitant[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("st_sous_traitants")
    .select("*")
    .order("cree_le", { ascending: false })
  if (error) throw new Error(error.message)
  return (data as LigneST[]).map(vers)
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
  const { data, error } = await supabase
    .from("st_sous_traitants")
    .insert(liste.map(versLigne))
    .select("id")
  if (error) throw new Error(error.message)
  return (data as { id: string }[]).length
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

// Liste des métiers présents dans la base (pour proposer des objectifs cohérents).
export async function metiersDistincts(): Promise<string[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase.from("st_sous_traitants").select("metier")
  if (error) throw new Error(error.message)
  const set = new Set<string>()
  for (const r of (data as { metier: string }[]) ?? []) {
    const m = (r.metier || "").trim()
    if (m) set.add(m)
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"))
}
