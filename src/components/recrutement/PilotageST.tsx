import { useEffect, useState } from "react"
import { Loader2, AlertTriangle, Power, Save, CheckCircle2, Info } from "lucide-react"
import type { PilotageST as Pilotage, SequenceST } from "../../recrutement"
import { supabaseConfigure } from "../../lib/supabase"
import { chargerPilotage, majPilotage } from "../../lib/pilotageStDb"
import { chargerSequences } from "../../lib/sequencesStDb"

const champ =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"

const joursLabels: { n: number; l: string }[] = [
  { n: 1, l: "Lun" },
  { n: 2, l: "Mar" },
  { n: 3, l: "Mer" },
  { n: 4, l: "Jeu" },
  { n: 5, l: "Ven" },
  { n: 6, l: "Sam" },
  { n: 7, l: "Dim" },
]

export default function PilotageST() {
  const [p, setP] = useState<Pilotage | null>(null)
  const [sequences, setSequences] = useState<SequenceST[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState("")
  const [enreg, setEnreg] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (!supabaseConfigure) {
      setErreur("Base non configurée.")
      setChargement(false)
      return
    }
    Promise.all([chargerPilotage(), chargerSequences()])
      .then(([pil, seqs]) => {
        setP(pil)
        setSequences(seqs)
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
      .finally(() => setChargement(false))
  }, [])

  const set = <K extends keyof Pilotage>(k: K, v: Pilotage[K]) => {
    setP((prev) => (prev ? { ...prev, [k]: v } : prev))
    setOk(false)
  }

  function toggleJour(n: number) {
    if (!p) return
    const s = new Set(p.jours)
    if (s.has(n)) s.delete(n)
    else s.add(n)
    set("jours", [...s].sort((a, b) => a - b))
  }

  async function sauvegarder(partiel?: Partial<Pilotage>) {
    if (!p) return
    const aEnregistrer = { ...p, ...partiel }
    setEnreg(true)
    setErreur("")
    try {
      await majPilotage(aEnregistrer)
      setP(aEnregistrer)
      setOk(true)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnreg(false)
    }
  }

  if (chargement)
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
        <Loader2 size={18} className="animate-spin" /> Chargement…
      </div>
    )
  if (!p)
    return (
      <div className="mx-auto max-w-2xl px-8">
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {erreur || "Pilotage indisponible."}
        </div>
      </div>
    )

  const seqActive = p.sequenceId
    ? sequences.find((s) => s.id === p.sequenceId)
    : sequences.find((s) => s.actif)

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-8 pb-10">
      {erreur && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {erreur}
        </div>
      )}

      {/* Interrupteur principal Lancer / Arrêter */}
      <div
        className={
          "flex items-center justify-between rounded-xl border p-5 shadow-sm " +
          (p.actif ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white")
        }
      >
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <Power size={18} className={p.actif ? "text-emerald-600" : "text-slate-400"} />
            {p.actif ? "Recrutement EN MARCHE" : "Recrutement à l'arrêt"}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {p.actif
              ? "Le moteur démarre et relance les sous-traitants selon les réglages ci-dessous."
              : "Rien n'est envoyé. Active quand tu as besoin de nouveaux sous-traitants."}
          </p>
        </div>
        <button
          onClick={() => sauvegarder({ actif: !p.actif })}
          disabled={enreg}
          className={
            "rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 " +
            (p.actif ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700")
          }
        >
          {p.actif ? "Arrêter" : "Lancer"}
        </button>
      </div>

      {/* Réglages */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Objectif : nouveaux sous-traitants par semaine</span>
          <span className="mb-2 block text-xs text-slate-400">
            Le moteur ne met en séquence que ce nombre de nouveaux ST par semaine (7 jours glissants) — inutile de bombarder toute la base.
          </span>
          <input
            type="number"
            min={0}
            className={champ + " w-28"}
            value={p.objectifHebdo}
            onChange={(e) => set("objectifHebdo", Math.max(0, parseInt(e.target.value) || 0))}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Plafond d'envois par jour (SMS + e-mails)</span>
          <span className="mb-2 block text-xs text-slate-400">Sécurité anti-spam : au-delà, le moteur attend le lendemain.</span>
          <input
            type="number"
            min={1}
            className={champ + " w-28"}
            value={p.plafondJour}
            onChange={(e) => set("plafondJour", Math.max(1, parseInt(e.target.value) || 1))}
          />
        </label>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Plage horaire d'envoi</span>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <input type="time" className={champ + " w-32"} value={p.heureMin} onChange={(e) => set("heureMin", e.target.value)} />
            <span>à</span>
            <input type="time" className={champ + " w-32"} value={p.heureMax} onChange={(e) => set("heureMax", e.target.value)} />
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Jours d'envoi</span>
          <div className="flex gap-1.5">
            {joursLabels.map(({ n, l }) => (
              <button
                key={n}
                onClick={() => toggleJour(n)}
                className={
                  "h-9 w-11 rounded-lg border text-xs font-medium " +
                  (p.jours.includes(n)
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-400 hover:bg-slate-50")
                }
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Séquence utilisée</span>
          <select className={champ} value={p.sequenceId ?? ""} onChange={(e) => set("sequenceId", e.target.value || null)}>
            <option value="">— (séquence marquée « active » dans l'onglet Séquences) —</option>
            {sequences.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Avertissement si aucune séquence exploitable */}
      {!seqActive && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <Info size={16} className="mt-0.5 shrink-0" />
          Aucune séquence sélectionnée ni active. Va dans l'onglet <b>Séquences</b> pour en créer une et l'activer, sinon rien ne partira.
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => sauvegarder()}
          disabled={enreg}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {enreg ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Enregistrer les réglages
        </button>
        {ok && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 size={15} /> Enregistré
          </span>
        )}
      </div>
    </div>
  )
}
