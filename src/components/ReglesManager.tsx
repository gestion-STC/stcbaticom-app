import { useEffect, useMemo, useState } from "react"
import {
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
  Clock,
  Target,
  Repeat,
  Loader2,
  AlertTriangle,
} from "lucide-react"
import { palette, type Statut } from "../statuts"
import type { Email } from "../emails"
import type { Regle } from "../regles"
import { supabaseConfigure } from "../lib/supabase"
import { chargerStatuts } from "../lib/statutsDb"
import { chargerEmails } from "../lib/emailsDb"
import { chargerProspects } from "../lib/prospectsDb"
import { chargerRegles, creerRegle, majRegle, supprimerRegle } from "../lib/reglesDb"
import RegleModal from "./RegleModal"

type ModalState = { mode: "create" } | { mode: "edit"; regle: Regle } | null

export default function ReglesManager() {
  const [regles, setRegles] = useState<Regle[]>([])
  const [statuts, setStatuts] = useState<Statut[]>([])
  const [emails, setEmails] = useState<Email[]>([])
  const [types, setTypes] = useState<string[]>([])
  const [arrondissements, setArrondissements] = useState<string[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)

  useEffect(() => {
    if (!supabaseConfigure) {
      setErreur("Supabase non configuré.")
      setChargement(false)
      return
    }
    Promise.all([chargerStatuts(), chargerEmails(), chargerRegles(), chargerProspects()])
      .then(([s, e, r, p]) => {
        setStatuts(s)
        setEmails(e)
        setRegles(r)
        setTypes([...new Set(p.map((x) => x.type).filter(Boolean))].sort())
        setArrondissements([...new Set(p.map((x) => x.arrondissement).filter(Boolean))].sort())
      })
      .catch((e) =>
        setErreur(
          "Chargement impossible. Avez-vous exécuté les scripts SQL ? Détail : " +
            (e instanceof Error ? e.message : String(e)),
        ),
      )
      .finally(() => setChargement(false))
  }, [])

  async function enregistrer(r: Regle) {
    if (modal?.mode === "edit" && modal.regle.id) {
      setRegles((arr) => arr.map((x) => (x.id === modal.regle.id ? { ...r, id: x.id } : x)))
      await majRegle(modal.regle.id, r).catch(console.error)
    } else {
      try {
        const cree = await creerRegle(r)
        setRegles((arr) => [...arr, cree])
      } catch (e) {
        setErreur("Création impossible : " + (e instanceof Error ? e.message : String(e)))
      }
    }
    setModal(null)
  }

  async function basculerActif(r: Regle) {
    const nouvelle = { ...r, actif: !r.actif }
    setRegles((arr) => arr.map((x) => (x === r ? nouvelle : x)))
    if (r.id) majRegle(r.id, nouvelle).catch(console.error)
  }

  async function supprimer(r: Regle) {
    setRegles((arr) => arr.filter((x) => x !== r))
    if (r.id) await supprimerRegle(r.id).catch(console.error)
  }

  const emailNom = useMemo(
    () => Object.fromEntries(emails.map((e) => [e.id, e.nom])),
    [emails],
  )

  function delaiTexte(r: Regle) {
    if (r.delaiValeur === 0) return "dès l'entrée"
    return `${r.delaiValeur} ${r.delaiUnite} ${r.delaiSens === "avant" ? "avant" : "après"}`
  }

  return (
    <div className="px-8 pb-10">
      <div className="mx-auto max-w-3xl">
        {/* Statut du moteur : tant que l'envoi d'email (Resend) n'est pas branché,
            les règles sont ENREGISTRÉES mais AUCUN email ne part automatiquement. */}
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold">Envoi automatique pas encore actif</p>
            <p className="mt-0.5 text-amber-700">
              Tu peux déjà créer et régler tes règles ici — elles sont bien enregistrées. Mais
              <b> aucun email ne part encore tout seul</b> : le moteur s'activera une fois la
              connexion email (Resend) mise en place. En attendant, envoie tes emails à la main
              depuis la fiche d'un prospect.
            </p>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Définissez quel email partira automatiquement quand un prospect change
            d'état (une fois le moteur activé).
          </p>
          <button
            onClick={() => setModal({ mode: "create" })}
            disabled={!statuts.length || !emails.length}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            <Plus size={16} strokeWidth={2.3} />
            Ajouter une règle
          </button>
        </div>

        {erreur && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
            <p className="flex-1">{erreur}</p>
            <button onClick={() => setErreur(null)} className="text-red-500">✕</button>
          </div>
        )}

        {!chargement && emails.length === 0 && !erreur && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Créez d'abord des emails (onglet Emails) pour les rattacher à une règle.
          </div>
        )}

        {modal && (
          <RegleModal
            regle={modal.mode === "edit" ? modal.regle : null}
            statuts={statuts}
            emails={emails}
            types={types}
            arrondissements={arrondissements}
            onClose={() => setModal(null)}
            onSave={enregistrer}
          />
        )}

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {chargement ? (
            <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Chargement…
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {regles.map((r, i) => {
                const st = statuts.find((s) => s.id === r.etatId)
                return (
                  <li key={r.id ?? i} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-slate-500">Quand</span>
                        {st && (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${palette[st.couleur].pill}`}>
                            {st.libelle}
                          </span>
                        )}
                        <ArrowRight size={14} className="text-slate-300" />
                        <span className="font-medium text-slate-800">
                          {emailNom[r.emailId] ?? "(email supprimé)"}
                        </span>
                        <span className="text-slate-400">· {delaiTexte(r)}</span>
                      </div>
                      {/* Conditions */}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        {r.heureMin && r.heureMax && (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5">
                            <Clock size={11} /> {r.heureMin}–{r.heureMax}
                          </span>
                        )}
                        {(r.filtreType || r.filtreArrondissement) && (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5">
                            <Target size={11} />
                            {[r.filtreType, r.filtreArrondissement].filter(Boolean).join(" · ")}
                          </span>
                        )}
                        {r.repeter && (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5">
                            <Repeat size={11} /> ×{r.repeterMax} / {r.repeterIntervalle}j
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => basculerActif(r)}
                      className={
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium " +
                        (r.actif ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")
                      }
                    >
                      {r.actif ? "Actif" : "Inactif"}
                    </button>
                    <button onClick={() => setModal({ mode: "edit", regle: r })} className="shrink-0 rounded-md p-1.5 text-slate-400 hover:text-blue-600">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => supprimer(r)} className="shrink-0 rounded-md p-1.5 text-slate-300 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </li>
                )
              })}
              {regles.length === 0 && !erreur && (
                <li className="px-5 py-6 text-center text-sm text-slate-400">
                  Aucune règle. Cliquez sur « Ajouter une règle ».
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
