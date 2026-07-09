import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Phone,
  PhoneOff,
  SkipForward,
  Play,
  Mail,
  Building2,
  User,
  Clock,
  CalendarPlus,
  Check,
  AlertTriangle,
  MapPin,
  Copy,
  Mic,
  Undo2,
  Search,
} from "lucide-react"
import { palette, statutsParDefaut, classePastille, type Statut } from "../statuts"
import type { Prospect } from "../data"
import { prospects as prospectsDemo, estApporteur } from "../data"
import BandeauErreur from "./BandeauErreur"
import { joursLabels, type Creneau } from "../creneaux"
import type { Rdv } from "../rdv"
import { supabaseConfigure } from "../lib/supabase"
import { chargerProspects, majProspect } from "../lib/prospectsDb"
import { chargerStatuts } from "../lib/statutsDb"
import { chargerCreneaux } from "../lib/creneauxDb"
import { chargerRdv } from "../lib/rdvDb"
import { lireParametre, ecrireParametre } from "../lib/parametresDb"
import { chargerNumeros, numeroPourProspect, numeroLeMoinsUtilise } from "../lib/numerosEmission"
import { relanceAutoEntreeEtat } from "../lib/relanceAuto"
import { numeroValide, formaterTelephone, chiffresTel } from "../lib/telephone"
import { lancerAppelRingover, statutAppelsRingover, detailAppelRingover } from "../lib/ringover"
import { entrantActif } from "../lib/appelEntrantActif"
import { enregistrerAppel } from "../lib/appelsDb"
import { resultatsNonJoint, RESULTAT_DECROCHE } from "../appels"
import NouveauRdvModal from "./NouveauRdvModal"
import HistoriqueProspect from "./HistoriqueProspect"

function dateAujourdhui(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Interprète le résultat d'un appel Ringover (last_state / is_failed) → message à afficher
// (null = rien à signaler) + libellé pour le journal d'appels.
function messageResultat(
  last_state?: string | null,
  is_failed?: boolean | null,
  entreprise?: string,
): { texte: string | null; resultat: string } {
  const st = String(last_state || "").toUpperCase()
  const nom = entreprise ? entreprise + " : " : ""
  if (is_failed || st === "FAILED" || st === "FAX_FAILED")
    return { texte: `⚠️ ${nom}numéro injoignable ou invalide — à vérifier.`, resultat: "Numéro invalide" }
  if (st === "VOICEMAIL") return { texte: `${nom}répondeur.`, resultat: "Répondeur" }
  if (st === "MISSED" || st === "NOANSWER_TRANSFERED" || st === "QUEUE_TIMEOUT")
    return { texte: null, resultat: "Pas de réponse" }
  if (st === "CANCELLED") return { texte: null, resultat: "Annulé" }
  if (st === "ANSWERED") return { texte: null, resultat: "Décroché" }
  return { texte: null, resultat: "Appel passé" }
}

// Interroge Ringover (jusqu'à ~90 s : le relevé d'appel met du temps à s'écrire) pour
// connaître le résultat FINAL d'un appel. Renvoie null si le résultat n'arrive jamais.
async function resoudreResultat(
  callId: string,
  entreprise?: string,
): Promise<{ resultat: string; texte: string | null } | null> {
  for (let i = 0; i < 15; i++) {
    const det = await detailAppelRingover(callId)
    if (det.ok && det.trouve && det.last_state) {
      return messageResultat(det.last_state, det.is_failed, entreprise)
    }
    await new Promise((r) => setTimeout(r, 6000))
  }
  return null
}

// "JJ/MM/AAAA" ou "JJ/MM/AAAA HH:MM" -> Date (au jour), ou null si pas une date.
function parseDateFr(s: string): Date | null {
  const m = (s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null
}

// Dictée vocale du navigateur (Web Speech API) — surtout dispo sous Chrome/Edge.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Reconnaissance: any =
  typeof window !== "undefined"
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : undefined

export default function SessionsCall() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [statuts, setStatuts] = useState<Statut[]>(statutsParDefaut)
  const [fileStatut, setFileStatut] = useState<string>("")
  const [cadence, setCadence] = useState(5)
  const [enCours, setEnCours] = useState(false)
  const [fileSession, setFileSession] = useState<Prospect[]>([])
  const [index, setIndex] = useState(0)
  const [creneaux, setCreneaux] = useState<Creneau[]>([])
  const [rdvJour, setRdvJour] = useState<Rdv[]>([])
  const [rdvPour, setRdvPour] = useState<Prospect | null>(null)
  // Commentaires en cours d'édition, rattachés à l'id du prospect (évite tout mélange)
  const [commentaires, setCommentaires] = useState<Record<string, string>>({})
  const [erreur, setErreur] = useState<string | null>(null)
  const [relanceMsg, setRelanceMsg] = useState("")
  const [relanceInput, setRelanceInput] = useState("") // valeur du sélecteur date+heure
  const [copie, setCopie] = useState(false)
  const [numerosPool, setNumerosPool] = useState<string[]>([]) // réserve de numéros Ringover
  const [appelMsg, setAppelMsg] = useState<{ ok: boolean; texte: string } | null>(null) // retour d'appel Ringover
  const [rechercheDirecte, setRechercheDirecte] = useState("") // barre "appeler un prospect directement"
  const [ecoute, setEcoute] = useState(false) // dictée vocale en cours
  const [auto, setAuto] = useState(false) // mode automatique : appelle le prospect tout seul
  const [compte, setCompte] = useState<number | null>(null) // compte à rebours avant l'appel auto
  const [stats, setStats] = useState({ appels: 0, decroches: 0, os: 0 }) // perf de la session en cours
  const [erreurSave, setErreurSave] = useState(false) // une sauvegarde a échoué
  const [ordreAppel, setOrdreAppel] = useState<"base" | "meilleurs" | "melange">("melange") // ordre de la file (mélangé par défaut)
  // Priorités à INCLURE dans la session (cochées par défaut). Permet ex. « aujourd'hui
  // je n'appelle que les Haute + Moyenne ». Une priorité inconnue/vide passe toujours.
  const [prioritesActives, setPrioritesActives] = useState<Record<string, boolean>>({
    Haute: true,
    Moyenne: true,
    Basse: true,
  })
  const [script, setScript] = useState("") // script/accroche d'appel (persisté)
  const [scriptEdit, setScriptEdit] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recoRef = useRef<any>(null)
  const commentaireRef = useRef("")
  const cleCourantRef = useRef("") // id du prospect affiché (pour viser le bon en dictée)
  const verrouRef = useRef(false) // empêche de traiter 2× le même prospect (double-clic)
  const avancerRef = useRef<() => void>(() => {}) // toujours la dernière version d'avancer()
  const autoRef = useRef(false) // dernière valeur de `auto` (pour les callbacks async)
  const indexRef = useRef(0) // index courant (pour vérifier le bon prospect dans les callbacks async)
  const fileSessionRef = useRef<Prospect[]>([]) // file courante (idem)
  const dernierAppelRef = useRef(0) // horodatage du dernier appel lancé (anti double-appel)
  const dernierCallIdRef = useRef<string | undefined>(undefined) // id du dernier appel Ringover lancé
  const dernierAppelProspectRef = useRef<string | undefined>(undefined) // prospect du dernier appel lancé
  const enCoursRef = useRef(false) // session en cours (pour les callbacks asynchrones)
  const goTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null) // minuterie de l'appel auto
  // Surveillance de fin d'appel (mode auto) : on attend qu'un appel démarre (vuActif),
  // puis qu'il n'y ait plus d'appel en cours (raccrochage) pour passer au suivant.
  const surveillanceRef = useRef<{
    actif: boolean
    vuActif: boolean
    prospectId?: string
    statut?: string
    zeros?: number // nb de tours consécutifs à 0 appel (anti-hoquet)
    callId?: string // identifiant de l'appel Ringover (pour récupérer son résultat)
    entreprise?: string // nom pour le message de résultat
  }>({ actif: false, vuActif: false })
  const [surveille, setSurveille] = useState(false) // pour l'affichage "en attente de fin d'appel"

  function rechargerRdvJour() {
    const auj = dateAujourdhui()
    chargerRdv()
      .then((rows) =>
        setRdvJour(
          rows.filter((r) => r.date === auj && !r.fait).sort((a, b) => a.heure.localeCompare(b.heure)),
        ),
      )
      .catch(() => {})
  }

  useEffect(() => {
    if (!supabaseConfigure) {
      setProspects(prospectsDemo)
      return
    }
    chargerProspects()
      .then((rows) => setProspects(rows.filter((p) => !estApporteur(p))))
      .catch((e) => setErreur(e instanceof Error ? e.message : "Erreur inconnue"))
    chargerStatuts()
      .then((rows) => rows.length && setStatuts(rows))
      .catch(() => {})
    chargerCreneaux()
      .then((rows) => setCreneaux(rows.filter((c) => c.actif)))
      .catch(() => {})
    lireParametre("script_appel").then((v) => v && setScript(v)).catch(() => {})
    chargerNumeros().then(setNumerosPool).catch(() => {})
    rechargerRdvJour()
  }, [])

  // Évite d'appeler 2 fois le même numéro dans une session
  function dedupTelephone(liste: Prospect[]): Prospect[] {
    const vus = new Set<string>()
    const out: Prospect[] = []
    for (const p of liste) {
      const t = chiffresTel(p.telephone || "")
      if (t && vus.has(t)) continue
      if (t) vus.add(t)
      out.push(p)
    }
    return out
  }

  // Priorités connues (l'ordre = de la plus forte à la plus faible).
  const PRIORITES = ["Haute", "Moyenne", "Basse"]
  // Vrai si ce prospect passe le filtre de priorités. Une priorité hors liste (vide,
  // inconnue) passe toujours — on ne cache jamais un prospect à cause d'une valeur inattendue.
  const prioriteOk = (p: Prospect): boolean =>
    !PRIORITES.includes(p.priorite) || Boolean(prioritesActives[p.priorite])

  // Prospects d'un état, filtrés par les priorités cochées.
  const fileDeLEtat = (libelle: string): Prospect[] =>
    prospects.filter((p) => p.statut === libelle && prioriteOk(p))

  // Ordonne la file selon le choix de l'utilisateur (fait au démarrage de session).
  function ordonnerFile(liste: Prospect[]): Prospect[] {
    if (ordreAppel === "base") return liste // ordre d'origine de la base
    if (ordreAppel === "melange") {
      // mélange aléatoire (pour ne pas griller tous les bons leads d'un coup)
      const a = [...liste]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a
    }
    // "meilleurs" : priorité Haute d'abord, puis gros volume d'OS
    const rangPrio = (p: string) =>
      ({ Haute: 0, Moyenne: 1, Basse: 2 } as Record<string, number>)[p] ?? 3
    const rangVol = (v: string) =>
      ({ Élevé: 0, Normal: 1, Faible: 2 } as Record<string, number>)[v] ?? 3
    return [...liste].sort(
      (a, b) =>
        rangPrio(a.priorite) - rangPrio(b.priorite) ||
        rangVol(a.volume || "") - rangVol(b.volume || ""),
    )
  }

  function lancerCreneau(cr: Creneau) {
    const st = statuts.find((s) => s.id === cr.etatId)
    if (!st) return
    const file = ordonnerFile(dedupTelephone(fileDeLEtat(st.libelle)))
    if (file.length === 0) return
    verrouRef.current = false // repartir propre
    setFileStatut(st.libelle)
    setCadence(cr.cadenceSecondes)
    setFileSession(file)
    setIndex(0)
    setStats({ appels: 0, decroches: 0, os: 0 })
    setEnCours(true)
  }

  const comptes = useMemo(() => {
    const c: Record<string, number> = {}
    prospects.forEach((p) => (c[p.statut] = (c[p.statut] ?? 0) + 1))
    return c
  }, [prospects])

  // Prospects à relancer aujourd'hui ou en retard (triés du plus ancien au plus récent).
  const relances = useMemo(() => {
    const auj = new Date()
    auj.setHours(0, 0, 0, 0)
    return prospects
      .filter((p) => {
        const d = parseDateFr(p.prochaineRelance)
        return d !== null && d.getTime() <= auj.getTime()
      })
      .sort((a, b) => parseDateFr(a.prochaineRelance)!.getTime() - parseDateFr(b.prochaineRelance)!.getTime())
  }, [prospects])

  const estEnRetard = (s: string): boolean => {
    const d = parseDateFr(s)
    if (!d) return false
    const auj = new Date()
    auj.setHours(0, 0, 0, 0)
    return d.getTime() < auj.getTime()
  }

  // Heure "HH:MM" d'une relance, si elle a été précisée.
  const heureRelance = (s: string): string => {
    const m = (s || "").match(/(\d{2}):(\d{2})/)
    return m ? m[0] : ""
  }

  // Nombre d'infos importantes manquantes (email, gestionnaire, adresse) → à compléter pendant l'appel.
  const nbInfosManquantes = (p: Prospect): number =>
    [p.email, p.contact, p.adresse].filter((v) => !(v || "").trim()).length

  // Édition en direct d'un champ du prospect en cours (pour compléter les infos manquantes
  // pendant l'appel). On met à jour l'affichage tout de suite, et on enregistre au blur.
  type ChampInfo = "telephone" | "email" | "contact" | "adresse"
  function majChampCourant(champ: ChampInfo, valeur: string) {
    if (!courant?.id) return
    const id = courant.id
    setFileSession((arr) => arr.map((x) => (x.id === id ? { ...x, [champ]: valeur } : x)))
    setProspects((arr) => arr.map((x) => (x.id === id ? { ...x, [champ]: valeur } : x)))
  }
  function sauverChamp(champ: ChampInfo, valeur: string) {
    if (courant?.id) majProspect(courant.id, { [champ]: valeur }).catch(() => setErreurSave(true))
  }

  // Marque une relance comme faite : on efface la date (la fiche quitte la liste).
  function relanceFaite(p: Prospect) {
    if (!p.id) return
    setProspects((arr) => arr.map((x) => (x.id === p.id ? { ...x, prochaineRelance: "—" } : x)))
    majProspect(p.id, { prochaine_relance: "—" }).catch(() => setErreurSave(true))
  }

  const courant = fileSession[index]
  const cleCourant = courant?.id ?? ""
  // Commentaire affiché : valeur en cours d'édition si elle existe, sinon celui du prospect
  const commentaireCourant =
    cleCourant in commentaires ? commentaires[cleCourant] : courant?.commentaire ?? ""

  // Numéro du prospect incorrect/incomplet ? (pour prévenir avant d'appeler dans le vide)
  const telCourantInvalide = Boolean(courant) && !numeroValide(courant?.telephone || "")

  // Numéro d'émission à utiliser pour appeler CE prospect (toujours le même pour lui).
  // `bloque` = son numéro attribué est sorti de la rotation (pause/supprimé) → appel interdit
  // avec un autre numéro (anti-spam) tant que ce n'est pas réglé.
  const attributionCourante =
    courant && numerosPool.length ? numeroPourProspect(courant, numerosPool, prospects) : null
  const emissionBloquee = Boolean(attributionCourante?.bloque)
  const numeroEmissionCourant = attributionCourante && !emissionBloquee ? attributionCourante.numero : ""

  // Réattribution CONSCIENTE d'un nouveau numéro (bouton du bandeau « appel bloqué ») :
  // c'est le seul chemin autorisé pour changer le numéro d'émission d'un prospect.
  function reattribuerNumero() {
    if (!courant?.id || numerosPool.length === 0) return
    const nouveau = numeroLeMoinsUtilise(numerosPool, prospects)
    if (!nouveau) return
    const id = courant.id
    setProspects((arr) => arr.map((x) => (x.id === id ? { ...x, numeroEmission: nouveau } : x)))
    setFileSession((arr) => arr.map((x) => (x.id === id ? { ...x, numeroEmission: nouveau } : x)))
    majProspect(id, { numero_emission: nouveau }).catch(() => setErreurSave(true))
    setAppelMsg({ ok: true, texte: `Nouveau numéro attribué : ${nouveau}. Tu peux appeler.` })
    setTimeout(() => setAppelMsg(null), 5000)
  }

  // À la 1re fois qu'on appelle un prospect, on lui attribue un numéro (le moins utilisé)
  // et on l'enregistre sur sa fiche pour que ce soit toujours le même ensuite.
  useEffect(() => {
    if (!courant?.id || numerosPool.length === 0) return
    const { numero, aEnregistrer } = numeroPourProspect(courant, numerosPool, prospects)
    if (aEnregistrer && numero && courant.numeroEmission !== numero) {
      const id = courant.id
      setProspects((arr) => arr.map((x) => (x.id === id ? { ...x, numeroEmission: numero } : x)))
      setFileSession((arr) => arr.map((x) => (x.id === id ? { ...x, numeroEmission: numero } : x)))
      majProspect(id, { numero_emission: numero }).catch(() => setErreurSave(true))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courant?.id, numerosPool])

  function sauverCommentaire() {
    if (courant?.id)
      majProspect(courant.id, { commentaire: commentaireCourant }).catch(() => setErreurSave(true))
  }

  // Sauvegarde AUTOMATIQUE du commentaire pendant la frappe (après ~1 s sans taper),
  // pour ne plus dépendre du fait de « sortir » du champ (le champ « bleu »/sélectionné
  // se sauve désormais tout seul). Complète onBlur + la sauvegarde à l'avancement.
  useEffect(() => {
    const id = courant?.id
    if (!id) return
    const com = commentaireCourant
    if (com === (courant?.commentaire ?? "")) return // déjà à jour, rien à faire
    const t = setTimeout(() => {
      setProspects((arr) => arr.map((x) => (x.id === id ? { ...x, commentaire: com } : x)))
      setFileSession((arr) => arr.map((x) => (x.id === id ? { ...x, commentaire: com } : x)))
      majProspect(id, { commentaire: com }).catch(() => setErreurSave(true))
    }, 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentaireCourant, courant?.id])

  // Gardent la dernière valeur du commentaire + l'id du prospect courant (pour la dictée vocale).
  commentaireRef.current = commentaireCourant
  cleCourantRef.current = cleCourant

  // Dictée vocale : on parle, ça s'ajoute au commentaire (et c'est enregistré).
  function dicterCommentaire() {
    if (!Reconnaissance) {
      alert("La dictée vocale n'est pas disponible sur ce navigateur. Utilisez Google Chrome.")
      return
    }
    if (ecoute) {
      recoRef.current?.stop()
      return
    }
    // On vise CE prospect précis (capturé maintenant) ; si on change de fiche,
    // les phrases qui arrivent en retard sont ignorées (plus de note sur la mauvaise fiche).
    const cibleId = courant?.id
    if (!cibleId) {
      alert("Impossible de dicter sur cette fiche (non enregistrée).")
      return
    }
    const reco = new Reconnaissance()
    reco.lang = "fr-FR"
    reco.continuous = true
    reco.interimResults = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reco.onresult = (e: any) => {
      let txt = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) txt += e.results[i][0].transcript
      }
      txt = txt.trim()
      if (!txt) return
      if (cleCourantRef.current !== cibleId) return // on a changé de prospect → on ignore
      const base = commentaireRef.current
      const nouveau = (base && !/\s$/.test(base) ? base + " " : base) + txt
      commentaireRef.current = nouveau
      setCommentaires((prev) => ({ ...prev, [cibleId]: nouveau }))
      majProspect(cibleId, { commentaire: nouveau }).catch(() => {})
    }
    reco.onend = () => {
      setEcoute(false)
      recoRef.current = null
    }
    reco.onerror = () => {
      setEcoute(false)
      recoRef.current = null
    }
    recoRef.current = reco
    reco.start()
    setEcoute(true)
  }

  function demarrer() {
    const file = ordonnerFile(dedupTelephone(fileDeLEtat(fileStatut)))
    if (file.length === 0) return
    verrouRef.current = false // repartir propre (le verrou peut rester posé après une fin de session)
    setFileSession(file)
    setIndex(0)
    setStats({ appels: 0, decroches: 0, os: 0 })
    setEnCours(true)
  }

  function avancer() {
    // On quitte le prospect → on arrête toute surveillance de fin d'appel en cours.
    surveillanceRef.current = { actif: false, vuActif: false }
    setSurveille(false)
    // Sauver le commentaire en cours AVANT de changer de prospect (sinon perdu via « Passer »).
    if (courant?.id) {
      const com = commentaireCourant
      if (com !== (courant.commentaire ?? "")) {
        const id = courant.id
        setProspects((arr) => arr.map((x) => (x.id === id ? { ...x, commentaire: com } : x)))
        majProspect(id, { commentaire: com }).catch(() => setErreurSave(true))
      }
    }
    setRelanceMsg("")
    setRelanceInput("")
    setCopie(false)
    recoRef.current?.stop() // stopper la dictée avant de changer de prospect
    // Relâcher le focus (bouton cliqué) pour que les raccourcis clavier restent dispo.
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    if (index >= fileSession.length - 1) {
      setEnCours(false)
      setIndex(0)
    } else {
      setIndex((i) => i + 1)
    }
  }
  // Refs toujours à jour (pour les appels asynchrones : surveillance, minuteries).
  avancerRef.current = avancer
  autoRef.current = auto
  indexRef.current = index
  fileSessionRef.current = fileSession
  enCoursRef.current = enCours

  // Revenir au prospect précédent (pour corriger une erreur).
  function reculer() {
    // On quitte le prospect → on arrête toute surveillance de fin d'appel en cours.
    surveillanceRef.current = { actif: false, vuActif: false }
    setSurveille(false)
    recoRef.current?.stop()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    setRelanceMsg("")
    setRelanceInput("")
    setCopie(false)
    setIndex((i) => Math.max(0, i - 1))
  }

  // Programme une relance à date + heure exactes sur le prospect en cours
  // (alimente la liste « À relancer »). relanceInput = "AAAA-MM-JJTHH:MM" (datetime-local).
  function programmerRelance() {
    if (!courant?.id || !relanceInput) return
    const m = relanceInput.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
    if (!m) return
    const date = `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` // "JJ/MM/AAAA HH:MM"
    setProspects((arr) => arr.map((x) => (x.id === courant.id ? { ...x, prochaineRelance: date } : x)))
    setFileSession((arr) => arr.map((x) => (x.id === courant.id ? { ...x, prochaineRelance: date } : x)))
    majProspect(courant.id, { prochaine_relance: date }).catch(() => setErreurSave(true))
    setRelanceMsg(`Relance programmée le ${date}`)
    setRelanceInput("")
  }

  function appliquer(nouveauStatut: string) {
    if (verrouRef.current) return
    verrouRef.current = true
    if (courant) {
      const cible = courant
      const com = commentaireCourant
      // Relance auto « J+X » de l'état d'arrivée (sans écraser une relance déjà prévue).
      const relance = relanceAutoEntreeEtat(nouveauStatut, statuts, cible.prochaineRelance ?? "")
      setProspects((arr) =>
        arr.map((x) =>
          (cible.id ? x.id === cible.id : x === cible)
            ? { ...x, statut: nouveauStatut, commentaire: com, ...(relance ? { prochaineRelance: relance } : {}) }
            : x,
        ),
      )
      if (cible.id) {
        majProspect(cible.id, {
          statut: nouveauStatut,
          commentaire: com,
          ...(relance ? { prochaine_relance: relance } : {}),
        }).catch(() => setErreurSave(true))
        // Changer l'état = la personne a été jointe (décroché)
        enregistrerAppel(cible.id, RESULTAT_DECROCHE, nouveauStatut).catch(() => setErreurSave(true))
      }
      const estObjectif = statuts.find((s) => s.libelle === nouveauStatut)?.estObjectif
      setStats((s) => ({ appels: s.appels + 1, decroches: s.decroches + 1, os: s.os + (estObjectif ? 1 : 0) }))
    }
    avancer()
  }

  // La personne n'a pas été jointe : on journalise sans changer l'état.
  function appelNonJoint(resultat: string) {
    if (verrouRef.current) return
    verrouRef.current = true
    if (courant?.id) {
      const cible = courant
      const id = courant.id
      const com = commentaireCourant
      enregistrerAppel(id, resultat, cible.statut).catch(() => setErreurSave(true))
      majProspect(id, { commentaire: com }).catch(() => setErreurSave(true))
      setProspects((arr) =>
        arr.map((x) => (x.id === cible.id ? { ...x, commentaire: com } : x)),
      )
      setStats((s) => ({ ...s, appels: s.appels + 1 }))
    }
    avancer()
  }

  // Copier le numéro du prospect en cours (pour le coller dans le dialer Ringover).
  function copierNumero() {
    if (!courant?.telephone) return
    navigator.clipboard
      ?.writeText(courant.telephone)
      .then(() => {
        setCopie(true)
        setTimeout(() => setCopie(false), 1500)
      })
      .catch(() => {})
  }

  // ⚑ POINT UNIQUE D'APPEL — aujourd'hui : ouvre le lien tel: (pris en charge par le softphone
  // Ringover s'il est installé).
  // MAINTENANT : on tente d'abord le relais Ringover (appel auto avec le numéro
  // attribué). Si le relais n'est pas encore déployé / échoue, on retombe sur le
  // lien tel: (softphone), pour ne jamais bloquer les appels.
  async function declencherAppel(p: Prospect | undefined) {
    if (!p?.telephone) return
    // Numéro incomplet/incorrect → on n'appelle pas dans le vide, on prévient.
    if (!numeroValide(p.telephone)) {
      setAppelMsg({ ok: false, texte: "Numéro incorrect ou incomplet — corrigez-le avant d'appeler." })
      setTimeout(() => setAppelMsg(null), 4000)
      return
    }
    // COHÉRENCE ANTI-SPAM : un prospect est TOUJOURS appelé avec le même numéro.
    // Si son numéro attribué est sorti de la rotation (pause/supprimé), on BLOQUE :
    // jamais d'appel avec un autre numéro en douce.
    if (numerosPool.length) {
      const attribution = numeroPourProspect(p, numerosPool, prospects)
      if (attribution.bloque) {
        setAppelMsg({
          ok: false,
          texte:
            `Appel bloqué : ${p.entreprise || "ce prospect"} a toujours été appelé avec le ` +
            `${attribution.numero}, qui n'est plus en rotation. Réactive-le dans Numéros d'appel, ` +
            `ou attribue-lui un nouveau numéro (bouton sur la fiche).`,
        })
        setTimeout(() => setAppelMsg(null), 9000)
        // En mode auto : on saute ce prospect (sinon la session resterait figée).
        if (autoRef.current) setTimeout(() => avancerRef.current(), 1500)
        return
      }
    }
    // Anti double-appel : ignore un 2e déclenchement trop rapproché (double-clic, ou
    // « Appeler maintenant » + minuterie auto). On garde 1,5 s → un vrai réessai reste possible.
    const maintenant = Date.now()
    if (maintenant - dernierAppelRef.current < 1500) return
    dernierAppelRef.current = maintenant
    dernierAppelProspectRef.current = p.id // pour savoir QUI concernait le dernier appel
    // Résout le numéro d'émission attribué à ce prospect (et l'attribue si nécessaire),
    // pour que même un appel direct parte du bon numéro.
    let from = p.numeroEmission || ""
    if (numerosPool.length) {
      const res = numeroPourProspect(p, numerosPool, prospects)
      from = res.numero
      if (res.aEnregistrer && res.numero && p.id) {
        const id = p.id
        setProspects((arr) => arr.map((x) => (x.id === id ? { ...x, numeroEmission: res.numero } : x)))
        majProspect(id, { numero_emission: res.numero }).catch(() => setErreurSave(true))
      }
    }
    const r = await lancerAppelRingover(p.telephone, from)
    if (r.ok) {
      dernierCallIdRef.current = r.callId // pour vérifier plus tard que CET appel est bien fini
      setAppelMsg({ ok: true, texte: "Appel lancé via Ringover — décrochez sur votre appli Ringover." })
      setTimeout(() => setAppelMsg(null), 5000)
      if (autoRef.current) {
        // L'appel est parti : on annule tout compte à rebours encore programmé
        // (ex. clic manuel « Appeler » pendant le décompte → sinon double appel).
        if (goTimerRef.current) {
          clearTimeout(goTimerRef.current)
          goTimerRef.current = null
        }
        setCompte(null)
        // Mode auto : la surveillance enchaîne au raccrochage ET récupère le résultat (via callId).
        surveillanceRef.current = {
          actif: true, vuActif: false, prospectId: p.id, statut: p.statut, callId: r.callId, entreprise: p.entreprise,
        }
        setSurveille(true)
      } else if (r.callId) {
        // Mode manuel : on vérifie en arrière-plan comment l'appel s'est terminé (numéro invalide ?).
        surveillerResultatManuel(r.callId, p.entreprise)
      }
      return
    }
    // ÉCHEC de l'appel Ringover : on le montre CLAIREMENT (avec la vraie raison),
    // au lieu de retomber en silence sur tel: (ce qui donnait l'impression que « rien ne se passe »).
    if (autoRef.current) {
      // Mode auto : on l'ARRÊTE (sinon la session resterait figée sans rien dire,
      // ou enchaînerait les échecs sur toute la file). L'utilisateur relance quand c'est réglé.
      setAuto(false)
      setAppelMsg({
        ok: false,
        texte:
          "Mode auto arrêté : l'appel n'est pas parti" +
          (r.message ? " — " + r.message : "") +
          ". Vérifie Ringover puis relance le mode auto.",
      })
      setTimeout(() => setAppelMsg(null), 10000)
      return
    }
    setAppelMsg({
      ok: false,
      texte: "L'appel n'est pas parti" + (r.message ? " — " + r.message : "") + ". Réessaie (bouton Appeler).",
    })
    setTimeout(() => setAppelMsg(null), 8000)
    // En mode manuel : on ouvre le softphone pour pouvoir composer à la main.
    const a = document.createElement("a")
    a.href = `tel:${p.telephone.replace(/\s/g, "")}`
    a.click()
  }

  // Vérifie en arrière-plan comment un appel MANUEL s'est terminé et PRÉVIENT si le numéro
  // est injoignable/invalide (ou répondeur). PAS de journalisation ici : en manuel c'est
  // l'utilisateur qui qualifie l'appel — sinon on créerait des DOUBLONS dans l'historique.
  async function surveillerResultatManuel(callId: string, entreprise?: string) {
    const m = await resoudreResultat(callId, entreprise)
    if (m?.texte) {
      setAppelMsg({ ok: false, texte: m.texte })
      setTimeout(() => setAppelMsg(null), 8000)
    }
  }

  // Appel direct depuis la barre de recherche : ouvre la FICHE complète du prospect
  // (mini-session à 1 prospect) pour prendre des notes / qualifier, ET lance l'appel.
  function appelerDirect(p: Prospect) {
    setAuto(false) // un appel direct est ponctuel/manuel → pas de compte à rebours auto
    autoRef.current = false
    verrouRef.current = false // repartir propre
    setFileStatut("Appel direct")
    setFileSession([p])
    setIndex(0)
    setStats({ appels: 0, decroches: 0, os: 0 })
    setRechercheDirecte("")
    setEnCours(true)
    declencherAppel(p)
  }

  // Mode automatique : à chaque NOUVEAU prospect (id qui change), un compte à rebours
  // (= le délai réglé) puis l'appel se lance tout seul. On NE dépend PAS de fileSession
  // (sinon éditer un champ relancerait l'appel à chaque lettre tapée).
  useEffect(() => {
    if (!enCours || !auto || !courant) {
      setCompte(null)
      return
    }
    // Numéro incorrect/incomplet → on PRÉVIENT puis on saute au suivant (pas d'appel dans le vide).
    if (!numeroValide(courant.telephone || "")) {
      setCompte(null)
      setAppelMsg({ ok: false, texte: `Numéro incorrect (${courant.entreprise || "prospect"}) — sauté.` })
      setTimeout(() => setAppelMsg(null), 3000)
      const skip = setTimeout(() => avancer(), 1500)
      return () => clearTimeout(skip)
    }
    // Numéro d'émission attribué mais SORTI de la rotation → on ne compose pas avec un
    // autre numéro (anti-spam) : on prévient et on saute au suivant.
    if (numerosPool.length && numeroPourProspect(courant, numerosPool, prospects).bloque) {
      setCompte(null)
      setAppelMsg({
        ok: false,
        texte: `${courant.entreprise || "Prospect"} : son numéro d'émission n'est plus en rotation — sauté (réactive-le ou réattribue).`,
      })
      setTimeout(() => setAppelMsg(null), 5000)
      const skip = setTimeout(() => avancer(), 1500)
      return () => clearTimeout(skip)
    }
    // Mode auto activé juste APRÈS un appel manuel sur CE prospect (< 20 s) : on ne
    // recompose pas par-dessus — on bascule direct en surveillance de fin d'appel.
    if (
      dernierCallIdRef.current &&
      courant.id &&
      dernierAppelProspectRef.current === courant.id &&
      Date.now() - dernierAppelRef.current < 20000 &&
      !surveillanceRef.current.actif
    ) {
      surveillanceRef.current = {
        actif: true,
        vuActif: false,
        prospectId: courant.id,
        statut: courant.statut,
        callId: dernierCallIdRef.current,
        entreprise: courant.entreprise,
      }
      setSurveille(true)
      setCompte(null)
      return
    }
    const cible = courant
    const delai = Math.max(2, cadence) // secondes
    setCompte(delai)
    const tick = setInterval(() => setCompte((c) => (c && c > 1 ? c - 1 : c)), 1000)
    // Avant de composer : on vérifie que l'appel PRÉCÉDENT est bien terminé (tu es peut-être
    // encore en ligne). On vérifie CET appel précis par son identifiant — pas le total d'équipe
    // (un compte admin voit aussi les appels des collègues). Sinon, re-vérification dans 3 s.
    let statutsKo = 0 // vérifications indisponibles d'affilée (réseau/API)
    async function tenterAppel() {
      // Quelqu'un est en train de t'appeler (appel entrant) → on ne compose pas par-dessus.
      if (entrantActif()) {
        goTimerRef.current = setTimeout(tenterAppel, 3000)
        return
      }
      if (dernierCallIdRef.current) {
        const st = await statutAppelsRingover(dernierCallIdRef.current)
        if (st.ok && st.actif) {
          statutsKo = 0
          goTimerRef.current = setTimeout(tenterAppel, 3000)
          return
        }
        // Vérification indisponible : on réessaie un peu (borné à ~15 s) plutôt que de
        // composer à l'aveugle par-dessus un appel peut-être encore en ligne.
        if (!st.ok && ++statutsKo < 5) {
          goTimerRef.current = setTimeout(tenterAppel, 3000)
          return
        }
      }
      // Toujours d'actualité ? (pendant la vérification réseau, l'utilisateur a pu
      // avancer / arrêter la session → on n'appelle pas le mauvais prospect)
      if (!enCoursRef.current || !autoRef.current) return
      const affiche = fileSessionRef.current[indexRef.current]
      if (!affiche || (cible.id ? affiche.id !== cible.id : affiche !== cible)) return
      declencherAppel(cible)
      setCompte(null)
    }
    goTimerRef.current = setTimeout(tenterAppel, delai * 1000)
    return () => {
      clearInterval(tick)
      if (goTimerRef.current) clearTimeout(goTimerRef.current)
      goTimerRef.current = null
    }
    // On dépend de `index` (et non de courant?.id) : fiable même si des prospects
    // ont le même id / pas d'id, et se relance bien à chaque changement de fiche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, enCours, index, cadence])

  // Couper le mode auto arrête toute surveillance en cours (évite un log fantôme au ré-activage).
  useEffect(() => {
    if (!auto) {
      surveillanceRef.current = { actif: false, vuActif: false }
      setSurveille(false)
    }
  }, [auto])

  // À l'arrêt de la session (Arrêter / Fin de session / fin de file) : on libère le verrou
  // anti-double-clic (sinon il peut rester posé et avaler le 1er clic de la session suivante)
  // et on arrête toute surveillance restante.
  useEffect(() => {
    if (!enCours) {
      verrouRef.current = false
      surveillanceRef.current = { actif: false, vuActif: false }
      setSurveille(false)
    }
  }, [enCours])

  // Surveillance de fin d'appel (mode auto « mains libres ») : toutes les 4 s, on demande
  // à Ringover combien d'appels sont en cours. Dès qu'un appel a démarré (vuActif) PUIS
  // qu'il n'y en a plus (raccrochage), on enregistre l'appel et on passe au suivant tout seul.
  useEffect(() => {
    if (!enCours || !auto) return
    let sansDemarrage = 0 // tours où l'appel n'a pas encore démarré
    let echecs = 0 // tours consécutifs où le statut est indisponible (réseau/API)
    let enVol = false // anti-empilement : une seule requête statut à la fois
    // Termine la surveillance : on AVANCE tout de suite (mains-libres, pas d'attente), puis on
    // récupère EN ARRIÈRE-PLAN le vrai résultat de l'appel (numéro invalide ? répondeur ?) pour
    // le journaliser correctement + prévenir si le numéro est mauvais.
    const finir = (resultatDefaut: string, s: { prospectId?: string; statut?: string; callId?: string; entreprise?: string }) => {
      surveillanceRef.current = { actif: false, vuActif: false }
      setSurveille(false)
      setStats((st) => ({ ...st, appels: st.appels + 1 })) // un appel auto = un appel dans les stats
      avancerRef.current()
      ;(async () => {
        let resultat = resultatDefaut
        if (s.callId) {
          const m = await resoudreResultat(s.callId, s.entreprise)
          if (m) {
            resultat = m.resultat
            if (m.texte) {
              setAppelMsg({ ok: false, texte: m.texte })
              setTimeout(() => setAppelMsg(null), 8000)
            }
          }
        }
        if (s.prospectId) enregistrerAppel(s.prospectId, resultat, s.statut ?? "").catch(() => setErreurSave(true))
      })()
    }
    const iv = setInterval(async () => {
      if (enVol) return
      if (!surveillanceRef.current.actif) return
      enVol = true
      let res: { ok: boolean; total: number; actif: boolean }
      try {
        // On suit CET appel précis (callId) : fiable même si des collègues sont en ligne
        // (un compte admin voit les appels de toute l'équipe dans le total).
        res = await statutAppelsRingover(surveillanceRef.current.callId)
      } finally {
        enVol = false
      }
      // Re-lire APRÈS l'attente : l'utilisateur a pu qualifier/avancer/reculer entre-temps.
      const s = surveillanceRef.current
      if (!s.actif) return
      // Si on ne surveille plus le prospect actuellement affiché (Précédent/Passer) → on arrête.
      if (s.prospectId && s.prospectId !== fileSessionRef.current[indexRef.current]?.id) {
        surveillanceRef.current = { actif: false, vuActif: false }
        setSurveille(false)
        return
      }
      if (!res.ok) {
        // Statut indisponible (clé/permission/réseau) : on ne reste pas bloqué à vie.
        echecs++
        if (echecs >= 8) {
          surveillanceRef.current = { actif: false, vuActif: false }
          setSurveille(false)
          setAppelMsg({ ok: false, texte: "Statut Ringover indisponible — passe au suivant à la main si besoin." })
          setTimeout(() => setAppelMsg(null), 6000)
        }
        return
      }
      echecs = 0
      // NOTRE appel est-il en ligne ? (par callId si connu, sinon repli sur le total)
      const enLigne = s.callId ? res.actif : res.total > 0
      if (enLigne) {
        // L'appel est en cours (décroché) : on note le démarrage, on remet les compteurs à 0.
        sansDemarrage = 0
        surveillanceRef.current = { ...s, vuActif: true, zeros: 0 }
      } else if (s.vuActif) {
        // Plus d'appel après en avoir vu un : on exige 2 tours consécutifs à 0 (anti-hoquet /
        // mise en attente passagère) avant de considérer que c'est raccroché.
        const zeros = (s.zeros ?? 0) + 1
        if (zeros < 2) {
          surveillanceRef.current = { ...s, zeros }
          return
        }
        finir("Appel passé", s)
      } else {
        // Aucun appel démarré : soit ça sonne encore (Ringover ne compte qu'après décroché),
        // soit pas de réponse. On patiente ≈28 s puis on avance (jamais bloqué sur « Appel en cours »).
        sansDemarrage++
        if (sansDemarrage >= 7) finir("Pas de réponse", s)
      }
    }, 4000)
    return () => clearInterval(iv)
  }, [auto, enCours])

  // Libère le verrou anti-double-clic à chaque nouveau prospect.
  useEffect(() => {
    verrouRef.current = false
  }, [index])

  // Raccourcis clavier pendant la session (sauf quand on tape dans un champ).
  useEffect(() => {
    if (!enCours) return
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      // On ignore si le focus est sur un champ de saisie OU sur un bouton/lien
      // (sinon Espace double-active le bouton et "2" journalise un appel par erreur).
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.tagName === "BUTTON" ||
          el.tagName === "A" ||
          el.isContentEditable)
      )
        return
      if (e.key === " ") {
        e.preventDefault()
        avancer()
        return
      }
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= resultatsNonJoint.length) {
        // Touches 1-4 : « pas joint »
        e.preventDefault()
        appelNonJoint(resultatsNonJoint[n - 1])
      } else if (n > resultatsNonJoint.length && n <= resultatsNonJoint.length + statuts.length) {
        // Touches suivantes : « joint → état » (décroché)
        e.preventDefault()
        appliquer(statuts[n - resultatsNonJoint.length - 1].libelle)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enCours, index, fileSession, commentaires, statuts])

  // Petit bandeau d'alerte si une sauvegarde a échoué (affiché sur les 2 écrans).
  const toastErreur = erreurSave ? (
    <div className="fixed bottom-4 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-3 rounded-lg bg-red-600 px-4 py-2.5 text-sm text-white shadow-lg">
      <AlertTriangle size={16} className="shrink-0" />
      Une sauvegarde n'a pas pu être enregistrée (vérifiez votre connexion).
      <button
        onClick={() => setErreurSave(false)}
        className="ml-1 rounded px-2 py-0.5 font-medium hover:bg-red-700"
      >
        OK
      </button>
    </div>
  ) : null

  const toastAppel = appelMsg ? (
    <div className="fixed bottom-16 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm text-white shadow-lg">
      <Phone size={16} className="shrink-0" />
      {appelMsg.texte}
      <button
        onClick={() => setAppelMsg(null)}
        className="ml-1 rounded px-2 py-0.5 font-medium hover:bg-blue-700"
      >
        OK
      </button>
    </div>
  ) : null

  // --- Écran de configuration ---
  if (!enCours) {
    const fileApercu = fileDeLEtat(fileStatut)
    const q = rechercheDirecte.trim().toLowerCase()
    const resultatsDirects = q
      ? prospects
          .filter((p) => [p.entreprise, p.contact, p.telephone].join(" ").toLowerCase().includes(q))
          .slice(0, 6)
      : []
    return (
      <div className="px-8 pb-10">
        {toastErreur}
      {toastAppel}
        <div className="mx-auto max-w-xl space-y-5">
          {erreur && <BandeauErreur message={erreur} />}

          {/* Appel direct : rechercher un prospect et l'appeler tout de suite */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Phone size={17} className="text-green-600" />
              Appeler un prospect directement
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Pour un appel ponctuel ou un test, sans lancer toute la file.
            </p>
            <div className="relative mt-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={rechercheDirecte}
                onChange={(e) => setRechercheDirecte(e.target.value)}
                placeholder="Nom, agence ou téléphone…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            {q && (
              <div className="mt-3 space-y-2">
                {resultatsDirects.length === 0 ? (
                  <p className="py-2 text-center text-sm text-slate-400">Aucun prospect trouvé.</p>
                ) : (
                  resultatsDirects.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{p.entreprise}</p>
                        <p className="truncate text-xs text-slate-500">
                          {p.contact ? p.contact + " · " : ""}
                          {p.telephone || "pas de numéro"}
                        </p>
                      </div>
                      <button
                        onClick={() => appelerDirect(p)}
                        disabled={!p.telephone}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
                      >
                        <Phone size={15} /> Appeler
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* À relancer aujourd'hui / en retard */}
          {relances.length > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-6 shadow-sm">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Clock size={18} className="text-orange-600" />
                À relancer
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {relances.length} prospect{relances.length > 1 ? "s" : ""} à rappeler aujourd'hui (ou en retard).
              </p>
              <div className="mt-4 space-y-2">
                {relances.map((p) => {
                  const retard = estEnRetard(p.prochaineRelance)
                  const heure = heureRelance(p.prochaineRelance)
                  return (
                    <div
                      key={p.id}
                      className="rounded-lg border border-slate-200 bg-white p-3.5"
                    >
                      {/* Ligne 1 : agence + gestionnaire à gauche, statut à droite */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {p.entreprise}
                          </p>
                          {p.contact && (
                            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                              <User size={12} className="shrink-0 text-slate-400" />
                              {p.contact}
                            </p>
                          )}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            retard ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {retard ? "En retard" : "Aujourd'hui"}
                        </span>
                      </div>

                      {/* Ligne 2 : quand + téléphone */}
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock size={12} className="text-orange-500" />
                          le {p.prochaineRelance.slice(0, 10)}
                          {heure && <span className="font-semibold text-slate-700"> à {heure}</span>}
                        </span>
                        {p.telephone && (
                          <span className="flex items-center gap-1">
                            <Phone size={12} className="text-slate-400" />
                            {p.telephone}
                          </span>
                        )}
                      </p>

                      {/* Ligne 3 : actions */}
                      <div className="mt-3 flex justify-end gap-2">
                        {p.telephone && (
                          <a
                            href={`tel:${p.telephone.replace(/\s/g, "")}`}
                            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                          >
                            <Phone size={14} /> Appeler
                          </a>
                        )}
                        <button
                          onClick={() => relanceFaite(p)}
                          title="Marquer la relance comme faite (efface la date)"
                          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                        >
                          <Check size={14} /> Fait
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* RDV du jour */}
          {rdvJour.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <Clock size={18} className="text-emerald-600" />
                Vos RDV aujourd'hui
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Appelez vos rendez-vous à l'heure prévue.
              </p>
              <div className="mt-4 space-y-2">
                {rdvJour.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                  >
                    <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-1 text-sm font-semibold text-emerald-700">
                      {r.heure}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {r.entreprise}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {r.telephone}
                        {r.note ? " · " + r.note : ""}
                      </p>
                    </div>
                    <a
                      href={`tel:${(r.telephone ?? "").replace(/\s/g, "")}`}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                    >
                      <Phone size={14} /> Appeler
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Créneaux programmés (raccourcis) */}
          {creneaux.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Vos créneaux
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Lancez une session programmée en un clic.
              </p>
              <div className="mt-4 space-y-2">
                {creneaux.map((cr) => {
                  const st = statuts.find((s) => s.id === cr.etatId)
                  const n = st ? comptes[st.libelle] ?? 0 : 0
                  return (
                    <div
                      key={cr.id}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5"
                    >
                      <Clock size={16} className="shrink-0 text-blue-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {cr.nom}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {st?.libelle ?? "—"} · {cr.heureDebut}–{cr.heureFin} ·{" "}
                          {cr.cadenceSecondes}s ·{" "}
                          {joursLabels
                            .filter((j) => cr.jours.includes(j.num))
                            .map((j) => j.court)
                            .join(" ")}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">
                        {n}
                      </span>
                      <button
                        onClick={() => lancerCreneau(cr)}
                        disabled={n === 0}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                      >
                        <Play size={14} /> Lancer
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Lancer une session d'appels
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Ou choisissez manuellement la file à appeler (par état) et la
              cadence.
            </p>

            <label className="mt-5 block text-sm font-medium text-slate-700">
              File d'appel
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {statuts.map((s) => {
                const n = comptes[s.libelle] ?? 0
                const actif = fileStatut === s.libelle
                return (
                  <button
                    key={s.id ?? s.libelle}
                    onClick={() => setFileStatut(s.libelle)}
                    disabled={n === 0}
                    className={
                      "flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-40 " +
                      (actif
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 hover:bg-slate-50")
                    }
                  >
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${palette[s.couleur].pill}`}
                    >
                      {s.libelle}
                    </span>
                    <span className="font-medium text-slate-500">{n}</span>
                  </button>
                )
              })}
            </div>

            <label className="mt-5 block text-sm font-medium text-slate-700">Ordre d'appel</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  { cle: "base", label: "📋 Ordre de la base", aide: "L'ordre d'origine" },
                  { cle: "meilleurs", label: "🎯 Meilleurs d'abord", aide: "Priorité + gros volume d'OS" },
                  { cle: "melange", label: "🎲 Mélangé", aide: "Aléatoire, pour varier" },
                ] as { cle: "base" | "meilleurs" | "melange"; label: string; aide: string }[]
              ).map((o) => (
                <button
                  key={o.cle}
                  onClick={() => setOrdreAppel(o.cle)}
                  title={o.aide}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    ordreAppel === o.cle
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <label className="mt-5 block text-sm font-medium text-slate-700">Priorités à appeler</label>
            <p className="text-xs text-slate-400">
              Décoche une priorité pour l'exclure de cette session (ex. n'appeler que les Haute + Moyenne).
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRIORITES.map((prio) => {
                const actif = Boolean(prioritesActives[prio])
                const n = prospects.filter((p) => p.statut === fileStatut && p.priorite === prio).length
                const emoji = prio === "Haute" ? "🔴" : prio === "Moyenne" ? "🟠" : "🟢"
                return (
                  <button
                    key={prio}
                    onClick={() => setPrioritesActives((prev) => ({ ...prev, [prio]: !prev[prio] }))}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      actif
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50"
                    }`}
                  >
                    <span className={actif ? "" : "opacity-40"}>{emoji}</span>
                    {prio}
                    <span className={`text-xs ${actif ? "text-blue-400" : "text-slate-300"}`}>({n})</span>
                    {actif && <Check size={13} className="text-blue-600" />}
                  </button>
                )
              })}
            </div>
            {PRIORITES.every((prio) => !prioritesActives[prio]) && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Aucune priorité cochée → aucun prospect à appeler. Coche au moins une priorité.
              </p>
            )}

            <label className="mt-5 block text-sm font-medium text-slate-700">
              Délai avant l'appel automatique : {cadence} s
            </label>
            <p className="text-xs text-slate-400">
              Temps de préparation avant que le « Mode auto » ne lance l'appel suivant.
            </p>
            <input
              type="range"
              min={3}
              max={60}
              step={1}
              value={cadence}
              onChange={(e) => setCadence(Number(e.target.value))}
              className="mt-2 w-full"
            />

            <button
              onClick={demarrer}
              disabled={fileApercu.length === 0}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
            >
              <Play size={17} />
              Démarrer la session ({fileApercu.length} appel
              {fileApercu.length > 1 ? "s" : ""})
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- Écran de session en cours ---
  return (
    <div className="px-8 pb-10">
      {toastErreur}
      {toastAppel}
      {rdvPour && (
        <NouveauRdvModal
          prospectId={rdvPour.id ?? ""}
          entreprise={rdvPour.entreprise}
          onClose={() => setRdvPour(null)}
          onCree={rechargerRdvJour}
        />
      )}
      {rdvJour.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
          <Clock size={18} className="shrink-0 text-emerald-600" />
          <span className="text-sm text-emerald-900">
            <span className="font-semibold">RDV aujourd'hui :</span>{" "}
            {rdvJour[0].heure} — {rdvJour[0].entreprise}
            {rdvJour.length > 1 ? ` (+${rdvJour.length - 1} autre${rdvJour.length > 2 ? "s" : ""})` : ""}
          </span>
          <a
            href={`tel:${(rdvJour[0].telephone ?? "").replace(/\s/g, "")}`}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            <Phone size={14} /> Appeler le RDV
          </a>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-sm text-slate-500">
            File « {fileStatut} » · appel {index + 1} / {fileSession.length}
          </span>
          <span className="flex items-center gap-3 text-xs font-medium">
            <span className="text-slate-600">📞 {stats.appels} appels</span>
            <span className="text-emerald-600">✓ {stats.decroches} décrochés</span>
            <span className="text-blue-600">🎯 {stats.os} demande{stats.os > 1 ? "s" : ""} d'OS</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAuto((v) => !v)}
            title="Appelle chaque prospect automatiquement"
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
              auto
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Phone size={15} /> Mode auto : {auto ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => {
              setEnCours(false)
              setIndex(0)
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Arrêter
          </button>
        </div>
      </div>

      {/* Compte à rebours du mode auto */}
      {auto && compte !== null && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3">
          <Phone size={18} className="shrink-0 animate-pulse text-blue-600" />
          <span className="text-sm font-medium text-blue-900">
            Appel automatique dans {compte}…
          </span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => {
                if (goTimerRef.current) clearTimeout(goTimerRef.current) // annule l'appel programmé
                goTimerRef.current = null
                declencherAppel(courant)
                setCompte(null)
              }}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Appeler maintenant
            </button>
            <button
              onClick={() => setAuto(false)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              Stop auto
            </button>
          </div>
        </div>
      )}

      {/* Surveillance de fin d'appel (mode auto mains libres) */}
      {auto && surveille && compte === null && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
          <Phone size={18} className="shrink-0 animate-pulse text-emerald-600" />
          <span className="text-sm font-medium text-emerald-900">
            Appel en cours — je passe au suivant automatiquement dès que tu raccroches.
          </span>
          <button
            onClick={() => avancer()}
            className="ml-auto rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Passer maintenant
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {courant ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                    <Building2 size={22} />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {courant.entreprise}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classePastille(courant.statut, statuts)}`}
                      >
                        {courant.statut}
                      </span>
                      {nbInfosManquantes(courant) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          <AlertTriangle size={12} /> {nbInfosManquantes(courant)} info
                          {nbInfosManquantes(courant) > 1 ? "s" : ""} à compléter
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => declencherAppel(courant)}
                  disabled={telCourantInvalide || emissionBloquee}
                  title={
                    telCourantInvalide
                      ? "Numéro incorrect ou incomplet"
                      : emissionBloquee
                        ? "Son numéro d'émission n'est plus en rotation — voir le bandeau rouge"
                        : undefined
                  }
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Phone size={17} /> Appeler
                </button>
              </div>

              {/* Numéro en GROS + Copier (si valide) — sinon alerte rouge + champ à corriger */}
              {!telCourantInvalide ? (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                  <Phone size={20} className="shrink-0 text-green-600" />
                  <span className="text-2xl font-bold tracking-wide text-slate-900">
                    {courant.telephone}
                  </span>
                  <button
                    onClick={copierNumero}
                    className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {copie ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    {copie ? "Copié !" : "Copier"}
                  </button>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-red-700">
                    <AlertTriangle size={15} className="shrink-0" />
                    {courant.telephone
                      ? "Numéro incorrect ou incomplet — corrigez-le pour pouvoir appeler"
                      : "Téléphone manquant — à compléter"}
                  </p>
                  <div className="flex items-center gap-2">
                    <Phone size={18} className="shrink-0 text-red-400" />
                    <input
                      value={courant.telephone || ""}
                      onChange={(e) => majChampCourant("telephone", e.target.value)}
                      onBlur={(e) => {
                        const f = formaterTelephone(e.target.value)
                        majChampCourant("telephone", f)
                        sauverChamp("telephone", f)
                      }}
                      placeholder="Ex. 01 84 25 80 81"
                      className="w-full rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-sm text-red-700 outline-none placeholder:text-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    />
                  </div>
                </div>
              )}

              {/* Numéro d'émission (rotation intelligente) — INFO : l'appel part tout seul avec ce numéro */}
              {numeroEmissionCourant && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2">
                  <Phone size={15} className="shrink-0 text-blue-600" />
                  <span className="text-xs text-slate-600">
                    Appel émis automatiquement depuis
                    <b className="ml-1 text-slate-900">{numeroEmissionCourant}</b>
                  </span>
                </div>
              )}

              {/* APPEL BLOQUÉ : son numéro d'émission est sorti de la rotation (anti-spam :
                  on n'appelle jamais un prospect avec un autre numéro que le sien). */}
              {emissionBloquee && attributionCourante && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
                    <AlertTriangle size={15} className="shrink-0" />
                    Appel bloqué — numéro d'émission hors rotation
                  </p>
                  <p className="mt-1 text-xs text-red-600">
                    Ce prospect a toujours été appelé avec le{" "}
                    <b className="text-red-800">{attributionCourante.numero}</b>, actuellement en pause
                    ou retiré de ta réserve. Pour rester cohérent, le logiciel n'appellera pas avec un
                    autre numéro.
                  </p>
                  <p className="mt-1 text-xs text-red-600">
                    → Réactive ce numéro dans <b>Paramétrage → Numéros d'appel</b>, ou change-le en
                    connaissance de cause :
                  </p>
                  <button
                    onClick={reattribuerNumero}
                    className="mt-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    Attribuer un nouveau numéro à ce prospect
                  </button>
                </div>
              )}

              {/* Autres infos — modifiables pendant l'appel, en rouge si manquantes */}
              <div className="mt-4 space-y-2">
                {(
                  [
                    { cle: "email", icone: <Mail size={15} />, label: "Email" },
                    { cle: "contact", icone: <User size={15} />, label: "Gestionnaire (nom)" },
                    { cle: "adresse", icone: <MapPin size={15} />, label: "Adresse" },
                  ] as { cle: ChampInfo; icone: ReactNode; label: string }[]
                ).map((f) => {
                  const valeur = courant[f.cle] || ""
                  const manquant = !valeur.trim()
                  return (
                    <div key={f.cle} className="flex items-center gap-2">
                      <span className={manquant ? "text-red-400" : "text-slate-400"}>{f.icone}</span>
                      <input
                        value={valeur}
                        onChange={(e) => majChampCourant(f.cle, e.target.value)}
                        onBlur={(e) => sauverChamp(f.cle, e.target.value)}
                        placeholder={`${f.label} manquant — à compléter`}
                        className={`w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none ${
                          manquant
                            ? "border-red-300 bg-red-50 text-red-700 placeholder:text-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                            : "border-slate-200 text-slate-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        }`}
                      />
                    </div>
                  )
                })}
              </div>

              {courant.id && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                    Historique
                  </p>
                  <HistoriqueProspect key={courant.id} prospectId={courant.id} compact />
                </div>
              )}

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Commentaire
                  </label>
                  {Reconnaissance && (
                    <button
                      onClick={dicterCommentaire}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${
                        ecoute
                          ? "animate-pulse bg-red-600 text-white"
                          : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Mic size={13} /> {ecoute ? "Écoute… (cliquer pour arrêter)" : "Dicter"}
                    </button>
                  )}
                </div>
                <textarea
                  value={commentaireCourant}
                  onChange={(e) =>
                    setCommentaires((prev) => ({ ...prev, [cleCourant]: e.target.value }))
                  }
                  onBlur={sauverCommentaire}
                  rows={2}
                  placeholder="Ce qui a été dit pendant l'appel… (ou cliquez sur « Dicter » 🎤)"
                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <p className="mt-4 mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Pas joint
                <span className="font-normal normal-case text-slate-400">— raccourcis : touches 1-{resultatsNonJoint.length} · Espace = passer</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {resultatsNonJoint.map((r, i) => (
                  <button
                    key={r}
                    onClick={() => appelNonJoint(r)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{i + 1}</kbd>
                    {r}
                  </button>
                ))}
              </div>

              <p className="mt-4 mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Joint → nouvel état
                <span className="font-normal normal-case text-slate-400">— raccourcis : touches {resultatsNonJoint.length + 1} et +</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {statuts.map((s, i) => {
                  const touche = resultatsNonJoint.length + i + 1
                  return (
                  <button
                    key={s.id ?? s.libelle}
                    onClick={() => appliquer(s.libelle)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 ${palette[s.couleur].pill}`}
                  >
                    {touche <= 9 && (
                      <kbd className="rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold">{touche}</kbd>
                    )}
                    {s.libelle}
                  </button>
                  )
                })}
              </div>

              <p className="mt-4 mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Rappeler plus tard
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="datetime-local"
                  value={relanceInput}
                  onChange={(e) => setRelanceInput(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
                <button
                  onClick={programmerRelance}
                  disabled={!relanceInput}
                  className="flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                >
                  <Clock size={14} /> Programmer le rappel
                </button>
                {relanceMsg && (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <Check size={13} /> {relanceMsg}
                  </span>
                )}
              </div>

              <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <button
                  onClick={reculer}
                  disabled={index === 0}
                  title="Revenir au prospect précédent (si erreur)"
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  <Undo2 size={16} /> Précédent
                </button>
                <button
                  onClick={() => setRdvPour(courant)}
                  className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  <CalendarPlus size={16} /> Programmer un RDV
                </button>
                <button
                  onClick={avancer}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  <SkipForward size={16} /> Passer
                  <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Espace</kbd>
                </button>
                <button
                  onClick={() => {
                    setEnCours(false)
                    setIndex(0)
                  }}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  <PhoneOff size={16} /> Fin de session
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              File terminée 🎉
            </div>
          )}
        </div>

        <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">📞 Script d'appel</p>
            <button
              onClick={() => {
                if (scriptEdit) ecrireParametre("script_appel", script).catch(() => setErreurSave(true))
                setScriptEdit((v) => !v)
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              {scriptEdit ? "Enregistrer" : "Modifier"}
            </button>
          </div>
          {scriptEdit ? (
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={8}
              placeholder="Votre accroche, vos arguments, les objections types…&#10;Ex : Bonjour, STC Bâtiment, nous intervenons pour les gestionnaires locatifs sur…"
              className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
          ) : script.trim() ? (
            <p className="whitespace-pre-line text-sm text-slate-700">{script}</p>
          ) : (
            <p className="text-sm text-slate-400">
              Aucun script. Cliquez « Modifier » pour écrire votre accroche et vos arguments — ils resteront affichés pendant vos appels.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-medium text-slate-700">
            File d'attente
          </p>
          <div className="flex flex-col gap-1.5">
            {fileSession.slice(index, index + 8).map((p, i) => (
              <div
                key={p.id ?? p.entreprise}
                className={
                  "truncate rounded-md px-2.5 py-1.5 text-sm " +
                  (i === 0
                    ? "bg-blue-50 font-medium text-blue-700"
                    : "text-slate-600")
                }
              >
                {p.entreprise}
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
