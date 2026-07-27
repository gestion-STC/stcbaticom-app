import { useState } from "react"
import { X, Phone, Trash2, Plus, Pencil, Check } from "lucide-react"
import type { Prospect } from "../data"
import { typesRdv, type Rdv } from "../rdv"

export default function RdvJourModal({
  dateLisible,
  rdvs,
  prospects,
  onClose,
  onAjouter,
  onSupprimer,
  onModifier,
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
  onModifier: (
    id: string,
    champs: { titre?: string; telephone?: string; type?: string; heure?: string; note?: string },
  ) => void
}) {
  const [prospectId, setProspectId] = useState("") // "" = saisie libre
  const [titre, setTitre] = useState("")
  const [telephone, setTelephone] = useState("")
  const [type, setType] = useState<string>("Téléphone")
  const [heure, setHeure] = useState("10:00")
  const [note, setNote] = useState("")
  // Édition d'un RDV existant (crayon).
  const [editId, setEditId] = useState<string | null>(null)
  const [eHeure, setEHeure] = useState("")
  const [eType, setEType] = useState("Téléphone")
  const [eNote, setENote] = useState("")
  const [eTitre, setETitre] = useState("")
  const [eTel, setETel] = useState("")

  function ouvrirEdition(r: Rdv) {
    setEditId(r.id ?? null)
    setEHeure(r.heure)
    setEType(r.type)
    setENote(r.note ?? "")
    setETitre(r.titre ?? "")
    setETel(r.telephone ?? "")
  }
  function enregistrerEdition(r: Rdv) {
    if (!r.id) return
    const champs: { titre?: string; telephone?: string; type?: string; heure?: string; note?: string } = {
      type: eType,
      heure: eHeure,
      note: eNote,
    }
    // Un RDV « libre » (pas rattaché à un prospect) : on peut aussi corriger le nom + tél.
    if (r.prospectId === null) {
      champs.titre = eTitre
      champs.telephone = eTel
    }
    onModifier(r.id, champs)
    setEditId(null)
  }

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
                .map((r) =>
                  editId === r.id ? (
                    // --- Mode ÉDITION ---
                    <div key={r.id} className="space-y-2 rounded-lg border border-blue-300 bg-blue-50/40 p-2.5">
                      {r.prospectId === null && (
                        <>
                          <input value={eTitre} onChange={(e) => setETitre(e.target.value)} placeholder="Nom / objet du RDV" className={champ + " w-full"} />
                          <input value={eTel} onChange={(e) => setETel(e.target.value)} placeholder="Téléphone (optionnel)" className={champ + " w-full"} />
                        </>
                      )}
                      <div className="flex items-center gap-2">
                        <select value={eType} onChange={(e) => setEType(e.target.value)} className={champ}>
                          {typesRdv.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <input type="time" value={eHeure} onChange={(e) => setEHeure(e.target.value)} className={champ} />
                      </div>
                      <textarea value={eNote} onChange={(e) => setENote(e.target.value)} placeholder="Commentaire (optionnel)" rows={3} className={champ + " w-full resize-y"} />
                      <div className="flex gap-2">
                        <button onClick={() => enregistrerEdition(r)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
                          <Check size={15} /> Enregistrer
                        </button>
                        <button onClick={() => setEditId(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    // --- Mode AFFICHAGE ---
                    <div key={r.id} className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2">
                      <span className="mt-0.5 shrink-0 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{r.heure}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">{r.entreprise}</p>
                        <p className="text-xs text-slate-400">
                          {r.type}
                          {r.telephone ? " · " + r.telephone : ""}
                        </p>
                        {r.note && (
                          <p className="mt-1 whitespace-pre-wrap break-words rounded-md bg-amber-50 px-2 py-1 text-xs text-slate-700">
                            {r.note}
                          </p>
                        )}
                      </div>
                      {r.telephone && (
                        <a href={`tel:${r.telephone.replace(/\s/g, "")}`} className="rounded-md p-1.5 text-green-600 hover:bg-green-50" title="Appeler">
                          <Phone size={16} />
                        </a>
                      )}
                      <button onClick={() => ouvrirEdition(r)} className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Modifier">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => r.id && onSupprimer(r.id)} className="rounded-md p-1.5 text-slate-300 hover:text-red-500" title="Supprimer">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ),
                )}
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
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Commentaire (optionnel)" rows={3} className={champ + " w-full resize-y"} />

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
