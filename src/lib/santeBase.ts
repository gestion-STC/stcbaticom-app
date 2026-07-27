// « Santé » de la base — l'indicateur d'avancement du nettoyage au fil de l'eau.
//
// Le principe retenu par l'utilisateur : la base se nettoie au fur et à mesure du
// démarchage. Cet indicateur sert à VOIR cette progression semaine après semaine
// (en chiffres, pas en pourcentage) et à savoir quoi compléter en priorité.
//
// Les règles de doublon sont celles de l'écran d'appel (candidatsDoublon) : un
// seul endroit décide de ce qu'est un doublon, donc l'indicateur ne peut jamais
// annoncer autre chose que ce que l'utilisateur voit pendant ses appels.

import type { Prospect } from "../data"
import { estApporteur } from "../data"
import { pairesDoublons } from "./doublonsProbables"

export type SanteBase = {
  total: number
  completes: number
  aCompleter: number
  sansTelephone: number
  sansContact: number
  sansEmail: number
  sansAdresse: number
  doublons: number // paires restant à trancher (comptées UNE fois)
}

const vide = (v: string | undefined): boolean => !(v || "").trim()

// Une fiche est « complète » quand on a de quoi travailler : un nom, un numéro,
// un e-mail et une adresse.
export function estFicheComplete(p: Prospect): boolean {
  return !vide(p.contact) && !vide(p.telephone) && !vide(p.email) && !vide(p.adresse)
}

// Les apporteurs d'affaires sont exclus : on ne les démarche pas (cohérent avec
// les autres écrans). Pur → testable.
export function calculerSante(prospects: Prospect[], nonDoublons: Set<string> = new Set()): SanteBase {
  const liste = prospects.filter((p) => !estApporteur(p))

  // Chaque paire est comptée une seule fois (clé triée), via un regroupement
  // par indice — tient la charge sur une grosse base.
  const paires = pairesDoublons(liste, nonDoublons)

  const completes = liste.filter(estFicheComplete).length
  return {
    total: liste.length,
    completes,
    aCompleter: liste.length - completes,
    sansTelephone: liste.filter((p) => vide(p.telephone)).length,
    sansContact: liste.filter((p) => vide(p.contact)).length,
    sansEmail: liste.filter((p) => vide(p.email)).length,
    sansAdresse: liste.filter((p) => vide(p.adresse)).length,
    doublons: paires.size,
  }
}
