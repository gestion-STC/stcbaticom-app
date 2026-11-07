// ════════════════════════════════════════════════════════════════════════════
// LA BOÎTE DE RÉCEPTION, façon Gmail (08/10/2026).
//
// Mahdi : « une boîte de réception, ça ne doit pas être différent de Gmail ».
// Donc, comme Gmail : un rail à gauche (Nouveau message, Boîte de réception,
// Non lus, Envoyés, Tous), une recherche en haut, une liste de CONVERSATIONS
// (une ligne = un échange, les non lues en gras sur fond blanc, les lues sur
// fond gris), « 1–50 sur N » à droite ; on clique, la conversation remplace la
// liste (flèche retour, Échap), les anciens messages repliés sur une ligne, le
// dernier déplié, Répondre / Transférer sous le dernier message, et la fenêtre
// « Nouveau message » en bas à droite.
//
// DEUX BOÎTES : la même interface sert au démarchage et au recrutement, mais
// chacune ne voit que les messages de son espace et répond depuis l'adresse
// de son espace. Chaque conversation de démarchage porte le nom de son agence.
// (14/10 : l'ancien dossier « Campagnes », figé depuis le 08/10, est retiré ; son historique reste archivé.)
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Forward,
  Inbox,
  Layers,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  Pencil,
  RefreshCw,
  Reply,
  Search,
  Send,
  Trash2,
  UserRound,
  X,
} from "lucide-react"
import {
  chargerMessages,
  type Espace,
  lienPieceJointe,
  marquerLus,
  marquerNonLus,
  repondreMessage,
  type Message,
} from "../lib/messagesDb"
import { useSession } from "../lib/auth"
import { useSignataires } from "../lib/useSignataires"
import { signatureStc, prenomDe } from "../lib/signatureStc"
import { apercuTexte, dateCourte, nomCorrespondant, objetReponse, objetTransfert } from "../lib/messagesUtils"
import {
  compterNonLues,
  etiquetteDe,
  filtrerConversations,
  grouperEnConversations,
  paginer,
  type Conversation,
  type Dossier,
} from "../lib/conversations"
import { formatTaille } from "../lib/stockage"
import { piecesAEnvoyer, piecesTropLourdes } from "../lib/envoiEmail"
import type { PieceJointe } from "../emails"
import PiecesCompo from "./PiecesCompo"
import { supabase } from "../lib/supabase"
import { Bandeau, Bouton, Champ, Chargement, Pastille, Selecteur, Vide, Zone } from "../ui"
import FicheArtisan from "./recrutement/FicheArtisan"

type Conv = Conversation<Message>
type Vue = Dossier
type Mode = "repondre" | "transferer" | null

const ADRESSE_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

// L'initiale du correspondant dans un rond, teinte stable par initiale ;
// anthracite pour nos propres messages.
const TEINTES = [
  "bg-signature-doux text-signature",
  "bg-info-fond text-info",
  "bg-ok-fond text-ok",
  "bg-attention-fond text-attention",
  "bg-fond-3 text-encre",
]
function Avatar({ nom, sortant }: { nom: string; sortant: boolean }) {
  const initiale = (nom.trim()[0] || "?").toUpperCase()
  const teinte = sortant ? "bg-action text-white" : TEINTES[initiale.charCodeAt(0) % TEINTES.length]
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-legende font-semibold ${teinte}`}>
      {initiale}
    </span>
  )
}

// ── Un message de la conversation ──
// Replié = une ligne (avatar, expéditeur, aperçu, date). Déplié = l'en-tête
// complet (de, à, date) + le corps + les pièces jointes.
function MessageCard({ m, ouvert, onToggle }: { m: Message; ouvert: boolean; onToggle: () => void }) {
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
    <article className="border-b border-fond-4 last:border-b-0">
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 px-10 py-4 text-left hover:bg-fond-2">
        <Avatar nom={nom} sortant={!entrant} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-corps font-semibold text-encre">
              {nom}
              {!entrant && <span className="font-normal text-encre-3"> (moi)</span>}
            </span>
            <span className="shrink-0 text-legende text-encre-3">
              {new Date(m.date).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>
          {ouvert ? (
            <div className="truncate text-legende text-encre-2">
              {m.de}
              {m.a && <> · À {m.a}</>}
            </div>
          ) : (
            <div className="truncate text-corps text-encre-2">{apercuTexte(m.corpsText || m.objet)}</div>
          )}
        </div>
      </button>

      {ouvert && (
        <div className="pb-5 pl-[5.5rem] pr-10">
          {m.corpsText ? (
            <pre className="whitespace-pre-wrap font-sans text-corps leading-relaxed text-encre">{m.corpsText}</pre>
          ) : m.corpsHtml ? (
            <iframe
              title="Contenu du message"
              // allow-same-origin (SANS allow-scripts) : aucun script ne s'exécute,
              // mais on peut mesurer la hauteur du contenu pour tout afficher.
              sandbox="allow-same-origin"
              srcDoc={m.corpsHtml}
              onLoad={(e) => {
                const f = e.currentTarget
                try {
                  const h = f.contentWindow?.document.body?.scrollHeight
                  if (h) f.style.height = h + 24 + "px"
                } catch {
                  /* mesure impossible : on garde la hauteur par défaut */
                }
              }}
              style={{ height: "300px" }}
              className="w-full border-0 bg-fond"
            />
          ) : (
            <p className="text-corps italic text-encre-3">(message vide)</p>
          )}

          {m.piecesJointes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {m.piecesJointes.map((pj) => (
                <Bouton
                  key={pj.chemin}
                  taille="sm"
                  icone={pjEnCours === pj.chemin ? <Loader2 className="animate-spin" /> : <Paperclip />}
                  disabled={pjEnCours === pj.chemin}
                  onClick={() => ouvrirPiece(pj.chemin)}
                >
                  {pj.nom}
                  {pj.taille > 0 && <span className="text-encre-3">({formatTaille(pj.taille)})</span>}
                </Bouton>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

// ── Une ligne de la liste ── une conversation. Non lue : fond blanc, en gras.
// Lue : fond gris doux. Au survol, l'action « lu / non lu » remplace la date.
function LigneConversation({ c, nom, onOuvrir, onBasculerLu }: { c: Conv; nom: string; onOuvrir: () => void; onBasculerLu: () => void }) {
  const nonLu = c.nonLus > 0
  const apercu = apercuTexte(c.dernier.corpsText || "", 110)
  return (
    <div className={`group relative flex items-center border-b border-fond-4 last:border-b-0 ${nonLu ? "bg-fond" : "bg-fond-2"} hover:z-10 hover:shadow-[0_1px_3px_rgba(0,0,0,0.18)]`}>
      <button type="button" onClick={onOuvrir} className="flex h-11 min-w-0 flex-1 items-center gap-3 px-10 text-left">
        <span className={`w-[230px] shrink-0 truncate text-corps ${nonLu ? "font-semibold text-encre" : "text-encre"}`}>
          {c.aRecu ? nom : `À : ${nom}`}
          {c.messages.length > 1 && <span className="chiffres font-normal text-encre-3"> {c.messages.length}</span>}
        </span>
        <span className="min-w-0 flex-1 truncate text-corps">
          <span className={nonLu ? "font-semibold text-encre" : "text-encre"}>{c.objet || "(sans objet)"}</span>
          {apercu && <span className="text-encre-3"> — {apercu}</span>}
        </span>
        {c.piecesJointes > 0 && <Paperclip size={14} className="shrink-0 text-encre-3" />}
        <span className={`w-16 shrink-0 text-right text-legende ${nonLu ? "font-semibold text-encre" : "text-encre-3"} ${c.aRecu ? "group-hover:invisible" : ""}`}>
          {dateCourte(c.dernier.date)}
        </span>
      </button>
      {c.aRecu && (
        <button
          type="button"
          title={nonLu ? "Marquer comme lu" : "Marquer comme non lu"}
          aria-label={nonLu ? "Marquer comme lu" : "Marquer comme non lu"}
          onClick={onBasculerLu}
          className="absolute right-9 top-1/2 hidden -translate-y-1/2 rounded-4 p-1.5 text-encre-2 hover:bg-fond-4 hover:text-encre group-hover:block"
        >
          {nonLu ? <MailOpen size={16} /> : <Mail size={16} />}
        </button>
      )}
    </div>
  )
}

// Un champ de la fenêtre « Nouveau message » : une ligne, un trait dessous, comme Gmail.
function ChampCompo({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <label className="flex h-10 items-center gap-3 border-b border-fond-4 text-corps">
      <span className="w-14 shrink-0 text-encre-2">{libelle}</span>
      {children}
    </label>
  )
}

// Qui signe (19/10/2026) : visible seulement quand le compte a plusieurs noms
// (Paramétrage › Emails › Mes signatures). Le choix vaut pour les réponses,
// les transferts et les nouveaux messages.
function SigneParCompo({ noms, nom, onChange }: { noms: string[]; nom: string; onChange: (n: string) => void }) {
  return (
    <label className="ml-auto flex min-w-0 items-center gap-2 text-legende text-encre-2">
      <span className="shrink-0">Signé par</span>
      <Selecteur value={nom} onChange={(e) => onChange(e.target.value)} aria-label="Signé par" className="w-48">
        {noms.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </Selecteur>
    </label>
  )
}

// `espace` null (07/11/2026) : les deux boîtes ensemble (un administrateur qui choisit « Tout ») ; une
// réponse part alors de la boîte du mail auquel on répond, un nouveau message de celle du démarchage.
export default function Messages({ espace }: { espace: Espace | null }) {
  // Signature STC Bâtiment pour tout ce qui part d'ici : le nom du compte, ou un
  // autre nom réglé dans Paramétrage › Emails › Mes signatures (19/10/2026).
  const session = useSession()
  const { noms: signataires, nom: nomSignataire, choisir: choisirSignataire } = useSignataires(session)
  const signatureHtml = useMemo(() => signatureStc({ nom: nomSignataire }), [nomSignataire])
  const prenomCommercial = prenomDe(nomSignataire)

  const [messages, setMessages] = useState<Message[]>([])
  const [agences, setAgences] = useState<Record<string, string>>({}) // id → nom, pour nommer les conversations
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState("")

  const [vue, setVue] = useState<Vue>("reception")
  const [recherche, setRecherche] = useState("")
  const [pageListe, setPageListe] = useState(1)
  const [cleOuverte, setCleOuverte] = useState<string | null>(null)
  const [depiles, setDepiles] = useState<string[]>([])
  const [fiche, setFiche] = useState<string | null>(null)

  // Composition : réponse / transfert (sous la conversation) ou nouveau message (fenêtre).
  const [mode, setMode] = useState<Mode>(null)
  const [nouveau, setNouveau] = useState(false)
  const [compoTo, setCompoTo] = useState("")
  const [compoObjet, setCompoObjet] = useState("")
  const [compoCorps, setCompoCorps] = useState("")
  const [compoPieces, setCompoPieces] = useState<PieceJointe[]>([])
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [envoiErreur, setEnvoiErreur] = useState("")
  const [envoiOk, setEnvoiOk] = useState("")

  const charger = useCallback(async () => {
    setChargement(true)
    setErreur("")
    try {
      const liste = await chargerMessages(espace ?? undefined)
      setMessages(liste)
      // Le nom de l'agence de chaque conversation (par lots : la liste d'ids peut être longue).
      const ids = [...new Set(liste.map((m) => m.agenceId).filter(Boolean))] as string[]
      if (ids.length && supabase) {
        const map: Record<string, string> = {}
        for (let i = 0; i < ids.length; i += 200) {
          const { data } = await supabase.from("agences").select("id, nom").in("id", ids.slice(i, i + 200))
          for (const a of (data ?? []) as { id: string; nom: string }[]) map[a.id] = a.nom || ""
        }
        setAgences(map)
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setChargement(false)
    }
  }, [espace])

  useEffect(() => {
    const t = setTimeout(charger, 0)
    return () => clearTimeout(t)
  }, [charger])

  const conversations = useMemo(() => grouperEnConversations(messages), [messages])
  const nbNonLues = useMemo(() => compterNonLues(conversations), [conversations])
  const visibles = useMemo(
    () => filtrerConversations(conversations, vue, recherche),
    [conversations, vue, recherche],
  )
  const pagination = useMemo(() => paginer(visibles, pageListe), [visibles, pageListe])
  const ouverte: Conv | null = useMemo(() => conversations.find((c) => c.cle === cleOuverte) ?? null, [conversations, cleOuverte])

  // Le nom qu'on affiche : l'agence si elle est connue, sinon le correspondant.
  const nomDe = useCallback((c: Conv) => (c.agenceId && agences[c.agenceId]) || c.nom, [agences])

  const enLecture = ouverte !== null

  // Échap = retour à la liste, comme Gmail (sauf pendant une saisie).
  useEffect(() => {
    if (!enLecture || nouveau || mode !== null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setCleOuverte(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [enLecture, nouveau, mode])

  function retourListe() {
    setCleOuverte(null)
    setMode(null)
    setEnvoiErreur("")
  }

  function changerVue(v: Vue) {
    setVue(v)
    setPageListe(1)
    retourListe()
  }

  function marquer(ids: string[], lu: boolean) {
    if (!ids.length) return
    setMessages((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, lu } : x)))
    if (lu) marquerLus(ids)
    else marquerNonLus(ids)
  }

  function ouvrirConversation(c: Conv) {
    setCleOuverte(c.cle)
    setMode(null)
    setEnvoiErreur("")
    setEnvoiOk("")
    // Le dernier message est déplié, les autres repliés (comme Gmail).
    setDepiles([c.dernier.id])
    marquer(c.messages.filter((m) => m.sens === "entrant" && !m.lu).map((m) => m.id), true)
  }

  function basculerLu(c: Conv) {
    const ids = c.messages.filter((m) => m.sens === "entrant").map((m) => m.id)
    marquer(ids, c.nonLus > 0)
  }

  function marquerOuverteNonLue() {
    if (!ouvert) return
    marquer(ouvert.messages.filter((m) => m.sens === "entrant").map((m) => m.id), false)
    retourListe()
  }

  function basculerMessage(id: string) {
    setDepiles((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // Ouvre la zone « Répondre » ou « Transférer » sous la conversation.
  function ouvrirCompo(m: Mode) {
    setEnvoiOk("")
    setEnvoiErreur("")
    setCompoTo("")
    setCompoCorps(m === "transferer" && ouverte ? corpsTransfert(ouverte.dernier) : "")
    setCompoPieces([])
    setMode(m)
  }

  function ouvrirNouveau() {
    setEnvoiOk("")
    setEnvoiErreur("")
    setCompoTo("")
    setCompoObjet("")
    setCompoCorps("")
    setCompoPieces([])
    setMode(null)
    setNouveau(true)
  }

  function fermerCompo() {
    setMode(null)
    setNouveau(false)
    setEnvoiErreur("")
  }

  const ouvert = ouverte
  const pretAEnvoyer = !piecesTropLourdes(compoPieces) && (
    nouveau
      ? ADRESSE_VALIDE.test(compoTo.trim()) && compoCorps.trim() !== ""
      : mode === "repondre"
        ? compoCorps.trim() !== ""
        : ADRESSE_VALIDE.test(compoTo.trim()) && compoCorps.trim() !== "")

  async function envoyer() {
    if (!pretAEnvoyer || envoiEnCours) return
    setEnvoiEnCours(true)
    setEnvoiErreur("")
    const pieces = piecesAEnvoyer(compoPieces)
    try {
      if (nouveau) {
        await repondreMessage({ to: compoTo.trim(), objet: compoObjet.trim() || "(sans objet)", corps: compoCorps.trim(), signatureHtml, commercial: prenomCommercial, espace: espace ?? "demarchage", pieces })
        setEnvoiOk(`Message envoyé à ${compoTo.trim()}.`)
      } else if (ouvert && mode === "repondre") {
        const dernier = ouvert.dernier
        await repondreMessage({
          to: ouvert.adresse,
          objet: objetReponse(dernier.objet),
          corps: compoCorps.trim(),
          inReplyTo: dernier.messageId,
          agenceId: ouvert.agenceId,
          signatureHtml,
          commercial: prenomCommercial,
          espace: ouvert.dernier.espace,
          pieces,
        })
        setEnvoiOk(`Réponse envoyée à ${nomDe(ouvert)}.`)
      } else if (ouvert && mode === "transferer") {
        await repondreMessage({
          to: compoTo.trim(),
          objet: objetTransfert(ouvert.dernier.objet),
          corps: compoCorps.trim(),
          inReplyTo: null,
          agenceId: null,
          signatureHtml,
          commercial: prenomCommercial,
          espace: ouvert.dernier.espace,
          pieces,
        })
        setEnvoiOk(`Message transféré à ${compoTo.trim()}.`)
      }
      setCompoCorps("")
      setCompoTo("")
      setCompoObjet("")
      setCompoPieces([])
      fermerCompo()
      charger()
    } catch (e) {
      setEnvoiErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnvoiEnCours(false)
    }
  }

  const dossiers: { id: Vue; label: string; icone: typeof Inbox; badge?: number }[] = [
    { id: "reception", label: "Boîte de réception", icone: Inbox, badge: nbNonLues },
    { id: "nonlus", label: "Non lus", icone: MailOpen },
    { id: "envoyes", label: "Envoyés", icone: Send },
    { id: "tous", label: "Tous les messages", icone: Layers },
  ]
  const libelleVue = dossiers.find((d) => d.id === vue)?.label ?? ""
  const pages = pagination

  return (
    <div className="page">
      {/* ── La barre du haut, comme Gmail (Mahdi, 06/11/2026) : « Nouveau message », les dossiers
          (réception, non lus, envoyés, tous) et la recherche. La liste et le message prennent
          toute la largeur de la page : plus de colonne à gauche. Mail ouvert : cette barre disparaît,
          celle du mail prend sa place (Mahdi, 06/11/2026). ── */}
      {!enLecture && (
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Bouton variante="plein" icone={<Pencil />} onClick={ouvrirNouveau}>
          Nouveau message
        </Bouton>
        <nav className="flex flex-wrap items-center gap-1" aria-label="Dossiers">
          {dossiers.map((d) => {
            const Icone = d.icone
            const actif = vue === d.id
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => changerVue(d.id)}
                aria-current={actif ? "page" : undefined}
                className={`flex h-[30px] items-center gap-2 rounded-full px-3 text-legende transition-colors ${actif ? "bg-fond-4 font-medium text-encre" : "text-encre-2 hover:bg-fond-3 hover:text-encre"}`}
              >
                <Icone size={14} className="shrink-0" />
                <span className="whitespace-nowrap">{d.label}</span>
                {d.badge ? <span className="chiffres rounded-full bg-encre px-1.5 text-[10px] font-medium leading-4 text-white">{d.badge}</span> : null}
              </button>
            )
          })}
        </nav>
        {!enLecture && (
          <div className="relative ml-auto w-full min-w-[220px] sm:w-[360px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-encre-3" />
            <Champ
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value)
                setPageListe(1)
              }}
              placeholder="Rechercher dans les messages"
              aria-label="Rechercher dans les messages"
              className="pl-9"
            />
          </div>
        )}
      </div>
      )}

      {/* ── La liste ou la conversation, sur toute la largeur ── */}
      <section className="min-w-0">
        {envoiOk && !enLecture && (
          <Bandeau role="ok" className="mb-4" action={<Bouton variante="discret" taille="sm" onClick={() => setEnvoiOk("")}>Fermer</Bouton>}>
            {envoiOk}
          </Bandeau>
        )}

        {/* Pleine page (Mahdi, 06/11/2026 : « la ligne du mail prend toute la page ») : plus de cadre,
            les lignes vont d'un bord à l'autre ; leur texte reste aligné sur la barre du haut (40 px). */}
        <div className={`-mx-10 border-t-[0.5px] border-trait ${enLecture ? "-mb-10 -mt-7 border-t-0" : ""}`}>
          {ouvert ? (
            /* ── Une conversation ── */
            <>
              {/* La barre du mail reste en haut pendant qu'on fait défiler le mail, comme dans Gmail. */}
              <div className="sticky top-0 z-20 flex h-12 items-center gap-1 border-b border-trait bg-fond px-8">
                <Bouton variante="discret" taille="icone" onClick={retourListe} aria-label="Retour à la liste" title="Retour (Échap)">
                  <ArrowLeft />
                </Bouton>
                {ouvert.aRecu && (
                  <Bouton variante="discret" taille="sm" icone={<Mail />} onClick={marquerOuverteNonLue}>
                    Marquer comme non lu
                  </Bouton>
                )}
                {ouvert.sousTraitantId && (
                  <Bouton variante="discret" taille="sm" icone={<UserRound />} onClick={() => setFiche(ouvert.sousTraitantId)}>
                    Ouvrir la fiche
                  </Bouton>
                )}
                <Bouton variante="discret" taille="sm" icone={<Forward />} onClick={() => ouvrirCompo("transferer")}>
                  Transférer
                </Bouton>
              </div>

              <div className="px-10 pb-2 pt-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-balance text-section font-semibold text-encre">{ouvert.objet || "(sans objet)"}</h2>
                  <Pastille role="inerte">{etiquetteDe(ouvert)}</Pastille>
                </div>
                <p className="mt-1 text-legende text-encre-2">
                  {nomDe(ouvert)}
                  {ouvert.adresse.includes("@") && nomDe(ouvert) !== ouvert.adresse && <> · {ouvert.adresse}</>}
                  {" · "}
                  <span className="chiffres">{ouvert.messages.length}</span> {ouvert.messages.length > 1 ? "messages" : "message"}
                </p>
              </div>

              <div>
                {ouvert.messages.map((m) => (
                  <MessageCard key={m.id} m={m} ouvert={depiles.includes(m.id)} onToggle={() => basculerMessage(m.id)} />
                ))}
              </div>

              {/* Répondre / Transférer : toujours en bas de l'écran, le mail défile au-dessus (comme Gmail). */}
              <div className="sticky bottom-0 z-20 max-h-[60vh] overflow-y-auto border-t border-trait bg-fond px-10 py-4">
                {mode === null ? (
                  <div className="flex gap-2">
                    <Bouton icone={<Reply />} onClick={() => ouvrirCompo("repondre")}>
                      Répondre
                    </Bouton>
                    <Bouton icone={<Forward />} onClick={() => ouvrirCompo("transferer")}>
                      Transférer
                    </Bouton>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <Avatar nom={nomSignataire || "S"} sortant />
                    <div className="min-w-0 flex-1 rounded-6 border border-trait bg-fond shadow-posee">
                      <div className="flex items-center gap-2 border-b border-fond-4 px-4 text-legende text-encre-2">
                        {mode === "repondre" ? (
                          <span className="flex h-10 items-center gap-2">
                            <Reply size={14} /> Répondre à {nomDe(ouvert)}
                            {ouvert.adresse.includes("@") && <span className="text-encre-3">· {ouvert.adresse}</span>}
                          </span>
                        ) : (
                          <ChampCompo libelle="À">
                            <input
                              value={compoTo}
                              onChange={(e) => setCompoTo(e.target.value)}
                              autoFocus
                              placeholder="Adresse e-mail du destinataire"
                              aria-label="Destinataire"
                              className="h-full w-full bg-transparent text-encre outline-none placeholder:text-encre-3"
                            />
                          </ChampCompo>
                        )}
                      </div>
                      <Zone
                        value={compoCorps}
                        onChange={(e) => setCompoCorps(e.target.value)}
                        rows={mode === "repondre" ? 6 : 9}
                        autoFocus={mode === "repondre"}
                        placeholder="Votre message… (la signature est ajoutée automatiquement)"
                        aria-label="Message"
                        className="rounded-none border-0 shadow-none focus:ring-0"
                      />
                      <PiecesCompo pieces={compoPieces} onChange={setCompoPieces} />
                      <div className="flex items-center gap-2 px-3 py-3">
                        <Bouton variante="plein" icone={<Send />} chargement={envoiEnCours} disabled={!pretAEnvoyer} onClick={envoyer}>
                          Envoyer
                        </Bouton>
                        <Bouton variante="discret" taille="icone" onClick={fermerCompo} aria-label="Abandonner" title="Abandonner">
                          <Trash2 />
                        </Bouton>
                        {envoiErreur && <span className="text-legende text-alerte">{envoiErreur}</span>}
                        {signataires.length > 1 ? <SigneParCompo noms={signataires} nom={nomSignataire} onChange={choisirSignataire} /> : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── La liste ── */
            <>
              <div className="flex h-12 items-center justify-between border-b border-trait px-8">
                <div className="flex items-center gap-2">
                  <Bouton variante="discret" taille="icone" onClick={charger} aria-label="Actualiser" title="Actualiser">
                    <RefreshCw className={chargement ? "animate-spin" : ""} />
                  </Bouton>
                  <span className="text-legende text-encre-2">{libelleVue}</span>
                </div>
                <div className="flex items-center gap-1 text-legende text-encre-2">
                  <span className="chiffres">
                    {pages.debut}–{pages.fin} sur {pages.total}
                  </span>
                  <Bouton variante="discret" taille="icone" disabled={pages.page <= 1} onClick={() => setPageListe(pages.page - 1)} aria-label="Page précédente">
                    <ChevronLeft />
                  </Bouton>
                  <Bouton variante="discret" taille="icone" disabled={pages.page >= pages.pages} onClick={() => setPageListe(pages.page + 1)} aria-label="Page suivante">
                    <ChevronRight />
                  </Bouton>
                </div>
              </div>

              {erreur && (
                <div className="px-10 py-4">
                  <Bandeau role="alerte">{erreur}</Bandeau>
                </div>
              )}
              {chargement && messages.length === 0 && !erreur && <Chargement texte="Lecture des messages…" />}
              {!chargement && !erreur && pages.total === 0 && (
                <Vide
                  titre={recherche.trim() ? "Aucun résultat" : vue === "envoyes" ? "Aucun message envoyé" : vue === "nonlus" ? "Tout est lu" : "Aucun message"}
                  texte={recherche.trim() ? "Essayez un autre mot : nom, adresse, objet ou contenu." : undefined}
                />
              )}

              {pagination.tranche.map((c) => (
                    <LigneConversation key={c.cle} c={c} nom={nomDe(c)} onOuvrir={() => ouvrirConversation(c)} onBasculerLu={() => basculerLu(c)} />
                  ))}
            </>
          )}
        </div>
      </section>

      {/* ── La fenêtre « Nouveau message », en bas à droite, comme Gmail ── */}
      {nouveau && (
        <div className="fixed bottom-0 right-8 z-40 flex w-[560px] max-w-[calc(100vw-4rem)] flex-col rounded-t-6 border border-trait bg-fond shadow-flottante" role="dialog" aria-label="Nouveau message">
          <div className="flex h-10 items-center justify-between rounded-t-6 bg-action px-4 text-legende font-semibold text-white">
            Nouveau message
            <button type="button" onClick={fermerCompo} aria-label="Fermer" className="rounded-4 p-1 hover:bg-white/15">
              <X size={16} />
            </button>
          </div>
          <div className="px-4">
            <ChampCompo libelle="À">
              <input
                value={compoTo}
                onChange={(e) => setCompoTo(e.target.value)}
                autoFocus
                placeholder="Adresse e-mail"
                aria-label="Destinataire"
                className="h-full w-full bg-transparent text-encre outline-none placeholder:text-encre-3"
              />
            </ChampCompo>
            <ChampCompo libelle="Objet">
              <input
                value={compoObjet}
                onChange={(e) => setCompoObjet(e.target.value)}
                placeholder="Objet"
                aria-label="Objet"
                className="h-full w-full bg-transparent text-encre outline-none placeholder:text-encre-3"
              />
            </ChampCompo>
            <textarea
              value={compoCorps}
              onChange={(e) => setCompoCorps(e.target.value)}
              placeholder="Votre message… (la signature est ajoutée automatiquement)"
              aria-label="Message"
              className="h-64 w-full resize-none bg-transparent py-3 text-corps leading-5 text-encre outline-none placeholder:text-encre-3"
            />
          </div>
          <PiecesCompo pieces={compoPieces} onChange={setCompoPieces} />
          <div className="flex items-center gap-2 border-t border-fond-4 px-4 py-3">
            <Bouton variante="plein" icone={<Send />} chargement={envoiEnCours} disabled={!pretAEnvoyer} onClick={envoyer}>
              Envoyer
            </Bouton>
            <Bouton variante="discret" taille="icone" onClick={fermerCompo} aria-label="Abandonner" title="Abandonner">
              <Trash2 />
            </Bouton>
            {envoiErreur && <span className="min-w-0 truncate text-legende text-alerte">{envoiErreur}</span>}
            {signataires.length > 1 ? <SigneParCompo noms={signataires} nom={nomSignataire} onChange={choisirSignataire} /> : null}
          </div>
        </div>
      )}

      {fiche && <FicheArtisan id={fiche} onFermer={() => setFiche(null)} onChange={charger} />}
    </div>
  )
}
