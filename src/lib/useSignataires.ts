import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { nomAffiche } from "./comptes"
import { dernierChoixSignature, lireSignatures, retenirChoixSignature, signataireRetenu, signatairesDe } from "./signatures"

/**
 * Les noms qui peuvent signer pour le compte connecté, et celui qui signe
 * (19/10/2026, voir src/lib/signatures.ts) : le nom du compte d'abord, puis
 * les autres noms réglés dans Paramétrage › Emails › Mes signatures. Le
 * dernier choix est repris sur ce navigateur tant que le nom existe encore.
 */
export function useSignataires(session: Session | null | undefined): { noms: string[]; nom: string; choisir: (nom: string) => void } {
  const principale = nomAffiche(session)
  const compteId = session?.user?.id ?? ""
  const [autres, setAutres] = useState<string[]>([])
  const [choix, setChoix] = useState<string | null>(null)

  useEffect(() => {
    if (!compteId) return
    let annule = false
    lireSignatures(compteId)
      .catch(() => [] as string[])
      .then((liste) => {
        if (annule) return
        setAutres(liste)
        setChoix(dernierChoixSignature(compteId))
      })
    return () => {
      annule = true
    }
  }, [compteId])

  const noms = signatairesDe(principale, autres)
  const nom = signataireRetenu(noms, choix)
  // Pas de useCallback : le compilateur React mémoïse lui-même (règle lint preserve-manual-memoization).
  const choisir = (n: string) => {
    setChoix(n)
    if (compteId) retenirChoixSignature(compteId, n)
  }
  return { noms, nom, choisir }
}
