import { useState } from "react"
import { Database, ListOrdered, Gauge, BarChart3 } from "lucide-react"
import BaseST from "./BaseST"
import SequencesST from "./SequencesST"
import PilotageST from "./PilotageST"
import SuiviST from "./SuiviST"

type Onglet = "base" | "sequences" | "pilotage" | "suivi"

const onglets: { id: Onglet; label: string; icon: typeof Database }[] = [
  { id: "base", label: "Base", icon: Database },
  { id: "sequences", label: "Séquences", icon: ListOrdered },
  { id: "pilotage", label: "Pilotage", icon: Gauge },
  { id: "suivi", label: "Suivi", icon: BarChart3 },
]

export default function RecrutementST() {
  const [onglet, setOnglet] = useState<Onglet>("base")

  return (
    <div>
      {/* Barre de sous-onglets (même esprit que Paramétrage) */}
      <div className="mb-6 border-b border-slate-200 px-8">
        <div className="mx-auto flex max-w-5xl gap-1">
          {onglets.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setOnglet(id)}
              className={
                "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors " +
                (onglet === id
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800")
              }
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
      </div>

      {onglet === "base" && <BaseST />}
      {onglet === "sequences" && <SequencesST />}
      {onglet === "pilotage" && <PilotageST />}
      {onglet === "suivi" && <SuiviST />}
    </div>
  )
}
