// SOUS-TRAITANTS › DASHBOARD (26/11/2026) : ce que l'écran lit. Lecture seule, paginée. Les lectures de la machine
// (fiches, envois, objectifs, réglages, séquences) sont celles de l'ancien écran Machine (machine abandonnée le 26/11/2026).
import { supabase } from "./supabase"
import { lireParLots } from "./pagination"
import { lireParametre } from "./parametresDb"
import { chargerSousTraitants } from "./sousTraitantsDb"
import { chargerEnvoisDepuis } from "./machineDb"
import { chargerObjectifs } from "./objectifsStDb"
import { chargerPilotage } from "./pilotageStDb"
import { chargerSequences } from "./sequencesStDb"
import { lecturesPartielles } from "../components/cockpit/useRafraichi"
import type { ClicST, DossierST, EnvoiST, ObjectifMetier, PilotageST, SequenceST, SousTraitant } from "../recrutement"

type Lot<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>
const sb = () => { if (!supabase) throw new Error("Supabase n'est pas configuré."); return supabase }
const compte = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => { const r = await q; if (r.error) throw new Error(r.error.message); return r.count ?? 0 }

export type DonneesSt = {
  maintenant: Date; fiches: SousTraitant[]; envois: EnvoiST[]; clics: ClicST[]; dossiers: DossierST[]
  objectifs: ObjectifMetier[]; pilotage: PilotageST | null; sequences: SequenceST[]
  /** null : lecture impossible (lot 8, D100) — l'écran dit « — », jamais un faux zéro ni une fausse « machine arrêtée ». */
  qualifies: number | null; formations: number | null; passagesAujourdhui: number | null; brutStc: string | null; brutStcSt: string | null
  /** Les lectures secondaires en échec, dites dans un bandeau avec « Réessayer ». */
  manques: string[]
}

export async function chargerTableauSt(maintenant: Date): Promise<DonneesSt> {
  type C = { id: string; sous_traitant_id: string; clique_le: string; destination: string; robot: boolean }
  type D = { id: string; created_at: string; raison_sociale: string | null; email: string | null; sous_traitant_id: string | null; vu_le: string | null; traite_le: string | null; complet_le: string | null }
  const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()).toISOString()
  const { manques, repli } = lecturesPartielles()
  const [fiches, envois, clics, dossiers, objectifs, pilotage, sequences, qualifies, formations, passagesAujourdhui, brutStc, brutStcSt] = await Promise.all([
    chargerSousTraitants(),
    chargerEnvoisDepuis("2020-01-01T00:00:00Z"),
    lireParLots<C>((d, f) => sb().from("st_clics").select("id, sous_traitant_id, clique_le, destination, robot").order("id").range(d, f) as unknown as Lot<C>)
      .then((l) => l.map((c): ClicST => ({ id: c.id, sousTraitantId: c.sous_traitant_id, cliqueLe: c.clique_le, destination: c.destination === "bareme" || c.destination === "stop" ? c.destination : "candidature", robot: Boolean(c.robot) }))),
    // Les dossiers détachés comptent aussi (lot 8, D90) : sans fiche, ils apparaissent « sans fiche rattachée ».
    lireParLots<D>((d, f) => sb().from("dossiers_st").select("id, created_at, raison_sociale, email, sous_traitant_id, vu_le, traite_le, complet_le").order("id").range(d, f) as unknown as Lot<D>)
      .then((l) => l.map((x): DossierST => ({ id: x.id, creeLe: x.created_at, raisonSociale: x.raison_sociale ?? "", email: x.email ?? "", donnees: {}, fichiers: [], emailEnvoye: false, sousTraitantId: x.sous_traitant_id, vuLe: x.vu_le, traiteLe: x.traite_le, completLe: x.complet_le }))),
    chargerObjectifs().catch(repli("les objectifs par corps de métier", [] as ObjectifMetier[])),
    chargerPilotage().catch(repli("l'état de la machine", null)),
    chargerSequences().catch(repli("les séquences", [] as SequenceST[])),
    compte(sb().from("st_qualifications").select("sous_traitant_id", { count: "exact", head: true })).catch(repli("les qualifications", null)),
    compte(sb().from("st_formations").select("sous_traitant_id", { count: "exact", head: true }).not("termine_le", "is", null)).catch(repli("les formations", null)),
    compte(sb().from("st_passages").select("id", { count: "exact", head: true }).gte("debut", debutJour)).catch(repli("les passages du jour", null)),
    lireParametre("chiffres_stc").catch(repli("les chiffres de STC Bâtiment", null)),
    // Les sous-traitants de STC Bâtiment, rangés à part (administrateurs seulement) depuis le 26/11/2026.
    lireParametre("chiffres_stc_st").catch(repli("les sous-traitants de STC Bâtiment", null)),
  ])
  return { maintenant, fiches, envois, clics, dossiers, objectifs, pilotage, sequences, qualifies, formations, passagesAujourdhui, brutStc, brutStcSt, manques }
}
