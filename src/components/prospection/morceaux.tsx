// Les petits morceaux d'écran communs à la prospection : titre de page, nom de base, barre, onglets.
import type { ReactNode } from "react"
import { Database } from "lucide-react"
import type { Base } from "../../prospection/modele"

export function Titre({ titre, sous, droite }: { titre: ReactNode; sous?: ReactNode; droite?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b-[0.5px] border-trait pb-4">
      <div className="min-w-0"><h1 className="text-h1 font-semibold tracking-[-0.015em] text-encre">{titre}</h1>{sous ? <p className="mt-1 text-legende text-encre-2">{sous}</p> : null}</div>
      {droite ? <div className="flex flex-wrap items-center gap-2">{droite}</div> : null}
    </div>
  )
}
export const NomBase = ({ base }: { base: Base | undefined }) => <span className="inline-flex items-center gap-1.5 text-colonne text-encre-2"><Database size={11} />{base?.nom ?? "—"}</span>
/** Une barre fine posée sur sa ligne, la valeur toujours écrite à côté (jamais la couleur seule). */
export const Barre = ({ v, max, ton = "bg-encre/70" }: { v: number; max: number; ton?: string }) => (
  <span className="block h-[6px] rounded-r-[3px] bg-fond-3"><span className={`block h-full rounded-r-[3px] ${ton}`} style={{ width: `${max > 0 ? Math.max(v ? 2 : 0, (v / max) * 100) : 0}%` }} /></span>
)
export function Onglets<T extends string>({ valeur, onChange, options }: { valeur: T; onChange: (v: T) => void; options: [T, string, number?][] }) {
  return (
    <div className="flex w-fit flex-wrap rounded-full bg-fond-3 p-[2px] text-colonne">
      {options.map(([k, l, n]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={`h-7 rounded-full px-3 ${valeur === k ? "bg-fond font-medium text-encre shadow-[0_1px_2px_rgb(17_17_19/0.08)]" : "text-encre-2 hover:text-encre"}`}>
          {l}{n != null ? <span className="chiffres ml-1 text-encre-2">{n}</span> : null}
        </button>
      ))}
    </div>
  )
}
