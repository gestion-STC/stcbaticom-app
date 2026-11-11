// La pilule « Mails de : Moi · Tout le monde · un commercial » (11/11/2026), recopiée de STC Bâtiment
// (src/components/admin/bureau/FiltrePersonne.tsx, le sélecteur des administrateurs).
// ⚠ UN FILTRE D'AFFICHAGE, PAS UN DROIT : c'est la base (règle de lecture de « messages ») qui ne montre à un
// commercial que ses mails. Un commercial n'a donc pas de sélecteur.
import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { MOI, TOUS, libelleChoix, type Personne } from "../../lib/filtrePersonne"

export default function FiltrePersonne({ choix, setChoix, personnes, etiquette = "Mails de" }: {
  choix: string
  setChoix: (c: string) => void
  personnes: Personne[]
  etiquette?: string
}) {
  const [ouvert, setOuvert] = useState(false)
  const boite = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const fermer = (e: MouseEvent) => { if (!boite.current?.contains(e.target as Node)) setOuvert(false) }
    document.addEventListener("mousedown", fermer)
    return () => document.removeEventListener("mousedown", fermer)
  }, [ouvert])
  const options: Personne[] = [{ id: MOI, nom: "Moi" }, { id: TOUS, nom: "Tout le monde" }, ...personnes]
  return (
    <div ref={boite} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}
        className="inline-flex h-[26px] min-w-[170px] items-center justify-between gap-2 rounded-full bg-[#F4F4F6] pl-3 pr-2.5 text-[13px] font-medium text-[#111113] hover:bg-[#ECECEF]">
        <span className="truncate"><span className="font-normal text-[#6B6B70]">{etiquette} :</span> {libelleChoix(choix, personnes)}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8E8E93]" strokeWidth={1.8} />
      </button>
      {ouvert && (
        <div role="listbox" aria-label={etiquette} className="absolute right-0 top-[32px] z-30 max-h-80 w-[230px] overflow-y-auto rounded-[10px] border-[0.5px] border-[#EEEEF0] bg-white p-1 shadow-[0_8px_24px_rgba(17,17,19,.08)]">
          {options.map((o, i) => (
            <button key={o.id} type="button" role="option" aria-selected={choix === o.id}
              onClick={() => { setChoix(o.id); setOuvert(false) }}
              className={`block h-8 w-full rounded-md px-2.5 text-left text-[13px] hover:bg-[#F7F7F9] ${choix === o.id ? "font-semibold" : ""} ${i === 2 ? "mt-1 border-t-[0.5px] border-[#EEEEF0] pt-1" : ""}`}>
              {o.nom}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
