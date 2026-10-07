import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Mail, Loader2, AlertTriangle, Check, PenLine } from "lucide-react"
import { apercu, type Email } from "../emails"
import { supabaseConfigure } from "../lib/supabase"
import { chargerEmails, creerEmail, majEmail, supprimerEmail } from "../lib/emailsDb"
import { lireParametre, ecrireParametre } from "../lib/parametresDb"
import { useSession } from "../lib/auth"
import { nomAffiche } from "../lib/comptes"
import { signatureStc } from "../lib/signatureStc"
import EmailModal from "./EmailModal"

type ModalState = { mode: "create" } | { mode: "edit"; email: Email } | null

export default function EmailsManager() {
  const [emails, setEmails] = useState<Email[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  // Signature STC Bâtiment du compte connecté : c'est elle qui part avec chaque
  // e-mail envoyé depuis le logiciel (après un appel, boîte de réception).
  const session = useSession()
  const signatureCompte = signatureStc({ nom: nomAffiche(session) })
  // Les envois AUTOMATIQUES (règles) n'ont pas de compte connecté : ils signent
  // du nom réglé ici (paramètre « commercial »), dans le même format.
  const [nomAuto, setNomAuto] = useState("")
  const [nomAutoCharge, setNomAutoCharge] = useState(false)
  const [nomAutoSauve, setNomAutoSauve] = useState(false)

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
    lireParametre("commercial")
      .then((v) => {
        if (v) setNomAuto(v)
      })
      .catch(() => {})
      .finally(() => setNomAutoCharge(true))
  }, [])

  async function enregistrerNomAuto() {
    try {
      await ecrireParametre("commercial", nomAuto.trim())
      setNomAutoSauve(true)
      setTimeout(() => setNomAutoSauve(false), 2000)
    } catch (e) {
      setErreur("Nom non enregistré. Détail : " + (e instanceof Error ? e.message : String(e)))
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
            signature={signatureCompte}
            onClose={() => setModal(null)}
            onSave={enregistrer}
          />
        )}

        {/* Une seule signature dans tout le logiciel : celle de STC Bâtiment
            (Mahdi, 07/10/2026). Pour le compte connecté, elle porte son nom ;
            pour les envois automatiques des règles, le nom réglé ci-dessous. */}
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <PenLine size={16} className="text-blue-600" />
            <p className="text-sm font-medium text-slate-800">Ma signature</p>
            <span className="text-xs text-slate-400">
              — signature STC Bâtiment, à ton nom. Elle part avec chaque e-mail envoyé
              depuis le logiciel. Pour changer le nom : onglet Comptes.
            </span>
          </div>
          <div
            className="signature-edit rounded-lg border border-slate-100 bg-slate-50 px-4 pb-4 text-sm"
            dangerouslySetInnerHTML={{ __html: signatureCompte }}
          />
        </div>

        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <PenLine size={16} className="text-blue-600" />
            <p className="text-sm font-medium text-slate-800">Envois automatiques</p>
            <span className="text-xs text-slate-400">
              — les règles d'envoi n'ont pas de compte connecté : elles signent du nom
              ci-dessous, même format. Ce nom remplit aussi {"{{commercial}}"}.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="nom-envois-automatiques"
              value={nomAuto}
              onChange={(e) => setNomAuto(e.target.value)}
              placeholder="L'équipe STC"
              disabled={!nomAutoCharge}
              className="w-72 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <button
              onClick={enregistrerNomAuto}
              disabled={!nomAutoCharge}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {nomAutoSauve ? <Check size={16} /> : null}
              {nomAutoSauve ? "Enregistré" : "Enregistrer"}
            </button>
          </div>
          <div
            className="signature-edit mt-3 rounded-lg border border-slate-100 bg-slate-50 px-4 pb-4 text-sm"
            dangerouslySetInnerHTML={{ __html: signatureStc({ nom: nomAuto }) }}
          />
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
                <p className="mt-2 border-t border-slate-100 pt-1.5 text-[11px] text-slate-400">
                  + la signature STC Bâtiment
                </p>
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
