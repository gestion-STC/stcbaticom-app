// ════════════════════════════════════════════════════════════════════════════
// LES RÉGLAGES DU DÉMARCHAGE — lus en UN seul endroit (14/10/2026).
//
// Leur valeur par défaut et leurs bornes sont écrites une seule fois, en base
// (`reglages_demarchage()`, supabase/regles-demarchage.sql). L'écran n'en connaît
// aucune : il lit ce que la base lui donne. Tant que ce n'est pas lu, rien
// n'est affiché ni calculé avec une valeur inventée.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import { ecrireParametre } from "../lib/parametresDb"

export type CleReglage =
  | "relance_interesse_jours"
  | "repos_appel_jours"
  | "repos_standard_jours"
  | "sommeil_apres_tentatives"
  | "sommeil_jours"
  | "heure_relance"
  | "quota_appels_jour"
  | "sonnerie_secondes"
  | "cadence_auto_secondes"
  | "rdv_rappel_avant_minutes"
  | "rdv_rappel_apres_minutes"
  | "a_completer_minutes"

export type Reglages = Record<CleReglage, number>
export type DefinitionReglage = { cle: CleReglage; valeur: number; defaut: number; mini: number; maxi: number }

// Le texte de chaque réglage dans Réglages › Objectifs et réglages (l'ordre d'affichage).
export const TEXTES_REGLAGES: { cle: CleReglage; titre: string; unite: string; aide: string }[] = [
  { cle: "repos_appel_jours", titre: "Repos entre deux appels", unite: "jours", aide: "Une agence appelée ne revient pas dans « À prospecter » avant ce délai (une fiche au même standard non plus)." },
  { cle: "repos_standard_jours", titre: "Repos après « standard »", unite: "jours", aide: "L'accueil a décroché, pas le gestionnaire : on le laisse tranquille plus longtemps." },
  { cle: "relance_interesse_jours", titre: "Relance des intéressés", unite: "jours", aide: "Une intéressée revient dans « À rappeler aujourd'hui » à ce rythme, quel que soit le résultat, jusqu'à signature, pas intéressée ou faux numéro." },
  { cle: "heure_relance", titre: "Heure des relances et des rappels", unite: "h", aide: "L'heure posée sur une relance, et proposée pour un rappel ou un RDV." },
  { cle: "sommeil_apres_tentatives", titre: "Mise en sommeil après", unite: "essais", aide: "Nombre d'appels sans avoir le gestionnaire avant que l'agence s'endorme." },
  { cle: "sommeil_jours", titre: "Durée du sommeil", unite: "jours", aide: "L'agence endormie revient dans « À réveiller » après ce délai." },
  { cle: "quota_appels_jour", titre: "Appels par jour et par numéro Ringover", unite: "appels", aide: "Au-delà, le numéro est signalé : on le met en pause pour ne pas passer pour du spam." },
  { cle: "sonnerie_secondes", titre: "Sonnerie avant « pas de réponse »", unite: "s", aide: "Sans décroché après ce délai, l'écran propose « pas de réponse »." },
  { cle: "cadence_auto_secondes", titre: "Compte à rebours du mode automatique", unite: "s", aide: "Le temps de lire la fiche avant que l'appel parte tout seul." },
  { cle: "rdv_rappel_avant_minutes", titre: "Rappel de RDV : avant l'heure", unite: "min", aide: "Le rappel à l'écran s'affiche ce nombre de minutes avant le RDV." },
  { cle: "rdv_rappel_apres_minutes", titre: "Rappel de RDV : après l'heure", unite: "min", aide: "… et reste affiché ce nombre de minutes après." },
  { cle: "a_completer_minutes", titre: "Appel « à compléter » après", unite: "min", aide: "Un appel lancé sans résultat noté depuis ce délai apparaît dans « À compléter » (et au contrôle du matin)." },
]

type Ligne = { cle: string; valeur: number; defaut: number; mini: number; maxi: number }

export async function chargerDefinitionsReglages(): Promise<DefinitionReglage[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase.rpc("reglages_demarchage")
  if (error) throw new Error(`Réglages du démarchage illisibles : ${error.message}`)
  return ((data ?? []) as Ligne[]).map((l) => ({ cle: l.cle as CleReglage, valeur: Number(l.valeur), defaut: Number(l.defaut), mini: Number(l.mini), maxi: Number(l.maxi) }))
}

export function versReglages(defs: DefinitionReglage[]): Reglages {
  const r = Object.fromEntries(defs.map((d) => [d.cle, d.valeur])) as Partial<Reglages>
  for (const t of TEXTES_REGLAGES) if (typeof r[t.cle] !== "number") throw new Error(`Réglage absent en base : ${t.cle} (SQL du 14/10 non collé ?)`)
  return r as Reglages
}

// Un réglage enregistré : refusé ici s'il sort des bornes de la base (la base l'ignorerait).
export async function enregistrerReglage(d: DefinitionReglage, valeur: number): Promise<void> {
  if (!Number.isInteger(valeur) || valeur < d.mini || valeur > d.maxi) throw new Error(`Entre ${d.mini} et ${d.maxi}.`)
  await ecrireParametre(d.cle, String(valeur))
  oublierReglages()
}

// ── Le partage entre écrans : une lecture, tous les écrans abonnés ──
let enCache: Promise<Reglages> | null = null
const abonnes = new Set<() => void>()
export function lireReglages(): Promise<Reglages> {
  if (!enCache) {
    enCache = chargerDefinitionsReglages().then(versReglages)
    enCache.catch(() => { enCache = null }) // un échec ne reste pas en mémoire : on retentera
  }
  return enCache
}
/** Après un changement dans Réglages : chaque écran relit. */
export function oublierReglages(): void {
  enCache = null
  for (const f of abonnes) f()
}
/** Les réglages, ou null tant qu'ils ne sont pas lus ; l'erreur s'il est impossible de les lire. */
export function useReglages(): { reglages: Reglages | null; erreur: string } {
  const [etat, setEtat] = useState<{ reglages: Reglages | null; erreur: string }>({ reglages: null, erreur: "" })
  useEffect(() => {
    let vivant = true
    const lire = () => {
      lireReglages()
        .then((r) => { if (vivant) setEtat({ reglages: r, erreur: "" }) })
        .catch((e) => { if (vivant) setEtat((x) => ({ ...x, erreur: e instanceof Error ? e.message : String(e) })) })
    }
    lire()
    abonnes.add(lire)
    return () => { vivant = false; abonnes.delete(lire) }
  }, [])
  return etat
}
