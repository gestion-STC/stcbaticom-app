// Les avis récoltés par les campagnes (10/11/2026).
import { supabase } from "./supabase"

export type StatutAvis = "a_valider" | "publie" | "refuse"
export type Avis = { id: string; campagneId: string | null; contactRef: string; public: string; note: number; commentaire: string; nomAffiche: string; autorise: boolean; statut: StatutAvis; motifRefus: string; rappeleLe: string | null; creeLe: string }
type Ligne = { id: string; campagne_id: string | null; contact_ref: string; public: string; note: number; commentaire: string; nom_affiche: string; autorise: boolean; statut: StatutAvis; motif_refus: string; rappele_le: string | null; cree_le: string }

export const NOM_PUBLIC: Record<string, string> = { locataires: "Locataires", clients_gestionnaires: "Gestionnaires clients", sous_traitants_actifs: "Sous-traitants actuels" }

function sb() {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  return supabase
}

export async function chargerAvis(): Promise<Avis[]> {
  const { data, error } = await sb().from("avis").select("*").order("cree_le", { ascending: false }).limit(1000)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Ligne[]).map((l) => ({ id: l.id, campagneId: l.campagne_id, contactRef: l.contact_ref, public: l.public, note: l.note, commentaire: l.commentaire, nomAffiche: l.nom_affiche, autorise: l.autorise, statut: l.statut, motifRefus: l.motif_refus, rappeleLe: l.rappele_le, creeLe: l.cree_le }))
}

async function maj(id: string, champs: Record<string, unknown>) {
  const { data, error } = await sb().from("avis").update(champs).eq("id", id).select("id")
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error("La base a refusé la modification.")
}
export const publierAvis = (id: string) => maj(id, { statut: "publie", motif_refus: "" })
export const refuserAvis = (id: string, motif: string) => maj(id, { statut: "refuse", motif_refus: motif })
export const noterRappel = (id: string) => maj(id, { rappele_le: new Date().toISOString() })
