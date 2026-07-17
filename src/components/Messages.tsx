import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Megaphone,
  Paperclip,
  RefreshCw,
  Search,
  Send,
} from "lucide-react"
import {
  chargerMessages,
  lienPieceJointe,
  marquerLus,
  marquerNonLus,
  repondreMessage,
  type Message,
} from "../lib/messagesDb"
import { chargerEmailsEnvoyes, type EmailEnvoye } from "../lib/emailsEnvoyesDb"
import {
  adresseCorrespondant,
  apercuTexte,
  dateCourte,
  grouperEnFils,
  nomCorrespondant,
  objetReponse,
  type Fil,
} from "../lib/messagesUtils"
import { formatTaille } from "../lib/stockage"
import { supabase } from "../lib/supabase"

type Onglet = "recus" | "envoyes"

// Un élément affiché dans la liste : soit un message (reçu/envoyé, avec contenu),
// soit un email de campagne (journalisé sans corps → affiché en en-tête seul).
type Item =
  | { type: "msg"; id: string; date: string; msg: Message }
  | { type: "campagne"; id: string; date: string; env: EmailEnvoye }

// Clé de fil d'un message (identique à grouperEnFils : prospect sinon adresse).
function cleFil(m: Message): string {
  return m.prospectId || adresseCorrespondant(m) || "(inconnu)"
}

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
  const [campagnes, setCampagnes] = useState<EmailEnvoye[]>([])
  const [prospects, setProspects] = useState<Record<string, string>>({})
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState("")

  const [onglet, setOnglet] = useState<Onglet>("recus")
  const [recherche, setRecherche] = useState("")
  const [filOuvert, setFilOuvert] = useState<string | null>(null)
  const [campagneOuverte, setCampagneOuverte] = useState<EmailEnvoye | null>(null)

  // Réponse (en bas du fil)
  const [reponseTexte, setReponseTexte] = useState("")
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [envoiErreur, setEnvoiErreur] = useState("")
  const [envoiOk, setEnvoiOk] = useState(false)

  const charger = useCallback(async () => {
    setChargement(true)
    setErreur("")
    try {
      const [liste, envois] = await Promise.all([
        chargerMessages(),
        chargerEmailsEnvoyes().catch(() => [] as EmailEnvoye[]),
      ])
      setMessages(liste)
      setCampagnes(envois)
      // Noms de prospects : à partir des messages ET des campagnes.
      const ids = [
        ...new Set(
          [
            ...liste.map((m) => m.prospectId),
            ...envois.map((e) => e.prospectId),
          ].filter(Boolean),
        ),
      ] as string[]
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
  const nbNonLus = useMemo(
    () => messages.filter((m) => m.sens === "entrant" && !m.lu).length,
    [messages],
  )

  // Éléments de la liste selon l'onglet, triés du plus récent au plus ancien.
  const items = useMemo<Item[]>(() => {
    if (onglet === "recus") {
      return messages
        .filter((m) => m.sens === "entrant")
        .map((m) => ({ type: "msg", id: m.id, date: m.date, msg: m }))
    }
    const envoyes: Item[] = messages
      .filter((m) => m.sens === "sortant")
      .map((m) => ({ type: "msg", id: m.id, date: m.date, msg: m }))
    const camp: Item[] = campagnes.map((e) => ({
      type: "campagne",
      id: "c-" + e.id,
      date: e.envoyeLe ?? "",
      env: e,
    }))
    return [...envoyes, ...camp].sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [messages, campagnes, onglet])

  const itemsVisibles = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (!q) return items
    const contient = (...vals: (string | null | undefined)[]) =>
      vals.some((v) => (v || "").toLowerCase().includes(q))
    return items.filter((it) =>
      it.type === "msg"
        ? contient(
            nomCorrespondant(it.msg.sens === "entrant" ? it.msg.de : it.msg.a),
            it.msg.de,
            it.msg.a,
            it.msg.objet,
            it.msg.corpsText,
          )
        : contient(prospects[it.env.prospectId], it.env.objet, it.env.modeleNom),
    )
  }, [items, recherche, prospects])

  const ouvert: Fil<Message> | null = useMemo(
    () => fils.find((f) => f.cle === filOuvert) ?? null,
    [fils, filOuvert],
  )

  function ouvrirMessage(m: Message) {
    setCampagneOuverte(null)
    setFilOuvert(cleFil(m))
    setReponseTexte("")
    setEnvoiErreur("")
    setEnvoiOk(false)
    // Ouvrir marque comme lus tous les messages reçus du fil.
    const cle = cleFil(m)
    const aLire = messages
      .filter((x) => x.sens === "entrant" && !x.lu && cleFil(x) === cle)
      .map((x) => x.id)
    if (aLire.length) {
      setMessages((prev) => prev.map((x) => (aLire.includes(x.id) ? { ...x, lu: true } : x)))
      marquerLus(aLire)
    }
  }

  function ouvrirCampagne(env: EmailEnvoye) {
    setFilOuvert(null)
    setCampagneOuverte(env)
  }

  // Repasse en « non lu » les messages reçus du fil ouvert.
  function marquerFilNonLu() {
    if (!ouvert) return
    const ids = ouvert.messages.filter((m) => m.sens === "entrant").map((m) => m.id)
    if (!ids.length) return
    setMessages((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, lu: false } : x)))
    marquerNonLus(ids)
    setFilOuvert(null) // on referme, comme Gmail (le mail redevient « en gras » dans la liste)
  }

  async function envoyerReponse() {
    if (!ouvert || !reponseTexte.trim()) return
    setEnvoiEnCours(true)
    setEnvoiErreur("")
    try {
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
      charger()
    } catch (e) {
      setEnvoiErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnvoiEnCours(false)
    }
  }

  const onglets: { id: Onglet; label: string; icon: typeof Inbox; badge?: number }[] = [
    { id: "recus", label: "Boîte de réception", icon: Inbox, badge: nbNonLus },
    { id: "envoyes", label: "Envoyés", icon: Send },
  ]

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-3 px-6">
      {/* ── Barre d'outils : onglets + recherche + actualiser ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {onglets.map((o) => {
            const Icon = o.icon
            const actif = onglet === o.id
            return (
              <button
                key={o.id}
                onClick={() => {
                  setOnglet(o.id)
                  setFilOuvert(null)
                  setCampagneOuverte(null)
                }}
                className={
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors " +
                  (actif ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100")
                }
              >
                <Icon size={16} />
                {o.label}
                {o.badge ? (
                  <span
                    className={
                      "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold " +
                      (actif ? "bg-white/25 text-white" : "bg-blue-500 text-white")
                    }
                  >
                    {o.badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="relative min-w-56 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher (expéditeur, objet, contenu)…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <button
          onClick={charger}
          title="Actualiser"
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <RefreshCw size={16} className={chargement ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── Corps : liste + volet de lecture ── */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Liste des mails */}
        <div className="flex w-96 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {chargement && messages.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
                <Loader2 size={16} className="animate-spin" /> Chargement…
              </div>
            )}
            {erreur && <p className="px-4 py-6 text-sm text-red-600">{erreur}</p>}
            {!chargement && !erreur && itemsVisibles.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
                <Inbox size={28} strokeWidth={1.5} />
                <p className="text-sm">
                  {recherche.trim()
                    ? "Aucun résultat"
                    : onglet === "recus"
                      ? "Aucun mail reçu"
                      : "Aucun mail envoyé"}
                </p>
              </div>
            )}

            {itemsVisibles.map((it) => {
              if (it.type === "campagne") {
                const e = it.env
                const nom = prospects[e.prospectId] || "Prospect"
                return (
                  <button
                    key={it.id}
                    onClick={() => ouvrirCampagne(e)}
                    className={
                      "block w-full border-b border-slate-100 px-4 py-3 text-left transition-colors " +
                      (campagneOuverte?.id === e.id ? "bg-blue-50" : "hover:bg-slate-50")
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                        À {nom}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{dateCourte(it.date)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {e.objet || "(sans objet)"}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-400">
                      <Megaphone size={12} className="shrink-0" />
                      Campagne · {e.modeleNom}
                      {e.aRepondu && <span className="text-emerald-600">· a répondu</span>}
                    </p>
                  </button>
                )
              }

              const m = it.msg
              const entrant = m.sens === "entrant"
              const nonLu = entrant && !m.lu
              const nom = nomCorrespondant(entrant ? m.de : m.a)
              const actif = filOuvert === cleFil(m)
              return (
                <button
                  key={it.id}
                  onClick={() => ouvrirMessage(m)}
                  className={
                    "block w-full border-b border-slate-100 px-4 py-3 text-left transition-colors " +
                    (actif ? "bg-blue-50" : "hover:bg-slate-50")
                  }
                >
                  <div className="flex items-center gap-2">
                    {nonLu && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                    <span
                      className={
                        "min-w-0 flex-1 truncate text-sm " +
                        (nonLu ? "font-semibold text-slate-900" : "text-slate-700")
                      }
                    >
                      {entrant ? nom : "À " + nom}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{dateCourte(m.date)}</span>
                  </div>
                  <p
                    className={
                      "mt-0.5 flex items-center gap-1.5 truncate text-sm " +
                      (nonLu ? "font-medium text-slate-800" : "text-slate-600")
                    }
                  >
                    {m.piecesJointes.length > 0 && (
                      <Paperclip size={12} className="shrink-0 text-slate-400" />
                    )}
                    <span className="truncate">{m.objet || "(sans objet)"}</span>
                  </p>
                  {m.corpsText && (
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {apercuTexte(m.corpsText)}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Volet de lecture */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
          {campagneOuverte ? (
            <div className="flex flex-1 flex-col overflow-y-auto px-6 py-5">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                <Megaphone size={14} /> Email de campagne
              </div>
              <h2 className="mt-2 text-base font-semibold text-slate-900">
                {campagneOuverte.objet || "(sans objet)"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                À {prospects[campagneOuverte.prospectId] || "prospect"} · Modèle «{" "}
                {campagneOuverte.modeleNom} »
                {campagneOuverte.envoyeLe && (
                  <>
                    {" "}
                    ·{" "}
                    {new Date(campagneOuverte.envoyeLe).toLocaleString("fr-FR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </>
                )}
              </p>
              {campagneOuverte.aRepondu && (
                <p className="mt-2 text-sm font-medium text-emerald-600">Le prospect a répondu ✓</p>
              )}
              <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                Le contenu de cet email de campagne n'a pas été archivé — seul l'en-tête est
                conservé (objet, modèle, date).
              </div>
            </div>
          ) : !ouvert ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-300">
              <MailOpen size={40} strokeWidth={1.2} />
              <p className="text-sm text-slate-400">Sélectionne un message</p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-slate-900">{ouvert.nom}</h2>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {ouvert.adresse}
                    {ouvert.prospectId && prospects[ouvert.prospectId] && (
                      <> · Prospect : {prospects[ouvert.prospectId]}</>
                    )}
                  </p>
                </div>
                {ouvert.messages.some((m) => m.sens === "entrant") && (
                  <button
                    onClick={marquerFilNonLu}
                    title="Marquer comme non lu"
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Mail size={13} /> Marquer non lu
                  </button>
                )}
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-6 py-4">
                {ouvert.messages.map((m) => (
                  <BulleMessage key={m.id} m={m} />
                ))}
              </div>

              {/* Réponse, toujours visible en bas du fil. */}
              <div className="border-t border-slate-200 bg-white px-6 py-4">
                {envoiOk && <p className="mb-2 text-sm text-green-700">Réponse envoyée ✓</p>}
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
    </div>
  )
}
