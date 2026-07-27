import { useState } from "react"
import { X, Phone, Trash2, Plus, Pencil, Check, ChevronLeft, Mail, MapPin, User, Building2, Clock } from "lucide-react"
import type { Prospect } from "../data"
import { typesRdv, type Rdv } from "../rdv"

export default function RdvJourModal({
  dateLisible,
  rdvs,
  prospects,
  onClose,
  onAjouter,
  onSupprimer,
  onModifier,
}: {
  dateLisible: string
  rdvs: Rdv[]
  prospects: Prospect[]
  onClose: () => void
  onAjouter: (r: {
    prospectId: string | null
    titre: string
    telephone: string
    type: string
    heure: string
    note: string
  }) => void
  onSupprimer: (id: string) => void
  onModifier: (
    id: string,
    champs: { titre?: string; telephone?: string; type?: string; heure?: string; note?: string },
  ) => void
}) {
  const [prospectId, setProspectId] = useState("") // "" = saisie libre
  const [titre, setTitre] = useState("")
  const [telephone, setTelephone] = useState("")
  const [type, setType] = useState<string>("Téléphone")
  const [heure, setHeure] = useState("10:00")
  const [note, setNote] = useState("")
  // RDV ouvert « en grand » (clic sur un RDV de la liste).
  const [detailId, setDetailId] = useState<string | null>(null)
  // Édition d'un RDV existant (crayon), à l'intérieur de la vue détail.
  const [editId, setEditId] = useState<string | null>(null)
  const [eHeure, setEHeure] = useState("")
  const [eType, setEType] = useState("Téléphone")
  const [eNote, setENote] = useState("")
  const [eTitre, setETitre] = useState("")
  const [eTel, setETel] = useState("")

  function ouvrirEdition(r: Rdv) {
    setEditId(r.id ?? null)
    setEHeure(r.heure)
    setEType(r.type)
    setENote(r.note ?? "")
    setETitre(r.titre ?? "")
    setETel(r.telephone ?? "")
  }
  function enregistrerEdition(r: Rdv) {
    if (!r.id) return
    const champs: { titre?: string; telephone?: string; type?: string; heure?: string; note?: string } = {
      type: eType,
      heure: eHeure,
      note: eNote,
    }
    // Un RDV « libre » (pas rattaché à un prospect) : on peut aussi corriger le nom + tél.
    if (r.prospectId === null) {
      champs.titre = eTitre
      champs.telephone = eTel
    }
    onModifier(r.id, champs)
    setEditId(null)
  }

  const champ =
    "rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
  const libre = prospectId === ""

  function ajouter() {
    if (!libre || titre.trim()) {
      onAjouter({ prospectId: libre ? null : prospectId, titre, telephone, type, heure, note })
      setTitre("")
      setTelephone("")
      setNote("")
    }
  }

  // La fiche prospect/gestionnaire reliée à un RDV (si le RDV pointe vers un prospect de la base).
  const ficheDe = (r: Rdv): Prospect | undefined =>
    r.prospectId ? prospects.find((p) => p.id === r.prospectId) : undefined
  const numeroDe = (r: Rdv, f?: Prospect): string => (f?.telephone || r.telephone || "").trim()

  const rdvsTries = rdvs.slice().sort((a, b) => a.heure.localeCompare(b.heure))
  const rdvDetail = detailId ? rdvs.find((r) => r.id === detailId) : undefined

  // ---------------------------------------------------------------------------
  // Formulaire d'édition (réutilisé dans la vue détail).
  // ---------------------------------------------------------------------------
  function formEdition(r: Rdv) {
    return (
      <div className="space-y-2 rounded-lg border border-blue-300 bg-blue-50/40 p-3">
        {r.prospectId === null && (
          <>
            <input value={eTitre} onChange={(e) => setETitre(e.target.value)} placeholder="Nom / objet du RDV" className={champ + " w-full"} />
            <input value={eTel} onChange={(e) => setETel(e.target.value)} placeholder="Téléphone (optionnel)" className={champ + " w-full"} />
          </>
        )}
        <div className="flex items-center gap-2">
          <select value={eType} onChange={(e) => setEType(e.target.value)} className={champ}>
            {typesRdv.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input type="time" value={eHeure} onChange={(e) => setEHeure(e.target.value)} className={champ} />
        </div>
        <textarea value={eNote} onChange={(e) => setENote(e.target.value)} placeholder="Commentaire (optionnel)" rows={4} className={champ + " w-full resize-y"} />
        <div className="flex gap-2">
          <button onClick={() => enregistrerEdition(r)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Check size={15} /> Enregistrer
          </button>
          <button onClick={() => setEditId(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Vue DÉTAIL « en grand » d'un RDV : commentaire complet + fiche + Appeler.
  // ---------------------------------------------------------------------------
  function vueDetail(r: Rdv) {
    const f = ficheDe(r)
    const numero = numeroDe(r, f)
    const enEdition = editId === r.id
    return (
      <div>
        <button onClick={() => { setDetailId(null); setEditId(null) }} className="mb-3 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ChevronLeft size={16} /> Retour aux RDV du jour
        </button>

        {/* En-tête du RDV */}
        <div className="flex items-start gap-3">
          <span className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-base font-semibold text-white">
            <Clock size={16} /> {r.heure}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold leading-tight text-slate-900">{r.entreprise}</h3>
            <p className="text-sm text-slate-500">{r.type} · {dateLisible}</p>
          </div>
        </div>

        {enEdition ? (
          <div className="mt-4">{formEdition(r)}</div>
        ) : (
          <>
            {/* Commentaire du RDV, en entier */}
            {r.note && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Commentaire</p>
                <p className="whitespace-pre-wrap break-words rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-slate-700">{r.note}</p>
              </div>
            )}

            {/* Fiche du prospect / gestionnaire reliée */}
            {f ? (
              <div className="mt-4 rounded-lg border border-slate-200 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <Building2 size={13} /> Fiche
                  {f.statut && (
                    <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-slate-600">{f.statut}</span>
                  )}
                </p>
                <div className="space-y-1.5 text-sm text-slate-700">
                  {f.contact && <p className="flex items-center gap-2"><User size={14} className="text-slate-400" /> {f.contact}</p>}
                  {numero && <p className="flex items-center gap-2"><Phone size={14} className="text-slate-400" /> {numero}</p>}
                  {f.email && <p className="flex items-center gap-2 break-all"><Mail size={14} className="shrink-0 text-slate-400" /> {f.email}</p>}
                  {(f.adresse || f.arrondissement) && (
                    <p className="flex items-center gap-2"><MapPin size={14} className="shrink-0 text-slate-400" /> {[f.adresse, f.arrondissement].filter(Boolean).join(" · ")}</p>
                  )}
                  {f.commentaire && (
                    <p className="whitespace-pre-wrap break-words rounded-md bg-slate-50 px-2.5 py-2 text-[13px] text-slate-600">{f.commentaire}</p>
                  )}
                </div>
              </div>
            ) : (
              // RDV libre (pas de fiche) : au moins le téléphone saisi.
              numero && (
                <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                  <p className="flex items-center gap-2"><Phone size={14} className="text-slate-400" /> {numero}</p>
                </div>
              )
            )}

            {/* Appeler directement depuis le calendrier */}
            {numero && (
              <a
                href={`tel:${numero.replace(/\s/g, "")}`}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-base font-semibold text-white hover:bg-green-700"
              >
                <Phone size={18} /> Appeler {numero}
              </a>
            )}

            {/* Actions */}
            <div className="mt-3 flex gap-2">
              <button onClick={() => ouvrirEdition(r)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <Pencil size={15} /> Modifier
              </button>
              <button onClick={() => { if (r.id) { onSupprimer(r.id); setDetailId(null) } }} className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                <Trash2 size={15} /> Supprimer
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">RDV du {dateLisible}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-5">
          {rdvDetail ? (
            // ===== Vue détail « en grand » d'un RDV =====
            vueDetail(rdvDetail)
          ) : (
            // ===== Liste des RDV du jour + ajout =====
            <>
              {rdvsTries.length > 0 && (
                <div className="mb-4 space-y-2">
                  {rdvsTries.map((r) => (
                    <div key={r.id} className="flex items-start gap-2 rounded-lg border border-slate-200 hover:border-blue-300">
                      {/* Zone cliquable : ouvre le RDV en grand */}
                      <button
                        onClick={() => r.id && setDetailId(r.id)}
                        className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2 text-left"
                      >
                        <span className="mt-0.5 shrink-0 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{r.heure}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-800">{r.entreprise}</span>
                          <span className="block text-xs text-slate-400">
                            {r.type}
                            {r.telephone ? " · " + r.telephone : ""}
                          </span>
                          {r.note && (
                            <span className="mt-1 line-clamp-2 block whitespace-pre-wrap break-words text-xs text-slate-500">{r.note}</span>
                          )}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5 py-2 pr-2">
                        {r.telephone && (
                          <a href={`tel:${r.telephone.replace(/\s/g, "")}`} className="rounded-md p-1.5 text-green-600 hover:bg-green-50" title="Appeler">
                            <Phone size={16} />
                          </a>
                        )}
                        <button onClick={() => r.id && setDetailId(r.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Ouvrir / modifier">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => r.id && onSupprimer(r.id)} className="rounded-md p-1.5 text-slate-300 hover:text-red-500" title="Supprimer">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Ajouter un RDV */}
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Ajouter un RDV</p>
              <div className="space-y-2">
                <select value={prospectId} onChange={(e) => setProspectId(e.target.value)} className={champ + " w-full"}>
                  <option value="">— Autre (saisie libre) —</option>
                  {prospects.map((p) => (
                    <option key={p.id} value={p.id}>{p.entreprise}</option>
                  ))}
                </select>

                {libre && (
                  <div className="space-y-2 rounded-lg bg-slate-50 p-2.5">
                    <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Nom / objet du RDV (ex. M. Durand, notaire)" className={champ + " w-full"} />
                    <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Téléphone (optionnel)" className={champ + " w-full"} />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <select value={type} onChange={(e) => setType(e.target.value)} className={champ}>
                    {typesRdv.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className={champ} />
                </div>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Commentaire (optionnel)" rows={3} className={champ + " w-full resize-y"} />

                <button
                  onClick={ajouter}
                  disabled={libre && !titre.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  <Plus size={16} /> Ajouter le RDV
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
