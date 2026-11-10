// La formation des sous-traitants en base (10/11/2026) : l'avancement de chacun, la banque de questions et les règles.
import { useCallback, useEffect, useState } from "react"
import { supabase } from "./supabase"
import { lireParLots } from "./pagination"
import { ecrireParametre, lireParametre } from "./parametresDb"
import { regles, type EtatFormation, type ReglesFormation } from "../recrutement/formationST"
import type { QuestionDepart } from "../recrutement/banqueDepart"

export const URL_FORMATION = "https://gestion-stc.github.io/stcbaticom-app/"
export type Formation = { sousTraitantId: string; jeton: string; etat: EtatFormation; score: number | null; essais: number; vues: number; derogationMotif: string; derogationPar: string; derogationLe: string | null; lienEnvoyeLe: string | null; termineLe: string | null; journal: { le: string; score: number; ratees: string[] }[] }
export type QuestionF = QuestionDepart & { id: string; actif: boolean; posee: number; ratee: number }
type Ligne = { sous_traitant_id: string; jeton: string; etat: EtatFormation; score: number | null; essais: number; vues: string[] | null; derogation_motif: string | null; derogation_par: string | null; derogation_le: string | null; lien_envoye_le: string | null; termine_le: string | null; journal: Formation["journal"] | null }
const COLONNES = "sous_traitant_id, jeton, etat, score, essais, vues, derogation_motif, derogation_par, derogation_le, lien_envoye_le, termine_le, journal"
const sb = () => { if (!supabase) throw new Error("Supabase n'est pas configuré."); return supabase }
const versFormation = (l: Ligne): Formation => ({ sousTraitantId: l.sous_traitant_id, jeton: l.jeton, etat: l.etat, score: l.score, essais: l.essais, vues: l.vues?.length ?? 0, derogationMotif: l.derogation_motif ?? "", derogationPar: l.derogation_par ?? "", derogationLe: l.derogation_le, lienEnvoyeLe: l.lien_envoye_le, termineLe: l.termine_le, journal: l.journal ?? [] })
export const lienFormation = (f: Pick<Formation, "jeton">) => `${URL_FORMATION}?formation=${f.jeton}`

export async function chargerRegles(): Promise<ReglesFormation> {
  try { return regles(JSON.parse((await lireParametre("formation_regles")) || "{}")) } catch { return regles(null) }
}
export const enregistrerRegles = (r: ReglesFormation) => ecrireParametre("formation_regles", JSON.stringify(r))

export async function chargerFormations(): Promise<Map<string, Formation>> {
  const l = await lireParLots<Ligne>((d, f) => sb().from("st_formations").select(COLONNES).order("sous_traitant_id").range(d, f) as never)
  return new Map(l.map((x) => [x.sous_traitant_id, versFormation(x)]))
}

export function useFormation(id: string) {
  const [formation, setFormation] = useState<Formation | null>(null)
  const [reglesF, setRegles] = useState<ReglesFormation>(regles(null))
  const recharger = useCallback(async () => {
    if (!id) return
    const [{ data }, r] = await Promise.all([sb().from("st_formations").select(COLONNES).eq("sous_traitant_id", id).maybeSingle(), chargerRegles()])
    setFormation(data ? versFormation(data as unknown as Ligne) : null); setRegles(r)
  }, [id])
  useEffect(() => { const t = setTimeout(() => void recharger().catch(() => undefined), 0); return () => clearTimeout(t) }, [recharger])
  return { formation, regles: reglesF, recharger }
}

async function fiche(id: string): Promise<Formation> {
  const { error } = await sb().from("st_formations").upsert({ sous_traitant_id: id }, { onConflict: "sous_traitant_id", ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  const { data, error: e2 } = await sb().from("st_formations").select(COLONNES).eq("sous_traitant_id", id).single()
  if (e2) throw new Error(e2.message)
  return versFormation(data as unknown as Ligne)
}

/** Le lien personnel, créé à la première demande. */
export const preparerLien = async (id: string) => lienFormation(await fiche(id))

export async function envoyerLienFormation(id: string): Promise<string> {
  const f = await fiche(id)
  const { data: st, error } = await sb().from("st_sous_traitants").select("email, contact").eq("id", id).single()
  if (error) throw new Error(error.message)
  const { email, contact } = st as { email: string | null; contact: string | null }
  if (!email) throw new Error("Ce sous-traitant n'a pas d'adresse e-mail.")
  const lien = lienFormation(f)
  const html = `<p>Bonjour${contact ? ` ${contact}` : ""},</p><p>Avant de travailler ensemble, il reste une étape : une courte formation à notre application, pour que vos premières missions se passent bien.</p><p><a href="${lien}">Commencer ma formation</a></p><p>Vous pouvez vous arrêter et reprendre quand vous voulez.</p><p>L'équipe STC Bâtiment</p>`
  const { data, error: e2 } = await sb().functions.invoke("envoyer-email", { body: { espace: "recrutement", to: email, subject: "Votre formation STC Bâtiment", html } })
  if (e2) throw new Error(e2.message)
  if ((data as { error?: string } | null)?.error) throw new Error(String((data as { error: string }).error))
  const { error: e3 } = await sb().from("st_formations").update({ lien_envoye_le: new Date().toISOString(), ...(f.etat === "a_envoyer" ? { etat: "envoye" } : {}) }).eq("sous_traitant_id", id)
  if (e3) throw new Error(e3.message)
  return email
}

export async function accorderDerogation(id: string, motif: string, par: string): Promise<void> {
  await fiche(id)
  const { error } = await sb().from("st_formations").update({ derogation_motif: motif, derogation_par: par, derogation_le: new Date().toISOString() }).eq("sous_traitant_id", id)
  if (error) throw new Error(error.message)
}

// ── La banque ──
type LigneQ = { id: string; theme: string; texte: string; bonne: string; fausses: string[]; explication: string; actif: boolean; posee: number; ratee: number }
export async function chargerBanque(): Promise<QuestionF[]> {
  return lireParLots<LigneQ>((d, f) => sb().from("st_formation_questions").select("id, theme, texte, bonne, fausses, explication, actif, posee, ratee").order("cree_le").range(d, f) as never)
}
export async function importerBanque(l: QuestionDepart[]): Promise<void> {
  const { error } = await sb().from("st_formation_questions").insert(l)
  if (error) throw new Error(error.message)
}
export async function enregistrerQuestion(q: QuestionF | (QuestionDepart & { actif: boolean })): Promise<void> {
  const { theme, texte, bonne, fausses, explication, actif } = q
  const { error } = "id" in q && q.id ? await sb().from("st_formation_questions").update({ theme, texte, bonne, fausses, explication, actif }).eq("id", q.id) : await sb().from("st_formation_questions").insert({ theme, texte, bonne, fausses, explication, actif })
  if (error) throw new Error(error.message)
}
export async function supprimerQuestion(id: string): Promise<void> {
  const { error } = await sb().from("st_formation_questions").delete().eq("id", id)
  if (error) throw new Error(error.message)
}
export async function proposerQuestions(theme: string, nombre: number): Promise<QuestionDepart[]> {
  const { data, error } = await sb().functions.invoke("formation-st", { body: { action: "proposer", theme, nombre } })
  if (error) throw new Error(error.message)
  return ((data as { questions: Omit<QuestionDepart, "theme">[] }).questions ?? []).map((q) => ({ ...q, theme }))
}
