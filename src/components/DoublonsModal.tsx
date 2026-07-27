import { useEffect, useMemo, useState } from "react"
import { X, Loader2, Trash2, Building2, User, CheckCircle2, Combine } from "lucide-react"
import type { Prospect } from "../data"
import type { Agence } from "../agences"
import { chargerProspects, supprimerProspect, fusionnerProspects, fusionnerChamps } from "../lib/prospectsDb"
import { chargerAgences, supprimerAgence, fusionnerAgences } from "../lib/agencesDb"
import { groupesDoublons } from "../lib/doublonsProbables"
import { chargerNonDoublons, marquerNonDoublonsGroupe } from "../lib/nonDoublons"
import { estApporteur } from "../data"

type Item = { id: string; titre: string; sousTitre: string; score: number }
type Groupe = {
  cle: string
  table: "prospect" | "agence" // table à nettoyer
  categorie: "gestionnaire" | "agence" // pour l'icône / le sens
  entete: string
  certain: boolean // false = piste à confirmer (même numéro : souvent le standard)
  items: Item[]
  prospects?: Prospect[] // fiches complètes (pour la fusion)
  agences?: Agence[]
}

const norm = (s: string) => (s || "").trim().toLowerCase()

export default function DoublonsModal({ onClose }: { onClose: () => void }) {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [agences, setAgences] = useState<Agence[]>([])
  const [chargement, setChargement] = useState(true)
  const [garde, setGarde] = useState<Record<string, string>>({})
  // Paires déjà tranchées « 2 personnes différentes » (ici ou pendant un appel) :
  // elles ne doivent plus jamais remonter.
  const [nonDoublons, setNonDoublons] = useState<Set<string>>(new Set())

  function recharger() {
    Promise.all([chargerProspects(), chargerAgences(), chargerNonDoublons()])
      .then(([p, a, nd]) => {
        setProspects(p)
        setAgences(a)
        setNonDoublons(nd)
      })
      .catch(() => {})
      .finally(() => setChargement(false))
  }
  useEffect(recharger, [])

  const scoreP = (p: Prospect) =>
    [p.contact, p.email, p.telephone, p.commentaire].filter((x) => x?.trim()).length

  const groupes = useMemo<Groupe[]>(() => {
    const versP = (p: Prospect): Item => ({
      id: p.id!,
      titre: p.contact || p.entreprise,
      sousTitre: [p.telephone, p.email, p.entreprise].filter(Boolean).join(" · "),
      score: scoreP(p),
    })

    // Mêmes règles que le repérage pendant les appels et que le compteur du
    // Dashboard : les trois écrans annoncent donc toujours la même chose.
    const res: Groupe[] = []
    const parId = new Map(prospects.filter((p) => p.id).map((p) => [p.id!, p]))
    for (const g of groupesDoublons(prospects.filter((p) => !estApporteur(p)), nonDoublons)) {
      const fiches = g.ids.map((id) => parId.get(id)).filter((p): p is Prospect => !!p)
      if (fiches.length < 2) continue
      res.push({
        cle: g.cle,
        table: "prospect",
        categorie: "gestionnaire",
        entete: (g.certain ? "Sûrement la même personne — " : "À confirmer — ") + g.libelle,
        certain: g.certain,
        items: fiches.map(versP),
        prospects: fiches,
      })
    }

    // Agences (table) : même nom = même agence
    const mapA: Record<string, Agence[]> = {}
    agences.forEach((a) => {
      const k = norm(a.nom)
      if (a.id && k) (mapA[k] ??= []).push(a)
    })
    Object.entries(mapA)
      .filter(([, arr]) => arr.length > 1)
      .forEach(([cle, arr]) =>
        res.push({
          cle: "agn:" + cle,
          table: "agence",
          categorie: "agence",
          entete: `Même agence — ${arr[0].nom}`,
          certain: true,
          items: arr.map((a): Item => ({
            id: a.id!,
            titre: a.nom,
            sousTitre: [a.adresse, a.arrondissement].filter(Boolean).join(" · "),
            score: a.nbGestionnaires ?? 0,
          })),
          agences: arr,
        }),
      )

    return res
  }, [prospects, agences, nonDoublons])

  const [enCours, setEnCours] = useState<string | null>(null)

  const idGarde = (g: Groupe) =>
    garde[g.cle] ?? [...g.items].sort((a, b) => b.score - a.score)[0]?.id

  async function fusionner(g: Groupe) {
    const keep = idGarde(g)
    if (!keep) return
    if (!confirm(`Fusionner ces ${g.items.length} fiches en une seule ?\n\nOn garde TOUT (email, commentaires, et l'historique des appels/RDV des deux) sur la fiche conservée.`))
      return
    setEnCours(g.cle)
    try {
      if (g.table === "prospect" && g.prospects) {
        const gardeP = g.prospects.find((p) => p.id === keep)!
        const autres = g.prospects.filter((p) => p.id !== keep)
        await fusionnerProspects(fusionnerChamps(gardeP, autres), autres)
      } else if (g.table === "agence" && g.agences) {
        await fusionnerAgences(keep, g.agences.filter((a) => a.id !== keep).map((a) => a.id!))
      }
      recharger()
    } catch (e) {
      console.error(e)
      alert("La fusion a échoué. Réessayez.")
    } finally {
      setEnCours(null)
    }
  }

  // « Ce ne sont pas des doublons » : mémorisé DÉFINITIVEMENT, le groupe ne
  // remontera plus — ni ici, ni pendant les appels, ni dans le compteur.
  async function ecarter(g: Groupe) {
    const ids = (g.prospects ?? []).map((p) => p.id).filter((x): x is string => !!x)
    if (ids.length < 2) return
    setEnCours(g.cle)
    try {
      await marquerNonDoublonsGroupe(ids)
      setNonDoublons(await chargerNonDoublons())
    } catch {
      alert("La décision n'a pas pu être enregistrée. Réessayez.")
    } finally {
      setEnCours(null)
    }
  }

  async function supprimerAutres(g: Groupe) {
    const keep = idGarde(g)
    const aSupprimer = g.items.filter((i) => i.id !== keep)
    if (
      !confirm(
        `Supprimer simplement ${aSupprimer.length} fiche(s) ?\n\n⚠️ Leur historique (appels, RDV, e-mails) sera DÉFINITIVEMENT perdu. Pour tout récupérer sur la fiche conservée, utilisez plutôt « Fusionner ».`,
      )
    )
      return
    setEnCours(g.cle)
    try {
      let echecs = 0
      for (const i of aSupprimer) {
        try {
          if (g.table === "prospect") await supprimerProspect(i.id)
          else await supprimerAgence(i.id)
        } catch (e) {
          console.error(e)
          echecs++
        }
      }
      if (echecs > 0) alert(`${echecs} suppression(s) ont échoué. Réessayez.`)
      recharger()
    } finally {
      setEnCours(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Doublons</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Trois indices : <span className="font-medium">même e-mail</span> et{" "}
            <span className="font-medium">même nom dans la même agence</span> sont des indices
            sûrs. Un <span className="font-medium">même numéro</span> est seulement une piste — c'est
            souvent le standard d'une agence avec deux gestionnaires différents ; ces cas sont
            présentés deux par deux, jamais regroupés. Votre réponse « Ce ne sont pas des
            doublons » est retenue définitivement, ici comme pendant vos appels.
          </p>

          {chargement ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Analyse…
            </div>
          ) : groupes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 size={32} className="text-emerald-500" />
              <p className="text-sm font-medium text-slate-700">Aucun doublon détecté 🎉</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">{groupes.length} doublon(s) trouvé(s).</p>
              {groupes.map((g) => (
                <div key={g.cle} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                    {g.categorie === "agence" ? <Building2 size={15} className="text-slate-400" /> : <User size={15} className="text-slate-400" />}
                    {g.entete}
                  </div>
                  <div className="space-y-1.5">
                    {g.items.map((i) => (
                      <label key={i.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 hover:bg-slate-50">
                        <input
                          type="radio"
                          name={g.cle}
                          checked={idGarde(g) === i.id}
                          onChange={() => setGarde((s) => ({ ...s, [g.cle]: i.id }))}
                          className="h-4 w-4"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-slate-800">{i.titre}</p>
                          <p className="truncate text-xs text-slate-400">{i.sousTitre}</p>
                        </div>
                        {idGarde(g) === i.id && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">à garder</span>
                        )}
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    {g.table === "prospect" && (
                      <button
                        onClick={() => ecarter(g)}
                        disabled={enCours === g.cle}
                        className="mr-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Ce ne sont pas des doublons
                      </button>
                    )}
                    <button
                      onClick={() => supprimerAutres(g)}
                      disabled={enCours === g.cle}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Trash2 size={14} /> Supprimer simplement
                    </button>
                    <button
                      onClick={() => fusionner(g)}
                      disabled={enCours === g.cle}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {enCours === g.cle ? <Loader2 size={14} className="animate-spin" /> : <Combine size={14} />}
                      Fusionner (tout garder)
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
