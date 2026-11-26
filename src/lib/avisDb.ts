// Les avis récoltés par les campagnes (10/11/2026).
import { supabase } from "./supabase"
import { lireParLots } from "./pagination"

export type StatutAvis = "a_valider" | "publie" | "refuse"
export type Avis = { id: string; campagneId: string | null; contactRef: string; public: string; note: number; commentaire: string; nomAffiche: string; autorise: boolean; statut: StatutAvis; motifRefus: string; rappeleLe: string | null; creeLe: string }
type Ligne = { id: string; campagne_id: string | null; contact_ref: string; public: string; note: number; commentaire: string; nom_affiche: string; autorise: boolean; statut: StatutAvis; motif_refus: string; rappele_le: string | null; cree_le: string }

export const NOM_PUBLIC: Record<string, string> = { locataires: "Locataires", clients_gestionnaires: "Gestionnaires clients", sous_traitants_actifs: "Sous-traitants actuels" }

function sb() {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  return supabase
}

export async function chargerAvis(): Promise<Avis[]> {
  // Tous les avis, par lots (26/11/2026) : au-delà de 1 000, les plus anciens disparaissaient sans rien dire.
  const lignes = await lireParLots<Ligne>((d, f) => sb().from("avis").select("*").order("cree_le", { ascending: false }).order("id").range(d, f) as unknown as PromiseLike<{ data: Ligne[] | null; error: { message: string } | null }>)
  return lignes.map((l) => ({ id: l.id, campagneId: l.campagne_id, contactRef: l.contact_ref, public: l.public, note: l.note, commentaire: l.commentaire, nomAffiche: l.nom_affiche, autorise: l.autorise, statut: l.statut, motifRefus: l.motif_refus, rappeleLe: l.rappele_le, creeLe: l.cree_le }))
}

async function maj(id: string, champs: Record<string, unknown>) {
  const { data, error } = await sb().from("avis").update(champs).eq("id", id).select("id")
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error("La base a refusé la modification.")
}
export const publierAvis = (id: string) => maj(id, { statut: "publie", motif_refus: "" })
export const refuserAvis = (id: string, motif: string) => maj(id, { statut: "refuse", motif_refus: motif })
export const noterRappel = (id: string) => maj(id, { rappele_le: new Date().toISOString() })

/** Les passages vers la page d'avis Google, par campagne (lot 3, 27/11/2026) : depuis le 17/11, le lien d'avis mène
 *  directement à Google, rien n'est plus noté chez nous ; seul le passage est connu (clic « google », hors robots). */
export type PassagesGoogle = { campagneId: string; nom: string; personnes: number; dernier: string }
export async function chargerPassagesGoogle(): Promise<PassagesGoogle[]> {
  type L = { campagne_id: string; contact_ref: string; le: string }
  const lignes = await lireParLots<L>((d, f) => sb().from("cmp_evenements").select("campagne_id, contact_ref, le").eq("type", "clic").eq("lien", "google").eq("robot", false).order("id").range(d, f) as unknown as PromiseLike<{ data: L[] | null; error: { message: string } | null }>)
  if (!lignes.length) return []
  const ids = [...new Set(lignes.map((l) => l.campagne_id))]
  const { data, error } = await sb().from("cmp_campagnes").select("id, nom").in("id", ids)
  if (error) throw new Error(error.message)
  const noms = new Map((data ?? []).map((c) => [String(c.id), String(c.nom)]))
  return ids.map((id) => {
    const l = lignes.filter((x) => x.campagne_id === id)
    return { campagneId: id, nom: noms.get(id) ?? "Campagne supprimée", personnes: new Set(l.map((x) => x.contact_ref)).size, dernier: l.reduce((m, x) => (x.le > m ? x.le : m), "") }
  }).sort((a, b) => b.personnes - a.personnes)
}
