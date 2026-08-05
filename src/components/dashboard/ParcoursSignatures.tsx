// « Comment on décroche un 1er ordre de service » — le parcours réel de chaque
// gestionnaire signé, pour repérer le schéma qui se répète.
//
// L'OS arrive hors du logiciel (mail, téléphone) : on le désigne donc à la main,
// fiche par fiche. Un état marqué « Objectif atteint » est aussi reconnu, pour
// ceux qui basculent pendant un appel.
//
// Volontairement HORS du filtre jour/semaine/mois du Dashboard : les signatures
// sont rares, les enfermer dans une fenêtre de 7 jours les ferait disparaître.

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Loader2, Repeat, Plus, X } from "lucide-react"
import type { Prospect } from "../../data"
import type { Statut } from "../../statuts"
import { chargerHistorique } from "../../lib/historiqueDb"
import { analyserParcours, moyenneParcours, type Parcours } from "../../lib/parcoursSignature"
import { apparence, dateLisible } from "../../lib/historiqueAffichage"
import { lireParametre, ecrireParametre } from "../../lib/parametresDb"
import {
  cleOsGestionnaires,
  parserOsGestionnaires,
  serialiserOsGestionnaires,
  ajouterOsGestionnaire,
  retirerOsGestionnaire,
  finDeJournee,
  type OsGestionnaire,
} from "../../lib/osGestionnaires"

type Ligne = { prospect: Prospect; parcours: Parcours; saisi: boolean }

function jourCourt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
}

function nomProspect(p: Prospect): string {
  return [p.entreprise, p.contact].filter(Boolean).join(" · ") || "Sans nom"
}

export default function ParcoursSignatures({
  prospects,
  statuts,
}: {
  prospects: Prospect[]
  statuts: Statut[]
}) {
  const [saisis, setSaisis] = useState<OsGestionnaire[]>([])
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [chargement, setChargement] = useState(true)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  // Formulaire d'ajout
  const [ajout, setAjout] = useState(false)
  const [recherche, setRecherche] = useState("")
  const [choisi, setChoisi] = useState<Prospect | null>(null)
  const [dateOS, setDateOS] = useState("")

  useEffect(() => {
    lireParametre(cleOsGestionnaires)
      .then((v) => setSaisis(parserOsGestionnaires(v)))
      .catch(() => setSaisis([]))
  }, [])

  useEffect(() => {
    const objectifs = statuts.filter((s) => s.estObjectif).map((s) => s.libelle)
    const parId = new Map(prospects.filter((p) => p.id).map((p) => [p.id as string, p]))

    // Deux sources : la saisie manuelle (prioritaire) et l'état « objectif ».
    const cibles = new Map<string, { prospect: Prospect; date: string | null; saisi: boolean }>()
    for (const o of saisis) {
      const p = parId.get(o.prospectId)
      if (p) cibles.set(o.prospectId, { prospect: p, date: finDeJournee(o.date), saisi: true })
    }
    for (const p of prospects) {
      if (!p.id || cibles.has(p.id) || !objectifs.includes(p.statut)) continue
      cibles.set(p.id, { prospect: p, date: null, saisi: false })
    }

    if (cibles.size === 0) {
      setLignes([])
      setChargement(false)
      return
    }

    let annule = false
    setChargement(true)
    Promise.all(
      [...cibles.values()].map(async (c) => ({
        prospect: c.prospect,
        saisi: c.saisi,
        parcours: analyserParcours(
          await chargerHistorique(c.prospect.id as string),
          objectifs,
          c.date,
        ),
      })),
    )
      .then((res) => {
        if (annule) return
        // Le plus récemment signé en premier : c'est le cas le plus parlant.
        res.sort((a, b) => ((a.parcours.dateOS ?? "") < (b.parcours.dateOS ?? "") ? 1 : -1))
        setLignes(res)
        setOuvert(res[0]?.prospect.id ?? null)
      })
      .finally(() => {
        if (!annule) setChargement(false)
      })
    return () => {
      annule = true
    }
  }, [prospects, statuts, saisis])

  async function enregistrer(liste: OsGestionnaire[]) {
    setErreur(null)
    const avant = saisis
    setSaisis(liste) // affichage immédiat
    try {
      await ecrireParametre(cleOsGestionnaires, serialiserOsGestionnaires(liste))
    } catch (e) {
      setSaisis(avant) // on remet en place : ne pas laisser croire que c'est enregistré
      setErreur("Enregistrement impossible : " + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function valider() {
    if (!choisi?.id || !dateOS) return
    await enregistrer(ajouterOsGestionnaire(saisis, choisi.id, dateOS))
    setAjout(false)
    setRecherche("")
    setChoisi(null)
    setDateOS("")
  }

  // 8 résultats suffisent : c'est une recherche, pas une liste à parcourir.
  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (q.length < 2) return []
    return prospects
      .filter((p) => p.id && nomProspect(p).toLowerCase().includes(q))
      .slice(0, 8)
  }, [recherche, prospects])

  const moy = moyenneParcours(lignes.map((l) => l.parcours))

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Repeat size={18} className="text-violet-600" />
          <h2 className="text-base font-semibold text-slate-900">
            Ce qui a mené au 1er ordre de service
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setAjout((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
        >
          <Plus size={15} /> Signaler un 1er OS
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Le parcours complet de chaque gestionnaire signé, depuis le lancement du log — pour
        repérer à partir de combien d'échanges un premier OS se déclenche.
      </p>

      {erreur && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{erreur}</p>
      )}

      {ajout && (
        <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-4">
          <p className="text-sm font-medium text-violet-900">
            Quel gestionnaire a envoyé son premier ordre de service ?
          </p>
          {choisi ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-800">
                {nomProspect(choisi)}
              </span>
              <button
                type="button"
                onClick={() => setChoisi(null)}
                className="text-xs text-violet-700 underline"
              >
                changer
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Taper le nom de l'agence ou du contact…"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {resultats.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {resultats.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setChoisi(p)}
                        className="w-full rounded-lg bg-white px-3 py-2 text-left text-sm hover:bg-violet-100"
                      >
                        {nomProspect(p)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {recherche.trim().length >= 2 && resultats.length === 0 && (
                <p className="mt-2 text-xs text-slate-500">Aucune fiche ne correspond.</p>
              )}
            </>
          )}

          <label className="mt-3 block text-sm font-medium text-violet-900">
            Date du 1er ordre de service
            <input
              type="date"
              value={dateOS}
              onChange={(e) => setDateOS(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={valider}
              disabled={!choisi || !dateOS}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => setAjout(false)}
              className="rounded-lg px-4 py-2 text-sm text-slate-600"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {chargement && (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Reconstitution des parcours…
        </div>
      )}

      {!chargement && lignes.length === 0 && (
        <p className="py-6 text-sm text-slate-500">
          Aucun gestionnaire signalé pour l'instant. Dès que l'un d'eux t'envoie son premier ordre
          de service, clique sur « Signaler un 1er OS » — tout son parcours s'affichera ici.
        </p>
      )}

      {!chargement && lignes.length > 0 && (
        <>
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
            {lignes.map(({ prospect, parcours, saisi }) => {
              const id = prospect.id as string
              const deplie = ouvert === id
              const c = parcours.comptes
              const nbAppels = c.appelsSortants + c.appelsEntrants
              const nbMails = c.emailsEnvoyes + c.emailsRecus
              return (
                <li key={id} className="rounded-lg border border-slate-200">
                  <div className="flex items-center gap-1 pr-2">
                    <button
                      type="button"
                      onClick={() => setOuvert(deplie ? null : id)}
                      className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left hover:bg-slate-50"
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
                              1er OS le {jourCourt(parcours.dateOS)} · {nbAppels} appel
                              {nbAppels > 1 ? "s" : ""} · {nbMails} mail{nbMails > 1 ? "s" : ""}
                              {parcours.delaiJours != null && <> · {parcours.delaiJours} jours</>}
                            </>
                          ) : (
                            <span className="text-amber-700">Date du 1er OS inconnue</span>
                          )}
                        </p>
                      </div>
                    </button>
                    {saisi && (
                      <button
                        type="button"
                        onClick={() => enregistrer(retirerOsGestionnaire(saisis, id))}
                        title="Retirer de la liste"
                        className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>

                  {deplie && (
                    <div className="border-t border-slate-100 p-3">
                      {parcours.avant.length === 0 ? (
                        <p className="text-sm text-slate-400">Aucune action enregistrée.</p>
                      ) : (
                        <ul className="space-y-2">
                          {parcours.avant.map((e, i) => {
                            const s = apparence(e)
                            const Icon = s.icon
                            return (
                              <li key={i} className="flex items-start gap-2.5">
                                <div
                                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${s.teinte}`}
                                >
                                  <Icon size={14} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-slate-800">{e.libelle}</p>
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
