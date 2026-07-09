import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Inbox,
  Loader2,
  MailOpen,
  Paperclip,
  RefreshCw,
  Send,
} from "lucide-react"
import {
  chargerMessages,
  lienPieceJointe,
  marquerLus,
  repondreMessage,
  type Message,
} from "../lib/messagesDb"
import {
  dateCourte,
  grouperEnFils,
  objetReponse,
  type Fil,
} from "../lib/messagesUtils"
import { formatTaille } from "../lib/stockage"
import { supabase } from "../lib/supabase"

type Filtre = "tous" | "nonlus"

// ── Une bulle de message dans le fil ──
function BulleMessage({ m }: { m: Message }) {
  const entrant = m.sens === "entrant"
  const [pjEnCours, setPjEnCours] = useState("")

  async function ouvrirPiece(chemin: string) {
    setPjEnCours(chemin)
    try {
      const url = await lienPieceJointe(chemin)
      window.open(url, "_blank", "noopener")
    } catch (e) {
      alert("Téléchargement impossible : " + (e instanceof Error ? e.message : e))
    } finally {
      setPjEnCours("")
    }
  }

  return (
    <div className={"flex " + (entrant ? "justify-start" : "justify-end")}>
      <div
        className={
          "w-[85%] rounded-xl border px-4 py-3 " +
          (entrant ? "border-slate-200 bg-white" : "border-blue-100 bg-blue-50")
        }
      >
        <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-400">
          {entrant ? (
            <ArrowDownLeft size={13} className="text-emerald-500" />
          ) : (
            <ArrowUpRight size={13} className="text-blue-500" />
          )}
          <span className="font-medium text-slate-500">{entrant ? "Reçu" : "Envoyé"}</span>
          <span>·</span>
          <span>
            {new Date(m.date).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
          </span>
        </div>
        {m.objet && <p className="text-sm font-semibold text-slate-800">{m.objet}</p>}

        {/* Corps : texte si disponible, sinon HTML isolé (sandbox = aucun script). */}
        {m.corpsText ? (
          <pre className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-slate-700">
            {m.corpsText}
          </pre>
        ) : m.corpsHtml ? (
          <iframe
            title="Contenu du message"
            sandbox=""
            srcDoc={m.corpsHtml}
            className="mt-1 h-64 w-full rounded border-0 bg-white"
          />
        ) : (
          <p className="mt-1 text-sm italic text-slate-400">(message vide)</p>
        )}

        {/* Pièces jointes reçues (archivées dans le bucket privé). */}
        {m.piecesJointes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.piecesJointes.map((pj) => (
              <button
                key={pj.chemin}
                onClick={() => ouvrirPiece(pj.chemin)}
                disabled={pjEnCours === pj.chemin}
                className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
              >
                {pjEnCours === pj.chemin ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Paperclip size={12} />
                )}
                {pj.nom}
                {pj.taille > 0 && <span className="text-slate-400">({formatTaille(pj.taille)})</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Messages() {
  const [messages, setMessages] = useState<Message[]>([])
  const [prospects, setProspects] = useState<Record<string, string>>({})
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState("")
  const [filtre, setFiltre] = useState<Filtre>("tous")
  const [filOuvert, setFilOuvert] = useState<string | null>(null)

  // Réponse (en bas du fil)
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

  const fils = useMemo(() => grouperEnFils(messages), [messages])
  const filsVisibles = useMemo(
    () => (filtre === "nonlus" ? fils.filter((f) => f.nonLus > 0) : fils),
    [fils, filtre],
  )
  const ouvert: Fil<Message> | null = useMemo(
    () => fils.find((f) => f.cle === filOuvert) ?? null,
    [fils, filOuvert],
  )

  function ouvrirFil(f: Fil<Message>) {
    setFilOuvert(f.cle)
    setReponseTexte("")
    setEnvoiErreur("")
    setEnvoiOk(false)
    // Ouvrir un fil marque tous ses messages reçus comme lus.
    const aLire = f.messages.filter((m) => m.sens === "entrant" && !m.lu).map((m) => m.id)
    if (aLire.length) {
      setMessages((prev) => prev.map((m) => (aLire.includes(m.id) ? { ...m, lu: true } : m)))
      marquerLus(aLire)
    }
  }

  async function envoyerReponse() {
    if (!ouvert || !reponseTexte.trim()) return
    setEnvoiEnCours(true)
    setEnvoiErreur("")
    try {
      // On répond au dernier message du fil (le fil de discussion est conservé
      // grâce à l'en-tête in_reply_to).
      const dernier = ouvert.dernier
      await repondreMessage({
        to: ouvert.adresse,
        objet: objetReponse(dernier.objet),
        corps: reponseTexte.trim(),
        inReplyTo: dernier.messageId,
        prospectId: ouvert.prospectId,
      })
      setEnvoiOk(true)
      setReponseTexte("")
      charger() // la réponse (journalisée côté serveur) apparaît dans le fil
    } catch (e) {
      setEnvoiErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnvoiEnCours(false)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl gap-4 px-6">
      {/* ── Liste des fils de discussion ── */}
      <div className="flex w-96 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex gap-1">
            {(
              [
                { id: "tous", label: "Toutes les conversations" },
                { id: "nonlus", label: "Non lues" },
              ] as { id: Filtre; label: string }[]
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltre(f.id)}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                  (filtre === f.id ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100")
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
          {!chargement && !erreur && filsVisibles.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
              <Inbox size={28} strokeWidth={1.5} />
              <p className="text-sm">Aucune conversation</p>
            </div>
          )}
          {filsVisibles.map((f) => {
            const actif = f.cle === filOuvert
            const nonLu = f.nonLus > 0
            const entreprise = f.prospectId ? prospects[f.prospectId] : ""
            const aDesPieces = f.messages.some((m) => m.piecesJointes.length > 0)
            return (
              <button
                key={f.cle}
                onClick={() => ouvrirFil(f)}
                className={
                  "block w-full border-b border-slate-100 px-4 py-3 text-left transition-colors " +
                  (actif ? "bg-blue-50" : "hover:bg-slate-50")
                }
              >
                <div className="flex items-center gap-2">
                  <span
                    className={
                      "min-w-0 flex-1 truncate text-sm " +
                      (nonLu ? "font-semibold text-slate-900" : "text-slate-700")
                    }
                  >
                    {f.nom}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{dateCourte(f.dernier.date)}</span>
                  {nonLu && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-semibold text-white">
                      {f.nonLus}
                    </span>
                  )}
                </div>
                <p
                  className={
                    "mt-0.5 flex items-center gap-1.5 truncate text-sm " +
                    (nonLu ? "font-medium text-slate-800" : "text-slate-500")
                  }
                >
                  {aDesPieces && <Paperclip size={12} className="shrink-0 text-slate-400" />}
                  <span className="truncate">{f.dernier.objet || "(sans objet)"}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {entreprise ? entreprise + " · " : ""}
                  {f.messages.length} message{f.messages.length > 1 ? "s" : ""}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Le fil de discussion ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        {!ouvert ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-300">
            <MailOpen size={40} strokeWidth={1.2} />
            <p className="text-sm text-slate-400">Sélectionne une conversation</p>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="truncate text-base font-semibold text-slate-900">{ouvert.nom}</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {ouvert.adresse}
                {ouvert.prospectId && prospects[ouvert.prospectId] && (
                  <> · Prospect : {prospects[ouvert.prospectId]}</>
                )}
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-6 py-4">
              {ouvert.messages.map((m) => (
                <BulleMessage key={m.id} m={m} />
              ))}
            </div>

            {/* Réponse, toujours visible en bas du fil. */}
            <div className="border-t border-slate-200 bg-white px-6 py-4">
              {envoiOk && (
                <p className="mb-2 text-sm text-green-700">Réponse envoyée ✓</p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={reponseTexte}
                  onChange={(e) => setReponseTexte(e.target.value)}
                  rows={3}
                  placeholder={`Répondre à ${ouvert.nom}… (la signature est ajoutée automatiquement)`}
                  className="min-h-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                />
                <button
                  onClick={envoyerReponse}
                  disabled={envoiEnCours || !reponseTexte.trim()}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {envoiEnCours ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Envoyer
                </button>
              </div>
              {envoiErreur && <p className="mt-1 text-sm text-red-600">{envoiErreur}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
