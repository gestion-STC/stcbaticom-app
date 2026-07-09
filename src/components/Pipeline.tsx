import { useEffect, useState } from "react"
import { Phone, Flag } from "lucide-react"
import { palette, statutsParDefaut, type Statut } from "../statuts"
import type { Prospect } from "../data"
import { prospects as prospectsDemo, estApporteur } from "../data"
import { supabaseConfigure } from "../lib/supabase"
import { chargerProspects, majProspect } from "../lib/prospectsDb"
import { chargerStatuts } from "../lib/statutsDb"
import { relanceAutoEntreeEtat } from "../lib/relanceAuto"
import BandeauErreur from "./BandeauErreur"

export default function Pipeline() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [statuts, setStatuts] = useState<Statut[]>(statutsParDefaut)
  const [survol, setSurvol] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseConfigure) {
      setProspects(prospectsDemo)
      return
    }
    chargerProspects()
      .then((rows) => setProspects(rows.filter((p) => !estApporteur(p))))
      .catch((e) => setErreur(e instanceof Error ? e.message : "Erreur inconnue"))
    chargerStatuts()
      .then((rows) => rows.length && setStatuts(rows))
      .catch(() => {})
  }, [])

  function deplacer(p: Prospect, libelle: string) {
    if (p.statut === libelle) return
    // Relance auto « J+X » de l'état d'arrivée (sans écraser une relance déjà prévue).
    const relance = relanceAutoEntreeEtat(libelle, statuts, p.prochaineRelance ?? "")
    setProspects((arr) =>
      arr.map((x) => (x === p ? { ...x, statut: libelle, ...(relance ? { prochaineRelance: relance } : {}) } : x)),
    )
    if (p.id)
      majProspect(p.id, { statut: libelle, ...(relance ? { prochaine_relance: relance } : {}) }).catch(
        console.error,
      )
  }

  return (
    <div className="flex h-full flex-col px-8 pb-6">
      {erreur && <BandeauErreur message={erreur} />}
      <p className="mb-4 text-sm text-slate-500">
        Glissez une carte d'une colonne à l'autre pour changer l'état du prospect.
      </p>

      <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
        {statuts.map((s) => {
          const cartes = prospects.filter((p) => p.statut === s.libelle)
          const c = palette[s.couleur]
          return (
            <div
              key={s.id ?? s.libelle}
              onDragOver={(e) => {
                e.preventDefault()
                setSurvol(s.libelle)
              }}
              onDragLeave={() => setSurvol((v) => (v === s.libelle ? null : v))}
              onDrop={(e) => {
                e.preventDefault()
                setSurvol(null)
                const id = e.dataTransfer.getData("text/plain")
                const p = prospects.find((x) => (x.id ?? x.entreprise) === id)
                if (p) deplacer(p, s.libelle)
              }}
              className={
                "flex w-72 shrink-0 flex-col rounded-xl border bg-slate-50/60 " +
                (survol === s.libelle
                  ? "border-blue-400 bg-blue-50/50"
                  : "border-slate-200")
              }
            >
              {/* En-tête colonne */}
              <div className="flex items-center justify-between px-3 py-2.5">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${c.pill}`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: c.dot }}
                  />
                  {s.libelle}
                  {s.estObjectif && <Flag size={11} />}
                </span>
                <span className="text-xs font-medium text-slate-400">
                  {cartes.length}
                </span>
              </div>

              {/* Cartes (limitées à 50 par colonne pour rester rapide à grande échelle) */}
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {cartes.slice(0, 50).map((p) => (
                  <div
                    key={p.id ?? p.entreprise}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", p.id ?? p.entreprise)
                    }
                    className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm active:cursor-grabbing"
                  >
                    <p className="truncate text-sm font-medium text-slate-800">
                      {p.entreprise}
                    </p>
                    {p.contact && (
                      <p className="truncate text-xs text-slate-500">
                        {p.contact}
                      </p>
                    )}
                    {p.telephone && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
                        <Phone size={12} /> {p.telephone}
                      </p>
                    )}
                  </div>
                ))}
                {cartes.length > 50 && (
                  <p className="px-1 py-2 text-center text-xs font-medium text-slate-400">
                    + {cartes.length - 50} autres…
                  </p>
                )}
                {cartes.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs text-slate-300">
                    —
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
