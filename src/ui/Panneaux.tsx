// La trousse STC — ce qui s'ouvre par-dessus la page : le panneau latéral (une
// fiche, à droite) et le dialogue (une question, au centre). Rayon 6, ombre
// flottante, voile sombre léger. Échap et le voile ferment.
import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"

function useEchap(fermer: () => void) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") fermer() }
    window.addEventListener("keydown", f)
    return () => window.removeEventListener("keydown", f)
  }, [fermer])
}

export function Panneau({ titre, sousTitre, onFermer, children, pied, largeur = "w-[440px]" }: {
  titre: ReactNode
  sousTitre?: ReactNode
  onFermer: () => void
  children: ReactNode
  pied?: ReactNode
  largeur?: string
}) {
  useEchap(onFermer)
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onFermer} />
      <aside className={`absolute inset-y-0 right-0 flex max-w-full flex-col border-l border-trait bg-fond shadow-flottante ${largeur}`}>
        <div className="flex items-start justify-between gap-4 border-b border-trait px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-section font-semibold tracking-[-0.015em] text-encre">{titre}</h2>
            {sousTitre ? <div className="mt-1 text-legende text-encre-2">{sousTitre}</div> : null}
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="rounded-3 p-1 text-encre-2 hover:bg-fond-4 hover:text-encre">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {pied ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-trait px-6 py-3">{pied}</div> : null}
      </aside>
    </div>
  )
}

export function Dialogue({ titre, description, onFermer, children, pied, largeur = "max-w-lg" }: {
  titre: ReactNode
  description?: ReactNode
  onFermer: () => void
  children?: ReactNode
  pied?: ReactNode
  largeur?: string
}) {
  useEchap(onFermer)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onFermer} />
      <div className={`relative flex max-h-full w-full flex-col rounded-6 border border-trait bg-fond shadow-flottante ${largeur}`}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 className="text-sous-titre font-semibold text-encre">{titre}</h2>
            {description ? <p className="mt-1 text-legende text-encre-2">{description}</p> : null}
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="rounded-3 p-1 text-encre-2 hover:bg-fond-4 hover:text-encre">
            <X size={18} />
          </button>
        </div>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div> : <div className="h-4" />}
        {pied ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-trait px-6 py-3">{pied}</div> : null}
      </div>
    </div>
  )
}
