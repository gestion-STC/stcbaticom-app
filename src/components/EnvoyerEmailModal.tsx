import { useEffect, useState } from "react"
import { X, Send, Check, Loader2, AlertTriangle } from "lucide-react"
import type { Prospect } from "../data"
import type { Email } from "../emails"
import { chargerEmails } from "../lib/emailsDb"
import { lireParametre } from "../lib/parametresDb"
import { composer, envoyerEmail, emailConfigure } from "../lib/envoiEmail"

export default function EnvoyerEmailModal({
  prospect,
  onClose,
}: {
  prospect: Prospect
  onClose: () => void
}) {
  const [emails, setEmails] = useState<Email[]>([])
  const [signature, setSignature] = useState("")
  const [modeleId, setModeleId] = useState("")
  const [envoi, setEnvoi] = useState(false)
  const [fait, setFait] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    chargerEmails()
      .then((e) => {
        setEmails(e)
        if (e.length) setModeleId(e[0].id ?? "")
      })
      .catch(() => {})
    lireParametre("signature").then((v) => v && setSignature(v)).catch(() => {})
  }, [])

  const modele = emails.find((e) => e.id === modeleId)
  const apercu = modele ? composer(modele, prospect, signature) : null

  async function envoyer() {
    if (!modele) return
    setErreur(null)
    setEnvoi(true)
    try {
      await envoyerEmail(prospect, modele, signature)
      setFait(true)
      setTimeout(onClose, 1000)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      setEnvoi(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Send size={18} className="text-blue-600" /> Envoyer un email
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-sm text-slate-600">
            À <span className="font-medium text-slate-900">{prospect.entreprise}</span>
            {prospect.email ? (
              <span className="text-slate-500"> · {prospect.email}</span>
            ) : (
              <span className="text-red-500"> · pas d'email</span>
            )}
          </p>

          {!emailConfigure && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              L'envoi d'email n'est pas encore configuré (Supabase requis). L'aperçu
              fonctionne, mais l'envoi réel sera actif une fois la configuration faite.
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-slate-500">Modèle</span>
            <select
              value={modeleId}
              onChange={(e) => setModeleId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              {emails.map((e) => (
                <option key={e.id} value={e.id}>{e.nom}</option>
              ))}
            </select>
          </label>

          {apercu && (
            <div>
              <span className="text-xs font-medium text-slate-500">Aperçu</span>
              <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="border-b border-slate-200 pb-2 text-sm font-medium text-slate-800">
                  {apercu.objet || "(objet)"}
                </p>
                <div
                  className="signature-edit mt-2 text-sm text-slate-600"
                  dangerouslySetInnerHTML={{ __html: apercu.corpsHtml }}
                />
              </div>
            </div>
          )}

          {erreur && (
            <p className="flex items-start gap-2 text-xs text-red-500">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {erreur}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
          <button
            onClick={envoyer}
            disabled={!modele || !prospect.email || envoi || fait || !emailConfigure}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {fait ? <Check size={16} /> : envoi ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {fait ? "Envoyé !" : envoi ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  )
}
