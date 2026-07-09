import { useEffect, useState } from "react"
import { Building2, X, Plus, Loader2 } from "lucide-react"
import type { Agence } from "../agences"
import {
  chargerAgencesDuProspect,
  chargerAgences,
  creerAgence,
  lierProspectAgence,
  delierProspectAgence,
} from "../lib/agencesDb"

export default function AgencesProspect({ prospectId }: { prospectId: string }) {
  const [agences, setAgences] = useState<Agence[]>([])
  const [toutes, setToutes] = useState<Agence[]>([])
  const [chargement, setChargement] = useState(true)
  const [choix, setChoix] = useState("")
  const [nouvelle, setNouvelle] = useState("")

  function recharger() {
    chargerAgencesDuProspect(prospectId)
      .then(setAgences)
      .catch(() => {})
      .finally(() => setChargement(false))
  }

  useEffect(() => {
    recharger()
    chargerAgences().then(setToutes).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospectId])

  const disponibles = toutes.filter((a) => !agences.some((x) => x.id === a.id))

  async function lier() {
    if (!choix) return
    await lierProspectAgence(prospectId, choix).catch(console.error)
    setChoix("")
    recharger()
  }

  async function creerEtLier() {
    const nom = nouvelle.trim()
    if (!nom) return
    try {
      const a = await creerAgence({ nom })
      await lierProspectAgence(prospectId, a.id!)
      setNouvelle("")
      setToutes((t) => [...t, a])
      recharger()
    } catch (e) {
      console.error(e)
    }
  }

  async function retirer(agenceId: string) {
    setAgences((arr) => arr.filter((a) => a.id !== agenceId))
    await delierProspectAgence(prospectId, agenceId).catch(console.error)
  }

  if (chargement)
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
        <Loader2 size={14} className="animate-spin" /> Chargement…
      </div>
    )

  return (
    <div className="space-y-2">
      {agences.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {agences.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm text-slate-700"
            >
              <Building2 size={14} className="text-slate-400" />
              {a.nom}
              <button
                onClick={() => a.id && retirer(a.id)}
                className="text-slate-300 hover:text-red-500"
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">Aucune agence reliée.</p>
      )}

      {/* Relier une agence existante */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={choix}
          onChange={(e) => setChoix(e.target.value)}
          className="min-w-44 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">Relier une agence existante…</option>
          {disponibles.map((a) => (
            <option key={a.id} value={a.id}>{a.nom}</option>
          ))}
        </select>
        <button
          onClick={lier}
          disabled={!choix}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Relier
        </button>
      </div>

      {/* Créer une nouvelle agence */}
      <div className="flex items-center gap-2">
        <input
          value={nouvelle}
          onChange={(e) => setNouvelle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && creerEtLier()}
          placeholder="…ou créer une nouvelle agence"
          className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <button
          onClick={creerEtLier}
          disabled={!nouvelle.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          <Plus size={15} /> Créer
        </button>
      </div>
    </div>
  )
}
