// Les deux repos de Réglages, lus en un seul endroit (14/10) : après n'importe quel appel (5 j par
// défaut) et après un « standard » (15 j). Fichier à part : db.ts ne dépend pas de sessionOutils.
import { lireParametre } from "../lib/parametresDb"
import { debutRepos, REPOS_JOURS, REPOS_STANDARD_JOURS } from "./sessionOutils"

export async function lireRepos(quand: Date): Promise<{ depuis: string; standardDepuis: string; jours: number; joursStandard: number }> {
  const [a, b] = await Promise.all([lireParametre("repos_appel_jours").catch(() => null), lireParametre("repos_standard_jours").catch(() => null)])
  const n = Number(a), s = Number(b)
  const jours = Number.isInteger(n) && n >= 1 && n <= 60 ? n : REPOS_JOURS
  const joursStandard = Number.isInteger(s) && s >= 1 && s <= 90 ? s : REPOS_STANDARD_JOURS
  return { depuis: debutRepos(quand, jours), standardDepuis: debutRepos(quand, joursStandard), jours, joursStandard }
}

