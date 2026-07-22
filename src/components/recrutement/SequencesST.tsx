import { useEffect, useState } from "react"
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  X,
  AlertTriangle,
  Mail,
  MessageSquare,
  CheckCircle2,
  Power,
} from "lucide-react"
import type { SequenceST, EtapeST, CanalEtape } from "../../recrutement"
import { etapeVide, variablesST } from "../../recrutement"
import { supabaseConfigure } from "../../lib/supabase"
import {
  chargerSequences,
  creerSequence,
  majSequence,
  supprimerSequence,
  chargerEtapes,
  creerEtape,
  majEtape,
  supprimerEtape,
} from "../../lib/sequencesStDb"

const champ =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"

export default function SequencesST() {
  const [sequences, setSequences] = useState<SequenceST[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [etapes, setEtapes] = useState<EtapeST[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState("")
  const [modalEtape, setModalEtape] = useState<EtapeST | null>(null)

  useEffect(() => {
    if (!supabaseConfigure) {
      setErreur("Base non configurée.")
      setChargement(false)
      return
    }
    chargerSequences()
      .then((s) => {
        setSequences(s)
        setSelId(s[0]?.id ?? null)
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
      .finally(() => setChargement(false))
  }, [])

  useEffect(() => {
    if (!selId) {
      setEtapes([])
      return
    }
    chargerEtapes(selId)
      .then(setEtapes)
      .catch((e) => setErreur(String(e)))
  }, [selId])

  async function ajouterSequence() {
    const nom = prompt("Nom de la séquence :", "Nouvelle séquence")
    if (!nom) return
    try {
      const s = await creerSequence(nom)
      setSequences((l) => [...l, s])
      setSelId(s.id ?? null)
    } catch (e) {
      setErreur(String(e))
    }
  }

  async function activer(s: SequenceST) {
    // Une seule séquence active à la fois (celle utilisée pour démarrer les ST).
    try {
      await Promise.all(
        sequences.filter((x) => x.actif && x.id !== s.id).map((x) => majSequence(x.id!, { actif: false })),
      )
      await majSequence(s.id!, { actif: !s.actif })
      setSequences((l) => l.map((x) => ({ ...x, actif: x.id === s.id ? !s.actif : false })))
    } catch (e) {
      setErreur(String(e))
    }
  }

  async function renommer(s: SequenceST) {
    const nom = prompt("Renommer la séquence :", s.nom)
    if (!nom || nom === s.nom) return
    await majSequence(s.id!, { nom }).catch((e) => setErreur(String(e)))
    setSequences((l) => l.map((x) => (x.id === s.id ? { ...x, nom } : x)))
  }

  async function supprimerSeq(s: SequenceST) {
    if (!confirm(`Supprimer la séquence « ${s.nom} » et toutes ses étapes ?`)) return
    await supprimerSequence(s.id!).catch((e) => setErreur(String(e)))
    setSequences((l) => l.filter((x) => x.id !== s.id))
    if (selId === s.id) setSelId(null)
  }

  async function enregistrerEtape(e: EtapeST) {
    try {
      if (e.id) {
        await majEtape(e.id, e)
        setEtapes((l) => l.map((x) => (x.id === e.id ? e : x)))
      } else {
        const cree = await creerEtape(e)
        setEtapes((l) => [...l, cree])
      }
      setModalEtape(null)
    } catch (err) {
      setErreur(String(err))
    }
  }

  async function supprimerEt(e: EtapeST) {
    if (!confirm("Supprimer cette étape ?")) return
    await supprimerEtape(e.id!).catch((err) => setErreur(String(err)))
    setEtapes((l) => l.filter((x) => x.id !== e.id))
  }

  const seq = sequences.find((s) => s.id === selId)

  if (chargement)
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
        <Loader2 size={18} className="animate-spin" /> Chargement…
      </div>
    )

  return (
    <div className="mx-auto flex max-w-5xl gap-6 px-8 pb-10">
      {/* Colonne : liste des séquences */}
      <div className="w-56 shrink-0">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Séquences</h3>
          <button onClick={ajouterSequence} className="rounded-lg p-1 text-blue-600 hover:bg-blue-50" title="Nouvelle séquence">
            <Plus size={17} />
          </button>
        </div>
        <div className="space-y-1">
          {sequences.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelId(s.id ?? null)}
              className={
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm " +
                (s.id === selId ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50")
              }
            >
              <span className="flex-1 truncate">{s.nom}</span>
              {s.actif && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">active</span>}
            </button>
          ))}
          {sequences.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Aucune séquence.</p>}
        </div>
      </div>

      {/* Colonne : détail de la séquence sélectionnée */}
      <div className="min-w-0 flex-1">
        {erreur && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {erreur}
          </div>
        )}

        {!seq ? (
          <div className="py-16 text-center text-sm text-slate-400">
            Crée une séquence pour composer les relances (SMS et e-mails).
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-800">{seq.nom}</h2>
              <button onClick={() => renommer(seq)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Renommer">
                <Pencil size={14} />
              </button>
              <div className="flex-1" />
              <button
                onClick={() => activer(seq)}
                className={
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium " +
                  (seq.actif
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50")
                }
              >
                <Power size={14} /> {seq.actif ? "Séquence active" : "Activer"}
              </button>
              <button onClick={() => supprimerSeq(seq)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Supprimer la séquence">
                <Trash2 size={15} />
              </button>
            </div>

            <p className="mb-4 text-xs text-slate-500">
              Chaque étape part à <b>J+X</b> après l'entrée du sous-traitant dans la séquence. Utilise les variables{" "}
              {variablesST.map((v) => (
                <code key={v.cle} className="mx-0.5 rounded bg-slate-100 px-1 text-[11px] text-slate-600">{v.cle}</code>
              ))}
              — dont <code className="rounded bg-slate-100 px-1 text-[11px] text-slate-600">{"{{lien}}"}</code> (lien tracké vers le dépôt de dossier).
            </p>

            <div className="space-y-2">
              {etapes.map((e, i) => (
                <div key={e.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      {e.canal === "sms" ? (
                        <span className="flex items-center gap-1 font-medium text-violet-700"><MessageSquare size={14} /> SMS</span>
                      ) : (
                        <span className="flex items-center gap-1 font-medium text-blue-700"><Mail size={14} /> E-mail</span>
                      )}
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">J+{e.delaiJours}</span>
                      {!e.actif && <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-400">désactivée</span>}
                    </div>
                    {e.canal === "email" && e.objet && <div className="mt-0.5 truncate text-sm font-medium text-slate-700">{e.objet}</div>}
                    <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{e.contenu || <span className="italic">Vide</span>}</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setModalEtape(e)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Modifier">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => supprimerEt(e)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Supprimer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setModalEtape(etapeVide(seq.id!, etapes.length))}
              className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600"
            >
              <Plus size={15} /> Ajouter une étape
            </button>
          </>
        )}
      </div>

      {modalEtape && <ModalEtape etape={modalEtape} onFermer={() => setModalEtape(null)} onEnregistrer={enregistrerEtape} />}
    </div>
  )
}

function ModalEtape({
  etape,
  onFermer,
  onEnregistrer,
}: {
  etape: EtapeST
  onFermer: () => void
  onEnregistrer: (e: EtapeST) => void
}) {
  const [f, setF] = useState<EtapeST>({ ...etape })
  const set = <K extends keyof EtapeST>(k: K, v: EtapeST[K]) => setF((p) => ({ ...p, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFermer}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h3 className="font-semibold text-slate-800">{etape.id ? "Modifier l'étape" : "Nouvelle étape"}</h3>
          <button onClick={onFermer} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Canal */}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-slate-500">Canal</span>
            <div className="flex gap-2">
              {(["email", "sms"] as CanalEtape[]).map((c) => (
                <button
                  key={c}
                  onClick={() => set("canal", c)}
                  className={
                    "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium " +
                    (f.canal === c ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")
                  }
                >
                  {c === "sms" ? <MessageSquare size={15} /> : <Mail size={15} />}
                  {c === "sms" ? "SMS" : "E-mail"}
                </button>
              ))}
            </div>
          </div>

          {/* Délai */}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Envoyer après (jours)</span>
            <input
              type="number"
              min={0}
              className={champ + " w-28"}
              value={f.delaiJours}
              onChange={(e) => set("delaiJours", Math.max(0, parseInt(e.target.value) || 0))}
            />
            <span className="ml-2 text-xs text-slate-400">J+{f.delaiJours} après l'entrée en séquence</span>
          </label>

          {/* Objet (e-mail seulement) */}
          {f.canal === "email" && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Objet de l'e-mail</span>
              <input className={champ} value={f.objet} onChange={(e) => set("objet", e.target.value)} placeholder="Rejoignez nos sous-traitants" />
            </label>
          )}

          {/* Contenu */}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              {f.canal === "sms" ? "Texte du SMS" : "Message (e-mail)"}
            </span>
            <textarea
              className={champ + " min-h-[130px] resize-y font-mono text-xs"}
              value={f.contenu}
              onChange={(e) => set("contenu", e.target.value)}
              placeholder={
                f.canal === "sms"
                  ? "Bonjour {{contact}}, STC Bâtiment recrute des {{metier}}. Déposez votre dossier : {{lien}}"
                  : "Bonjour {{contact}},\n\nNous recherchons des artisans {{metier}}…\nDéposez votre dossier ici : {{lien}}"
              }
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {variablesST.map((v) => (
                <button
                  key={v.cle}
                  onClick={() => set("contenu", f.contenu + v.cle)}
                  title={v.desc}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200"
                >
                  {v.cle}
                </button>
              ))}
            </div>
            {f.canal === "sms" && (
              <p className="mt-1 text-[11px] text-slate-400">
                {f.contenu.length} caractères (≈ {Math.max(1, Math.ceil(f.contenu.length / 160))} SMS)
              </p>
            )}
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={f.actif} onChange={(e) => set("actif", e.target.checked)} />
            Étape active (décocher pour la mettre en pause sans la supprimer)
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5">
          <button onClick={onFermer} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
          <button
            onClick={() => onEnregistrer(f)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <CheckCircle2 size={15} /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
