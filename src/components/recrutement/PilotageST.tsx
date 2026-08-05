import { useEffect, useState } from "react"
import { Loader2, AlertTriangle, Power, Save, CheckCircle2, Info, Plus, Trash2, HardHat } from "lucide-react"
import type { PilotageST as Pilotage, SequenceST, ObjectifMetier, SousTraitant } from "../../recrutement"
import { supabase, supabaseConfigure } from "../../lib/supabase"
import { chargerPilotage, majPilotage } from "../../lib/pilotageStDb"
import { chargerSequences } from "../../lib/sequencesStDb"
import { chargerObjectifs, creerObjectif, majObjectif, supprimerObjectif } from "../../lib/objectifsStDb"
import { chargerSousTraitants } from "../../lib/sousTraitantsDb"
import { tauxGlobal, volumeADemarcher, dispoAContacter, FENETRE_JOURS, CORPS_METIERS } from "../../lib/recrutementCalc"

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
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState("")
  const [enreg, setEnreg] = useState(false)
  const [ok, setOk] = useState(false)
  // Formulaire d'ajout d'un objectif
  const [nvMetier, setNvMetier] = useState("")
  const [nvObjectif, setNvObjectif] = useState(1)
  // Base des sous-traitants (pour calculer le volume de chaque campagne)
  const [liste, setListe] = useState<SousTraitant[]>([])
  // Suivi : envois des dernières 24 h + dernier passage du moteur
  const [envois24h, setEnvois24h] = useState<number | null>(null)
  const [dernierEnvoi, setDernierEnvoi] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseConfigure) {
      setErreur("Base non configurée.")
      setChargement(false)
      return
    }
    Promise.all([chargerPilotage(), chargerSequences(), chargerObjectifs(), chargerSousTraitants()])
      .then(([pil, seqs, objs, sts]) => {
        setP(pil)
        setSequences(seqs)
        setObjectifs(objs)
        setListe(sts)
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
      .finally(() => setChargement(false))
    // Suivi des envois (24 h glissantes + dernier envoi) — informatif, non bloquant.
    if (supabase) {
      const depuis = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      supabase.from("st_envois").select("id", { count: "exact", head: true }).eq("statut", "envoye").gte("envoye_le", depuis)
        .then(({ count }) => setEnvois24h(count ?? 0))
      supabase.from("st_envois").select("envoye_le").order("envoye_le", { ascending: false }).limit(1)
        .then(({ data }) => setDernierEnvoi((data as { envoye_le: string }[] | null)?.[0]?.envoye_le ?? null))
    }
  }, [])

  // ── Suivi d'un objectif : réalisé vs voulu (même règle « contient » que le moteur) ──
  const SEMAINE_MS = 7 * 24 * 3600 * 1000
  const contientMetier = (st: SousTraitant, metier: string) =>
    (st.metier || "").toLowerCase().includes(metier.trim().toLowerCase())
  const suiviDe = (o: ObjectifMetier) => {
    const depuis = Date.now() - SEMAINE_MS
    const dans = liste.filter((s) => contientMetier(s, o.metier))
    return {
      demarres7j: dans.filter((s) => s.demarreLe && new Date(s.demarreLe).getTime() >= depuis).length,
      enSequence: dans.filter((s) => s.statut === "en_sequence").length,
      deposes7j: dans.filter((s) => s.deposeLe && new Date(s.deposeLe).getTime() >= depuis).length,
      deposesTotal: dans.filter((s) => s.statut === "depose").length,
    }
  }

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

  // Taux global (60 j, repli sur défaut prudent) qui pilote le calcul de toutes les campagnes.
  const tg = tauxGlobal(liste)

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

      {/* ── SUIVI DES OBJECTIFS : réalisé vs voulu ─────────────────────────── */}
      {objectifs.some((o) => o.actif) && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <CheckCircle2 size={16} className="text-emerald-600" /> Suivi des objectifs (7 derniers jours)
            </span>
            <span className="text-[11px] text-slate-400">
              {envois24h !== null && <>Envois 24 h : <b className="text-slate-600">{envois24h}</b> / {p.plafondJour}</>}
              {dernierEnvoi && <> · dernier envoi {new Date(dernierEnvoi).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</>}
            </span>
          </div>
          <div className="mt-3 space-y-2.5">
            {objectifs.filter((o) => o.actif).map((o) => {
              const s = suiviDe(o)
              const pct = o.objectifHebdo > 0 ? Math.min(100, Math.round((s.demarres7j / o.objectifHebdo) * 100)) : 0
              return (
                <div key={o.id} className="rounded-lg border border-slate-100 px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{corpsLabel(o.metier)}</span>
                    <span className={pct >= 100 ? "font-semibold text-emerald-600" : "font-semibold text-slate-700"}>
                      {s.demarres7j} / {o.objectifHebdo} démarré{s.demarres7j > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={"h-full rounded-full transition-all " + (pct >= 100 ? "bg-emerald-500" : "bg-blue-500")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1 flex gap-3 text-[11px] text-slate-500">
                    <span>🔄 {s.enSequence} en séquence</span>
                    <span>📥 {s.deposes7j} déposé{s.deposes7j > 1 ? "s" : ""} cette semaine</span>
                    <span>🏁 {s.deposesTotal} déposé{s.deposesTotal > 1 ? "s" : ""} au total</span>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            « Démarrés » = mis en séquence par le moteur cette semaine. Le dépôt du dossier arrive après les
            relances (e-mails + SMS), c'est lui qui compte comme recrue.
          </p>
        </div>
      )}

      {/* Campagnes par corps de métier */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <HardHat size={16} className="text-blue-600" /> Campagnes par corps de métier
          </span>
          <span
            className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
            title={tg.fiable ? "taux de conversion réel" : "taux par défaut prudent (pas encore assez de données)"}
          >
            Taux {tg.fiable ? "réel" : "prudent"} : {(tg.taux * 100).toFixed(1)} %
          </span>
        </div>
        <p className="mb-3 mt-1 text-xs text-slate-400">
          Ajoute autant de campagnes que tu veux (une par corps). Dis le nombre voulu : le logiciel calcule le volume
          à démarcher à partir du taux de conversion réel ({FENETRE_JOURS} derniers jours) + marge. Un artisan
          multi-corps compte dans chacun de ses corps.
        </p>

        <div className="space-y-2">
          {objectifs.map((o) => {
            const vol = volumeADemarcher(o.objectifHebdo, tg.taux)
            const dispo = dispoAContacter(liste, o.metier)
            const assez = dispo >= vol
            return (
              <div key={o.id} className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm font-medium text-slate-700">{corpsLabel(o.metier)}</span>
                  <input
                    type="number"
                    min={0}
                    defaultValue={o.objectifHebdo}
                    onBlur={(e) => {
                      const v = Math.max(0, parseInt(e.target.value) || 0)
                      if (v !== o.objectifHebdo) changerObjectif(o, { objectifHebdo: v })
                    }}
                    className={champ + " w-16"}
                    title="Nombre à recruter"
                  />
                  <span className="text-xs text-slate-400">voulus</span>
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input type="checkbox" checked={o.actif} onChange={(e) => changerObjectif(o, { actif: e.target.checked })} />
                    actif
                  </label>
                  <button onClick={() => retirerObjectif(o)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  → démarcher ~<b className="text-slate-700">{vol}</b> ·{" "}
                  <span className={assez ? "text-emerald-600" : "text-amber-600"}>
                    {dispo} dispo{assez ? "" : ` (manque ${vol - dispo})`}
                  </span>
                </div>
              </div>
            )
          })}
          {objectifs.length === 0 && <p className="py-2 text-xs text-slate-400">Aucune campagne. Ajoute un corps de métier ci-dessous.</p>}
        </div>

        {/* Ajout d'une campagne */}
        <div className="mt-3 flex items-end gap-2 border-t border-slate-100 pt-3">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-slate-500">Corps de métier</span>
            <select value={nvMetier} onChange={(e) => setNvMetier(e.target.value)} className={champ}>
              <option value="">— choisir —</option>
              {CORPS_METIERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label className="w-24">
            <span className="mb-1 block text-xs text-slate-500">Nb voulu</span>
            <input type="number" min={0} value={nvObjectif} onChange={(e) => setNvObjectif(Math.max(0, parseInt(e.target.value) || 0))} className={champ} />
          </label>
          <button onClick={ajouterObjectif} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus size={15} /> Ajouter
          </button>
        </div>

        {objectifs.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Total visé : <b className="text-slate-700">{totalHebdo}</b> recrue(s), toutes campagnes actives confondues.
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

// Libellé court d'un corps de métier (repli sur la valeur brute si inconnu).
function corpsLabel(value: string): string {
  return CORPS_METIERS.find((c) => c.value === value)?.label ?? value
}
