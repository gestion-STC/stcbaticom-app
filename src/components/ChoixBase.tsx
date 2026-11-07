// LE CHOIX DE BASE DANS UNE PAGE (Mahdi, 07/11/2026 : « pas de sélecteur en haut ; tu mets juste les
// sélecteurs sur chaque onglet, comme ça je choisis ce que je veux regarder »). Il n'apparaît que pour
// un compte qui a les deux bases ; le dernier choix de chaque page est gardé dans le navigateur.
import type { Espace } from "../lib/messagesDb"
import type { ChoixEspace } from "../lib/useChoixBase"
import { NOM_BASE } from "../lib/perimetre"

export default function ChoixBase({ valeur, onChange, espaces, avecTout, className = "" }: { valeur: ChoixEspace; onChange: (c: ChoixEspace) => void; espaces: Espace[]; avecTout: boolean; className?: string }) {
  if (espaces.length < 2) return null
  const options: [ChoixEspace, string][] = [...(avecTout ? [["tout", "Tout"] as [ChoixEspace, string]] : []), ...espaces.map((e) => [e, NOM_BASE[e]] as [ChoixEspace, string])]
  return (
    <div className={`flex w-fit rounded-full bg-fond-3 p-[2px] text-colonne ${className}`} role="tablist" aria-label="Base">
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={valeur === k}
          onClick={() => onChange(k)}
          className={`h-7 rounded-full px-3.5 ${valeur === k ? "bg-fond font-medium text-encre shadow-[0_1px_2px_rgb(17_17_19/0.08)]" : "text-encre-2 hover:text-encre"}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
