// LES TÂCHES DES CAMPAGNES (09/11/2026) : une étape Appel ou LinkedIn d'une séquence devient une chose à faire pour
// quelqu'un. Elles se lisent dans l'Agenda et sur la fiche de la session de call ; « Fait » les retire des deux.
import { supabase } from "./supabase"
import { lireParLots } from "./pagination"

export type TacheCampagne = {
  id: string; type: "appel" | "linkedin"; consigne: string; creeLe: string; campagneNom: string
  contactRef: string; baseId: string; nom: string; personne: string; telephone: string; appelStandard: boolean; proprietaireId: string | null
}
type LigneTache = { id: string; campagne_id: string; contact_ref: string; type: string; consigne: string | null; cree_le: string; cible: string | null }
type LigneContact = { id: string; base_id: string; nom: string | null; personne: string | null; telephone: string | null; proprietaire_id: string | null; champs: { standard?: string } | null }
type Lot<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

function sb() {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  return supabase
}

/** Les tâches ouvertes, les plus anciennes d'abord ; pour un seul contact si on le précise. */
export async function chargerTachesCampagne(contactRef?: string): Promise<TacheCampagne[]> {
  const taches = await lireParLots<LigneTache>((d, f) => {
    const q = sb().from("cmp_taches").select("id, campagne_id, contact_ref, type, consigne, cree_le, cible").is("faite_le", null)
    return (contactRef ? q.eq("contact_ref", contactRef) : q).order("cree_le").order("id").range(d, f) as unknown as Lot<LigneTache>
  })
  if (!taches.length) return []
  const { data: camps, error } = await sb().from("cmp_campagnes").select("id, nom").in("id", [...new Set(taches.map((t) => t.campagne_id))])
  if (error) throw new Error(error.message)
  const nomCampagne = new Map(((camps ?? []) as { id: string; nom: string }[]).map((c) => [c.id, c.nom]))
  const refs = [...new Set(taches.map((t) => t.contact_ref))]
  const contacts = new Map<string, LigneContact>()
  for (let i = 0; i < refs.length; i += 200) {
    const { data, error: e } = await sb().from("cmp_contacts").select("id, base_id, nom, personne, telephone, proprietaire_id, champs").in("id", refs.slice(i, i + 200))
    if (e) throw new Error(e.message)
    for (const k of (data ?? []) as LigneContact[]) contacts.set(k.id, k)
  }
  return taches.flatMap((t) => {
    const k = contacts.get(t.contact_ref)
    if (!k) return []
    return [{ id: t.id, type: t.type === "linkedin" ? "linkedin" as const : "appel" as const, consigne: t.consigne ?? "", creeLe: t.cree_le, campagneNom: nomCampagne.get(t.campagne_id) ?? "Campagne", contactRef: t.contact_ref, baseId: k.base_id, nom: k.nom ?? "", personne: k.personne ?? "", telephone: t.cible === "standard" ? k.champs?.standard || k.telephone || "" : k.telephone ?? "", appelStandard: t.cible === "standard", proprietaireId: k.proprietaire_id }]
  })
}

export async function terminerTacheCampagne(id: string): Promise<void> {
  const { data, error } = await sb().from("cmp_taches").update({ faite_le: new Date().toISOString() }).eq("id", id).select("id")
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error("Cette tâche n'a pas pu être enregistrée.")
}

/** La recherche LinkedIn de la personne : on n'a pas de profil en base, le commercial choisit le bon. */
export function rechercheLinkedin(t: Pick<TacheCampagne, "personne" | "nom">): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([t.personne, t.nom].filter(Boolean).join(" "))}`
}
