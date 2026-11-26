// ════════════════════════════════════════════════════════════════════════════
// LA BOÎTE DE RÉCEPTION, dessinée comme celle de STC Bâtiment (11/11/2026).
//
// Mahdi : « tu me fais un copier-coller de ce qui existe sur STC Bâtiment, je veux exactement la même
// chose — vu que c'est le même logiciel, il faut que les interfaces soient les mêmes ».
// Donc, comme STC (src/pages/admin/AdminOrdresServicePage.tsx et OSMessagesTabV2.tsx) : le titre
// « Boîte de réception », le comptage, UNE pilule noire « Nouveau message » ; une recherche et les
// filtres du quotidien en pilules (Non lus, Envoyés), le reste dans le « ⋯ » ; la liste pleine largeur
// en rangées fines (Contact, Source, Objet, Date), les non-lus sur fond bleu très léger. On clique, la
// conversation remplace la liste (flèche retour, Échap) : la barre du haut, le bandeau gris des
// décisions (lead / dead, bon contact cité, absent), puis le fil façon client mail (rond « STC » noir
// pour nos envois), Répondre / Transférer collés en bas, et le « Nouveau message » flottant en bas à droite.
//
// DEUX BOÎTES : la même interface sert au démarchage et au recrutement, mais
// chacune ne voit que les messages de son espace et répond depuis l'adresse
// de son espace. Chaque conversation de démarchage porte le nom de son agence.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowLeft, ChevronLeft, ChevronRight, Forward, Loader2, Mail, RefreshCw, Reply, Search, Send, Trash2, X } from "lucide-react"
import { chargerLies, clesDe, deciderReponse, fusionner, piecesPourTransfert, rechercherMessages, TRANCHE_RECENTS } from "../lib/messagesDb"
import { creerContact } from "../demarchage/db"
import {
  chargerBoite,
  type Espace,
  marquerLus,
  marquerNonLus,
  repondreMessage,
  repondreParInstantly,
  type Message,
} from "../lib/messagesDb"
import { useSession } from "../lib/auth"
import { estAdmin, listerComptes } from "../lib/comptes"
import { TOUS, compteDuChoix, filtrerParPersonne, type Personne } from "../lib/filtrePersonne"
import FiltrePersonne from "./boite/FiltrePersonne"
import { useSignataires } from "../lib/useSignataires"
import { signatureStc, prenomDe } from "../lib/signatureStc"
import { destinatairesReponse, filDeReponse, messageATransferer, objetReponse, objetTransfert } from "../lib/messagesUtils"
import { adressesInvalides, decouperAdresses, joindreAdresses } from "../lib/adressesEmail"
import {
  compterNonLues,
  etiquetteDe,
  filtrerConversations,
  grouperEnConversations,
  paginer,
  type Conversation,
  type Dossier,
  messageDeProspection,
  messageLinkedIn,
} from "../lib/conversations"
import { repondreLinkedIn } from "../lib/linkedinDb"
import { piecesAEnvoyer, piecesTropLourdes } from "../lib/envoiEmail"
import type { PieceJointe } from "../emails"
import PiecesCompo from "./PiecesCompo"
import { supabase } from "../lib/supabase"
import FicheArtisan from "./recrutement/FicheArtisan"
import { OUTIL, PETITE, PILULE_CLAIRE, PILULE_NOIRE, SOUS_TITRE, TITRE_PAGE, bascule } from "./agenda/dessinBureau"
import { ElementMenu, MenuPoints, SeparateurMenu } from "./boite/MenuPoints"
import LigneBoite, { EnTeteColonnes } from "./boite/LigneBoite"
import MessageDuFil from "./boite/MessageDuFil"
import { etiquetteTri, interessesSansAgence } from "./boite/outils"

type Conv = Conversation<Message>
type Vue = Dossier
type Mode = "repondre" | "transferer" | null

// Le bandeau gris de STC, au-dessus du fil.
const BANDEAU = "mt-3 flex flex-wrap items-center gap-3 rounded-[10px] bg-[#F6F6F7] px-3.5 py-2.5"
// Une ligne « À / Objet » du composeur, soulignée d'un filet (STC).
const LIGNE_COMPO = "flex min-h-[38px] items-center gap-2.5 border-b-[0.5px] border-[#E6E6EA]"

// Un brouillon de réponse ou de transfert, gardé tant qu'on ne l'envoie ni ne l'annule (26/11/2026 : « Retour »
// puis « Répondre » effaçait ce qu'on avait écrit). En mémoire seulement, par conversation.
type Brouillon = { mode: Exclude<Mode, null>; cible: string | null; to: string; cc: string; cci: string; copies: boolean; corps: string; pieces: PieceJointe[] }

// Une liste d'adresses saisie : valide si elle en contient au moins une (À) et aucune fausse.
function adressesOk(texte: string, obligatoire: boolean): boolean {
  const l = decouperAdresses(texte)
  return (!obligatoire || l.length > 0) && adressesInvalides(l).length === 0
}

function LigneCompo({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <label className={LIGNE_COMPO}>
      <span className="w-12 shrink-0 text-[#8E8E93]">{libelle}</span>
      {children}
    </label>
  )
}

// Qui signe (19/10/2026) : visible seulement quand le compte a plusieurs noms
// (Paramétrage › Emails › Mes signatures). Le choix vaut pour les réponses,
// les transferts et les nouveaux messages. Dessiné comme le sélecteur gris de STC.
function SigneParCompo({ noms, nom, onChange }: { noms: string[]; nom: string; onChange: (n: string) => void }) {
  return (
    <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-[#8E8E93]">
      <span className="shrink-0">Signé par</span>
      <select value={nom} onChange={(e) => onChange(e.target.value)} aria-label="Signé par"
        className="h-[26px] w-44 min-w-0 rounded-full border-0 bg-[#F2F2F4] px-2.5 text-[11px] text-[#111113] outline-none">
        {noms.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  )
}

// `espace` null (07/11/2026) : les deux boîtes ensemble (un administrateur qui choisit « Tout ») ; une
// réponse part alors de la boîte du mail auquel on répond, un nouveau message de celle du démarchage.
export default function Messages({ espace }: { espace: Espace | null }) {
  // Signature STC Bâtiment pour tout ce qui part d'ici : le nom du compte, ou un
  // autre nom réglé dans Paramétrage › Emails › Mes signatures (19/10/2026).
  const session = useSession()
  // Au démarchage, la signature porte l'adresse dédiée du compte (11/11/2026) ; le recrutement garde l'adresse commune.
  const { noms: signataires, nom: nomSignataire, choisir: choisirSignataire, adresse: adresseDediee } = useSignataires(session)
  const signatureHtml = useMemo(() => signatureStc({ nom: nomSignataire, email: adresseDediee ?? undefined }), [nomSignataire, adresseDediee])
  const signatureCommune = useMemo(() => signatureStc({ nom: nomSignataire }), [nomSignataire])
  const signaturePour = (e: Espace) => (e === "demarchage" ? signatureHtml : signatureCommune)

  // « Mails de : Moi · Tout le monde · un commercial » (11/11/2026, comme STC Bâtiment) : pour un administrateur,
  // au démarchage. Un commercial n'en a pas besoin : la base ne lui montre que ses mails.
  const admin = estAdmin(session)
  const moi = session?.user?.id ?? ""
  const [choixPersonne, setChoixPersonne] = useState<string>(TOUS)
  const [personnes, setPersonnes] = useState<Personne[]>([])
  useEffect(() => {
    if (!admin || espace === "recrutement") return
    listerComptes().then((l) => setPersonnes(l.filter((c) => c.id !== moi).map((c) => ({ id: c.id, nom: c.nom || c.email })))).catch(() => undefined)
  }, [admin, espace, moi])
  const prenomCommercial = prenomDe(nomSignataire)

  const [messages, setMessages] = useState<Message[]>([])
  // Les envois les plus récents lus (Envoyés, Tous) ; « Plus anciens » en lit davantage. Réception est toujours complète.
  const [nbRecents, setNbRecents] = useState(TRANCHE_RECENTS)
  const [encore, setEncore] = useState(false)
  const [version, setVersion] = useState(0)
  // Les messages trouvés par la recherche du serveur, dans toute la boîte.
  const [trouves, setTrouves] = useState<ReadonlySet<string>>(new Set())
  const [rechercheEnCours, setRechercheEnCours] = useState(false)
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
  const [compoCc, setCompoCc] = useState("")
  const [compoCci, setCompoCci] = useState("")
  const [copiesOuvertes, setCopiesOuvertes] = useState(false)
  // Le message auquel on répond, ou qu'on transfère (celui sur lequel on a cliqué) ; null = le choix par défaut.
  const [cibleId, setCibleId] = useState<string | null>(null)
  const [brouillons, setBrouillons] = useState<Record<string, Brouillon>>({})
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
      const { messages: liste, encore: plus } = await chargerBoite(espace ?? undefined, nbRecents)
      setMessages(liste)
      setEncore(plus)
      setVersion((v) => v + 1)
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
  }, [espace, nbRecents])

  useEffect(() => {
    const t = setTimeout(charger, 0)
    return () => clearTimeout(t)
  }, [charger])

  // LA RECHERCHE PORTE SUR TOUTE LA BOÎTE (26/11/2026) : le serveur cherche, on ajoute ce qu'il trouve (et le reste de
  // ces conversations) à la liste. Avant, elle ne voyait que les 500 derniers messages.
  useEffect(() => {
    const q = recherche.trim()
    let annule = false
    const t = setTimeout(async () => {
      if (q.length < 2) { setTrouves(new Set()); setRechercheEnCours(false); return }
      setRechercheEnCours(true)
      try {
        const res = await rechercherMessages(espace ?? undefined, q)
        const lies = res.length ? await chargerLies(espace ?? undefined, clesDe(res)) : []
        if (annule) return
        setMessages((prev) => fusionner(prev, res, lies))
        setTrouves(new Set(res.map((m) => m.id)))
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : String(e))
      } finally {
        if (!annule) setRechercheEnCours(false)
      }
    }, 350)
    return () => { annule = true; clearTimeout(t) }
  }, [recherche, espace, version])

  const filtreParPersonne = admin && espace !== "recrutement" ? compteDuChoix(choixPersonne, moi) : null
  const conversations = useMemo(() => grouperEnConversations(filtrerParPersonne(messages, filtreParPersonne)), [messages, filtreParPersonne])
  const nbNonLues = useMemo(() => compterNonLues(conversations), [conversations])
  // Les réponses « intéressé » sans fiche agence : sans agence, ni lead ni suite (25/11/2026).
  const interessesPerdus = useMemo(() => (espace === "recrutement" ? [] : interessesSansAgence(conversations)), [conversations, espace])
  const visibles = useMemo(
    () => filtrerConversations(conversations, vue, recherche, trouves),
    [conversations, vue, recherche, trouves],
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

  const [decision, setDecision] = useState<"lead" | "dead" | null>(null)
  const [creation, setCreation] = useState(false)
  const [contactCree, setContactCree] = useState("")

  // Le brouillon en cours, gardé pour la conversation (rien n'est écrit en base).
  function garderBrouillon() {
    if (!cleOuverte || mode === null) return
    const b: Brouillon = { mode, cible: cibleId, to: compoTo, cc: compoCc, cci: compoCci, copies: copiesOuvertes, corps: compoCorps, pieces: compoPieces }
    const vide = !b.corps.trim() && !b.pieces.length && (mode === "repondre" || !b.to.trim())
    setBrouillons((prev) => {
      const n = { ...prev }
      if (vide) delete n[cleOuverte]
      else n[cleOuverte] = b
      return n
    })
  }
  function oublierBrouillon(cle: string | null) {
    if (cle) setBrouillons((prev) => { const n = { ...prev }; delete n[cle]; return n })
  }
  function reprendreBrouillon(b: Brouillon) {
    setMode(b.mode); setCibleId(b.cible); setCompoTo(b.to); setCompoCc(b.cc); setCompoCci(b.cci); setCopiesOuvertes(b.copies); setCompoCorps(b.corps); setCompoPieces(b.pieces)
  }

  function retourListe() {
    garderBrouillon()
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
    // 17/11/2026 : l'échec n'allait qu'à la console ; le message redevenait non lu au rechargement, sans explication.
    ;(lu ? marquerLus(ids) : marquerNonLus(ids)).catch((e) => {
      setMessages((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, lu: !lu } : x)))
      setErreur(e instanceof Error ? e.message : String(e))
    })
  }

  function ouvrirConversation(c: Conv) {
    setCleOuverte(c.cle)
    setMode(null)
    setEnvoiErreur("")
    setEnvoiOk("")
    // Le dernier message est déplié, les autres repliés (comme Gmail).
    setDepiles([c.dernier.id])
    marquer(c.messages.filter((m) => m.sens === "entrant" && !m.lu).map((m) => m.id), true)
    // Un brouillon laissé dans cette conversation revient tel quel.
    const b = brouillons[c.cle]
    if (b) reprendreBrouillon(b)
    // Toute l'histoire de la conversation, même ses messages plus anciens que ceux déjà lus.
    chargerLies(espace ?? undefined, clesDe(c.messages)).then((l) => { if (l.length) setMessages((prev) => fusionner(prev, l)) }).catch(() => undefined)
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

  // Ouvre la zone « Répondre » ou « Transférer » sous la conversation, pour le message choisi (sinon le choix par défaut).
  function ouvrirCompo(m: Exclude<Mode, null>, choisi: Message | null = null) {
    if (!ouverte) return
    setEnvoiOk("")
    setEnvoiErreur("")
    // Déjà ouvert sur ce message : rien à refaire (on ne perd pas ce qui est écrit).
    if (mode === m && (choisi === null || cibleId === choisi.id)) return
    // Une autre action était en cours : son brouillon est gardé.
    garderBrouillon()
    // Le brouillon de la même action sur le même message revient (« Retour » puis « Répondre »).
    const b = brouillons[ouverte.cle]
    if (b && b.mode === m && (choisi === null || b.cible === choisi.id)) { reprendreBrouillon(b); return }
    setCibleId(choisi?.id ?? null)
    setCompoCorps("")
    setCompoPieces([])
    setCompoCci("")
    if (m === "repondre") {
      // À : l'expéditeur du dernier message REÇU (jamais notre propre adresse), modifiable ; Cc et Cci possibles.
      const d = destinatairesReponse(ouverte.messages, choisi)
      setCompoTo(joindreAdresses(d.to))
      setCompoCc(joindreAdresses(d.cc))
      setCopiesOuvertes(d.cc.length > 0)
    } else {
      setCompoTo("")
      setCompoCc("")
      setCopiesOuvertes(false)
    }
    setMode(m)
    // Transférer emporte le message choisi (par défaut le dernier reçu), sa mise en page et SES pièces jointes.
    const recues = m === "transferer" ? messageATransferer(ouverte.messages, choisi)?.piecesJointes ?? [] : []
    if (recues.some((p) => !p.nonGardee)) piecesPourTransfert(recues).then((l) => setCompoPieces((actuelles) => (actuelles.length ? actuelles : l))).catch((e) => setEnvoiErreur(`Pièces jointes non reprises : ${e instanceof Error ? e.message : String(e)}. Ajoute-les à la main.`))
  }

  function ouvrirNouveau() {
    garderBrouillon()
    setEnvoiOk("")
    setEnvoiErreur("")
    setCompoCc("")
    setCompoCci("")
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
  // « Annuler » : le brouillon est jeté (geste voulu), contrairement à « Retour ».
  function annulerCompo() {
    oublierBrouillon(cleOuverte)
    fermerCompo()
  }

  const ouvert = ouverte
  const cible = ouvert && cibleId ? ouvert.messages.find((m) => m.id === cibleId) ?? null : null
  const aTransferer = ouvert && mode === "transferer" ? messageATransferer(ouvert.messages, cible) : null
  const objetCible = (cible ?? ouvert?.dernier)?.objet ?? ""
  // La réponse à trancher : la dernière reçue d'une agence, côté démarchage.
  const reponseATrancher = ouvert && ouvert.agenceId ? [...ouvert.messages].reverse().find((m) => m.sens === "entrant" && m.espace === "demarchage") ?? null : null
  async function creerLeContact() {
    const r = reponseATrancher, d = r?.triDetail
    if (!r?.agenceId || !d) return
    setCreation(true); setErreur("")
    const [prenom, ...reste] = (d.contact_nom ?? "").replace(/^(m\.|mme|madame|monsieur|mr)\s+/i, "").trim().split(/\s+/)
    const tel = (d.contact_telephone ?? "").replace(/\s/g, "")
    try {
      await creerContact(r.agenceId, { prenom: reste.length ? prenom : "", nom: reste.length ? reste.join(" ") : prenom ?? "", email: d.contact_email ?? "", ...(/^(\+33|0)[67]/.test(tel) ? { mobile: d.contact_telephone } : { ligneDirecte: d.contact_telephone ?? "" }), note: "Cité dans une réponse à une campagne", principal: false })
      setContactCree(r.id)
    } catch (e) { setErreur(e instanceof Error ? e.message : String(e)) } finally { setCreation(false) }
  }
  async function trancher(d: "lead" | "dead") {
    if (!reponseATrancher) return
    setDecision(d); setErreur("")
    try {
      await deciderReponse(reponseATrancher.id, d)
      const tri = d === "lead" ? "interesse" : "pas_interesse"
      setMessages((l) => l.map((m) => (m.id === reponseATrancher.id ? { ...m, tri } : m)))
    } catch (e) { setErreur(e instanceof Error ? e.message : String(e)) } finally { setDecision(null) }
  }

  // LinkedIn et la boîte de prospection répondent dans leur propre conversation : pas de champ À.
  const canalFixe = !!ouvert && mode === "repondre" && (!!messageLinkedIn(ouvert.messages) || !!messageDeProspection(ouvert.messages))
  const copiesOk = adressesOk(compoCc, false) && adressesOk(compoCci, false)
  const pretAEnvoyer = !piecesTropLourdes(compoPieces) && (
    nouveau
      ? adressesOk(compoTo, true) && compoCorps.trim() !== ""
      : mode === "repondre"
        ? compoCorps.trim() !== "" && (canalFixe || (adressesOk(compoTo, true) && copiesOk))
        : adressesOk(compoTo, true) && copiesOk && (compoCorps.trim() !== "" || !!aTransferer))

  async function envoyer() {
    if (!pretAEnvoyer || envoiEnCours) return
    setEnvoiEnCours(true)
    setEnvoiErreur("")
    const pieces = piecesAEnvoyer(compoPieces)
    try {
      const cleEnvoyee = cleOuverte
      if (nouveau) {
        await repondreMessage({ to: decouperAdresses(compoTo), objet: compoObjet.trim() || "(sans objet)", corps: compoCorps.trim(), signatureHtml: signaturePour(espace ?? "demarchage"), commercial: prenomCommercial, espace: espace ?? "demarchage", pieces })
        setEnvoiOk(`Message envoyé à ${compoTo.trim()}.`)
      } else if (ouvert && mode === "repondre" && messageLinkedIn(ouvert.messages)) {
        if (pieces?.length) throw new Error("Pas de pièce jointe sur LinkedIn : mets plutôt un lien.")
        await repondreLinkedIn(messageLinkedIn(ouvert.messages)!.id, compoCorps.trim())
        setEnvoiOk(`Réponse envoyée sur LinkedIn à ${nomDe(ouvert)}.`)
      } else if (ouvert && mode === "repondre" && messageDeProspection(ouvert.messages)) {
        if (pieces?.length) throw new Error("Pas de pièce jointe sur une réponse à un prospect : mets plutôt un lien.")
        await repondreParInstantly({ message: messageDeProspection(ouvert.messages)!.id, objet: objetReponse(objetCible), corps: compoCorps.trim(), signatureHtml: signaturePour(ouvert.dernier.espace) })
        setEnvoiOk(`Réponse envoyée à ${nomDe(ouvert)}.`)
      } else if (ouvert && mode === "repondre") {
        // Le fil : le Message-ID du mail reçu auquel on répond, jamais l'identifiant d'un de nos envois.
        const fil = filDeReponse(ouvert.messages, cible)
        const to = decouperAdresses(compoTo)
        await repondreMessage({
          to,
          cc: decouperAdresses(compoCc),
          cci: decouperAdresses(compoCci),
          objet: objetReponse(objetCible),
          corps: compoCorps.trim(),
          inReplyTo: fil.inReplyTo,
          references: fil.references,
          agenceId: ouvert.agenceId,
          signatureHtml: signaturePour((cible ?? ouvert.dernier).espace),
          commercial: prenomCommercial,
          espace: (cible ?? ouvert.dernier).espace,
          pieces,
        })
        setEnvoiOk(`Réponse envoyée à ${joindreAdresses(to)}.`)
      } else if (ouvert && mode === "transferer" && aTransferer) {
        await repondreMessage({
          to: decouperAdresses(compoTo),
          cc: decouperAdresses(compoCc),
          cci: decouperAdresses(compoCci),
          objet: objetTransfert(aTransferer.objet),
          corps: compoCorps.trim(),
          inReplyTo: null,
          agenceId: null,
          signatureHtml: signaturePour(aTransferer.espace),
          commercial: prenomCommercial,
          espace: aTransferer.espace,
          pieces,
          citation: { de: aTransferer.de, a: aTransferer.a, date: aTransferer.date, objet: aTransferer.objet, html: aTransferer.corpsHtml, texte: aTransferer.corpsText },
        })
        setEnvoiOk(`Message transféré à ${joindreAdresses(decouperAdresses(compoTo))}.`)
      }
      setCompoCorps("")
      setCompoTo("")
      setCompoCc("")
      setCompoCci("")
      setCompoObjet("")
      setCompoPieces([])
      setCibleId(null)
      if (!nouveau) oublierBrouillon(cleEnvoyee)
      fermerCompo()
      charger()
    } catch (e) {
      setEnvoiErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnvoiEnCours(false)
    }
  }

  const pages = pagination
  const libelleBoite = espace === "recrutement" ? "Sous-traitants" : espace === "demarchage" ? "Gestionnaires" : "Les deux boîtes"
  const triOuvert = etiquetteTri(reponseATrancher)
  const linkedIn = ouvert ? messageLinkedIn(ouvert.messages) : null
  const toutDeplie = ouvert ? depiles.length >= ouvert.messages.length : false

  // Le bandeau « envoyé » ou l'erreur : le gris de STC, un point de couleur, et « Fermer ».
  const bandeaux = (
    <>
      {envoiOk && (
        <div className={BANDEAU}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1F8A4C]" />
          <span className="min-w-0 flex-1 text-[#3C3C40]">{envoiOk}</span>
          <button type="button" className={`${PILULE_CLAIRE} ${PETITE}`} onClick={() => setEnvoiOk("")}>Fermer</button>
        </div>
      )}
      {erreur && (
        <div className={BANDEAU}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#C9302C]" />
          <span className="min-w-0 flex-1 text-[#C9302C]">{erreur}</span>
        </div>
      )}
    </>
  )

  return (
    <div className="page text-[13px] text-[#111113]">
      {!ouvert ? (
        /* ══ LA LISTE ══ */
        <>
          {/* En-tête : « Boîte de réception », le comptage, et UNE action noire (STC). */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className={TITRE_PAGE}>Boîte de réception</h1>
              <p className={SOUS_TITRE}>
                {libelleBoite} · <span className="tabular-nums">{visibles.length}</span> conversation{visibles.length > 1 ? "s" : ""}
                {encore && vue !== "reception" && vue !== "nonlus" && !recherche.trim() && <> (les plus récentes)</>}
                {rechercheEnCours && <> · recherche dans toute la boîte…</>}
                {nbNonLues > 0 && <> · <span className="tabular-nums">{nbNonLues}</span> non lue{nbNonLues > 1 ? "s" : ""}</>}
              </p>
            </div>
            <button type="button" onClick={ouvrirNouveau} className={PILULE_NOIRE}>Nouveau message</button>
          </div>

          {/* Barre d'outils minimaliste : la recherche, les filtres du quotidien en pilules, le reste dans le ⋯. */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-b-[0.5px] border-[#E6E6EA] pb-2.5">
            <label className="flex min-w-[220px] flex-1 items-center gap-2">
              <Search className="h-[13px] w-[13px] shrink-0 text-[#8E8E93]" strokeWidth={2} />
              <input
                aria-label="Rechercher dans les messages"
                placeholder="Nom, adresse, objet ou contenu…"
                value={recherche}
                onChange={(e) => { setRecherche(e.target.value); setPageListe(1) }}
                className="h-7 min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-[#A1A1A6]"
              />
            </label>
            <button type="button" aria-pressed={vue === "nonlus"} className={bascule(vue === "nonlus")} onClick={() => changerVue(vue === "nonlus" ? "reception" : "nonlus")}>
              Non lus{nbNonLues > 0 && <span className={`ml-1.5 tabular-nums ${vue === "nonlus" ? "text-white/70" : "text-[#8E8E93]"}`}>{nbNonLues}</span>}
            </button>
            <button type="button" aria-pressed={vue === "envoyes"} className={bascule(vue === "envoyes")} onClick={() => changerVue(vue === "envoyes" ? "reception" : "envoyes")}
              title="Les conversations où nous avons écrit">
              Envoyés
            </button>
            {admin && espace !== "recrutement" && (
              <FiltrePersonne choix={choixPersonne} setChoix={(c) => { setChoixPersonne(c); setPageListe(1) }} personnes={personnes} />
            )}
            <button type="button" className={OUTIL} onClick={charger} title="Actualiser" aria-label="Actualiser">
              <RefreshCw className={`h-[15px] w-[15px] ${chargement ? "animate-spin" : ""}`} strokeWidth={1.7} />
            </button>
            <MenuPoints titre="Plus de filtres" pastille={vue === "tous"} largeur="w-60">
              {(fermer) => (
                <>
                  <ElementMenu coche={vue === "reception"} onClick={() => { changerVue("reception"); fermer() }}>Boîte de réception</ElementMenu>
                  <SeparateurMenu />
                  <ElementMenu coche={vue === "tous"} onClick={() => { changerVue(vue === "tous" ? "reception" : "tous"); fermer() }}>Tous les messages</ElementMenu>
                </>
              )}
            </MenuPoints>
          </div>

          {bandeaux}
          {interessesPerdus.length > 0 && (
            <div className={BANDEAU}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#C27C0E]" />
              <span className="min-w-0 flex-1 text-[#3C3C40]">
                {interessesPerdus.length} réponse{interessesPerdus.length > 1 ? "s" : ""} « intéressé » sans fiche agence (adresse inconnue ou sur plusieurs fiches) : pas de lead tant qu'elle{interessesPerdus.length > 1 ? "s ne sont pas rattachées" : " n'est pas rattachée"} à la bonne agence.
              </span>
              {interessesPerdus.slice(0, 3).map((c) => (
                <button key={c.cle} type="button" className={`${PILULE_CLAIRE} ${PETITE}`} onClick={() => ouvrirConversation(c)}>{nomDe(c)}</button>
              ))}
            </div>
          )}

          {/* La liste, pleine largeur, en rangées fines — comme une boîte mail. */}
          <EnTeteColonnes />
          <div className="border-t-[0.5px] border-[#E6E6EA]">
            {pagination.tranche.map((c) => (
              <LigneBoite key={c.cle} c={c} nom={nomDe(c)} onOuvrir={() => ouvrirConversation(c)} onBasculerLu={() => basculerLu(c)} />
            ))}
            {chargement && messages.length === 0 && !erreur && (
              <div className="flex items-center justify-center gap-2 py-12 text-[#8E8E93]">
                <Loader2 className="h-4 w-4 animate-spin" /> Lecture des messages…
              </div>
            )}
            {!chargement && !erreur && pages.total === 0 && (
              <div className="py-12 text-center text-[13px] text-[#8E8E93]">
                <Mail className="mx-auto mb-2.5 h-9 w-9 text-[#C7C7CC]" strokeWidth={1.2} />
                {recherche.trim() ? "Aucun résultat" : vue === "envoyes" ? "Aucun message envoyé" : vue === "nonlus" ? "Tout est lu" : "Aucun message"}
                {recherche.trim() && <p className="mt-1 text-[11px]">Essayez un autre mot : nom, adresse, objet ou contenu.</p>}
              </div>
            )}
          </div>
          {/* « 1–50 sur N », discret, sous la liste. */}
          {pages.total > 0 && (
            <div className="flex items-center justify-end gap-1 px-2 pt-2 text-[11px] text-[#8E8E93]">
              <span className="tabular-nums">{pages.debut}–{pages.fin} sur {pages.total}</span>
              <button type="button" className={OUTIL} disabled={pages.page <= 1} onClick={() => setPageListe(pages.page - 1)} aria-label="Page précédente">
                <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={1.8} />
              </button>
              <button type="button" className={OUTIL} disabled={pages.page >= pages.pages} onClick={() => setPageListe(pages.page + 1)} aria-label="Page suivante">
                <ChevronRight className="h-[15px] w-[15px]" strokeWidth={1.8} />
              </button>
            </div>
          )}
          {/* Rien n'est caché : les envois plus anciens se lisent à la demande (la Réception, elle, est toujours complète). */}
          {encore && pages.page >= pages.pages && vue !== "reception" && vue !== "nonlus" && (
            <div className="flex justify-center pt-3">
              <button type="button" className={`${PILULE_CLAIRE} ${PETITE}`} disabled={chargement} onClick={() => setNbRecents((n) => n + TRANCHE_RECENTS)}>
                {chargement && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Plus anciens
              </button>
            </div>
          )}
        </>
      ) : (
        /* ══ LA CONVERSATION, en page entière, présentée comme un client mail ══ */
        <div className="-mb-10 flex min-h-[calc(100dvh-28px)] flex-col">
          {/* La barre reste en haut quand on descend dans le fil : retour, le titre, le ⋯. */}
          <div className="sticky top-0 z-30 -mx-10 -mt-7 flex items-center gap-2 bg-white/90 px-10 py-3 backdrop-blur">
            <button type="button" className={OUTIL} onClick={retourListe} title="Retour à la liste (Échap)" aria-label="Retour à la liste">
              <ArrowLeft className="h-[15px] w-[15px] text-[#111113]" strokeWidth={1.8} />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <h2 className="min-w-0 truncate text-[13px] font-semibold">{nomDe(ouvert)}</h2>
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-[#6B6B70]">
                <span className={`h-1.5 w-1.5 rounded-full ${ouvert.aRecu ? "bg-[#2F6FE0]" : "bg-[#8E8E93]"}`} />
                {etiquetteDe(ouvert)}
              </span>
              {ouvert.adresse.includes("@") && nomDe(ouvert) !== ouvert.adresse && (
                <span className="hidden min-w-0 truncate text-[11px] text-[#8E8E93] sm:inline">{ouvert.adresse}</span>
              )}
            </div>
            {ouvert.sousTraitantId && (
              <button type="button" className={`${PILULE_CLAIRE} ${PETITE}`} onClick={() => setFiche(ouvert.sousTraitantId)}>Ouvrir la fiche</button>
            )}
            <MenuPoints titre="Plus d'actions">
              {(fermer) => (
                <>
                  {ouvert.aRecu && <ElementMenu onClick={() => { fermer(); marquerOuverteNonLue() }}>Marquer non lu</ElementMenu>}
                  <ElementMenu onClick={() => { fermer(); ouvrirCompo("transferer") }}>Transférer</ElementMenu>
                  {ouvert.sousTraitantId && <ElementMenu onClick={() => { fermer(); setFiche(ouvert.sousTraitantId) }}>Ouvrir la fiche</ElementMenu>}
                </>
              )}
            </MenuPoints>
          </div>

          {bandeaux}

          {/* Une réponse d'agence : le tri, et la décision du commercial (lead / dead). */}
          {reponseATrancher && (
            <div className={BANDEAU}>
              <p className="min-w-[260px] flex-1 leading-normal text-[#3C3C40]">
                <span className="font-semibold text-[#111113]">Réponse d'une agence</span>
                {triOuvert ? (
                  <> — classée <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="h-1.5 w-1.5 rounded-full" style={{ background: triOuvert.couleur }} /><b className="font-semibold text-[#111113]">{triOuvert.libelle}</b></span>. </>
                ) : " — pas encore classée. "}
                Un lead rouvre ou crée le lead ; un dead passe l'agence en « Pas intéressé ».
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={`${PILULE_NOIRE} ${PETITE}`} disabled={decision !== null || reponseATrancher.tri === "interesse"} onClick={() => void trancher("lead")}>
                  {decision === "lead" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}C'est un lead
                </button>
                <button type="button" className={`${PILULE_CLAIRE} ${PETITE}`} disabled={decision !== null || reponseATrancher.tri === "pas_interesse"} onClick={() => void trancher("dead")}>
                  {decision === "dead" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}C'est un dead
                </button>
              </div>
            </div>
          )}
          {/* Le bon contact que l'IA a lu dans la réponse : on l'ajoute à la fiche de l'agence d'un clic. */}
          {reponseATrancher?.triDetail?.contact_nom || reponseATrancher?.triDetail?.contact_email ? (
            <div className={BANDEAU}>
              <p className="min-w-0 flex-1 text-[#3C3C40]">
                <span className="font-semibold text-[#111113]">Bon contact cité</span> — {[reponseATrancher.triDetail.contact_nom, reponseATrancher.triDetail.contact_email, reponseATrancher.triDetail.contact_telephone].filter(Boolean).join(" · ")}
              </p>
              {contactCree === reponseATrancher.id ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[#1F8A4C]"><span className="h-1.5 w-1.5 rounded-full bg-[#1F8A4C]" />Contact ajouté à la fiche</span>
              ) : (
                <button type="button" className={`${PILULE_CLAIRE} ${PETITE}`} disabled={creation} onClick={() => void creerLeContact()}>
                  {creation && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Créer ce contact
                </button>
              )}
            </div>
          ) : null}
          {reponseATrancher?.tri === "absent" && reponseATrancher.triDetail?.retour ? (
            <div className={BANDEAU}>
              <p className="min-w-0 flex-1 text-[#3C3C40]">
                <span className="font-semibold text-[#111113]">Absent jusqu'au {new Date(reponseATrancher.triDetail.retour + "T12:00:00").toLocaleDateString("fr-FR")}</span> — la séquence reprend après son retour.
              </p>
            </div>
          ) : null}

          {/* En-tête du fil : le sujet en grand, le nombre de messages, déplier, actualiser. */}
          <div className="mt-4 flex items-center gap-2.5 border-b-[0.5px] border-[#E6E6EA] pb-2.5">
            <Mail className="h-[15px] w-[15px] shrink-0 text-[#6B6B70]" strokeWidth={1.7} />
            <h2 className="min-w-0 flex-1 truncate text-[21px] font-semibold tracking-[-0.02em]" title={ouvert.objet || "(sans objet)"}>
              {ouvert.objet || "(sans objet)"}
            </h2>
            <span className="shrink-0 tabular-nums text-[#6B6B70]">{ouvert.messages.length}</span>
            {linkedIn && (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-[#6B6B70]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#8E8E93]" />
                LinkedIn
              </span>
            )}
            {ouvert.messages.length > 1 && (
              <button type="button" className="shrink-0 text-[11px] text-[#3C3C40] underline underline-offset-2 hover:text-[#111113]"
                onClick={() => setDepiles(toutDeplie ? [ouvert.dernier.id] : ouvert.messages.map((m) => m.id))}>
                {toutDeplie ? "Réduire" : "Tout déplier"}
              </button>
            )}
            <button type="button" className={OUTIL} onClick={charger} title="Actualiser" aria-label="Actualiser">
              <RefreshCw className={`h-[15px] w-[15px] text-[#6B6B70] ${chargement ? "animate-spin" : ""}`} strokeWidth={1.7} />
            </button>
          </div>

          {/* Le fil : une surface, des messages séparés par un filet, comme Gmail. */}
          <div className="flex-1">
            {ouvert.messages.map((m) => (
              <MessageDuFil key={m.id} m={m} ouvert={depiles.includes(m.id)} objetDuFil={ouvert.objet} onToggle={() => basculerMessage(m.id)}
                onRepondre={linkedIn ? undefined : () => ouvrirCompo("repondre", m)} onTransferer={() => ouvrirCompo("transferer", m)} />
            ))}
          </div>

          {/* Répondre / Transférer + le composeur : collés en bas, le fil défile au-dessus (STC). */}
          <div className="sticky bottom-0 z-10 -mx-10 mt-2 border-t-[0.5px] border-[#E6E6EA] bg-white px-10 py-3">
            {mode === null ? (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={PILULE_CLAIRE} onClick={() => ouvrirCompo("repondre")}>
                  <Reply className="h-[14px] w-[14px]" strokeWidth={1.8} />
                  Répondre
                </button>
                <button type="button" className={PILULE_CLAIRE} onClick={() => ouvrirCompo("transferer")}>
                  <Forward className="h-[14px] w-[14px]" strokeWidth={1.8} />
                  Transférer
                </button>
              </div>
            ) : (
              <div className="max-h-[55vh] overflow-y-auto">
                {canalFixe ? (
                  <div className={LIGNE_COMPO}>
                    <span className="w-12 shrink-0 text-[#8E8E93]">À</span>
                    <span className="min-w-0 truncate">
                      {nomDe(ouvert)}
                      {linkedIn ? <span className="text-[#8E8E93]"> · sur LinkedIn</span> : ouvert.adresse.includes("@") && nomDe(ouvert) !== ouvert.adresse && <span className="text-[#8E8E93]"> &lt;{ouvert.adresse}&gt;</span>}
                    </span>
                  </div>
                ) : (
                  <>
                    {/* À modifiable, plusieurs adresses possibles ; Cc et Cci d'un clic, comme sur la fiche agence. */}
                    <LigneCompo libelle="À">
                      <input value={compoTo} onChange={(e) => setCompoTo(e.target.value)} onBlur={() => setCompoTo(joindreAdresses(decouperAdresses(compoTo)))} autoFocus={mode === "transferer"}
                        placeholder="destinataire@exemple.fr" aria-label="Destinataire"
                        className={`min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-[#A1A1A6] ${adressesOk(compoTo, false) ? "" : "text-[#C9302C]"}`} />
                      {!copiesOuvertes && <button type="button" onClick={() => setCopiesOuvertes(true)} className="shrink-0 text-[11px] text-[#6B6B70] hover:text-[#111113]">Cc · Cci</button>}
                    </LigneCompo>
                    {copiesOuvertes && (
                      <>
                        <LigneCompo libelle="Cc">
                          <input value={compoCc} onChange={(e) => setCompoCc(e.target.value)} onBlur={() => setCompoCc(joindreAdresses(decouperAdresses(compoCc)))} placeholder="En copie, visible par tous" aria-label="Copie"
                            className={`min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-[#A1A1A6] ${adressesOk(compoCc, false) ? "" : "text-[#C9302C]"}`} />
                        </LigneCompo>
                        <LigneCompo libelle="Cci">
                          <input value={compoCci} onChange={(e) => setCompoCci(e.target.value)} onBlur={() => setCompoCci(joindreAdresses(decouperAdresses(compoCci)))} placeholder="En copie cachée" aria-label="Copie cachée"
                            className={`min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-[#A1A1A6] ${adressesOk(compoCci, false) ? "" : "text-[#C9302C]"}`} />
                        </LigneCompo>
                      </>
                    )}
                  </>
                )}
                {!(mode === "repondre" && linkedIn) && (
                  <div className={LIGNE_COMPO}>
                    <span className="w-12 shrink-0 text-[#8E8E93]">Objet</span>
                    <span className="min-w-0 truncate">{mode === "repondre" ? objetReponse(objetCible) : objetTransfert(aTransferer?.objet ?? "")}</span>
                  </div>
                )}
                <textarea
                  value={compoCorps}
                  onChange={(e) => setCompoCorps(e.target.value)}
                  rows={mode === "repondre" ? 4 : 8}
                  autoFocus={mode === "repondre"}
                  placeholder={mode === "transferer" ? "Un mot pour accompagner le transfert (facultatif)…" : "Rédigez votre message… (la signature est ajoutée automatiquement)"}
                  aria-label="Message"
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void envoyer() }}
                  className="block max-h-[500px] min-h-[96px] w-full resize-none border-0 bg-transparent py-2 text-[13px] leading-[1.65] outline-none placeholder:text-[#A1A1A6]"
                />
                {aTransferer && (
                  <p className="pb-2 text-[11px] text-[#8E8E93]">
                    Le message de {aTransferer.de || "?"} du {new Date(aTransferer.date).toLocaleString("fr-FR")} suit, avec sa mise en page.
                  </p>
                )}
                <PiecesCompo pieces={compoPieces} onChange={setCompoPieces} />
                <div className="flex flex-wrap items-center gap-1.5">
                  {signataires.length > 1 ? <SigneParCompo noms={signataires} nom={nomSignataire} onChange={choisirSignataire} /> : null}
                  {envoiErreur && <span className="min-w-0 text-[11px] text-[#C9302C]">{envoiErreur}</span>}
                  <span className="flex-1" />
                  <button type="button" className="px-2 text-[11px] text-[#6B6B70] hover:text-[#111113] hover:underline" onClick={annulerCompo}>Annuler</button>
                  <button type="button" onClick={() => void envoyer()} disabled={envoiEnCours || !pretAEnvoyer} aria-label={envoiEnCours ? "Envoi…" : "Envoyer"} title="Envoyer (Ctrl + Entrée)"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#111113] text-white hover:bg-[#2A2A2E] disabled:opacity-50">
                    {envoiEnCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-[15px] w-[15px]" strokeWidth={1.8} />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Le « Nouveau message » flottant, façon Gmail (bas-droite, non bloquant), comme STC ── */}
      {nouveau && (
        <div role="dialog" aria-label="Nouveau message"
          className="fixed bottom-0 right-4 z-50 flex w-[95vw] max-w-[540px] flex-col rounded-t-[10px] border-[0.5px] border-b-0 border-[#D4D4D8] bg-white text-[13px] text-[#111113] shadow-[0_-4px_30px_rgba(17,17,19,.12)] sm:right-8">
          <div className="flex items-center rounded-t-[10px] bg-[#F6F6F7] py-2 pl-3.5 pr-2.5">
            <span className="flex-1 font-semibold">Nouveau message</span>
            <button type="button" className={OUTIL} onClick={() => { if (!envoiEnCours) fermerCompo() }} title="Fermer" aria-label="Fermer">
              <X className="h-[15px] w-[15px]" strokeWidth={1.8} />
            </button>
          </div>
          <div className="px-3.5">
            <LigneCompo libelle="À">
              <input value={compoTo} onChange={(e) => setCompoTo(e.target.value)} autoFocus placeholder="Adresse e-mail" aria-label="Destinataire"
                className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-[#A1A1A6]" />
            </LigneCompo>
            <div className="border-b-[0.5px] border-[#E6E6EA] py-1">
              <input aria-label="Objet" value={compoObjet} onChange={(e) => setCompoObjet(e.target.value)} placeholder="Objet"
                className="w-full bg-transparent py-1.5 text-[13px] outline-none placeholder:text-[#A1A1A6]" />
            </div>
            <textarea
              aria-label="Message"
              value={compoCorps}
              onChange={(e) => setCompoCorps(e.target.value)}
              placeholder="Votre message… (la signature est ajoutée automatiquement)"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void envoyer() }}
              className="max-h-[45vh] min-h-[220px] w-full resize-none bg-transparent py-3 text-[13px] leading-[1.65] outline-none placeholder:text-[#A1A1A6]"
            />
            <PiecesCompo pieces={compoPieces} onChange={setCompoPieces} />
          </div>
          {envoiErreur && <p className="mx-3.5 mb-2 rounded-[6px] bg-[#C9302C]/[0.06] px-3 py-2 text-[11px] text-[#C9302C]">{envoiErreur}</p>}
          <div className="flex items-center gap-2 border-t-[0.5px] border-[#E6E6EA] px-3.5 py-2.5">
            <button type="button" onClick={() => void envoyer()} disabled={envoiEnCours || !pretAEnvoyer} className={`${PILULE_NOIRE} ${PETITE}`}>
              {envoiEnCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Envoyer
            </button>
            <div className="min-w-2 flex-1" />
            {signataires.length > 1 ? <SigneParCompo noms={signataires} nom={nomSignataire} onChange={choisirSignataire} /> : null}
            <button type="button" className={`${OUTIL} text-[#8E8E93] hover:text-[#C9302C]`} title="Supprimer le brouillon" aria-label="Supprimer le brouillon"
              onClick={() => { setCompoTo(""); setCompoObjet(""); setCompoCorps(""); setCompoPieces([]); fermerCompo() }}>
              <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.7} />
            </button>
          </div>
        </div>
      )}

      {fiche && <FicheArtisan id={fiche} onFermer={() => setFiche(null)} onChange={charger} />}
    </div>
  )
}
