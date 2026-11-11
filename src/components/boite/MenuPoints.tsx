// Le menu « ⋯ » de STC Bâtiment (DropdownMenu de shadcn), refait sans bibliothèque :
// un rond d'outil qui ouvre une petite carte, fermée au clic dehors ou par Échap.
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Check, MoreHorizontal } from "lucide-react"
import { MENU, OUTIL } from "../agenda/dessinBureau"

export function MenuPoints({ titre, pastille, largeur = "w-56", children }: { titre: string; pastille?: boolean; largeur?: string; children: (fermer: () => void) => ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOuvert(false) }
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOuvert(false) } }
    document.addEventListener("mousedown", dehors)
    window.addEventListener("keydown", echap, true)
    return () => { document.removeEventListener("mousedown", dehors); window.removeEventListener("keydown", echap, true) }
  }, [ouvert])
  return (
    <div ref={ref} className="relative">
      <button type="button" className={`${OUTIL} relative`} title={titre} aria-label={titre} aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
        <MoreHorizontal className="h-[15px] w-[15px]" strokeWidth={1.8} />
        {pastille && <span className="absolute right-1 top-[5px] h-1.5 w-1.5 rounded-full bg-[#C9302C]" />}
      </button>
      {ouvert && (
        <div role="menu" className={`absolute right-0 top-full z-40 mt-1 ${largeur} ${MENU}`}>
          {children(() => setOuvert(false))}
        </div>
      )}
    </div>
  )
}

/** Une ligne du menu ; `coche` défini = case à cocher (le ✓ à gauche, comme shadcn). */
export function ElementMenu({ onClick, coche, disabled, children }: { onClick: () => void; coche?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" role={coche === undefined ? "menuitem" : "menuitemcheckbox"} aria-checked={coche} disabled={disabled} onClick={onClick}
      className={`relative flex w-full items-center rounded-[6px] py-1.5 pr-2 text-left text-[13px] text-[#111113] hover:bg-[#F2F2F4] disabled:opacity-50 ${coche === undefined ? "pl-2" : "pl-8"}`}>
      {coche && <Check className="absolute left-2 h-4 w-4" strokeWidth={1.8} />}
      {children}
    </button>
  )
}

export function SeparateurMenu() {
  return <div className="-mx-1 my-1 h-px bg-[#EEEEF0]" />
}
