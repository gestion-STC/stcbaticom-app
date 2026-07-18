import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ArrowLeft,
  Forward,
  Inbox,
  Loader2,
  Mail,
  Megaphone,
  Paperclip,
  Reply,
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
  objetTransfert,
  type Fil,
} from "../lib/messagesUtils"
import { formatTaille } from "../lib/stockage"
import { supabase } from "../lib/supabase"

type Onglet = "recus" | "envoyes"
type ModeCompo = "repondre" | "transferer" | null

// Un élément affiché dans la liste : soit un message (reçu/envoyé, avec contenu),
// soit un email de campagne (journalisé sans corps → affiché en en-tête seul).
type Item =
  | { type: "msg"; id: string; date: string; msg: Message }
  | { type: "campagne"; id: string; date: string; env: EmailEnvoye }

// Clé de fil d'un message (identique à grouperEnFils : prospect sinon adresse).
function cleFil(m: Message): string {
  return m.prospectId || adresseCorrespondant(m) || "(inconnu)"
}

// Corps pré-rempli pour un transfert : cite le message d'origine.
function corpsTransfert(m: Message): string {
  const contenu = m.corpsText || "(contenu non textuel — voir le mail d'origine)"
  return (
    "\n\n---------- Message transféré ----------\n" +
    `De : ${m.de}\n` +
    `Date : ${new Date(m.date).toLocaleString("fr-FR")}\n` +
    `Objet : ${m.objet}\n\n` +
    contenu
  )
}

// Avatar rond avec l'initiale de l'expéditeur (couleur stable par initiale ;
// bleu pour nos propres messages sortants).
function Avatar({ nom, sortant }: { nom: string; sortant: boolean }) {
  const initiale = (nom.trim()[0] || "?").toUpperCase()
  const palette = [
    "bg-emerald-500",
    "bg-indigo-500",
    "bg-rose-500",
    "bg-amber-500",
    "bg-sky-500",
    "bg-violet-500",
    "bg-teal-500",
  ]
  const bg = sortant ? "bg-blue-600" : palette[initiale.charCodeAt(0) % palette.length]
  return (
    <span
      className={
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white " +
        bg
      }
    >
      {initiale}
    </span>
  )
}

// ── Un message de la conversation, façon Gmail ──
// En-tête (avatar, expéditeur, destinataires, date) + corps. Replié = une seule
// ligne (aperçu) ; déplié = le message entier + pièces jointes.
function MessageCard({
  m,
  ouvert,
  onToggle,
}: {
  m: Message
  ouvert: boolean
  onToggle: () => void
}) {
  const [pjEnCours, setPjEnCours] = useState("")
  const entrant = m.sens === "entrant"
  const nom = nomCorrespondant(m.de)

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
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-6 py-4 text-left hover:bg-slate-50/60"
      >
        <Avatar nom={nom} sortant={!entrant} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-semibold text-slate-900">
              {nom}
              {!entrant && <span className="font-normal text-slate-400"> (vous)</span>}
            </span>
            <span className="shrink-0 text-xs text-slate-400">
              {new Date(m.date).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>
          {ouvert ? (
            <div className="truncate text-xs text-slate-500">
              {m.de}
              {m.a && <> · À {m.a}</>}
            </div>
          ) : (
            <div className="truncate text-sm text-slate-500">
              {apercuTexte(m.corpsText || m.objet)}
            </div>
          )}
        </div>
      </button>

      {ouvert && (
        <div className="pb-5 pl-[4.5rem] pr-6">
          {m.corpsText ? (
            <pre className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
              {m.corpsText}
            </pre>
          ) : m.corpsHtml ? (
            <iframe
              title="Contenu du message"
              sandbox=""
              srcDoc={m.corpsHtml}
              className="h-96 w-full rounded border border-slate-100 bg-white"
            />
          ) : (
            <p className="text-sm italic text-slate-400">(message vide)</p>
          )}

          {m.piecesJointes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
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
      )}
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
  const [depiles, setDepiles] = useState<string[]>([]) // messages dépliés dans la conversation

  // Zone de composition (répondre / transférer)
  const [mode, setMode] = useState<ModeCompo>(null)
  const [reponseTexte, setReponseTexte] = useState("")
  const [transfertTo, setTransfertTo] = useState("")
  const [transfertCorps, setTransfertCorps] = useState("")
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
      const ids = [
        ...new Set(
          [...liste.map((m) => m.prospectId), ...envois.map((e) => e.prospectId)].filter(Boolean),
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

  function retourListe() {
    setFilOuvert(null)
    setCampagneOuverte(null)
    setMode(null)
    setEnvoiOk(false)
    setEnvoiErreur("")
  }

  function ouvrirMessage(m: Message) {
    setCampagneOuverte(null)
    setFilOuvert(cleFil(m))
    setMode(null)
    setReponseTexte("")
    setTransfertTo("")
    setEnvoiErreur("")
    setEnvoiOk(false)
    const cle = cleFil(m)
    // Déplie le dernier message du fil par défaut (comme Gmail).
    const filMsgs = messages
      .filter((x) => cleFil(x) === cle)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
    const dernier = filMsgs[filMsgs.length - 1]
    setDepiles(dernier ? [dernier.id] : [])
    const aLire = filMsgs.filter((x) => x.sens === "entrant" && !x.lu).map((x) => x.id)
    if (aLire.length) {
      setMessages((prev) => prev.map((x) => (aLire.includes(x.id) ? { ...x, lu: true } : x)))
      marquerLus(aLire)
    }
  }

  function basculerMessage(id: string) {
    setDepiles((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function ouvrirCampagne(env: EmailEnvoye) {
    setFilOuvert(null)
    setMode(null)
    setCampagneOuverte(env)
  }

  function marquerFilNonLu() {
    if (!ouvert) return
    const ids = ouvert.messages.filter((m) => m.sens === "entrant").map((m) => m.id)
    if (!ids.length) return
    setMessages((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, lu: false } : x)))
    marquerNonLus(ids)
    retourListe()
  }

  // Ouvre la zone « Répondre » ou « Transférer » (pré-remplit le transfert).
  function ouvrirCompo(m: ModeCompo) {
    setEnvoiOk(false)
    setEnvoiErreur("")
    if (m === "transferer" && ouvert) {
      setTransfertTo("")
      setTransfertCorps(corpsTransfert(ouvert.dernier))
    }
    setMode(m)
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
      setMode(null)
      charger()
    } catch (e) {
      setEnvoiErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnvoiEnCours(false)
    }
  }

  async function envoyerTransfert() {
    if (!ouvert || !transfertTo.trim() || !transfertCorps.trim()) return
    setEnvoiEnCours(true)
    setEnvoiErreur("")
    try {
      await repondreMessage({
        to: transfertTo.trim(),
        objet: objetTransfert(ouvert.dernier.objet),
        corps: transfertCorps.trim(),
        inReplyTo: null,
        prospectId: null,
      })
      setEnvoiOk(true)
      setTransfertTo("")
      setTransfertCorps("")
      setMode(null)
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

  const enLecture = campagneOuverte !== null || ouvert !== null

  return (
    <div className="flex h-full flex-col gap-3 px-6">
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
                  retourListe()
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

        {!enLecture && (
          <div className="relative min-w-56 flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher (expéditeur, objet, contenu)…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
        )}
        {enLecture && <div className="flex-1" />}

        <button
          onClick={charger}
          title="Actualiser"
          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <RefreshCw size={16} className={chargement ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── Corps : liste PLEIN ÉCRAN, ou mail ouvert PLEIN ÉCRAN ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Vue 1 : email de campagne (en-tête seul) */}
        {campagneOuverte ? (
          <div className="flex flex-1 flex-col overflow-y-auto">
            <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-3">
              <button
                onClick={retourListe}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <ArrowLeft size={16} /> Retour
              </button>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                <Megaphone size={14} /> Email de campagne
              </div>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">
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
          </div>
        ) : ouvert ? (
          /* Vue 2 : conversation PLEIN ÉCRAN */
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-3">
              <button
                onClick={retourListe}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <ArrowLeft size={16} /> Retour
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-slate-900">
                  {ouvert.dernier.objet || "(sans objet)"}
                </h2>
                {ouvert.prospectId && prospects[ouvert.prospectId] && (
                  <p className="truncate text-xs text-slate-500">
                    Prospect : {prospects[ouvert.prospectId]}
                  </p>
                )}
              </div>
              {ouvert.messages.some((m) => m.sens === "entrant") && (
                <button
                  onClick={marquerFilNonLu}
                  title="Marquer comme non lu"
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Mail size={13} /> Non lu
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-white">
              {ouvert.messages.map((m) => (
                <MessageCard
                  key={m.id}
                  m={m}
                  ouvert={depiles.includes(m.id)}
                  onToggle={() => basculerMessage(m.id)}
                />
              ))}
            </div>

            {/* Barre d'actions + zone de composition */}
            <div className="border-t border-slate-200 bg-white px-6 py-4">
              {envoiOk && <p className="mb-2 text-sm text-green-700">Message envoyé ✓</p>}

              {mode === null && (
                <div className="flex gap-2">
                  <button
                    onClick={() => ouvrirCompo("repondre")}
                    className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Reply size={15} /> Répondre
                  </button>
                  <button
                    onClick={() => ouvrirCompo("transferer")}
                    className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Forward size={15} /> Transférer
                  </button>
                </div>
              )}

              {mode === "repondre" && (
                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Reply size={13} /> Réponse à {ouvert.nom}
                  </div>
                  <textarea
                    value={reponseTexte}
                    onChange={(e) => setReponseTexte(e.target.value)}
                    rows={5}
                    autoFocus
                    placeholder="Votre réponse… (la signature est ajoutée automatiquement)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={envoyerReponse}
                      disabled={envoiEnCours || !reponseTexte.trim()}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {envoiEnCours ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Send size={15} />
                      )}
                      Envoyer
                    </button>
                    <button
                      onClick={() => setMode(null)}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {mode === "transferer" && (
                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Forward size={13} /> Transférer
                  </div>
                  <input
                    value={transfertTo}
                    onChange={(e) => setTransfertTo(e.target.value)}
                    autoFocus
                    placeholder="Destinataire (adresse e-mail)…"
                    className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                  <textarea
                    value={transfertCorps}
                    onChange={(e) => setTransfertCorps(e.target.value)}
                    rows={6}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={envoyerTransfert}
                      disabled={envoiEnCours || !transfertTo.trim() || !transfertCorps.trim()}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {envoiEnCours ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Forward size={15} />
                      )}
                      Transférer
                    </button>
                    <button
                      onClick={() => setMode(null)}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {envoiErreur && <p className="mt-2 text-sm text-red-600">{envoiErreur}</p>}
            </div>
          </>
        ) : (
          /* Vue 3 : LISTE plein écran */
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
                    className="flex w-full items-center gap-3 border-b border-l-4 border-l-transparent border-slate-100 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <span className="h-2 w-2 shrink-0" />
                    <span className="w-52 shrink-0 truncate text-sm text-slate-700">À {nom}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="text-slate-700">{e.objet || "(sans objet)"}</span>
                      <span className="text-slate-400">
                        {" "}
                        — Campagne · {e.modeleNom}
                        {e.aRepondu ? " · a répondu" : ""}
                      </span>
                    </span>
                    <Megaphone size={13} className="shrink-0 text-slate-300" />
                    <span className="w-16 shrink-0 text-right text-xs text-slate-400">
                      {dateCourte(it.date)}
                    </span>
                  </button>
                )
              }

              const m = it.msg
              const entrant = m.sens === "entrant"
              const nonLu = entrant && !m.lu
              const nom = nomCorrespondant(entrant ? m.de : m.a)
              return (
                <button
                  key={it.id}
                  onClick={() => ouvrirMessage(m)}
                  className={
                    "flex w-full items-center gap-3 border-b border-l-4 border-slate-100 px-4 py-3 text-left transition-colors " +
                    (nonLu
                      ? "border-l-blue-500 bg-blue-50/60 hover:bg-blue-50"
                      : "border-l-transparent hover:bg-slate-50")
                  }
                >
                  {nonLu ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  ) : (
                    <span className="h-2 w-2 shrink-0" />
                  )}
                  <span
                    className={
                      "w-52 shrink-0 truncate text-sm " +
                      (nonLu ? "font-semibold text-slate-900" : "text-slate-700")
                    }
                  >
                    {entrant ? nom : "À " + nom}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className={nonLu ? "font-semibold text-slate-900" : "text-slate-700"}>
                      {m.objet || "(sans objet)"}
                    </span>
                    {m.corpsText && <span className="text-slate-400"> — {apercuTexte(m.corpsText)}</span>}
                  </span>
                  {m.piecesJointes.length > 0 && (
                    <Paperclip size={13} className="shrink-0 text-slate-400" />
                  )}
                  <span className="w-16 shrink-0 text-right text-xs text-slate-400">
                    {dateCourte(m.date)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
