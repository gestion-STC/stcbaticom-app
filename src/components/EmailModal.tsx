import { useRef, useState } from "react"
import { X, Paperclip, Loader2, FileText, Trash2 } from "lucide-react"
import { variables, apercu, type Email } from "../emails"
import { televerser, supprimerFichier, formatTaille } from "../lib/stockage"

export default function EmailModal({
  email,
  ordreParDefaut,
  signature,
  onClose,
  onSave,
}: {
  email: Email | null // null = création
  ordreParDefaut: number
  signature?: string
  onClose: () => void
  onSave: (e: Email) => void
}) {
  const [f, setF] = useState<Email>(
    email ?? { nom: "", objet: "", corps: "", ordre: ordreParDefaut, pieces: [] },
  )
  const corpsRef = useRef<HTMLTextAreaElement>(null)
  const pjRef = useRef<HTMLInputElement>(null)
  const [upload, setUpload] = useState(false)
  const [erreurPj, setErreurPj] = useState<string | null>(null)
  const set = (champ: keyof Email, v: string) => setF((p) => ({ ...p, [champ]: v }))

  async function ajouterPiece(file: File) {
    setErreurPj(null)
    setUpload(true)
    try {
      const pj = await televerser(file)
      setF((p) => ({ ...p, pieces: [...p.pieces, pj] }))
    } catch (e) {
      setErreurPj(
        "Envoi du fichier impossible. Le stockage est-il configuré ? Détail : " +
          (e instanceof Error ? e.message : String(e)),
      )
    } finally {
      setUpload(false)
    }
  }

  function retirerPiece(i: number) {
    const pj = f.pieces[i]
    setF((p) => ({ ...p, pieces: p.pieces.filter((_, k) => k !== i) }))
    if (pj?.chemin) supprimerFichier(pj.chemin).catch(() => {})
  }

  // Insère une variable à la position du curseur dans le corps
  function inserer(cle: string) {
    const ta = corpsRef.current
    if (!ta) {
      set("corps", f.corps + cle)
      return
    }
    const debut = ta.selectionStart
    const fin = ta.selectionEnd
    const nouveau = f.corps.slice(0, debut) + cle + f.corps.slice(fin)
    set("corps", nouveau)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = debut + cle.length
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {email ? "Modifier l'email" : "Nouvel email"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 px-5 py-5 lg:grid-cols-2">
          {/* Édition */}
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Nom du modèle</span>
              <input
                value={f.nom}
                onChange={(e) => set("nom", e.target.value)}
                placeholder="ex. Annonce d'appel"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Objet</span>
              <input
                value={f.objet}
                onChange={(e) => set("objet", e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Corps du message</span>
              <textarea
                ref={corpsRef}
                value={f.corps}
                onChange={(e) => set("corps", e.target.value)}
                rows={10}
                className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">
                Insérer une variable :
              </p>
              <div className="flex flex-wrap gap-1.5">
                {variables.map((v) => (
                  <button
                    key={v.cle}
                    onClick={() => inserer(v.cle)}
                    className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pièces jointes */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">
                  Pièces jointes
                </p>
                <button
                  onClick={() => pjRef.current?.click()}
                  disabled={upload}
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  {upload ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Paperclip size={13} />
                  )}
                  {upload ? "Envoi…" : "Ajouter un document"}
                </button>
                <input
                  ref={pjRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ""
                    if (file) ajouterPiece(file)
                  }}
                />
              </div>
              {erreurPj && (
                <p className="mb-1.5 text-xs text-red-500">{erreurPj}</p>
              )}
              <div className="space-y-1.5">
                {f.pieces.map((pj, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5"
                  >
                    <FileText size={15} className="shrink-0 text-slate-400" />
                    <a
                      href={pj.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-xs text-slate-700 hover:text-blue-600"
                      title={pj.nom}
                    >
                      {pj.nom}
                    </a>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {formatTaille(pj.taille)}
                    </span>
                    <button
                      onClick={() => retirerPiece(i)}
                      className="shrink-0 text-slate-300 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {f.pieces.length === 0 && (
                  <p className="text-xs text-slate-400">Aucune pièce jointe.</p>
                )}
              </div>
            </div>
          </div>

          {/* Aperçu */}
          <div>
            <span className="text-xs font-medium text-slate-500">Aperçu</span>
            <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="border-b border-slate-200 pb-2 text-sm font-medium text-slate-800">
                {apercu(f.objet) || "(objet)"}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
                {apercu(f.corps) || "(corps du message)"}
              </p>
              {signature && (
                <div
                  className="signature-edit mt-3 border-t border-slate-200 pt-2 text-sm text-slate-500"
                  dangerouslySetInnerHTML={{ __html: apercu(signature) }}
                />
              )}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Les variables ({"{{contact}}"}, {"{{entreprise}}"}…) sont
              remplacées par les infos du prospect à l'envoi.
              {signature ? " Votre signature est ajoutée automatiquement à la fin." : ""}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            onClick={() => onSave(f)}
            disabled={!f.nom.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
