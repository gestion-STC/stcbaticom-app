// Les motifs de perte de la campagne d'un contact (Mahdi, 10/11/2026) : ceux réglés dans la campagne, s'il y en a une.
import { supabase } from "./supabase"

export async function motifsDeCampagne(contactRef: string): Promise<string[] | null> {
  if (!supabase) return null
  const { data: inscriptions } = await supabase.from("cmp_inscriptions").select("campagne_id").eq("contact_ref", contactRef).order("entree_le", { ascending: false }).limit(1)
  const id = (inscriptions?.[0] as { campagne_id?: string } | undefined)?.campagne_id
  if (!id) return null
  const { data } = await supabase.from("cmp_campagnes").select("config, origine, base_id").eq("id", id).maybeSingle()
  const ligne = data as { origine?: string | null; base_id?: string; config?: { qualification?: { motifs?: unknown } } | null } | null
  // Une agence : les motifs de sa fiche, une seule liste partout (11/11/2026).
  if (ligne?.base_id && ligne.base_id !== "artisans") return null
  const motifs = ligne?.origine ? null : ligne?.config?.qualification?.motifs
  return Array.isArray(motifs) && motifs.length ? (motifs as string[]) : null
}
