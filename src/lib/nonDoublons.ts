// Mémoire des « non, ce ne sont PAS des doublons ».
//
// C'est la pièce qui fait converger la base : chaque fois que l'utilisateur
// répond « ce sont 2 personnes différentes » (typiquement deux gestionnaires qui
// partagent le standard de leur agence), on le retient DÉFINITIVEMENT. Sans ça,
// le logiciel reposerait la même question à chaque appel — l'utilisateur
// finirait par ignorer l'alerte, et elle ne servirait plus à rien.
//
// Rangé dans la table `parametres` (clé/valeur), comme les numéros d'émission :
// aucun script SQL à exécuter pour que ça marche.

import { lireParametre, ecrireParametre } from "./parametresDb"
import { clePaire } from "./doublonsProbables"

const CLE = "paires_non_doublons"

// Lit la valeur stockée (JSON) → liste de clés de paires. Tolère une valeur
// absente ou abîmée (on repart d'une liste vide plutôt que de planter l'écran).
// Pur → testable.
export function parserPaires(brut: string | null): string[] {
  if (!brut) return []
  try {
    const arr = JSON.parse(brut)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string" && !!x) : []
  } catch {
    return []
  }
}

// Toutes les paires déjà tranchées « ce ne sont pas des doublons ».
export async function chargerNonDoublons(): Promise<Set<string>> {
  const brut = await lireParametre(CLE).catch(() => null)
  return new Set(parserPaires(brut))
}

// Retient que ces deux fiches sont deux personnes DIFFÉRENTES.
// On relit juste avant d'écrire pour ne pas écraser une décision prise ailleurs.
export async function marquerNonDoublon(idA: string, idB: string): Promise<void> {
  if (!idA || !idB || idA === idB) return
  const actuelles = await chargerNonDoublons()
  actuelles.add(clePaire(idA, idB))
  await ecrireParametre(CLE, JSON.stringify([...actuelles]))
}
