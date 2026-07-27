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
  await marquerNonDoublonsGroupe([idA, idB])
}

// Toutes les paires possibles à l'intérieur d'un groupe de fiches. Sert à écarter
// un groupe entier d'un seul clic dans l'écran Doublons. Pur → testable.
export function pairesDuGroupe(ids: string[]): string[] {
  const propres = [...new Set(ids.filter(Boolean))]
  const paires: string[] = []
  for (let i = 0; i < propres.length; i++)
    for (let j = i + 1; j < propres.length; j++) paires.push(clePaire(propres[i], propres[j]))
  return paires
}

// Écarte d'un coup toutes les paires d'un groupe (une seule écriture en base).
export async function marquerNonDoublonsGroupe(ids: string[]): Promise<void> {
  const paires = pairesDuGroupe(ids)
  if (paires.length === 0) return
  const actuelles = await chargerNonDoublons()
  paires.forEach((k) => actuelles.add(k))
  await ecrireParametre(CLE, JSON.stringify([...actuelles]))
}
