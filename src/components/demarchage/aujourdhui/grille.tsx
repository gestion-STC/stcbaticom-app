// ── LA GRILLE DE LA PAGE AUJOURD'HUI (dessin validé le 06/11/2026) ──
// Mahdi : « j'aime les choses droites, carrées ». Une gouttière unique (40 px), des en-têtes de
// bloc de 40 px posés sur un filet, des graphiques à barres de MÊME hauteur (corps 132 px, axe
// 24 px, note 20 px), des lignes de liste de 56 px. Écrans visés : 1920, Mac 13-14", 1280, 1100.
import { useEffect, useRef, useState, type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

export const H_GRAPHE = 132

export const Mention = ({ children, className = "" }: { children: ReactNode; className?: string }) => <p className={`text-colonne text-encre-2 ${className}`}>{children}</p>

/** L'en-tête d'un bloc : 40 px, posé sur un filet ; à droite, une mention ou des onglets. */
export function EnTete({ titre, droite }: { titre: ReactNode; droite?: ReactNode }) {
  return (
    <div className="mb-5 flex h-10 items-end justify-between gap-4 border-b-[0.5px] border-trait">
      <h2 className="truncate pb-2.5 text-sous-titre font-semibold text-encre">{titre}</h2>
      <div className="flex shrink-0 items-end">{droite}</div>
    </div>
  )
}
export const MentionEnTete = ({ children }: { children: ReactNode }) => <span className="pb-2.5 text-colonne text-encre-2">{children}</span>

/** Une rangée de blocs : la même gouttière partout. */
export const Rangee = ({ colonnes, children, className = "" }: { colonnes: string; children: ReactNode; className?: string }) => <div className={`grid gap-x-10 gap-y-10 ${colonnes} ${className}`}>{children}</div>
export const Bloc = ({ children, className = "" }: { children: ReactNode; className?: string }) => <section className={`flex min-w-0 flex-col ${className}`}>{children}</section>

/** Un nombre qui monte jusqu'à sa valeur ; à chaque rafraîchissement, il part de la valeur affichée
 *  (pas de zéro toutes les minutes). « Moins d'animation » : la valeur tout de suite. */
export function Compteur({ valeur }: { valeur: number }) {
  const [v, setV] = useState(0)
  const affiche = useRef(0)
  useEffect(() => {
    const duree = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 700
    const de = affiche.current, t0 = performance.now()
    let raf = 0
    const pas = (t: number) => {
      const k = duree ? Math.min(1, (t - t0) / duree) : 1
      const x = Math.round(de + (valeur - de) * (1 - Math.pow(1 - k, 3)))
      affiche.current = x
      setV(x)
      if (k < 1) raf = requestAnimationFrame(pas)
    }
    raf = requestAnimationFrame(pas)
    return () => cancelAnimationFrame(raf)
  }, [valeur])
  return <span className="chiffres">{v}</span>
}

/** Un graphique à barres d'UNE série : corps de hauteur fixe, axe fixe, note fixe (une ligne). */
export function Barres({ points, enAvant, info, note, vide }: { points: { cle: string; valeur: number }[]; enAvant: string | null; info: (p: { cle: string; valeur: number }) => string; note: ReactNode; vide: string }) {
  const [survol, setSurvol] = useState<string | null>(null)
  const max = Math.max(1, ...points.map((x) => x.valeur))
  if (!points.length) return <div className="flex items-center justify-center text-legende text-encre-2" style={{ height: H_GRAPHE + 44 }}>{vide}</div>
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: H_GRAPHE }}>
        {points.map((x) => (
          <div key={x.cle} className="relative flex h-full flex-1 flex-col justify-end" onMouseEnter={() => setSurvol(x.cle)} onMouseLeave={() => setSurvol(null)}>
            {survol === x.cle ? <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-4 bg-encre px-2 py-0.5 text-colonne text-white">{info(x)}</div> : null}
            <div className={`rounded-t-[4px] transition-colors ${x.cle === enAvant ? "bg-info" : survol === x.cle ? "bg-info/60" : "bg-info/25"}`} style={{ height: `${Math.max(2, (x.valeur / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="flex h-6 items-center gap-1.5 border-t-[0.5px] border-trait">
        {points.map((x) => <span key={x.cle} className={`chiffres flex-1 text-center text-colonne ${x.cle === enAvant ? "font-medium text-encre" : "text-encre-2"}`}>{x.cle}</span>)}
      </div>
      <p className="h-5 truncate text-colonne text-encre-2">{note}</p>
    </div>
  )
}

/** Une ligne de liste : TOUJOURS 56 px (leads, victoires, signaux). */
export function Ligne({ gauche, titre, sous, droite, onClick }: { gauche: ReactNode; titre: ReactNode; sous: ReactNode; droite?: ReactNode; onClick?: () => void }) {
  const corps = <span className="min-w-0 flex-1"><span className="block truncate text-legende text-encre">{titre}</span><span className="block truncate text-colonne text-encre-2">{sous}</span></span>
  return (
    <li className="flex h-14 items-center gap-3 border-b-[0.5px] border-trait last:border-b-0">
      <span className="flex w-7 shrink-0 justify-center">{gauche}</span>
      {onClick ? <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left hover:opacity-80">{corps}</button> : corps}
      {droite ? <span className="flex shrink-0 items-center gap-3">{droite}</span> : null}
    </li>
  )
}
export const Rond = ({ Icone }: { Icone: LucideIcon }) => <span className="flex h-7 w-7 items-center justify-center rounded-full bg-fond-3"><Icone size={13} className="text-encre-2" /></span>
export const PointLead = () => <span className="h-1.5 w-1.5 rounded-full bg-signature" />

/** Un chiffre d'une grille de chiffres : libellé, valeur, détail ; toujours la même hauteur. */
export function Chiffre({ libelle, valeur, detail, ton = "text-encre", onClick, title }: { libelle: string; valeur: ReactNode; detail?: ReactNode; ton?: string; onClick?: () => void; title?: string }) {
  const contenu = (
    <>
      <span className="block truncate text-colonne text-encre-2">{libelle}</span>
      <span className={`chiffres block text-sous-titre font-semibold ${ton}`}>{valeur}</span>
      <span className="block h-4 truncate text-colonne text-encre-2">{detail}</span>
    </>
  )
  return onClick
    ? <button type="button" title={title} onClick={onClick} className="h-[68px] min-w-0 rounded-4 px-2 py-1.5 text-left transition-colors hover:bg-fond-2">{contenu}</button>
    : <div title={title} className="h-[68px] min-w-0 px-2 py-1.5">{contenu}</div>
}
