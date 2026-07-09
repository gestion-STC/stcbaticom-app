import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  RefreshCw,
  Reply,
  Send,
  X,
} from "lucide-react"
import {
  chargerMessages,
  marquerLu,
  repondreMessage,
  type Message,
} from "../lib/messagesDb"
import { dateCourte, extraireAdresse, nomCorrespondant, objetReponse } from "../lib/messagesUtils"
import { supabase } from "../lib/supabase"

type Filtre = "tous" | "entrant" | "sortant" | "nonlus"

const filtres: { id: Filtre; label: string }[] = [
  { id: "tous", label: "Tous" },
  { id: "entrant", label: "Reçus" },
  { id: "sortant", label: "Envoyés" },
  { id: "nonlus", label: "Non lus" },
]

// L'adresse du correspondant (l'autre partie que nous) selon le sens du message.
function adresseCorrespondant(m: Message): string {
  return extraireAdresse(m.sens === "entrant" ? m.de : m.a)
}

export default function Messages() {
  const [messages, setMessages] = useState<Message[]>([])
  const [prospects, setProspects] = useState<Record<string, string>>({})
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState("")
  const [filtre, setFiltre] = useState<Filtre>("tous")
  const [ouvertId, setOuvertId] = useState<string | null>(null)

  // Volet de réponse
  const [reponseOuverte, setReponseOuverte] = useState(false)
  const [reponseTexte, setReponseTexte] = useState("")
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [envoiErreur, setEnvoiErreur] = useState("")
  const [envoiOk, setEnvoiOk] = useState(false)

  const charger = useCallback(async () => {
    setChargement(true)
    setErreur("")
    try {
      const liste = await chargerMessages()
      setMessages(liste)
      // Noms des prospects liés (pour afficher l'entreprise à côté de l'adresse).
      const ids = [...new Set(liste.map((m) => m.prospectId).filter(Boolean))] as string[]
      if (ids.length && supabase) {
        const { data } = await supabase
          .from("prospects")
          .select("id, entreprise, contact")
          .in("id", ids)
        const map: Record<string, string> = {}
        for (const p of (data ?? []) as { id: string; entreprise: string; contact: string }[]) {
          map[p.id] = p.entreprise || p.contact || ""
        }
        setProspects(map)
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  const visibles = useMemo(() => {
    if (filtre === "entrant") return messages.filter((m) => m.sens === "entrant")
    if (filtre === "sortant") return messages.filter((m) => m.sens === "sortant")
    if (filtre === "nonlus") return messages.filter((m) => m.sens === "entrant" && !m.lu)
    return messages
  }, [messages, filtre])

  const ouvert = useMemo(() => messages.find((m) => m.id === ouvertId) ?? null, [messages, ouvertId])

  function ouvrir(m: Message) {
    setOuvertId(m.id)
    setReponseOuverte(false)
    setReponseTexte("")
    setEnvoiErreur("")
    setEnvoiOk(false)
    // Ouvrir un message reçu le marque comme lu (localement + en base).
    if (m.sens === "entrant" && !m.lu) {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, lu: true } : x)))
      marquerLu(m.id)
    }
  }

  async function envoyerReponse() {
    if (!ouvert || !reponseTexte.trim()) return
    setEnvoiEnCours(true)
    setEnvoiErreur("")
    try {
      await repondreMessage({
        to: adresseCorrespondant(ouvert),
        objet: objetReponse(ouvert.objet),
        corps: reponseTexte.trim(),
        inReplyTo: ouvert.messageId,
        prospectId: ouvert.prospectId,
      })
      setEnvoiOk(true)
      setReponseOuverte(false)
      setReponseTexte("")
      // Recharge pour voir la réponse apparaître dans la liste (journalisée côté serveur).
      charger()
    } catch (e) {
      setEnvoiErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnvoiEnCours(false)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl gap-4 px-6">
      {/* ── Liste des messages ── */}
      <div className="flex w-96 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex gap-1">
            {filtres.map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltre(f.id)}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                  (filtre === f.id
                    ? "bg-blue-600 text-white"
                    : "text-slate-500 hover:bg-slate-100")
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={charger}
            title="Actualiser"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <RefreshCw size={15} className={chargement ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {chargement && messages.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
              <Loader2 size={16} className="animate-spin" /> Chargement…
            </div>
          )}
          {erreur && <p className="px-4 py-6 text-sm text-red-600">{erreur}</p>}
          {!chargement && !erreur && visibles.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
              <Inbox size={28} strokeWidth={1.5} />
              <p className="text-sm">Aucun message</p>
            </div>
          )}
          {visibles.map((m) => {
            const nonLu = m.sens === "entrant" && !m.lu
            const actif = m.id === ouvertId
            const entreprise = m.prospectId ? prospects[m.prospectId] : ""
            return (
              <button
                key={m.id}
                onClick={() => ouvrir(m)}
                className={
                  "block w-full border-b border-slate-100 px-4 py-3 text-left transition-colors " +
                  (actif ? "bg-blue-50" : "hover:bg-slate-50")
                }
              >
                <div className="flex items-center gap-2">
                  {m.sens === "entrant" ? (
                    <ArrowDownLeft size={14} className="shrink-0 text-blue-500" />
                  ) : (
                    <ArrowUpRight size={14} className="shrink-0 text-slate-400" />
                  )}
                  <span
                    className={
                      "min-w-0 flex-1 truncate text-sm " +
                      (nonLu ? "font-semibold text-slate-900" : "text-slate-700")
                    }
                  >
                    {nomCorrespondant(m.sens === "entrant" ? m.de : m.a)}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{dateCourte(m.date)}</span>
                  {nonLu && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                </div>
                <p
                  className={
                    "mt-0.5 truncate text-sm " +
                    (nonLu ? "font-medium text-slate-800" : "text-slate-500")
                  }
                >
                  {m.objet || "(sans objet)"}
                </p>
                {entreprise && (
                  <p className="mt-0.5 truncate text-xs text-slate-400">{entreprise}</p>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Détail du message ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        {!ouvert ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-300">
            <MailOpen size={40} strokeWidth={1.2} />
            <p className="text-sm text-slate-400">Sélectionne un message pour le lire</p>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-slate-900">
                    {ouvert.objet || "(sans objet)"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    <span className="font-medium text-slate-700">
                      {nomCorrespondant(ouvert.de)}
                    </span>{" "}
                    &lt;{extraireAdresse(ouvert.de)}&gt; → {extraireAdresse(ouvert.a)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {new Date(ouvert.date).toLocaleString("fr-FR", {
                      dateStyle: "long",
                      timeStyle: "short",
                    })}
                    {ouvert.prospectId && prospects[ouvert.prospectId] && (
                      <> · Prospect : {prospects[ouvert.prospectId]}</>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setReponseOuverte(true)
                    setEnvoiOk(false)
                  }}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Reply size={15} /> Répondre
                </button>
              </div>
            </div>

            {/* Corps : HTML affiché dans une iframe isolée (sandbox = aucun script ne
                peut s'exécuter — indispensable pour un email reçu de l'extérieur). */}
            <div className="min-h-0 flex-1">
              {ouvert.corpsHtml ? (
                <iframe
                  title="Contenu du message"
                  sandbox=""
                  srcDoc={ouvert.corpsHtml}
                  className="h-full w-full border-0"
                />
              ) : (
                <pre className="h-full overflow-y-auto whitespace-pre-wrap px-6 py-4 font-sans text-sm text-slate-700">
                  {ouvert.corpsText || "(message vide)"}
                </pre>
              )}
            </div>

            {envoiOk && !reponseOuverte && (
              <div className="border-t border-slate-200 bg-green-50 px-6 py-3 text-sm text-green-700">
                Réponse envoyée ✓
              </div>
            )}

            {reponseOuverte && (
              <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Mail size={15} className="text-slate-400" />
                    Répondre à {adresseCorrespondant(ouvert)} —{" "}
                    <span className="text-slate-500">{objetReponse(ouvert.objet)}</span>
                  </p>
                  <button
                    onClick={() => setReponseOuverte(false)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                  >
                    <X size={15} />
                  </button>
                </div>
                <textarea
                  value={reponseTexte}
                  onChange={(e) => setReponseTexte(e.target.value)}
                  rows={5}
                  autoFocus
                  placeholder="Écris ta réponse… (la signature est ajoutée automatiquement)"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
                {envoiErreur && <p className="mt-1 text-sm text-red-600">{envoiErreur}</p>}
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={envoyerReponse}
                    disabled={envoiEnCours || !reponseTexte.trim()}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {envoiEnCours ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Send size={15} />
                    )}
                    Envoyer
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
