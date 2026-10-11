// Session de call · Recrutement (11/10/2026) — les lectures et l'écriture.
// Les files se lisent par lots (PostgREST s'arrête à 1 000 lignes) ; l'appel
// s'enregistre par la fonction de la base `st_appel_enregistrer`, qui applique
// les règles (rappels, injoignable, arrêt de la séquence).
import { supabase } from "./supabase"
import { lireParLots } from "./pagination"
import type { SousTraitant } from "../recrutement"
import { chargerSousTraitantsParLots } from "./sousTraitantsDb"
import { ordonnerLeads, ordonnerRappelsST, type FileST, type IssueST, type ResultatST } from "./appelsStOutils"

export type AppelST = {
  id: string; sousTraitantId: string; date: string; compteId: string | null; compteNom: string; resultat: ResultatST; issue: IssueST; motif: string; note: string
  rappelLe: string | null; numeroUtilise: string; dureeS: number | null; callId: string; sens: "sortant" | "entrant"
}
type LigneAppel = {
  id: string; sous_traitant_id: string; date: string; compte_id: string | null; compte_nom: string; resultat: ResultatST; issue: IssueST; motif: string; note: string
  rappel_le: string | null; numero_utilise: string; duree_s: number | null; call_id: string; sens: "sortant" | "entrant"
}
const COLONNES = "id, sous_traitant_id, date, compte_id, compte_nom, resultat, issue, motif, note, rappel_le, numero_utilise, duree_s, call_id, sens"
const vers = (l: LigneAppel): AppelST => ({
  id: l.id, sousTraitantId: l.sous_traitant_id, date: l.date, compteId: l.compte_id, compteNom: l.compte_nom ?? "", resultat: l.resultat, issue: l.issue ?? "", motif: l.motif ?? "", note: l.note ?? "",
  rappelLe: l.rappel_le, numeroUtilise: l.numero_utilise ?? "", dureeS: l.duree_s, callId: l.call_id ?? "", sens: l.sens === "entrant" ? "entrant" : "sortant",
})
function sb() {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  return supabase
}
const finDeJournee = (maintenant: Date) => new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1).toISOString()
const CLIC = "bareme_vu_le.not.is.null,candidature_clic_le.not.is.null,nb_clics.gt.0"

// Les trois files. `metier` filtre en plus (optionnel).
export async function chargerFileST(file: FileST, maintenant: Date, metier = ""): Promise<SousTraitant[]> {
  const base = (de: number, a: number) => {
    let q = sb().from("st_sous_traitants").select("*").is("depose_le", null).is("desinscrit_le", null).neq("statut", "desinscrit").order("id").range(de, a)
    if (metier) q = q.eq("metier", metier)
    return q
  }
  if (file === "leads") {
    const lignes = await chargerSousTraitantsParLots((de, a) => base(de, a).or(CLIC).neq("telephone", "").eq("telephone_invalide", false).eq("suivi", "").is("rappel_le", null))
    return ordonnerLeads(lignes)
  }
  if (file === "rappels") {
    const lignes = await chargerSousTraitantsParLots((de, a) => base(de, a).neq("suivi", "injoignable").lt("rappel_le", finDeJournee(maintenant)))
    return ordonnerRappelsST(lignes)
  }
  const lignes = await chargerSousTraitantsParLots((de, a) => base(de, a).eq("suivi", "va_deposer"))
  return lignes.sort((x, y) => (x.suiviLe ?? "").localeCompare(y.suiviLe ?? ""))
}

export async function compterFilesST(maintenant: Date, metier = ""): Promise<Record<FileST, number>> {
  const base = () => {
    let q = sb().from("st_sous_traitants").select("id", { count: "exact", head: true }).is("depose_le", null).is("desinscrit_le", null).neq("statut", "desinscrit")
    if (metier) q = q.eq("metier", metier)
    return q
  }
  const [a, b, c] = await Promise.all([
    base().or(CLIC).neq("telephone", "").eq("telephone_invalide", false).eq("suivi", "").is("rappel_le", null),
    base().neq("suivi", "injoignable").lt("rappel_le", finDeJournee(maintenant)),
    base().eq("suivi", "va_deposer"),
  ])
  for (const r of [a, b, c]) if (r.error) throw new Error(r.error.message)
  return { leads: a.count ?? 0, rappels: b.count ?? 0, promis: c.count ?? 0 }
}

export async function chargerAppelsDe(sousTraitantId: string): Promise<AppelST[]> {
  const { data, error } = await sb().from("st_appels").select(COLONNES).eq("sous_traitant_id", sousTraitantId).order("date", { ascending: false }).limit(200)
  if (error) {
    if (/st_appels/.test(error.message)) return [] // la table n'est pas encore posée
    throw new Error(error.message)
  }
  return ((data ?? []) as LigneAppel[]).map(vers)
}

export type ParamsAppelST = {
  sousTraitantId: string; resultat: ResultatST; issue: IssueST; motif?: string; note?: string; rappelLe?: string | null; numero?: string; dureeS?: number | null; callId?: string; compteNom: string
}
export type BilanAppelST = { appelId: string; suivi: string; rappelLe: string | null }
export async function enregistrerAppelST(p: ParamsAppelST): Promise<BilanAppelST> {
  const { data, error } = await sb().rpc("st_appel_enregistrer", {
    p_sous_traitant_id: p.sousTraitantId, p_resultat: p.resultat, p_issue: p.issue, p_motif: p.motif ?? "", p_note: p.note ?? "",
    p_rappel_le: p.rappelLe ?? null, p_numero: p.numero ?? "", p_duree_s: p.dureeS ?? null, p_call_id: p.callId ?? "", p_compte_nom: p.compteNom,
  })
  if (error) throw new Error(error.message)
  const r = data as { appel_id: string; suivi: string; rappel_le: string | null }
  return { appelId: r.appel_id, suivi: r.suivi ?? "", rappelLe: r.rappel_le }
}

// Les appels d'une période, par compte (pour le classement, plus tard).
export async function compterAppelsST(de: Date, a: Date): Promise<{ compteNom: string; appels: number; joints: number }[]> {
  const lignes = await lireParLots<{ id: string; compte_nom: string; resultat: string }>((d, f) =>
    sb().from("st_appels").select("id, compte_nom, resultat").gte("date", de.toISOString()).lt("date", a.toISOString()).order("id").range(d, f))
  const par = new Map<string, { compteNom: string; appels: number; joints: number }>()
  for (const l of lignes) {
    const k = l.compte_nom || "(sans compte)"
    const s = par.get(k) ?? { compteNom: k, appels: 0, joints: 0 }
    s.appels++
    if (l.resultat === "joint") s.joints++
    par.set(k, s)
  }
  return [...par.values()].sort((x, y) => y.appels - x.appels)
}
