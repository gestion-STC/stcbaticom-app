import { supabase } from "./supabase"
import { lireParLots } from "./pagination"
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
  const sb = supabase
  const minuit = new Date()
  minuit.setHours(0, 0, 0, 0)
  // Lu par lots, sans plafond arbitraire : cette liste sert de garde-fou
  // anti-rappel (« qui a déjà été appelé aujourd'hui ») — une troncature
  // silencieuse ferait rappeler quelqu'un qu'on a déjà eu au téléphone.
  const lignes = await lireParLots<LigneAppel>((debut, fin) =>
    sb
      .from("appels")
      .select("*") // « * » : tolère l'absence de la colonne « sens » avant migration
      .gte("horodatage", minuit.toISOString())
      .order("horodatage", { ascending: true })
      .order("id", { ascending: true })
      .range(debut, fin)
      .then(({ data, error }) => ({ data: data as LigneAppel[] | null, error })),
  )
  return lignes.map(vers)
}

// Fenêtre d'historique chargée pour les statistiques.
//
// On borne dans le TEMPS plutôt qu'en nombre de lignes : à ~300 appels/jour,
// l'ancienne limite de 2000 lignes ne couvrait même pas une semaine et
// tronquait les statistiques EN SILENCE.
//
// 6 mois : large de sorte à ne RIEN retirer de l'historique existant (le
// Dashboard n'affiche au maximum que 30 jours, mais l'analyse « recette moyenne
// avant l'OS » remonte plus loin), tout en gardant le volume borné. Si la base
// d'appels devient très grosse, il faudra passer à un calcul côté serveur
// plutôt qu'à tout charger dans le navigateur.
const JOURS_HISTORIQUE = 180

// Charge les appels récents (les plus récents d'abord), par lots pour ne rien
// perdre au-delà des 1000 lignes que Supabase renvoie au maximum par requête.
export async function chargerAppels(): Promise<Appel[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const sb = supabase
  const depuis = new Date()
  depuis.setDate(depuis.getDate() - JOURS_HISTORIQUE)
  depuis.setHours(0, 0, 0, 0)
  const lignes = await lireParLots<LigneAppel>((debut, fin) =>
    sb
      .from("appels")
      .select("*") // « * » : tolère l'absence de la colonne « sens » avant migration
      .gte("horodatage", depuis.toISOString())
      .order("horodatage", { ascending: false })
      // Tri secondaire : deux appels au même horodatage pourraient sinon changer
      // d'ordre d'un lot à l'autre (ligne dupliquée ou sautée au recollage).
      .order("id", { ascending: false })
      .range(debut, fin)
      .then(({ data, error }) => ({ data: data as LigneAppel[] | null, error })),
  )
  return lignes.map(vers)
}
