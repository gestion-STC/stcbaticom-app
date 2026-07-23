import { useEffect, useState } from "react"
import { Loader2, AlertTriangle, Power, Save, CheckCircle2, Info, Plus, Trash2, HardHat } from "lucide-react"
import type { PilotageST as Pilotage, SequenceST, ObjectifMetier } from "../../recrutement"
import { supabaseConfigure } from "../../lib/supabase"
import { chargerPilotage, majPilotage } from "../../lib/pilotageStDb"
import { chargerSequences } from "../../lib/sequencesStDb"
import { chargerObjectifs, creerObjectif, majObjectif, supprimerObjectif } from "../../lib/objectifsStDb"
import { metiersDistincts } from "../../lib/sousTraitantsDb"

const champ =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"

const joursLabels: { n: number; l: string }[] = [
  { n: 1, l: "Lun" }, { n: 2, l: "Mar" }, { n: 3, l: "Mer" }, { n: 4, l: "Jeu" },
  { n: 5, l: "Ven" }, { n: 6, l: "Sam" }, { n: 7, l: "Dim" },
]

export default function PilotageST() {
  const [p, setP] = useState<Pilotage | null>(null)
  const [sequences, setSequences] = useState<SequenceST[]>([])
  const [objectifs, setObjectifs] = useState<ObjectifMetier[]>([])
  const [metiers, setMetiers] = useState<string[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState("")
  const [enreg, setEnreg] = useState(false)
  const [ok, setOk] = useState(false)
  // Formulaire d'ajout d'un objectif
  const [nvMetier, setNvMetier] = useState("")
  const [nvObjectif, setNvObjectif] = useState(1)

  useEffect(() => {
    if (!supabaseConfigure) {
      setErreur("Base non configurée.")
      setChargement(false)
      return
    }
    Promise.all([chargerPilotage(), chargerSequences(), chargerObjectifs(), metiersDistincts()])
      .then(([pil, seqs, objs, mets]) => {
        setP(pil)
        setSequences(seqs)
        setObjectifs(objs)
        setMetiers(mets)
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

  // ---- Objectifs par métier ----
  async function ajouterObjectif() {
    const metier = nvMetier.trim()
    if (!metier) return
    if (objectifs.some((o) => o.metier.toLowerCase() === metier.toLowerCase())) {
      setErreur(`Un objectif existe déjà pour « ${metier} ».`)
      return
    }
    try {
      const o = await creerObjectif({ metier, objectifHebdo: Math.max(0, nvObjectif), actif: true })
      setObjectifs((l) => [...l, o])
      setNvMetier("")
      setNvObjectif(1)
      setErreur("")
    } catch (e) {
      setErreur(String(e))
    }
  }

  async function changerObjectif(o: ObjectifMetier, patch: Partial<ObjectifMetier>) {
    const maj = { ...o, ...patch }
    setObjectifs((l) => l.map((x) => (x.id === o.id ? maj : x)))
    await majObjectif(o.id!, patch).catch((e) => setErreur(String(e)))
  }

  async function retirerObjectif(o: ObjectifMetier) {
    if (!confirm(`Supprimer l'objectif « ${o.metier} » ?`)) return
    await supprimerObjectif(o.id!).catch((e) => setErreur(String(e)))
    setObjectifs((l) => l.filter((x) => x.id !== o.id))
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

  const seqActive = p.sequenceId ? sequences.find((s) => s.id === p.sequenceId) : sequences.find((s) => s.actif)
  const totalHebdo = objectifs.filter((o) => o.actif).reduce((n, o) => n + o.objectifHebdo, 0)

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-8 pb-10">
      {erreur && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {erreur}
        </div>
      )}

      {/* Interrupteur principal Lancer / Arrêter */}
      <div className={"flex items-center justify-between rounded-xl border p-5 shadow-sm " + (p.actif ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white")}>
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <Power size={18} className={p.actif ? "text-emerald-600" : "text-slate-400"} />
            {p.actif ? "Recrutement EN MARCHE" : "Recrutement à l'arrêt"}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {p.actif
              ? "Le moteur démarre et relance les sous-traitants selon les objectifs par métier ci-dessous."
              : "Rien n'est envoyé. Active quand tu as besoin de nouveaux sous-traitants."}
          </p>
        </div>
        <button
          onClick={() => sauvegarder({ actif: !p.actif })}
          disabled={enreg}
          className={"rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 " + (p.actif ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700")}
        >
          {p.actif ? "Arrêter" : "Lancer"}
        </button>
      </div>

      {/* Objectifs par métier */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <HardHat size={16} className="text-blue-600" /> Objectifs par métier
        </div>
        <p className="mb-3 mt-1 text-xs text-slate-400">
          Dis combien de sous-traitants tu veux recruter par semaine, métier par métier. Le moteur pioche dans la bonne base (le métier des sous-traitants) et ne démarre que ce qu'il faut.
        </p>

        <div className="space-y-2">
          {objectifs.map((o) => (
            <div key={o.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2">
              <span className="flex-1 truncate text-sm font-medium text-slate-700">{o.metier}</span>
              <input
                type="number"
                min={0}
                defaultValue={o.objectifHebdo}
                onBlur={(e) => {
                  const v = Math.max(0, parseInt(e.target.value) || 0)
                  if (v !== o.objectifHebdo) changerObjectif(o, { objectifHebdo: v })
                }}
                className={champ + " w-20"}
                title="Nombre à recruter par semaine"
              />
              <span className="text-xs text-slate-400">/sem</span>
              <label className="flex items-center gap-1 text-xs text-slate-500">
                <input type="checkbox" checked={o.actif} onChange={(e) => changerObjectif(o, { actif: e.target.checked })} />
                actif
              </label>
              <button onClick={() => retirerObjectif(o)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Supprimer">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {objectifs.length === 0 && <p className="py-2 text-xs text-slate-400">Aucun objectif. Ajoute un métier ci-dessous.</p>}
        </div>

        {/* Ajout */}
        <div className="mt-3 flex items-end gap-2 border-t border-slate-100 pt-3">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-slate-500">Métier</span>
            <input
              list="metiers-base"
              value={nvMetier}
              onChange={(e) => setNvMetier(e.target.value)}
              placeholder="Plombier, Peintre, Électricien…"
              className={champ}
            />
            <datalist id="metiers-base">
              {metiers.map((m) => <option key={m} value={m} />)}
            </datalist>
          </label>
          <label className="w-24">
            <span className="mb-1 block text-xs text-slate-500">Par sem.</span>
            <input type="number" min={0} value={nvObjectif} onChange={(e) => setNvObjectif(Math.max(0, parseInt(e.target.value) || 0))} className={champ} />
          </label>
          <button onClick={ajouterObjectif} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus size={15} /> Ajouter
          </button>
        </div>

        {objectifs.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Total visé : <b className="text-slate-700">{totalHebdo}</b> sous-traitant(s)/semaine, tous métiers actifs confondus.
          </p>
        )}
        {metiers.length === 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600">
            <Info size={13} className="mt-0.5 shrink-0" />
            Astuce : importe d'abord tes bases (onglet Base) en leur donnant un métier — les métiers seront alors suggérés ici.
          </p>
        )}
      </div>

      {/* Réglages de cadence */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Plafond d'envois par jour (SMS + e-mails)</span>
          <span className="mb-2 block text-xs text-slate-400">Sécurité anti-spam, tous métiers confondus : au-delà, le moteur attend le lendemain.</span>
          <input type="number" min={1} className={champ + " w-28"} value={p.plafondJour} onChange={(e) => set("plafondJour", Math.max(1, parseInt(e.target.value) || 1))} />
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
              <button key={n} onClick={() => toggleJour(n)} className={"h-9 w-11 rounded-lg border text-xs font-medium " + (p.jours.includes(n) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-400 hover:bg-slate-50")}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Séquence utilisée (commune à tous les métiers)</span>
          <select className={champ} value={p.sequenceId ?? ""} onChange={(e) => set("sequenceId", e.target.value || null)}>
            <option value="">— (séquence marquée « active » dans l'onglet Séquences) —</option>
            {sequences.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
          <span className="mt-1 block text-xs text-slate-400">Le message s'adapte au métier grâce à la variable {"{{metier}}"}.</span>
        </label>
      </div>

      {!seqActive && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <Info size={16} className="mt-0.5 shrink-0" />
          Aucune séquence sélectionnée ni active. Va dans l'onglet <b>Séquences</b> pour en créer une et l'activer, sinon rien ne partira.
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => sauvegarder()} disabled={enreg} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
          {enreg ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Enregistrer la cadence
        </button>
        {ok && <span className="flex items-center gap-1.5 text-sm text-emerald-600"><CheckCircle2 size={15} /> Enregistré</span>}
      </div>
    </div>
  )
}
