import { useRef, useState } from "react"
import { X, CalendarPlus, Check } from "lucide-react"
import { creerRdv } from "../lib/rdvDb"

function aujourdhui(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Prise de RDV rapide pour un prospect donné (depuis la fiche ou une session).
export default function NouveauRdvModal({
  prospectId,
  entreprise,
  onClose,
  onCree,
}: {
  prospectId: string
  entreprise: string
  onClose: () => void
  onCree?: () => void
}) {
  const [date, setDate] = useState(aujourdhui())
  const [heure, setHeure] = useState("10:00")
  const [note, setNote] = useState("")
  const [enCours, setEnCours] = useState(false)
  const [fait, setFait] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const verrouRef = useRef(false)

  async function enregistrer() {
    if (verrouRef.current) return // anti double-clic (verrou synchrone)
    verrouRef.current = true
    setEnCours(true)
    setErreur(null)
    try {
      await creerRdv({ prospectId, date, heure, note })
      setFait(true)
      onCree?.()
      setTimeout(onClose, 700)
    } catch (e) {
      setErreur("Enregistrement impossible : " + (e instanceof Error ? e.message : String(e)))
      setEnCours(false)
      verrouRef.current = false
    }
  }

  const champ =
    "rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <CalendarPlus size={18} className="text-blue-600" />
            Programmer un RDV
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-5">
          <p className="text-sm text-slate-600">
            Avec <span className="font-medium text-slate-900">{entreprise}</span>
          </p>
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="text-xs font-medium text-slate-500">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={champ + " w-full"} />
            </label>
            <label>
              <span className="text-xs font-medium text-slate-500">Heure</span>
              <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className={champ + " w-full"} />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Note (optionnel)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. rappeler après le devis" className={champ + " w-full"} />
          </label>
          {erreur && <p className="text-xs text-red-500">{erreur}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
          <button
            onClick={enregistrer}
            disabled={enCours || fait}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {fait ? <Check size={16} /> : <CalendarPlus size={16} />}
            {fait ? "Ajouté !" : "Ajouter au calendrier"}
          </button>
        </div>
      </div>
    </div>
  )
}
