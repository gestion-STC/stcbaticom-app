import { useEffect, useMemo, useState } from "react"
import { Building2, Search, Users, Loader2, AlertTriangle } from "lucide-react"
import type { Agence } from "../agences"
import { supabaseConfigure } from "../lib/supabase"
import { chargerAgences } from "../lib/agencesDb"
import AgenceModal from "./AgenceModal"

export default function AgencesView() {
  const [agences, setAgences] = useState<Agence[]>([])
  const [recherche, setRecherche] = useState("")
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [selection, setSelection] = useState<Agence | null>(null)

  function recharger() {
    if (!supabaseConfigure) {
      setErreur("Supabase non configuré.")
      setChargement(false)
      return
    }
    chargerAgences()
      .then(setAgences)
      .catch((e) =>
        setErreur(
          "Chargement impossible. Avez-vous créé les tables agences ? Détail : " +
            (e instanceof Error ? e.message : String(e)),
        ),
      )
      .finally(() => setChargement(false))
  }

  useEffect(recharger, [])

  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    const filtres = q
      ? agences.filter((a) =>
          [a.nom, a.adresse, a.arrondissement].join(" ").toLowerCase().includes(q),
        )
      : agences
    // Classement : plus de lots en haut, puis par nom
    return [...filtres].sort(
      (a, b) => (b.nbLots ?? 0) - (a.nbLots ?? 0) || a.nom.localeCompare(b.nom),
    )
  }, [recherche, agences])

  return (
    <div className="px-8 pb-10">
      {selection && (
        <AgenceModal
          agence={selection}
          onClose={() => setSelection(null)}
          onMaj={recharger}
        />
      )}

      {erreur && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
          <p>{erreur}</p>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {agences.length} agence{agences.length > 1 ? "s" : ""}
        </p>
        <div className="relative w-72 max-w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher une agence…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>

      {chargement ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-8 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Chargement…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lignes.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelection(a)}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-slate-50"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                {a.logoUrl ? (
                  <img src={a.logoUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Building2 size={20} className="text-slate-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{a.nom}</p>
                <p className="truncate text-xs text-slate-400">
                  {a.adresse || "—"} {a.arrondissement ? `· ${a.arrondissement}` : ""}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                  <Users size={12} /> {a.nbGestionnaires ?? 0} gestionnaire
                  {(a.nbGestionnaires ?? 0) > 1 ? "s" : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold leading-none text-slate-900">
                  {(a.nbLots ?? 0).toLocaleString("fr-FR")}
                </p>
                <p className="text-[11px] text-slate-400">lots</p>
              </div>
            </button>
          ))}
          {lignes.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-400">
              Aucune agence.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
