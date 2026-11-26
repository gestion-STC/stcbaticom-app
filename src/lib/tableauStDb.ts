// SOUS-TRAITANTS › DASHBOARD (26/11/2026) : ce que l'écran lit. Lecture seule, paginée. Les lectures de la machine
// (fiches, envois, objectifs, réglages, séquences) sont celles de l'écran Machine.
import { supabase } from "./supabase"
import { lireParLots } from "./pagination"
import { lireParametre } from "./parametresDb"
import { chargerSousTraitants } from "./sousTraitantsDb"
import { chargerEnvoisDepuis } from "./machineDb"
import { chargerObjectifs } from "./objectifsStDb"
import { chargerPilotage } from "./pilotageStDb"
import { chargerSequences } from "./sequencesStDb"
import type { ClicST, DossierST, EnvoiST, ObjectifMetier, PilotageST, SequenceST, SousTraitant } from "../recrutement"

type Lot<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>
const sb = () => { if (!supabase) throw new Error("Supabase n'est pas configuré."); return supabase }
const compte = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => { const r = await q; if (r.error) throw new Error(r.error.message); return r.count ?? 0 }

export type DonneesSt = {
  maintenant: Date; fiches: SousTraitant[]; envois: EnvoiST[]; clics: ClicST[]; dossiers: DossierST[]
  objectifs: ObjectifMetier[]; pilotage: PilotageST | null; sequences: SequenceST[]
  qualifies: number; formations: number; passagesAujourdhui: number; brutStc: string | null; brutStcSt: string | null
}

export async function chargerTableauSt(maintenant: Date): Promise<DonneesSt> {
  type C = { id: string; sous_traitant_id: string; clique_le: string; destination: string; robot: boolean }
  type D = { id: string; created_at: string; raison_sociale: string | null; email: string | null; sous_traitant_id: string | null; vu_le: string | null; traite_le: string | null; complet_le: string | null }
  const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()).toISOString()
  const [fiches, envois, clics, dossiers, objectifs, pilotage, sequences, qualifies, formations, passagesAujourdhui, brutStc, brutStcSt] = await Promise.all([
    chargerSousTraitants(),
    chargerEnvoisDepuis("2020-01-01T00:00:00Z"),
    lireParLots<C>((d, f) => sb().from("st_clics").select("id, sous_traitant_id, clique_le, destination, robot").order("id").range(d, f) as unknown as Lot<C>)
      .then((l) => l.map((c): ClicST => ({ id: c.id, sousTraitantId: c.sous_traitant_id, cliqueLe: c.clique_le, destination: c.destination === "bareme" || c.destination === "stop" ? c.destination : "candidature", robot: Boolean(c.robot) }))),
    lireParLots<D>((d, f) => sb().from("dossiers_st").select("id, created_at, raison_sociale, email, sous_traitant_id, vu_le, traite_le, complet_le").is("detache_le", null).order("id").range(d, f) as unknown as Lot<D>)
      .then((l) => l.map((x): DossierST => ({ id: x.id, creeLe: x.created_at, raisonSociale: x.raison_sociale ?? "", email: x.email ?? "", donnees: {}, fichiers: [], emailEnvoye: false, sousTraitantId: x.sous_traitant_id, vuLe: x.vu_le, traiteLe: x.traite_le, completLe: x.complet_le }))),
    chargerObjectifs().catch(() => [] as ObjectifMetier[]),
    chargerPilotage().catch(() => null),
    chargerSequences().catch(() => [] as SequenceST[]),
    compte(sb().from("st_qualifications").select("sous_traitant_id", { count: "exact", head: true })).catch(() => 0),
    compte(sb().from("st_formations").select("sous_traitant_id", { count: "exact", head: true }).not("termine_le", "is", null)).catch(() => 0),
    compte(sb().from("st_passages").select("id", { count: "exact", head: true }).gte("debut", debutJour)).catch(() => 0),
    lireParametre("chiffres_stc").catch(() => null),
    // Les sous-traitants de STC Bâtiment, rangés à part (administrateurs seulement) depuis le 26/11/2026.
    lireParametre("chiffres_stc_st").catch(() => null),
  ])
  return { maintenant, fiches, envois, clics, dossiers, objectifs, pilotage, sequences, qualifies, formations, passagesAujourdhui, brutStc, brutStcSt }
}
