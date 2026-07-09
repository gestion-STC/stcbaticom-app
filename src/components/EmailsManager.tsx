import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Mail, Loader2, AlertTriangle, Check, PenLine } from "lucide-react"
import { apercu, type Email } from "../emails"
import { supabaseConfigure } from "../lib/supabase"
import { chargerEmails, creerEmail, majEmail, supprimerEmail } from "../lib/emailsDb"
import { lireParametre, ecrireParametre } from "../lib/parametresDb"
import EmailModal from "./EmailModal"
import SignatureEditor from "./SignatureEditor"

type ModalState = { mode: "create" } | { mode: "edit"; email: Email } | null

export default function EmailsManager() {
  const [emails, setEmails] = useState<Email[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [signature, setSignature] = useState("")
  const [sigChargee, setSigChargee] = useState(false)
  const [sigSauvee, setSigSauvee] = useState(false)

  useEffect(() => {
    if (!supabaseConfigure) {
      setErreur("Supabase non configuré.")
      setChargement(false)
      return
    }
    chargerEmails()
      .then(setEmails)
      .catch((e) =>
        setErreur(
          "Impossible de charger les emails. Avez-vous créé la table « emails » ? Détail : " +
            (e instanceof Error ? e.message : String(e)),
        ),
      )
      .finally(() => setChargement(false))
    lireParametre("signature")
      .then((v) => {
        if (v) setSignature(v)
      })
      .catch(() => {})
      .finally(() => setSigChargee(true))
  }, [])

  async function enregistrerSignature() {
    try {
      await ecrireParametre("signature", signature)
      setSigSauvee(true)
      setTimeout(() => setSigSauvee(false), 2000)
    } catch (e) {
      setErreur(
        "Signature non enregistrée. Avez-vous créé la table « parametres » ? Détail : " +
          (e instanceof Error ? e.message : String(e)),
      )
    }
  }

  async function enregistrer(em: Email) {
    if (modal?.mode === "edit" && modal.email.id) {
      setEmails((arr) => arr.map((x) => (x.id === modal.email.id ? { ...em, id: x.id } : x)))
      await majEmail(modal.email.id, em).catch(console.error)
    } else {
      try {
        const cree = await creerEmail(em)
        setEmails((arr) => [...arr, cree])
      } catch (e) {
        setErreur("Création impossible : " + (e instanceof Error ? e.message : String(e)))
      }
    }
    setModal(null)
  }

  async function supprimer(em: Email) {
    if (!confirm(`Supprimer le modèle « ${em.nom} » ?`)) return
    setEmails((arr) => arr.filter((x) => x.id !== em.id))
    if (em.id) await supprimerEmail(em.id).catch(console.error)
  }

  return (
    <div className="px-8 pb-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Composez vos modèles d'emails. Vous les rattacherez ensuite à vos
            états.
          </p>
          <button
            onClick={() => setModal({ mode: "create" })}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={16} strokeWidth={2.3} />
            Créer un email
          </button>
        </div>

        {erreur && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-500" />
            <p className="flex-1">{erreur}</p>
            <button onClick={() => setErreur(null)} className="text-red-500">
              ✕
            </button>
          </div>
        )}

        {modal && (
          <EmailModal
            email={modal.mode === "edit" ? modal.email : null}
            ordreParDefaut={(emails.at(-1)?.ordre ?? 0) + 1}
            signature={signature}
            onClose={() => setModal(null)}
            onSave={enregistrer}
          />
        )}

        {/* Signature (ajoutée automatiquement à la fin de chaque email) */}
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <PenLine size={16} className="text-blue-600" />
            <p className="text-sm font-medium text-slate-800">Ma signature</p>
            <span className="text-xs text-slate-400">
              — ajoutée automatiquement à la fin de chaque email
            </span>
          </div>
          {sigChargee && (
            <SignatureEditor valeurInitiale={signature} onChange={setSignature} />
          )}
          <div className="mt-2 flex justify-end">
            <button
              onClick={enregistrerSignature}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {sigSauvee ? <Check size={16} /> : null}
              {sigSauvee ? "Enregistrée" : "Enregistrer la signature"}
            </button>
          </div>
        </div>

        {chargement ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-8 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Chargement…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {emails.map((em) => (
              <div
                key={em.id}
                className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Mail size={16} />
                    </span>
                    <p className="font-medium text-slate-800">{em.nom}</p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setModal({ mode: "edit", email: em })}
                      className="rounded-md p-1.5 text-slate-400 hover:text-blue-600"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => supprimer(em)}
                      className="rounded-md p-1.5 text-slate-300 hover:text-red-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-sm font-medium text-slate-600">
                  {apercu(em.objet)}
                </p>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-slate-400">
                  {apercu(em.corps)}
                </p>
                {signature && (
                  <p className="mt-2 border-t border-slate-100 pt-1.5 text-[11px] text-slate-400">
                    + votre signature
                  </p>
                )}
              </div>
            ))}
            {emails.length === 0 && !erreur && (
              <p className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-400">
                Aucun modèle. Créez le premier.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
