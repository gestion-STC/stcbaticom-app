// « Comment on décroche un 1er ordre de service » — le parcours réel de chaque
// gestionnaire signé, pour repérer le schéma qui se répète.
//
// Volontairement HORS du filtre jour/semaine/mois du Dashboard : les signatures
// sont rares, les enfermer dans une fenêtre de 7 jours les ferait disparaître.

import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Loader2, Repeat } from "lucide-react"
import type { Prospect } from "../../data"
import type { Statut } from "../../statuts"
import { chargerHistorique } from "../../lib/historiqueDb"
import { analyserParcours, moyenneParcours, type Parcours } from "../../lib/parcoursSignature"
import { apparence, dateLisible } from "../../lib/historiqueAffichage"

type Ligne = { prospect: Prospect; parcours: Parcours }

function jourCourt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
}

export default function ParcoursSignatures({
  prospects,
  statuts,
}: {
  prospects: Prospect[]
  statuts: Statut[]
}) {
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [chargement, setChargement] = useState(true)
  const [ouvert, setOuvert] = useState<string | null>(null)

  useEffect(() => {
    const objectifs = statuts.filter((s) => s.estObjectif).map((s) => s.libelle)
    const signes = prospects.filter((p) => p.id && objectifs.includes(p.statut))
    if (!signes.length) {
      setLignes([])
      setChargement(false)
      return
    }
    let annule = false
    setChargement(true)
    Promise.all(
      signes.map(async (p) => ({
        prospect: p,
        parcours: analyserParcours(await chargerHistorique(p.id as string), objectifs),
      })),
    )
      .then((res) => {
        if (annule) return
        // Le plus récemment signé en premier : c'est le cas le plus parlant.
        res.sort((a, b) => ((a.parcours.dateOS ?? "") < (b.parcours.dateOS ?? "") ? 1 : -1))
        setLignes(res)
        setOuvert(res[0]?.prospect.id ?? null) // le 1er est déplié d'office
      })
      .finally(() => {
        if (!annule) setChargement(false)
      })
    return () => {
      annule = true
    }
  }, [prospects, statuts])

  const moy = moyenneParcours(lignes.map((l) => l.parcours))

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Repeat size={18} className="text-violet-600" />
        <h2 className="text-base font-semibold text-slate-900">
          Ce qui a mené au 1er ordre de service
        </h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Le parcours complet de chaque gestionnaire signé, depuis le lancement du log — pour
        repérer à partir de combien d'échanges un premier OS se déclenche.
      </p>

      {chargement && (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Reconstitution des parcours…
        </div>
      )}

      {!chargement && lignes.length === 0 && (
        <p className="py-6 text-sm text-slate-400">
          Aucun gestionnaire n'a encore envoyé de 1er ordre de service.
        </p>
      )}

      {!chargement && lignes.length > 0 && (
        <>
          {/* Synthèse : la réponse chiffrée à « au bout de combien ? » */}
          {moy.nb > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-violet-50 p-4">
              <div>
                <p className="text-2xl font-bold text-violet-900">{moy.appels}</p>
                <p className="text-xs text-violet-700">appels en moyenne</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-violet-900">{moy.emails}</p>
                <p className="text-xs text-violet-700">échanges par mail</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-violet-900">
                  {moy.jours != null ? moy.jours : "—"}
                </p>
                <p className="text-xs text-violet-700">jours du 1er contact à l'OS</p>
              </div>
            </div>
          )}
          {moy.nb > 0 && moy.nb < 5 && (
            <p className="mt-2 text-xs text-amber-700">
              Moyenne calculée sur {moy.nb} gestionnaire{moy.nb > 1 ? "s" : ""} seulement — à lire
              comme un indice, pas comme une règle.
            </p>
          )}

          <ul className="mt-4 space-y-3">
            {lignes.map(({ prospect, parcours }) => {
              const id = prospect.id as string
              const deplie = ouvert === id
              const c = parcours.comptes
              return (
                <li key={id} className="rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setOuvert(deplie ? null : id)}
                    className="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50"
                  >
                    {deplie ? (
                      <ChevronDown size={16} className="shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight size={16} className="shrink-0 text-slate-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {prospect.entreprise || "—"}
                        {prospect.contact && (
                          <span className="font-normal text-slate-500"> · {prospect.contact}</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {parcours.dateOS ? (
                          <>
                            1er OS le {jourCourt(parcours.dateOS)} · {c.appelsSortants +
                              c.appelsEntrants}{" "}
                            appel{c.appelsSortants + c.appelsEntrants > 1 ? "s" : ""} ·{" "}
                            {c.emailsEnvoyes + c.emailsRecus} mail
                            {c.emailsEnvoyes + c.emailsRecus > 1 ? "s" : ""}
                            {parcours.delaiJours != null && <> · {parcours.delaiJours} jours</>}
                          </>
                        ) : (
                          <span className="text-amber-700">
                            Date du 1er OS inconnue — l'état n'a pas été changé pendant un appel
                          </span>
                        )}
                      </p>
                    </div>
                  </button>

                  {deplie && (
                    <div className="border-t border-slate-100 p-3">
                      {parcours.avant.length === 0 ? (
                        <p className="text-sm text-slate-400">Aucune action enregistrée.</p>
                      ) : (
                        <ul className="space-y-2">
                          {parcours.avant.map((e, i) => {
                            const s = apparence(e)
                            const Icon = s.icon
                            const estOS = e.date === parcours.dateOS
                            return (
                              <li key={i} className="flex items-start gap-2.5">
                                <div
                                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${s.teinte}`}
                                >
                                  <Icon size={14} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p
                                    className={`text-sm ${estOS ? "font-bold text-violet-900" : "font-medium text-slate-800"}`}
                                  >
                                    {e.libelle}
                                    {estOS && " ← 1er ordre de service"}
                                  </p>
                                  {e.detail && (
                                    <p className="truncate text-xs text-slate-500">{e.detail}</p>
                                  )}
                                </div>
                                <span className="shrink-0 text-[11px] text-slate-400">
                                  {dateLisible(e.date)}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      {parcours.nbApres > 0 && (
                        <p className="mt-2 text-xs text-slate-400">
                          +{parcours.nbApres} action{parcours.nbApres > 1 ? "s" : ""} après l'OS (non
                          comptée{parcours.nbApres > 1 ? "s" : ""} dans l'analyse)
                        </p>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
