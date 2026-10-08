// La trousse STC — les champs de saisie : même forme que le bureau STC Bâtiment
// (hauteur 34, rayon 4, trait 1 px, anneau de focus 1 px à la couleur signature).
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react"
import { ChevronDown } from "lucide-react"

const CHAMP =
  "w-full rounded-4 border border-trait bg-fond px-3 text-legende text-encre shadow-posee transition-colors " +
  "placeholder:text-encre-3 focus:border-signature focus:outline-none focus:ring-1 focus:ring-signature " +
  "disabled:cursor-not-allowed disabled:opacity-50"

export function Champ({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CHAMP} h-[34px] ${className}`} />
}

export function Zone({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${CHAMP} min-h-[80px] py-2 leading-5 ${className}`} />
}

export function Selecteur({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`relative block ${className}`}>
      <select {...props} className={`${CHAMP} h-[34px] appearance-none pr-8`}>
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-encre-3" />
    </span>
  )
}

/** Une étiquette au-dessus d'un champ, avec une aide facultative en dessous. */
export function Etiquette({ texte, aide, children, className = "" }: { texte: string; aide?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-legende font-medium text-encre">{texte}</span>
      {children}
      {aide ? <span className="mt-1 block text-colonne text-encre-2">{aide}</span> : null}
    </label>
  )
}

/** Case à cocher, texte à droite. */
export function Case({ texte, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { texte: ReactNode }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-legende text-encre ${className}`}>
      <input type="checkbox" {...props} className="h-4 w-4 rounded-3 border-trait accent-action" />
      {texte}
    </label>
  )
}

/** Interrupteur marche / arrêt : anthracite quand il est allumé, comme au bureau STC. */
export function Interrupteur({ allume, onChange, libelle, disabled }: { allume: boolean; onChange: (v: boolean) => void; libelle?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={allume}
      aria-label={libelle}
      disabled={disabled}
      onClick={() => onChange(!allume)}
      className={
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors " +
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature focus-visible:ring-offset-2 disabled:opacity-50 " +
        (allume ? "bg-action" : "bg-trait-fort")
      }
    >
      <span className={"h-5 w-5 rounded-full bg-fond shadow-flottante transition-transform " + (allume ? "translate-x-5" : "translate-x-0")} />
    </button>
  )
}
