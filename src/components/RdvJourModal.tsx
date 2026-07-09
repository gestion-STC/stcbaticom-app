import { useState } from "react"
import { X, Phone, Trash2, Plus } from "lucide-react"
import type { Prospect } from "../data"
import { typesRdv, type Rdv } from "../rdv"

export default function RdvJourModal({
  dateLisible,
  rdvs,
  prospects,
  onClose,
  onAjouter,
  onSupprimer,
}: {
  dateLisible: string
  rdvs: Rdv[]
  prospects: Prospect[]
  onClose: () => void
  onAjouter: (r: {
    prospectId: string | null
    titre: string
    telephone: string
    type: string
    heure: string
    note: string
  }) => void
  onSupprimer: (id: string) => void
}) {
  const [prospectId, setProspectId] = useState("") // "" = saisie libre
  const [titre, setTitre] = useState("")
  const [telephone, setTelephone] = useState("")
  const [type, setType] = useState<string>("Téléphone")
  const [heure, setHeure] = useState("10:00")
  const [note, setNote] = useState("")

  const champ =
    "rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
  const libre = prospectId === ""

  function ajouter() {
    if (!libre || titre.trim()) {
      onAjouter({ prospectId: libre ? null : prospectId, titre, telephone, type, heure, note })
      setTitre("")
      setTelephone("")
      setNote("")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">RDV du {dateLisible}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-5">
          {/* RDV existants */}
          {rdvs.length > 0 && (
            <div className="mb-4 space-y-2">
              {rdvs
                .slice()
                .sort((a, b) => a.heure.localeCompare(b.heure))
                .map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                    <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{r.heure}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{r.entreprise}</p>
                      <p className="truncate text-xs text-slate-400">
                        {r.type}
                        {r.telephone ? " · " + r.telephone : ""}
                        {r.note ? " · " + r.note : ""}
                      </p>
                    </div>
                    {r.telephone && (
                      <a href={`tel:${r.telephone.replace(/\s/g, "")}`} className="rounded-md p-1.5 text-green-600 hover:bg-green-50" title="Appeler">
                        <Phone size={16} />
                      </a>
                    )}
                    <button onClick={() => r.id && onSupprimer(r.id)} className="rounded-md p-1.5 text-slate-300 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
            </div>
          )}

          {/* Ajouter un RDV */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Ajouter un RDV</p>
          <div className="space-y-2">
            <select value={prospectId} onChange={(e) => setProspectId(e.target.value)} className={champ + " w-full"}>
              <option value="">— Autre (saisie libre) —</option>
              {prospects.map((p) => (
                <option key={p.id} value={p.id}>{p.entreprise}</option>
              ))}
            </select>

            {libre && (
              <div className="space-y-2 rounded-lg bg-slate-50 p-2.5">
                <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Nom / objet du RDV (ex. M. Durand, notaire)" className={champ + " w-full"} />
                <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Téléphone (optionnel)" className={champ + " w-full"} />
              </div>
            )}

            <div className="flex items-center gap-2">
              <select value={type} onChange={(e) => setType(e.target.value)} className={champ}>
                {typesRdv.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className={champ} />
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optionnel)" className={champ + " w-full"} />

            <button
              onClick={ajouter}
              disabled={libre && !titre.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              <Plus size={16} /> Ajouter le RDV
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
