import { useEffect, useRef, useState } from "react"
import { X, Building2, Upload, Loader2, Phone, User } from "lucide-react"
import type { Agence } from "../agences"
import type { Prospect } from "../data"
import { majAgence, chargerGestionnaires } from "../lib/agencesDb"
import { televerser } from "../lib/stockage"

export default function AgenceModal({
  agence,
  onClose,
  onMaj,
}: {
  agence: Agence
  onClose: () => void
  onMaj: () => void
}) {
  const [nom, setNom] = useState(agence.nom)
  const [adresse, setAdresse] = useState(agence.adresse)
  const [arrondissement, setArrondissement] = useState(agence.arrondissement)
  const [nbLots, setNbLots] = useState(agence.nbLots ?? 0)
  const [logoUrl, setLogoUrl] = useState(agence.logoUrl)
  const [gestionnaires, setGestionnaires] = useState<Prospect[]>([])
  const [upload, setUpload] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (agence.id) chargerGestionnaires(agence.id).then(setGestionnaires).catch(() => {})
  }, [agence.id])

  async function changerLogo(file: File) {
    if (!agence.id) return
    setUpload(true)
    try {
      const pj = await televerser(file)
      await majAgence(agence.id, { logo_url: pj.url })
      setLogoUrl(pj.url)
      onMaj()
    } catch (e) {
      console.error(e)
    } finally {
      setUpload(false)
    }
  }

  async function enregistrer() {
    if (agence.id) await majAgence(agence.id, { nom, adresse, arrondissement, nb_lots: nbLots }).catch(console.error)
    onMaj()
    onClose()
  }

  const champ =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Agence</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-5">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {logoUrl ? (
                <img src={logoUrl} alt="logo" className="h-full w-full object-contain" />
              ) : (
                <Building2 size={28} className="text-slate-300" />
              )}
            </div>
            <div>
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) changerLogo(f) }} />
              <button
                onClick={() => logoRef.current?.click()}
                disabled={upload}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {upload ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                {upload ? "Envoi…" : logoUrl ? "Changer le logo" : "Ajouter un logo"}
              </button>
              <p className="mt-1 text-xs text-slate-400">PNG / JPG, idéalement carré</p>
            </div>
          </div>

          {/* Infos */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-slate-500">Nom de l'agence</span>
              <input value={nom} onChange={(e) => setNom(e.target.value)} className={champ} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Adresse</span>
              <input value={adresse} onChange={(e) => setAdresse(e.target.value)} className={champ} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Arrondissement</span>
              <input value={arrondissement} onChange={(e) => setArrondissement(e.target.value)} className={champ} />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-slate-500">
                Nombre de lots sous gestion
              </span>
              <input
                type="number"
                min={0}
                value={nbLots}
                onChange={(e) => setNbLots(Number(e.target.value) || 0)}
                className={champ}
              />
              <span className="mt-1 block text-xs text-slate-400">
                Plus une agence a de lots, plus elle remonte en haut de la liste.
              </span>
            </label>
          </div>

          {/* Gestionnaires */}
          <p className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Gestionnaires de cette agence ({gestionnaires.length})
          </p>
          <div className="space-y-1.5">
            {gestionnaires.map((g) => (
              <div key={g.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <User size={15} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {g.contact || g.entreprise}
                </span>
                {g.telephone && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Phone size={12} /> {g.telephone}
                  </span>
                )}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{g.statut}</span>
              </div>
            ))}
            {gestionnaires.length === 0 && (
              <p className="text-sm text-slate-400">Aucun gestionnaire relié.</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Fermer
          </button>
          <button onClick={enregistrer} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
