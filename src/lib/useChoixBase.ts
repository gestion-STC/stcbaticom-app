// Le choix de base d'une page (voir components/ChoixBase.tsx), mémorisé par page dans le navigateur.
import { useState } from "react"
import type { Espace } from "./messagesDb"

export type ChoixEspace = Espace | "tout"

const lire = (cle: string): string | null => {
  try {
    return localStorage.getItem(cle)
  } catch {
    return null
  }
}

/** Le choix de base d'une page : parmi les bases du compte (et « Tout » si `avecTout`), mémorisé par page. */
export function useChoixBase(page: string, espaces: Espace[], avecTout: boolean): [ChoixEspace, (c: ChoixEspace) => void] {
  const cle = `choix_base.${page}`
  const [choix, setChoix] = useState<string | null>(() => lire(cle))
  const permis: ChoixEspace[] = espaces.length > 1 && avecTout ? ["tout", ...espaces] : espaces
  const valeur = permis.find((p) => p === choix) ?? permis[0] ?? "demarchage"
  const changer = (c: ChoixEspace) => {
    setChoix(c)
    try {
      localStorage.setItem(cle, c)
    } catch {
      // navigateur sans stockage : le choix vaut pour la visite
    }
  }
  return [valeur, changer]
}
