// La trousse STC — les surfaces : carte, en-tête de page, onglets, pastilles,
// compteurs, bandeaux, tableau, état vide. Dessin « bancaire » (24/10/2026, celui du
// bureau STC) : filets fins, cartes sans ombre, rangées fines, en-têtes de colonne en
// texte gris (plus de capitales), états en petit point de couleur + texte gris.
import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react"
import { Loader2 } from "lucide-react"

export function Carte({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={`rounded-6 border-[0.5px] border-trait bg-fond ${className}`}>
      {children}
    </div>
  )
}

/** Titre de bloc dans une carte, avec une action facultative à droite. */
export function TitreCarte({ children, droite, className = "" }: { children: ReactNode; droite?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-5 pt-4 pb-2 ${className}`}>
      <h2 className="text-sous-titre font-semibold text-encre">{children}</h2>
      {droite ? <div className="flex items-center gap-2">{droite}</div> : null}
    </div>
  )
}

/** En-tête de page : H1 (21 px, plus de tiret violet depuis le 24/10), sous-titre, actions à droite.
 *  Sur un petit écran (MacBook, 13/10) : le titre ne se coupe pas, mais le sous-titre passe à la
 *  ligne au lieu de déborder SUR les boutons (il recouvrait « Nouvelle agence », plus cliquable).
 *  Et les commandes de droite passent à la ligne au lieu de sortir de l'écran (la session de call,
 *  13/10 : ses piles et filtres débordaient). Le titre garde sa largeur (min-w-min), le reste se replie. */
export function EnTetePage({ titre, sousTitre, droite }: { titre: ReactNode; sousTitre?: ReactNode; droite?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="relative min-w-0 lg:min-w-min lg:flex-1">
        <h1 className="whitespace-nowrap text-h1 font-semibold tracking-[-0.02em] text-encre">{titre}</h1>
        {sousTitre ? <p className="mt-1 text-legende text-encre-2">{sousTitre}</p> : null}
      </div>
      {droite ? <div className="relative z-10 flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">{droite}</div> : null}
    </div>
  )
}

/** Onglets : texte gris, un filet fin dessous, l'onglet ouvert en noir souligné de noir. */
export function Onglets<T extends string>({ valeur, onChange, options, className = "" }: {
  valeur: T
  onChange: (v: T) => void
  options: { id: T; label: ReactNode; badge?: number }[]
  className?: string
}) {
  return (
    <div role="tablist" className={`flex gap-[22px] border-b-[0.5px] border-trait ${className}`}>
      {options.map((o) => {
        const actif = o.id === valeur
        return (
          <button
            key={o.id}
            role="tab"
            type="button"
            aria-selected={actif}
            onClick={() => onChange(o.id)}
            className={
              "relative flex items-center gap-2 py-2.5 text-legende transition-colors " +
              (actif
                ? "font-medium text-encre after:absolute after:inset-x-0 after:-bottom-px after:h-[1.5px] after:bg-encre"
                : "text-encre-2 hover:text-encre")
            }
          >
            {o.label}
            {o.badge ? <span className="chiffres rounded-full bg-encre px-1.5 text-[10px] font-medium leading-4 text-white">{o.badge}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

export type RolePastille = "actif" | "fait" | "attente" | "probleme" | "inerte" | "info"
// La couleur du point ; le texte reste gris (dessin « bancaire », 24/10/2026).
const POINTS: Record<RolePastille, string> = {
  actif: "bg-encre",
  fait: "bg-ok",
  attente: "bg-attention",
  probleme: "bg-alerte",
  inerte: "bg-encre-3",
  info: "bg-info",
}
/** État : un petit point de couleur et un texte gris (plus de pastille remplie). `point` est gardé
 *  pour les écrans qui le passent : le point est toujours là. */
export function Pastille({ role = "inerte", children, className = "" }: { role?: RolePastille; children: ReactNode; point?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-colonne ${role === "actif" ? "text-encre" : "text-encre-2"} ${className}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${POINTS[role]}`} />
      {children}
    </span>
  )
}

/** Bandeau de compteurs : des cases séparées par des filets, cliquables si `onSelect`. */
export function Compteurs<T extends string>({ valeurs, actif, onSelect }: {
  valeurs: { id: T; libelle: string; valeur: ReactNode; detail?: ReactNode; role?: "alerte" | "ok" }[]
  actif?: T | null
  onSelect?: (id: T) => void
}) {
  return (
    <div className="flex flex-wrap items-stretch overflow-hidden rounded-6 border-[0.5px] border-trait bg-fond">
      {valeurs.map((v, i) => {
        const Tag = onSelect ? "button" : "div"
        return (
          <Tag
            key={v.id}
            type={onSelect ? "button" : undefined}
            onClick={onSelect ? () => onSelect(v.id) : undefined}
            className={
              "min-w-[120px] flex-1 px-4 py-3 text-left transition-colors " +
              (i > 0 ? "border-l-[0.5px] border-trait " : "") +
              (onSelect ? "hover:bg-fond-2 " : "") +
              (actif === v.id ? "bg-fond-3" : "")
            }
          >
            <div className="text-colonne text-encre-2">{v.libelle}</div>
            <div className={"chiffres mt-0.5 text-[24px] font-medium leading-8 tracking-[-0.02em] " + (v.role === "alerte" ? "text-alerte" : v.role === "ok" ? "text-ok" : "text-encre")}>{v.valeur}</div>
            {v.detail ? <div className="mt-0.5 text-colonne text-encre-2">{v.detail}</div> : null}
          </Tag>
        )
      })}
    </div>
  )
}

/** Bandeau d'information, d'attention ou d'alerte, avec une action à droite. */
export function Bandeau({ role = "info", children, action, className = "" }: { role?: "info" | "attention" | "alerte" | "ok"; children: ReactNode; action?: ReactNode; className?: string }) {
  const teinte = {
    info: "border-info/20 bg-info-fond text-encre",
    attention: "border-attention/20 bg-attention-fond text-attention",
    alerte: "border-alerte/20 bg-alerte-fond text-alerte",
    ok: "border-ok/20 bg-ok-fond text-ok",
  }[role]
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-6 border-[0.5px] px-3 py-2 text-legende ${teinte} ${className}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/** Tableau : rangées fines séparées d'un filet, en-têtes de colonne en texte gris 11 px. */
export function Tableau({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-legende">{children}</table>
    </div>
  )
}
export function Th({ num, className = "", children, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return (
    <th {...props} className={`h-[34px] border-b-[0.5px] border-trait px-3 text-left align-middle text-colonne font-normal text-encre-2 ${num ? "text-right" : ""} ${className}`}>
      {children}
    </th>
  )
}
export function Td({ num, className = "", children, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return (
    <td {...props} className={`border-b-[0.5px] border-trait px-3 py-[9px] align-middle ${num ? "chiffres text-right" : ""} ${className}`}>
      {children}
    </td>
  )
}
export function Tr({ className = "", children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr {...props} className={`transition-colors hover:bg-fond-2 ${props.onClick ? "cursor-pointer" : ""} ${className}`}>
      {children}
    </tr>
  )
}

/** Rien à montrer : un titre, une phrase, une action éventuelle. */
export function Vide({ titre, texte, action }: { titre: string; texte?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sous-titre font-semibold text-encre">{titre}</p>
      {texte ? <p className="max-w-md text-legende text-encre-2">{texte}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function Chargement({ texte = "Chargement…" }: { texte?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-legende text-encre-2">
      <Loader2 size={16} className="animate-spin" /> {texte}
    </div>
  )
}

/** La zone de filtres au-dessus d'une liste. */
export function BarreFiltres({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-3 ${className}`}>{children}</div>
}

/** Une paire libellé / valeur, dans une fiche. */
export function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-legende">
      <span className="shrink-0 text-encre-2">{libelle}</span>
      <span className="min-w-0 text-right text-encre">{children}</span>
    </div>
  )
}
