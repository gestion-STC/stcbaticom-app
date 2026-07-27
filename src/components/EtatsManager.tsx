import { useEffect, useState } from "react"
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Flag,
  Clock,
  Loader2,
  AlertTriangle,
  Check,
} from "lucide-react"
import { palette, deplacerEtat, renumeroterOrdres, type Statut } from "../statuts"
import { supabaseConfigure } from "../lib/supabase"
import {
  chargerStatuts,
  creerStatut,
  majStatut,
  majOrdreStatut,
  supprimerStatut,
} from "../lib/statutsDb"
import { chargerProspects } from "../lib/prospectsDb"
import EtatModal from "./EtatModal"

type ModalState = { mode: "create" } | { mode: "edit"; etat: Statut } | null

export default function EtatsManager() {
  const [statuts, setStatuts] = useState<Statut[]>([])
  const [comptes, setComptes] = useState<Record<string, number>>({})
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  // Ordre tel qu'il est ENREGISTRÉ (liste d'ids) : sert à savoir s'il y a des
  // changements en attente, et à pouvoir les annuler.
  const [ordreEnregistre, setOrdreEnregistre] = useState<string[]>([])
  const [enregistrementOrdre, setEnregistrementOrdre] = useState(false)
  const [ordreOk, setOrdreOk] = useState(false)

  // Vrai si l'ordre affiché diffère de celui enregistré → bandeau « Enregistrer ».
  const ordreModifie =
    statuts.length === ordreEnregistre.length &&
    statuts.some((s, i) => s.id !== ordreEnregistre[i])

  // Pose la liste ET la mémorise comme « ordre enregistré » (rien en attente).
  function poser(liste: Statut[]) {
    setStatuts(liste)
    setOrdreEnregistre(liste.map((s) => s.id ?? ""))
  }

  useEffect(() => {
    if (!supabaseConfigure) {
      setErreur("Supabase non configuré.")
      setChargement(false)
      return
    }
    chargerStatuts()
      .then(poser)
      .catch((e) =>
        setErreur(
          "Impossible de charger les états. Avez-vous exécuté le script SQL de mise à jour ? Détail : " +
            (e instanceof Error ? e.message : String(e)),
        ),
      )
      .finally(() => setChargement(false))
    chargerProspects()
      .then((rows) => {
        const c: Record<string, number> = {}
        rows.forEach((p) => (c[p.statut] = (c[p.statut] ?? 0) + 1))
        setComptes(c)
      })
      .catch(() => {})
  }, [])

  async function enregistrer(s: Statut) {
    if (modal?.mode === "edit" && modal.etat.id) {
      setStatuts((arr) => arr.map((x) => (x.id === modal.etat.id ? { ...s, id: x.id } : x)))
      await majStatut(modal.etat.id, s).catch(console.error)
    } else {
      try {
        const cree = await creerStatut(s)
        // Le nouvel état arrive en fin de liste, déjà enregistré : rien en attente.
        setStatuts((arr) => [...arr, cree])
        setOrdreEnregistre((ids) => [...ids, cree.id ?? ""])
      } catch (e) {
        setErreur("Création impossible : " + (e instanceof Error ? e.message : String(e)))
      }
    }
    setModal(null)
  }

  async function supprimer(s: Statut) {
    const n = comptes[s.libelle] ?? 0
    if (n > 0) {
      setErreur(
        `Impossible de supprimer « ${s.libelle} » : ${n} prospect(s) sont dans cet état. Déplacez-les d'abord.`,
      )
      return
    }
    if (!confirm(`Supprimer l'état « ${s.libelle} » ?`)) return
    setStatuts((arr) => arr.filter((x) => x.id !== s.id))
    setOrdreEnregistre((ids) => ids.filter((id) => id !== s.id))
    if (s.id) await supprimerStatut(s.id).catch(console.error)
  }

  // Déplacement PUREMENT local : instantané, aucun aller-retour réseau.
  // L'enregistrement se fait en une fois avec le bouton « Enregistrer l'ordre ».
  function deplacer(index: number, sens: -1 | 1) {
    const cible = index + sens
    if (cible < 0 || cible >= statuts.length) return
    setStatuts((arr) => deplacerEtat(arr, index, sens))
    setOrdreOk(false)
  }

  // Enregistre l'ordre affiché en RENUMÉROTANT proprement de 1 à N.
  // C'est ce qui corrige le bug historique : l'ancienne version échangeait deux
  // numéros sans les rafraîchir en mémoire, ce qui finissait par donner le MÊME
  // numéro à deux états — la base ne savait alors plus lequel passe devant, et
  // l'ordre sautait au rechargement. Une numérotation 1..N sans trou ni doublon
  // garantit le même classement partout (toutes les listes trient sur `ordre`).
  async function enregistrerOrdre() {
    setEnregistrementOrdre(true)
    setErreur(null)
    // On fige la liste au moment du clic : elle sert de référence même si l'écran
    // bouge entre-temps.
    const liste = statuts
    try {
      const aEcrire = liste
        .map((s, i) => ({ s, nouvelOrdre: i + 1 }))
        .filter(({ s, nouvelOrdre }) => s.id && s.ordre !== nouvelOrdre)
      await Promise.all(aEcrire.map(({ s, nouvelOrdre }) => majOrdreStatut(s.id!, nouvelOrdre)))
      // On aligne les numéros en mémoire sur ce qui vient d'être écrit.
      setStatuts(renumeroterOrdres)
      setOrdreEnregistre(liste.map((s) => s.id ?? ""))
      setOrdreOk(true)
      setTimeout(() => setOrdreOk(false), 3000)
    } catch (e) {
      setErreur(
        "L'ordre n'a pas pu être enregistré : " + (e instanceof Error ? e.message : String(e)),
      )
    } finally {
      setEnregistrementOrdre(false)
    }
  }

  // Revient à l'ordre enregistré (annule les déplacements en attente).
  function annulerOrdre() {
    setStatuts((arr) =>
      [...arr].sort((a, b) => ordreEnregistre.indexOf(a.id ?? "") - ordreEnregistre.indexOf(b.id ?? "")),
    )
    setOrdreOk(false)
  }

  return (
    <div className="px-8 pb-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Créez et organisez les états de vos prospects. Chaque état peut
            déclencher un email et une relance automatique.
          </p>
          <button
            onClick={() => setModal({ mode: "create" })}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={16} strokeWidth={2.3} />
            Créer un état
          </button>
        </div>

        {erreur && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
            <p className="flex-1">{erreur}</p>
            <button onClick={() => setErreur(null)} className="text-red-500">
              ✕
            </button>
          </div>
        )}

        {modal && (
          <EtatModal
            etat={modal.mode === "edit" ? modal.etat : null}
            etats={statuts}
            ordreParDefaut={(statuts.at(-1)?.ordre ?? 0) + 1}
            onClose={() => setModal(null)}
            onSave={enregistrer}
          />
        )}

        {/* Ordre en attente d'enregistrement */}
        {ordreModifie && (
          <div className="sticky top-2 z-10 mb-3 flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm">
            <AlertTriangle size={18} className="shrink-0 text-amber-500" />
            <p className="flex-1 text-sm text-amber-900">
              Vous avez changé l'ordre des états. Enregistrez pour l'appliquer partout
              (Prospects, Gestionnaires, Pipeline…).
            </p>
            <button
              onClick={annulerOrdre}
              disabled={enregistrementOrdre}
              className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100 disabled:opacity-40"
            >
              Annuler
            </button>
            <button
              onClick={enregistrerOrdre}
              disabled={enregistrementOrdre}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {enregistrementOrdre ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Enregistrement…
                </>
              ) : (
                <>
                  <Check size={15} /> Enregistrer l'ordre
                </>
              )}
            </button>
          </div>
        )}
        {ordreOk && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
            <Check size={16} className="text-green-600" /> Ordre enregistré — il s'applique
            maintenant partout.
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {chargement ? (
            <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Chargement…
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {statuts.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex flex-col">
                    <button
                      onClick={() => deplacer(i, -1)}
                      disabled={i === 0 || enregistrementOrdre}
                      title="Monter"
                      className="text-slate-300 hover:text-slate-600 disabled:opacity-30"
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      onClick={() => deplacer(i, 1)}
                      disabled={i === statuts.length - 1 || enregistrementOrdre}
                      title="Descendre"
                      className="text-slate-300 hover:text-slate-600 disabled:opacity-30"
                    >
                      <ChevronDown size={15} />
                    </button>
                  </div>

                  <span
                    className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${palette[s.couleur].pill}`}
                  >
                    {s.libelle}
                  </span>

                  {s.categorie && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                      {s.categorie}
                    </span>
                  )}
                  {s.estObjectif && (
                    <span title="Objectif" className="text-emerald-600">
                      <Flag size={14} fill="currentColor" />
                    </span>
                  )}
                  {s.relanceJours != null && (
                    <span className="flex items-center gap-0.5 text-[11px] text-slate-400">
                      <Clock size={12} /> J+{s.relanceJours}
                    </span>
                  )}

                  <span className="ml-auto text-xs text-slate-400">
                    {comptes[s.libelle] ?? 0} prospect(s)
                  </span>

                  <button
                    onClick={() => setModal({ mode: "edit", etat: s })}
                    className="rounded-md p-1.5 text-slate-400 hover:text-blue-600"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => supprimer(s)}
                    className="rounded-md p-1.5 text-slate-300 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
              {statuts.length === 0 && !erreur && (
                <li className="px-5 py-6 text-center text-sm text-slate-400">
                  Aucun état. Créez le premier.
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
