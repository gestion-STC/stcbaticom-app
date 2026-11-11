// Le dashboard Croissance (Mahdi, 11/11/2026) : ce qu'il lit. Douze semaines d'historique, et la base entière pour
// les entonnoirs. Lecture seule.
import { supabase } from "./supabase"
import { lireParLots } from "./pagination"
import type { AgenceCroissance, AppelDirect, AppelStDirect, ArtisanCroissance } from "./croissance"

type Lot<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>
const sb = () => { if (!supabase) throw new Error("Supabase n'est pas configuré."); return supabase }

export type DonneesCroissance = {
  agences: (AgenceCroissance & { cree_le: string | null })[]
  artisans: (ArtisanCroissance & { cree_le: string | null; metier: string | null; zone: string | null })[]
  leads: { cree_le: string; source: string | null }[]
  rdv: string[]
  appels: { agence_id: string; date: string }[]
  dossiers: string[]
  envois: { canal: string; campagne_id: string; le: string; envoi_id: string }[]
  reponses: { envoi_id: string | null; campagne_id: string; type: string }[]
  campagnes: { id: string; nom: string; statut: string; base_id: string }[]
  inscriptions: { campagne_id: string; statut: string }[]
}

export async function chargerCroissance(depuis: Date): Promise<DonneesCroissance> {
  const d = depuis.toISOString()
  const [agences, artisans, leads, rdv, appels, dossiers, envois, reponses, campagnes, inscriptions] = await Promise.all([
    lireParLots<DonneesCroissance["agences"][number]>((de, a) => sb().from("agences").select("etape, tentatives, joint_fois, premier_os_le, cree_le").neq("type", "apporteur").order("id").range(de, a) as unknown as Lot<DonneesCroissance["agences"][number]>),
    lireParLots<DonneesCroissance["artisans"][number]>((de, a) => sb().from("st_sous_traitants").select("statut, nb_envois_ok, nb_appels, nb_joints, nb_clics, suivi, depose_le, contrat_statut, contrat_signe_le, acces_ouvert_le, cree_le, metier, zone").order("id").range(de, a) as unknown as Lot<DonneesCroissance["artisans"][number]>),
    lireParLots<{ cree_le: string; source: string | null }>((de, a) => sb().from("leads_demarchage").select("cree_le, source").gte("cree_le", d).order("id").range(de, a) as unknown as Lot<{ cree_le: string; source: string | null }>),
    lireParLots<{ date: string }>((de, a) => sb().from("activites").select("date").eq("type", "rdv").gte("date", d).order("id").range(de, a) as unknown as Lot<{ date: string }>).then((l) => l.map((x) => x.date)),
    lireParLots<{ agence_id: string; date: string }>((de, a) => sb().from("activites").select("agence_id, date").eq("type", "appel").gte("date", new Date(Date.now() - 28 * 86_400_000).toISOString()).order("id").range(de, a) as unknown as Lot<{ agence_id: string; date: string }>),
    lireParLots<{ created_at: string }>((de, a) => sb().from("dossiers_st").select("created_at").gte("created_at", d).order("id").range(de, a) as unknown as Lot<{ created_at: string }>).then((l) => l.map((x) => x.created_at)),
    lireParLots<{ id: string; canal: string; campagne_id: string; le: string }>((de, a) => sb().from("cmp_envois").select("id, canal, campagne_id, le").eq("statut", "envoye").eq("test", false).gte("le", d).order("id").range(de, a) as unknown as Lot<{ id: string; canal: string; campagne_id: string; le: string }>).then((l) => l.map((x) => ({ canal: x.canal, campagne_id: x.campagne_id, le: x.le, envoi_id: x.id }))),
    lireParLots<{ envoi_id: string | null; campagne_id: string; type: string }>((de, a) => sb().from("cmp_evenements").select("envoi_id, campagne_id, type").in("type", ["reponse", "clic"]).gte("le", d).order("id").range(de, a) as unknown as Lot<{ envoi_id: string | null; campagne_id: string; type: string }>),
    sb().from("cmp_campagnes").select("id, nom, statut, base_id").then(({ data, error }) => { if (error) throw new Error(error.message); return (data ?? []) as DonneesCroissance["campagnes"] }),
    lireParLots<{ campagne_id: string; statut: string }>((de, a) => sb().from("cmp_inscriptions").select("campagne_id, statut").order("id").range(de, a) as unknown as Lot<{ campagne_id: string; statut: string }>),
  ])
  return { agences, artisans, leads, rdv, appels, dossiers, envois, reponses, campagnes, inscriptions }
}

/** En direct : les appels (agences et artisans) et les rendez-vous pris depuis lundi. Lecture seule. */
export async function chargerDirect(lundi: Date): Promise<{ appels: AppelDirect[]; appelsSt: AppelStDirect[]; rdv: { cree_le: string; compte_id: string | null; compte_nom: string | null }[] }> {
  const d = lundi.toISOString()
  const [appels, appelsSt, rdv] = await Promise.all([
    lireParLots<AppelDirect>((de, a) => sb().from("activites").select("date, compte_id, compte_nom, resultat, issue").eq("type", "appel").gte("date", d).order("id").range(de, a) as unknown as Lot<AppelDirect>),
    lireParLots<AppelStDirect>((de, a) => sb().from("st_appels").select("date, compte_id, compte_nom, resultat").gte("date", d).order("id").range(de, a) as unknown as Lot<AppelStDirect>),
    lireParLots<{ cree_le: string; compte_id: string | null; compte_nom: string | null }>((de, a) => sb().from("activites").select("cree_le, compte_id, compte_nom").eq("type", "rdv").gte("cree_le", d).order("id").range(de, a) as unknown as Lot<{ cree_le: string; compte_id: string | null; compte_nom: string | null }>),
  ])
  return { appels, appelsSt, rdv }
}
