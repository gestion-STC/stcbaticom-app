// Les motifs de perte de la campagne d'un contact (Mahdi, 10/11/2026) : ceux réglés dans la campagne, s'il y en a une.
import { supabase } from "./supabase"

export async function motifsDeCampagne(contactRef: string): Promise<string[] | null> {
  if (!supabase) return null
  const { data: inscriptions } = await supabase.from("cmp_inscriptions").select("campagne_id").eq("contact_ref", contactRef).order("entree_le", { ascending: false }).limit(1)
  const id = (inscriptions?.[0] as { campagne_id?: string } | undefined)?.campagne_id
  if (!id) return null
  const { data } = await supabase.from("cmp_campagnes").select("config, origine").eq("id", id).maybeSingle()
  const ligne = data as { origine?: string | null; config?: { qualification?: { motifs?: unknown } } | null } | null
  const motifs = ligne?.origine ? null : ligne?.config?.qualification?.motifs
  return Array.isArray(motifs) && motifs.length ? (motifs as string[]) : null
}
