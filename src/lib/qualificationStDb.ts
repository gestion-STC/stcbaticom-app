// La qualification des sous-traitants en base (09/11/2026) : une ligne par sous-traitant, et un seul questionnaire,
// modifiable dans Réglages de la machine. Les réponses sont partagées entre la session de call et la fiche ouverte
// par-dessus, et enregistrées au fil de l'appel.
import { useEffect, useSyncExternalStore } from "react"
import { supabase } from "./supabase"
import { SECTIONS_ST, type DecisionST, type ReponsesST, type SectionST } from "../recrutement/qualificationST"

export type EtatQualif = { reponses: ReponsesST; decision: DecisionST | null; charge: boolean; etat: "" | "enregistrement" | "enregistre" | "erreur"; erreur: string }
type Ligne = { reponses: ReponsesST | null; decision: DecisionST | null }

const VIDE: EtatQualif = { reponses: {}, decision: null, charge: false, etat: "", erreur: "" }
const DELAI_MS = 500
const dossiers = new Map<string, EtatQualif>()
const enAttente = new Map<string, ReturnType<typeof setTimeout>>()
const enLecture = new Set<string>()
const ecouteurs = new Set<() => void>()
const abonner = (f: () => void) => { ecouteurs.add(f); return () => { ecouteurs.delete(f) } }
const publier = () => ecouteurs.forEach((f) => f())
const poser = (id: string, p: Partial<EtatQualif>) => { dossiers.set(id, { ...(dossiers.get(id) ?? VIDE), ...p }); publier() }
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

function sb() {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  return supabase
}

async function lire(id: string) {
  if (enLecture.has(id)) return
  enLecture.add(id)
  try {
    const { data, error } = await sb().from("st_qualifications").select("reponses, decision").eq("sous_traitant_id", id).maybeSingle()
    if (error) throw new Error(error.message)
    // Une saisie partie entre-temps ne doit pas être écrasée par la lecture.
    if (enAttente.has(id)) return
    const l = data as Ligne | null
    poser(id, { reponses: l?.reponses ?? {}, decision: l?.decision ?? null, charge: true })
  } catch (e) { poser(id, { charge: true, etat: "erreur", erreur: message(e) }) } finally { enLecture.delete(id) }
}

export function useQualification(id: string): EtatQualif {
  useEffect(() => { if (id) void lire(id) }, [id])
  return useSyncExternalStore(abonner, () => (id ? dossiers.get(id) ?? VIDE : VIDE))
}

async function sauver(id: string, decideur?: string) {
  const d = dossiers.get(id)
  if (!d) return
  const maintenant = new Date().toISOString()
  const ligne = { sous_traitant_id: id, reponses: d.reponses, decision: d.decision, maj_le: maintenant, ...(decideur !== undefined ? { decide_par: decideur, decide_le: d.decision ? maintenant : null } : {}) }
  const { data, error } = await sb().from("st_qualifications").upsert(ligne, { onConflict: "sous_traitant_id" }).select("sous_traitant_id")
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error("La base a refusé l'enregistrement.")
}

/** Enregistre la saisie quelques instants après la dernière frappe. */
export function majReponses(id: string, reponses: ReponsesST) {
  poser(id, { reponses, etat: "enregistrement", erreur: "" })
  const t = enAttente.get(id)
  if (t) clearTimeout(t)
  enAttente.set(id, setTimeout(() => {
    enAttente.delete(id)
    sauver(id).then(() => poser(id, { etat: "enregistre" })).catch((e) => poser(id, { etat: "erreur", erreur: message(e) }))
  }, DELAI_MS))
}

const MOTIF_REFUS = "refusé à la qualification"

/** La décision part tout de suite. Un refus retire le sous-traitant des appels, avec son motif. */
export async function deciderQualification(id: string, decision: DecisionST | null, reponses: ReponsesST, parNom: string) {
  const avant = dossiers.get(id)?.decision ?? null
  const t = enAttente.get(id)
  if (t) { clearTimeout(t); enAttente.delete(id) }
  poser(id, { reponses, decision, etat: "enregistrement", erreur: "" })
  try {
    await sauver(id, decision ? parNom : "")
    if (decision === "Refusé") {
      const motif = String(reponses.motif ?? "")
      const { error } = await sb().from("st_sous_traitants").update({ suivi: "hors_cible", suivi_le: new Date().toISOString(), suivi_motif: motif }).eq("id", id)
      if (error) throw new Error(error.message)
      // La machine ne regarde que le statut : sans lui, e-mails et SMS (payants) continuaient
      // vers un artisan refusé (lot 5, 26/11/2026). Même geste que « hors cible » au téléphone
      // (st_appel_enregistrer) : seule une fiche à contacter ou en séquence est arrêtée.
      const { error: e2 } = await sb().from("st_sous_traitants")
        .update({ statut: "termine", statut_motif: MOTIF_REFUS + (motif ? ` : ${motif}` : ""), termine_le: new Date().toISOString(), pause_jusqu_au: null })
        .eq("id", id).in("statut", ["a_contacter", "en_sequence"])
      if (e2) throw new Error(e2.message)
    } else if (avant === "Refusé") {
      const { error } = await sb().from("st_sous_traitants").update({ suivi: "", suivi_le: null, suivi_motif: "" }).eq("id", id).eq("suivi", "hors_cible")
      if (error) throw new Error(error.message)
      // Le refus est levé : la fiche arrêtée PAR CE REFUS reprend où elle en était.
      const { data: f, error: e3 } = await sb().from("st_sous_traitants").select("statut, statut_motif, demarre_le, sequence_id").eq("id", id).maybeSingle()
      if (e3) throw new Error(e3.message)
      if (f && f.statut === "termine" && String(f.statut_motif ?? "").startsWith(MOTIF_REFUS)) {
        const { error: e4 } = await sb().from("st_sous_traitants")
          .update({ statut: f.demarre_le && f.sequence_id ? "en_sequence" : "a_contacter", statut_motif: "refus de qualification levé", termine_le: null })
          .eq("id", id).eq("statut", "termine")
        if (e4) throw new Error(e4.message)
      }
    }
    poser(id, { etat: "enregistre" })
  } catch (e) { poser(id, { etat: "erreur", erreur: message(e) }) }
}

// ── Le questionnaire ──
let questionnaire: SectionST[] = SECTIONS_ST
let questionnaireLu = false

async function lireQuestionnaire() {
  questionnaireLu = true
  const { data, error } = await sb().from("st_questionnaire").select("sections").eq("id", 1).maybeSingle()
  if (error) { questionnaireLu = false; return }
  const s = (data as { sections?: SectionST[] } | null)?.sections
  if (Array.isArray(s) && s.length) { questionnaire = s; publier() }
}

export function useQuestionnaire(): SectionST[] {
  useEffect(() => { if (!questionnaireLu) void lireQuestionnaire() }, [])
  return useSyncExternalStore(abonner, () => questionnaire)
}

export async function enregistrerQuestionnaire(sections: SectionST[], parNom: string) {
  const { data, error } = await sb().from("st_questionnaire").upsert({ id: 1, sections, maj_par: parNom, maj_le: new Date().toISOString() }, { onConflict: "id" }).select("id")
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error("La base a refusé l'enregistrement.")
  questionnaire = sections
  publier()
}

export type LigneQualification = { id: string; reponses: ReponsesST; decision: DecisionST | null; majLe: string; entreprise: string; contact: string; metier: string }
export async function chargerQualifications(): Promise<LigneQualification[]> {
  const { data, error } = await sb().from("st_qualifications").select("sous_traitant_id, reponses, decision, maj_le, st_sous_traitants(entreprise, contact, metier)").order("maj_le", { ascending: false }).limit(1000)
  if (error) throw new Error(error.message)
  type Brut = { sous_traitant_id: string; reponses: ReponsesST | null; decision: DecisionST | null; maj_le: string; st_sous_traitants: { entreprise: string | null; contact: string | null; metier: string | null } | null }
  return ((data ?? []) as unknown as Brut[]).map((l) => ({ id: l.sous_traitant_id, reponses: l.reponses ?? {}, decision: l.decision, majLe: l.maj_le, entreprise: l.st_sous_traitants?.entreprise ?? "", contact: l.st_sous_traitants?.contact ?? "", metier: l.st_sous_traitants?.metier ?? "" }))
}
