import { useEffect, useRef, useState } from "react"
import {
  Loader2,
  Upload,
  Plus,
  Search,
  Trash2,
  Pencil,
  X,
  AlertTriangle,
  MousePointerClick,
  CheckCircle2,
} from "lucide-react"
import type { SousTraitant, StatutST } from "../../recrutement"
import { libelleStatutST } from "../../recrutement"
import { supabaseConfigure } from "../../lib/supabase"
import {
  chargerSousTraitants,
  creerSousTraitant,
  insererSousTraitants,
  majSousTraitant,
  supprimerSousTraitant,
} from "../../lib/sousTraitantsDb"

const champ =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"

const couleurStatut: Record<StatutST, string> = {
  a_contacter: "bg-slate-100 text-slate-600",
  en_sequence: "bg-blue-50 text-blue-700",
  depose: "bg-emerald-50 text-emerald-700",
  exclu: "bg-rose-50 text-rose-600",
}

export default function BaseST() {
  const [liste, setListe] = useState<SousTraitant[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState("")
  const [recherche, setRecherche] = useState("")
  const [modal, setModal] = useState<{ st: Partial<SousTraitant>; id?: string } | null>(null)
  const [importEnCours, setImportEnCours] = useState(false)
  const [info, setInfo] = useState("")
  const fichierRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!supabaseConfigure) {
      setErreur("Base non configurée.")
      setChargement(false)
      return
    }
    chargerSousTraitants()
      .then(setListe)
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
      .finally(() => setChargement(false))
  }, [])

  async function recharger() {
    setListe(await chargerSousTraitants())
  }

  async function importer(file: File) {
    setImportEnCours(true)
    setErreur("")
    setInfo("")
    try {
      const { importerSousTraitants } = await import("../../lib/importSousTraitants")
      const res = await importerSousTraitants(file)
      if (res.total === 0) {
        setErreur("Aucune ligne exploitable (il faut au moins un e-mail ou un téléphone par ligne).")
        return
      }
      const n = await insererSousTraitants(res.sousTraitants)
      await recharger()
      setInfo(
        `${n} sous-traitant(s) importé(s)` +
          (res.ignorees ? ` — ${res.ignorees} ligne(s) ignorée(s) (ni e-mail ni téléphone).` : "."),
      )
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setImportEnCours(false)
      if (fichierRef.current) fichierRef.current.value = ""
    }
  }

  async function enregistrer(st: Partial<SousTraitant>, id?: string) {
    try {
      if (id) {
        await majSousTraitant(id, st)
      } else {
        await creerSousTraitant({ ...st, statut: "a_contacter", etapeCourante: 0, nbClics: 0 })
      }
      await recharger()
      setModal(null)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    }
  }

  async function supprimer(id: string) {
    if (!confirm("Supprimer ce sous-traitant de la base ?")) return
    await supprimerSousTraitant(id).catch((e) => setErreur(String(e)))
    setListe((l) => l.filter((x) => x.id !== id))
  }

  const filtree = liste.filter((st) => {
    if (!recherche.trim()) return true
    const t = recherche.toLowerCase()
    return [st.entreprise, st.contact, st.email, st.metier, st.zone]
      .join(" ")
      .toLowerCase()
      .includes(t)
  })

  // Résumé du tunnel (compteurs simples ; le détail vit dans l'onglet Suivi).
  const nb = {
    total: liste.length,
    enSequence: liste.filter((s) => s.statut === "en_sequence").length,
    clics: liste.filter((s) => s.dernierClicLe).length,
    deposes: liste.filter((s) => s.statut === "depose" || s.deposeLe).length,
  }

  if (chargement)
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
        <Loader2 size={18} className="animate-spin" /> Chargement…
      </div>
    )

  return (
    <div className="mx-auto max-w-5xl px-8 pb-10">
      {/* Compteurs du tunnel */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Compteur label="Dans la base" valeur={nb.total} />
        <Compteur label="En séquence" valeur={nb.enSequence} accent="text-blue-700" />
        <Compteur label="Ont cliqué" valeur={nb.clics} accent="text-amber-600" icone={<MousePointerClick size={14} />} />
        <Compteur label="Dossiers déposés" valeur={nb.deposes} accent="text-emerald-600" icone={<CheckCircle2 size={14} />} />
      </div>

      {/* Barre d'actions */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher (entreprise, contact, métier…)"
            className={champ + " pl-9"}
          />
        </div>
        <button
          onClick={() => fichierRef.current?.click()}
          disabled={importEnCours}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          {importEnCours ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          Importer (Excel/CSV)
        </button>
        <button
          onClick={() => setModal({ st: { entreprise: "", contact: "", email: "", telephone: "", metier: "", zone: "" } })}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={15} /> Ajouter
        </button>
        <input
          ref={fichierRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && importer(e.target.files[0])}
        />
      </div>

      {erreur && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {erreur}
        </div>
      )}
      {info && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> {info}
        </div>
      )}

      {/* Liste */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Entreprise</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Métier</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3 text-center">Clics</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtree.map((st) => (
              <tr key={st.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{st.entreprise || "—"}</div>
                  <div className="text-xs text-slate-400">{st.email || st.telephone || "—"}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{st.contact || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{st.metier || "—"}</td>
                <td className="px-4 py-3">
                  <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + couleurStatut[st.statut]}>
                    {libelleStatutST[st.statut]}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-slate-600">{st.nbClics || 0}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => setModal({ st, id: st.id })}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Modifier"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => st.id && supprimer(st.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Supprimer"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtree.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                  {liste.length === 0
                    ? "Aucun sous-traitant. Importez un fichier ou ajoutez-en un."
                    : "Aucun résultat pour cette recherche."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && <ModalST donnee={modal} onFermer={() => setModal(null)} onEnregistrer={enregistrer} />}
    </div>
  )
}

function Compteur({
  label,
  valeur,
  accent = "text-slate-800",
  icone,
}: {
  label: string
  valeur: number
  accent?: string
  icone?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        {icone} {label}
      </div>
      <div className={"mt-1 text-2xl font-bold " + accent}>{valeur}</div>
    </div>
  )
}

function ModalST({
  donnee,
  onFermer,
  onEnregistrer,
}: {
  donnee: { st: Partial<SousTraitant>; id?: string }
  onFermer: () => void
  onEnregistrer: (st: Partial<SousTraitant>, id?: string) => void
}) {
  const [f, setF] = useState<Partial<SousTraitant>>({ ...donnee.st })
  const set = (k: keyof SousTraitant, v: string) => setF((p) => ({ ...p, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFermer}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h3 className="font-semibold text-slate-800">
            {donnee.id ? "Modifier le sous-traitant" : "Nouveau sous-traitant"}
          </h3>
          <button onClick={onFermer} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <Ligne label="Entreprise">
            <input className={champ} value={f.entreprise ?? ""} onChange={(e) => set("entreprise", e.target.value)} />
          </Ligne>
          <Ligne label="Contact">
            <input className={champ} value={f.contact ?? ""} onChange={(e) => set("contact", e.target.value)} />
          </Ligne>
          <div className="grid grid-cols-2 gap-3">
            <Ligne label="E-mail">
              <input className={champ} value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} />
            </Ligne>
            <Ligne label="Téléphone">
              <input className={champ} value={f.telephone ?? ""} onChange={(e) => set("telephone", e.target.value)} />
            </Ligne>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Ligne label="Métier">
              <input className={champ} value={f.metier ?? ""} onChange={(e) => set("metier", e.target.value)} />
            </Ligne>
            <Ligne label="Zone">
              <input className={champ} value={f.zone ?? ""} onChange={(e) => set("zone", e.target.value)} />
            </Ligne>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5">
          <button
            onClick={onFermer}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            onClick={() => onEnregistrer(f, donnee.id)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}
