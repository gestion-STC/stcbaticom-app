import { supabase } from "./supabase"
import type { Appel, SensAppel } from "../appels"

type LigneAppel = {
  id: string
  prospect_id: string
  resultat: string
  nouvel_etat: string
  horodatage: string
  sens?: string
}

function vers(a: LigneAppel): Appel {
  return {
    id: a.id,
    prospectId: a.prospect_id,
    resultat: a.resultat,
    nouvelEtat: a.nouvel_etat,
    horodatage: a.horodatage,
    sens: a.sens === "entrant" ? "entrant" : "sortant",
  }
}

// Enregistre un appel dans le journal (sortant par défaut ; entrant = le prospect nous appelle).
export async function enregistrerAppel(
  prospectId: string,
  resultat: string,
  nouvelEtat: string,
  sens: SensAppel = "sortant",
): Promise<void> {
  if (!supabase || !prospectId) return
  const base = { prospect_id: prospectId, resultat, nouvel_etat: nouvelEtat }
  const { error } = await supabase.from("appels").insert({ ...base, sens })
  if (error) {
    // La colonne « sens » n'existe peut-être pas encore (migration SQL non faite) :
    // on réessaie sans, pour ne jamais bloquer la journalisation d'un appel.
    const { error: e2 } = await supabase.from("appels").insert(base)
    if (e2) throw new Error(e2.message)
  }
}

// Charge les appels d'AUJOURD'HUI (depuis minuit, heure locale) — sert à mesurer
// l'usage quotidien de chaque numéro d'émission (jauge anti-spam).
export async function chargerAppelsDuJour(): Promise<Appel[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const minuit = new Date()
  minuit.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from("appels")
    .select("*") // « * » : tolère l'absence de la colonne « sens » avant migration
    .gte("horodatage", minuit.toISOString())
    .limit(5000)
  if (error) throw new Error(error.message)
  return (data as LigneAppel[]).map(vers)
}

// Charge les appels (les plus récents d'abord).
export async function chargerAppels(): Promise<Appel[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("appels")
    .select("*") // « * » : tolère l'absence de la colonne « sens » avant migration
    .order("horodatage", { ascending: false })
    .limit(2000)
  if (error) throw new Error(error.message)
  return (data as LigneAppel[]).map(vers)
}
