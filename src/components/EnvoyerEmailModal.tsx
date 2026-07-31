import { useEffect, useMemo, useState } from "react"
import { X, Send, Check, Loader2, AlertTriangle, PenLine } from "lucide-react"
import type { Prospect } from "../data"
import { variables, type Email } from "../emails"
import { chargerEmails } from "../lib/emailsDb"
import { lireParametre } from "../lib/parametresDb"
import { composer, envoyerEmail, emailConfigure } from "../lib/envoiEmail"

// Envoi d'un e-mail à un prospect.
//
// L'objet et le message sont ÉDITABLES directement ici : on peut écrire un
// message personnalisé sans passer par Paramétrage → Emails pour créer un
// modèle. Choisir un modèle ne fait que pré-remplir les deux champs — le modèle
// enregistré n'est jamais modifié, ce qui permet de le retoucher librement pour
// un envoi ponctuel.
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
  const [objet, setObjet] = useState("")
  const [corps, setCorps] = useState("")
  const [envoi, setEnvoi] = useState(false)
  const [fait, setFait] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    chargerEmails()
      .then((e) => {
        setEmails(e)
        // On pré-remplit avec le 1er modèle, tout en le laissant modifiable.
        if (e.length) {
          setModeleId(e[0].id ?? "")
          setObjet(e[0].objet)
          setCorps(e[0].corps)
        }
      })
      .catch(() => {})
    lireParametre("signature").then((v) => v && setSignature(v)).catch(() => {})
  }, [])

  // Ce qui part réellement : le contenu affiché à l'écran, pas le modèle d'origine.
  const aEnvoyer = useMemo<Email>(
    () => ({ nom: nomPourJournal(emails, modeleId), objet, corps, ordre: 0, pieces: piecesDu(emails, modeleId) }),
    [emails, modeleId, objet, corps],
  )
  const apercu = useMemo(
    () => composer(aEnvoyer, prospect, signature),
    [aEnvoyer, prospect, signature],
  )

  function choisirModele(id: string) {
    setModeleId(id)
    const m = emails.find((e) => e.id === id)
    if (m) {
      setObjet(m.objet)
      setCorps(m.corps)
    } else {
      // « Écrire un message » : on repart d'une page blanche.
      setObjet("")
      setCorps("")
    }
  }

  function insererVariable(cle: string) {
    setCorps((c) => (c ? c + cle : cle))
  }

  const pret = Boolean(prospect.email) && objet.trim() !== "" && corps.trim() !== ""

  async function envoyer() {
    if (!pret) return
    setErreur(null)
    setEnvoi(true)
    try {
      await envoyerEmail(prospect, aEnvoyer, signature)
      setFait(true)
      setTimeout(onClose, 1000)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      setEnvoi(false)
    }
  }

  const champ =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"

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
            <span className="text-xs font-medium text-slate-500">
              Partir d'un modèle (facultatif)
            </span>
            <select
              value={modeleId}
              onChange={(e) => choisirModele(e.target.value)}
              className={champ + " mt-1"}
            >
              <option value="">✏️ Écrire un message (page blanche)</option>
              {emails.map((e) => (
                <option key={e.id} value={e.id}>{e.nom}</option>
              ))}
            </select>
            <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
              <PenLine size={11} /> Objet et message restent modifiables : le modèle enregistré
              n'est pas touché.
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-500">Objet</span>
            <input
              value={objet}
              onChange={(e) => setObjet(e.target.value)}
              placeholder="Ex. Suite à notre échange"
              className={champ + " mt-1"}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-500">Message</span>
            <textarea
              value={corps}
              onChange={(e) => setCorps(e.target.value)}
              rows={8}
              placeholder={"Bonjour {{contact}},\n\n…"}
              className={champ + " mt-1 resize-y"}
            />
          </label>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Insérer :</span>
            {variables.map((v) => (
              <button
                key={v.cle}
                onClick={() => insererVariable(v.cle)}
                title={`Remplacé à l'envoi par : ${v.exemple}`}
                className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
              >
                {v.label}
              </button>
            ))}
          </div>

          <div>
            <span className="text-xs font-medium text-slate-500">
              Aperçu (tel qu'il sera reçu, signature comprise)
            </span>
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

          {erreur && (
            <p className="flex items-start gap-2 whitespace-pre-wrap break-words text-xs text-red-500">
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
            disabled={!pret || envoi || fait || !emailConfigure}
            title={
              !prospect.email
                ? "Cette fiche n'a pas d'adresse email"
                : !objet.trim() || !corps.trim()
                  ? "Renseignez l'objet et le message"
                  : undefined
            }
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

// Nom retenu dans l'historique des envois : celui du modèle si on en est parti,
// sinon une mention explicite (utile pour s'y retrouver plus tard).
function nomPourJournal(emails: Email[], modeleId: string): string {
  return emails.find((e) => e.id === modeleId)?.nom ?? "Message personnalisé"
}

// Les pièces jointes du modèle choisi sont conservées (elles ne sont pas
// éditables ici) ; une page blanche part sans pièce jointe.
function piecesDu(emails: Email[], modeleId: string) {
  return emails.find((e) => e.id === modeleId)?.pieces ?? []
}
