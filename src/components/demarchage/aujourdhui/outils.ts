// Les petits outils du style courtier (formats de nombres, chapitre visible).
import { useEffect, useRef, useState } from "react"

export const fr = (n: number) => n.toLocaleString("fr-FR")
export const pct = (a: number, b: number): number | null => (b > 0 ? (a / b) * 100 : null)
export const pctTxt = (v: number | null, dec = 0) => (v === null ? "—" : `${v.toFixed(dec).replace(".", ",")} %`)

/** La barre fixe du haut : les chapitres de la page ; celui qu'on lit s'allume. */
export function useChapitreVisible(ids: readonly string[], pret: boolean) {
  const [actif, setActif] = useState(ids[0])
  const zone = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // La page défile dans le <main> du logiciel : c'est lui qu'on observe.
    const racine = zone.current?.closest("main") ?? null
    const obs = new IntersectionObserver((entrees) => {
      const vu = entrees.filter((e) => e.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top)[0]
      if (vu) setActif(vu.target.id)
    }, { root: racine, rootMargin: "-64px 0px -60% 0px" })
    ids.forEach((id) => { const el = zone.current?.querySelector("#" + id); if (el) obs.observe(el) })
    return () => obs.disconnect()
  }, [ids, pret]) // la page n est montée qu une fois les données lues
  const aller = (id: string) => zone.current?.querySelector("#" + id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  return { actif, aller, zone }
}
