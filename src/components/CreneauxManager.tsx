import { useEffect, useState } from "react"
import { Plus, Trash2, Loader2, AlertTriangle } from "lucide-react"
import { palette, type Statut } from "../statuts"
import { joursLabels, type Creneau } from "../creneaux"
import { supabaseConfigure } from "../lib/supabase"
import { chargerStatuts } from "../lib/statutsDb"
import {
  chargerCreneaux,
  creerCreneau,
  majCreneau,
  supprimerCreneau,
} from "../lib/creneauxDb"

export default function CreneauxManager() {
  const [creneaux, setCreneaux] = useState<Creneau[]>([])
  const [statuts, setStatuts] = useState<Statut[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseConfigure) {
      setErreur("Supabase non configuré.")
      setChargement(false)
      return
    }
    Promise.all([chargerStatuts(), chargerCreneaux()])
      .then(([s, c]) => {
        setStatuts(s)
        setCreneaux(c)
      })
      .catch((e) =>
        setErreur(
          "Chargement impossible. Avez-vous créé la table « creneaux » ? Détail : " +
            (e instanceof Error ? e.message : String(e)),
        ),
      )
      .finally(() => setChargement(false))
  }, [])

  function modifier(c: Creneau, champs: Partial<Creneau>, persister = true) {
    const nouveau = { ...c, ...champs }
    setCreneaux((arr) => arr.map((x) => (x === c ? nouveau : x)))
    if (persister && c.id) majCreneau(c.id, nouveau).catch(console.error)
  }

  function basculerJour(c: Creneau, jour: number) {
    const jours = c.jours.includes(jour)
      ? c.jours.filter((j) => j !== jour)
      : [...c.jours, jour].sort()
    modifier(c, { jours })
  }

  async function ajouter() {
    if (!statuts.length) return
    try {
      const cree = await creerCreneau({
        nom: "Nouveau créneau",
        etatId: statuts[0].id!,
        heureDebut: "09:00",
        heureFin: "12:00",
        cadenceSecondes: 20,
        jours: [1, 2, 3, 4, 5],
        actif: true,
      })
      setCreneaux((arr) => [...arr, cree])
    } catch (e) {
      setErreur("Création impossible : " + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function supprimer(c: Creneau) {
    setCreneaux((arr) => arr.filter((x) => x !== c))
    if (c.id) await supprimerCreneau(c.id).catch(console.error)
  }

  const champHeure =
    "rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"

  return (
    <div className="px-8 pb-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Programmez quels prospects appeler, quand et à quelle cadence.
          </p>
          <button
            onClick={ajouter}
            disabled={!statuts.length}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            <Plus size={16} strokeWidth={2.3} />
            Créer un créneau
          </button>
        </div>

        {erreur && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
            <p className="flex-1">{erreur}</p>
            <button onClick={() => setErreur(null)} className="text-red-500">✕</button>
          </div>
        )}

        {chargement ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-8 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Chargement…
          </div>
        ) : (
          <div className="space-y-3">
            {creneaux.map((c, i) => {
              const st = statuts.find((s) => s.id === c.etatId)
              return (
                <div
                  key={c.id ?? i}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      value={c.nom}
                      onChange={(e) => modifier(c, { nom: e.target.value }, false)}
                      onBlur={() => c.id && majCreneau(c.id, c).catch(console.error)}
                      className="flex-1 rounded-md border border-transparent px-2 py-1 text-sm font-medium text-slate-800 outline-none hover:border-slate-200 focus:border-blue-400"
                    />
                    <button
                      onClick={() => modifier(c, { actif: !c.actif })}
                      className={
                        "rounded-full px-2.5 py-1 text-xs font-medium " +
                        (c.actif
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500")
                      }
                    >
                      {c.actif ? "Actif" : "Inactif"}
                    </button>
                    <button
                      onClick={() => supprimer(c)}
                      className="rounded-md p-1.5 text-slate-300 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <span>Appeler les</span>
                    <select
                      value={c.etatId}
                      onChange={(e) => modifier(c, { etatId: e.target.value })}
                      className={champHeure}
                    >
                      {statuts.map((s) => (
                        <option key={s.id} value={s.id}>{s.libelle}</option>
                      ))}
                    </select>
                    {st && (
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: palette[st.couleur].dot }}
                      />
                    )}
                    <span>de</span>
                    <input
                      type="time"
                      value={c.heureDebut}
                      onChange={(e) => modifier(c, { heureDebut: e.target.value })}
                      className={champHeure}
                    />
                    <span>à</span>
                    <input
                      type="time"
                      value={c.heureFin}
                      onChange={(e) => modifier(c, { heureFin: e.target.value })}
                      className={champHeure}
                    />
                    <span>· cadence</span>
                    <input
                      type="number"
                      min={5}
                      step={5}
                      value={c.cadenceSecondes}
                      onChange={(e) =>
                        modifier(c, { cadenceSecondes: Number(e.target.value) || 5 })
                      }
                      className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    <span>s</span>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="mr-1 text-xs text-slate-400">Jours :</span>
                    {joursLabels.map((j, k) => {
                      const actif = c.jours.includes(j.num)
                      return (
                        <button
                          key={k}
                          onClick={() => basculerJour(c, j.num)}
                          className={
                            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium " +
                            (actif
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200")
                          }
                        >
                          {j.court}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {creneaux.length === 0 && !erreur && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-400">
                Aucun créneau. Cliquez sur « Créer un créneau ».
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
