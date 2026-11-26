// Rafraîchi toutes les 60 s quand l'onglet est visible, et dès qu'on y revient (comme l'ancien Dashboard).
import { useCallback, useEffect, useRef, useState } from "react"

export const RAFRAICHIR_MS = 60_000

/** Les lectures secondaires d'un tableau de bord (26/11/2026) : en échec, elles prennent leur valeur de repli MAIS l'erreur
 *  est gardée pour le bandeau. Avant, un `.catch(() => [])` muet affichait des zéros comme si de rien n'était. */
export function lecturesPartielles(): { manques: string[]; repli: <T>(quoi: string, valeur: T) => (e: unknown) => T } {
  const manques: string[] = []
  return { manques, repli: (quoi, valeur) => (e) => { manques.push(`${quoi} : ${e instanceof Error ? e.message : String(e)}`); return valeur } }
}

export function useRafraichi<T>(lire: (maintenant: Date) => Promise<T>, cle: unknown = null): { d: T | null; erreur: string; recharger: () => void } {
  const [d, setD] = useState<T | null>(null)
  const [erreur, setErreur] = useState("")
  const jeton = useRef(0)
  const vivant = useRef(true)
  const lireRef = useRef(lire)
  useEffect(() => { lireRef.current = lire })
  const charger = useCallback(() => {
    const j = ++jeton.current
    lireRef.current(new Date())
      .then((x) => { if (vivant.current && j === jeton.current) { setD(x); setErreur("") } })
      .catch((e) => { if (vivant.current && j === jeton.current) setErreur(e instanceof Error ? e.message : String(e)) })
  }, [])
  useEffect(() => {
    vivant.current = true
    const premier = setTimeout(charger, 0)
    const t = setInterval(() => { if (document.visibilityState === "visible") charger() }, RAFRAICHIR_MS)
    const surVisible = () => { if (document.visibilityState === "visible") charger() }
    document.addEventListener("visibilitychange", surVisible)
    return () => { vivant.current = false; clearTimeout(premier); clearInterval(t); document.removeEventListener("visibilitychange", surVisible) }
  }, [charger, cle])
  return { d, erreur, recharger: charger }
}
