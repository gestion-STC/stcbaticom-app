// ════════════════════════════════════════════════════════════════════════════
// SESSIONS DE CALL v2 — « petite copie d'Aircall » (Mahdi, 09/10/2026).
//
// Trois colonnes : la file à gauche, l'agence en cours au centre, son fil à
// droite. On choisit une des quatre files, un secteur du jour, on démarre ;
// le mode automatique compose tout seul après un compte à rebours. Après
// chaque appel, la barre de résultat pose UNE question, quatre boutons ; la
// base (`appel_enregistrer`) écrit l'étape, les tentatives et les tâches.
//
// La téléphonie est reprise de l'ancien écran, éprouvée : lancement par le
// relais Ringover, surveillance toutes les 4 s, détail de l'appel en arrière-
// plan, numéro d'émission attitré par agence (jamais un autre en douce).
//
// La page reste montée en permanence (App.tsx la masque) : une session en
// cours ne se coupe pas quand on va lire la boîte ou une fiche. `actif` dit
// si elle est affichée : on rafraîchit les repères au retour, jamais la file
// pendant une session.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  ArrowRight, CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, ExternalLink, Mail, Mic, MicOff, Phone, PhoneIncoming, PhoneOutgoing,
  Play, Plus, Search, Square, SquareCheck, StickyNote, type LucideIcon,
  ArrowRightLeft,
} from "lucide-react"
import type { Prospect } from "../../data"
import { entrantActif } from "../../lib/appelEntrantActif"
import { useSession } from "../../lib/auth"
import { nomAffiche } from "../../lib/comptes"
import type { Message } from "../../lib/messagesDb"
import { chargerNumeros } from "../../lib/numerosEmission"
import { ecrireParametre, lireParametre } from "../../lib/parametresDb"
import { detailAppelRingover, lancerAppelRingover, statutAppelsRingover } from "../../lib/ringover"
import { chiffresTel, formaterTelephone, numeroValide } from "../../lib/telephone"
import {
  agencesAppeleesAujourdHui, chargerAgence, chargerAgences, chargerFile, chargerSecteurs, compterAppelsDuJourParNumero, compterFiles, creerContact, creerNote, creerRdv, creerTache,
  enregistrerAppel, majAgence, type AgenceComplete,
} from "../../demarchage/db"
import {
  ETAPES, FILES, ROLES_CONTACT, SORTIES, dureeLisible, libelleEtape, libelleRole, libelleType, nomContact, numeroParDefaut, pastilleEtape,
  type Activite, type Agence, type File, type Resultat, type RoleContact, type Secteur, type TypeActivite,
} from "../../demarchage/modele"
import {
  DELAI_ANTI_DOUBLE_APPEL_MS, ESSAIS_DETAIL, INTERVALLE_SURVEILLANCE_MS, PAUSE_DETAIL_MS, SURVEILLANCE_INITIALE, TYPES_RDV,
  compteARebours, constituerFile, dateHeureCourte, decrireActivite, demainDixHeures, dureeAppel, jaugeDuJour, lignesNumeros, numeroEmissionPour, numeroLeMoinsAttribue,
  observerAppel, prospectDepuisAgence, resumeEcriture, suggestionDepuisDetail, texteDernierAppel, versIso,
  type ChoixResultat, type TypeRdv, type Verdict,
} from "../../demarchage/sessionOutils"
import { Bandeau, Bouton, Carte, Case, Champ, Chargement, Dialogue, EnTetePage, Etiquette, Interrupteur, Pastille, Selecteur, Vide, Zone } from "../../ui"
import EnvoyerEmailModal from "../EnvoyerEmailModal"
import BarreResultat from "./BarreResultat"

// ── La dictée vocale du navigateur (Chrome / Edge), typée sans `any` ──
type ResultatDictee = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }
type Dictee = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: ResultatDictee) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}
type FabriqueDictee = new () => Dictee
const FABRIQUE_DICTEE: FabriqueDictee | null = (() => {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: FabriqueDictee; webkitSpeechRecognition?: FabriqueDictee }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
})()

// ── L'appel en cours ──
type EtapeAppel = "attente" | "en_cours" | "termine" | "sans_suivi"
type AppelEnCours = {
  agenceId: string
  numeroAppele: string
  contactId: string | null
  numeroEmission: string
  callId: string
  debut: number // lancement
  enLigneDepuis: number | null // première fois vu en ligne (la durée part de là)
  fin: number | null
  etape: EtapeAppel
  manuel: boolean // « Noter un appel sans Ringover »
}
const TEXTES_APPEL: Record<EtapeAppel, string> = {
  attente: "Appel lancé : décroche sur ton poste Ringover, l'agence est composée ensuite.",
  en_cours: "En ligne",
  termine: "Appel terminé : note le résultat ci-dessous.",
  sans_suivi: "Suivi indisponible : note le résultat à la main.",
}

const CONTACT_VIDE = { prenom: "", nom: "", role: "gestionnaire" as RoleContact, ligneDirecte: "", mobile: "", email: "" }
type Action = "tache" | "rdv" | "note" | "passer"
const messageDe = (e: unknown) => (e instanceof Error ? e.message : String(e))

// ── Petits morceaux d'écran ──
function Section({ titre, droite, children }: { titre: string; droite?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-colonne font-semibold uppercase tracking-[0.07em] text-encre-2">{titre}</h3>
        {droite}
      </div>
      {children}
    </section>
  )
}

function LigneFile({ agence: a, courante, appelee, maintenant, onClick }: { agence: Agence; courante: boolean; appelee: boolean; maintenant: Date; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={courante ? "true" : undefined}
      className={"block w-full border-b border-l-2 border-b-fond-4 px-4 py-2 text-left transition-colors hover:bg-fond-2 " + (courante ? "border-l-signature bg-fond-3" : "border-l-transparent")}
    >
      <div className="flex items-center gap-2">
        <span className={"min-w-0 flex-1 truncate text-legende " + (courante ? "font-semibold" : "font-medium") + " text-encre"}>{a.nom}</span>
        {appelee ? <Check size={14} className="shrink-0 text-ok" aria-label="Appelée aujourd'hui" /> : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-colonne text-encre-2">
        <Pastille role={pastilleEtape(a.etape)}>{libelleEtape(a.etape)}</Pastille>
        {a.nbContacts > 0 ? <Pastille role="info" point>sourcée</Pastille> : null}
        {a.secteurLibelle ? <span>{a.secteurLibelle}</span> : null}
        {a.enseigne ? <span>· {a.enseigne}</span> : null}
      </div>
      <div className="mt-0.5 text-colonne text-encre-2">
        {texteDernierAppel(a, maintenant)}
        {a.prochaineEcheance ? ` · ${a.prochaineTache || "tâche"} le ${dateHeureCourte(a.prochaineEcheance)}` : ""}
      </div>
    </button>
  )
}

const ICONES_FIL: Record<TypeActivite, LucideIcon> = { appel: PhoneOutgoing, email: Mail, rdv: CalendarClock, tache: SquareCheck, note: StickyNote, etape: ArrowRight }
function LigneFil({ a }: { a: Activite }) {
  const d = decrireActivite(a)
  const Icone = a.type === "appel" && a.sens === "entrant" ? PhoneIncoming : (ICONES_FIL[a.type] ?? StickyNote)
  return (
    <li className="flex gap-3 py-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fond-3 text-encre-2">
        <Icone size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-legende font-medium text-encre">{d.titre}</span>
          <span className="chiffres shrink-0 text-colonne text-encre-2">{dateHeureCourte(a.date)}</span>
        </div>
        {d.detail ? <div className="text-colonne text-encre-2">{d.detail}</div> : null}
        {d.etat ? <Pastille role={d.etat === "fait" ? "fait" : "attente"} className="mt-1">{d.etat === "fait" ? "faite" : "ouverte"}</Pastille> : null}
        {a.note ? <p className="mt-1 whitespace-pre-line text-legende text-encre">{a.note}</p> : null}
      </div>
    </li>
  )
}

function LigneMessage({ m }: { m: Message }) {
  return (
    <div className="flex items-center gap-2 py-1.5 text-legende">
      <Mail size={14} className="shrink-0 text-encre-2" />
      <span className="min-w-0 flex-1 truncate text-encre">
        {m.sens === "entrant" ? "Reçu" : "Envoyé"} · {m.objet || "(sans objet)"}
      </span>
      <span className="chiffres shrink-0 text-colonne text-encre-2">{dateHeureCourte(m.date)}</span>
    </div>
  )
}

export default function SessionCall({ actif = true, agenceInitiale = null, onOuvrirAgence }: { actif?: boolean; agenceInitiale?: string | null; onOuvrirAgence?: (id: string, options?: { etape?: boolean }) => void }) {
  const session = useSession()
  const compteNom = nomAffiche(session)

  // ── Les réglages et la file ──
  const [file, setFile] = useState<File>("a_prospecter")
  const [compteurs, setCompteurs] = useState<Record<File, number> | null>(null)
  const [secteurs, setSecteurs] = useState<Secteur[]>([])
  const [secteurDuJour, setSecteurDuJour] = useState("")
  // Mahdi, 09/10 : « si je veux appeler les gestionnaires joints, je fais comment ? »
  // → un filtre par étape sur la file ("" = toutes les étapes de la file).
  const [etapeFiltre, setEtapeFiltre] = useState("")
  // Mahdi, 09/10 : « une agence où on a le nom et le mail du gestionnaire est plus
  // qualitative : il faut différencier les sourcées des non sourcées ».
  // Sourcée = au moins un gestionnaire connu (un contact sur la fiche).
  const [sourcage, setSourcage] = useState<"" | "sourcees" | "non_sourcees">("")
  const [inclureDejaAppelees, setInclureDejaAppelees] = useState(false)
  const [auto, setAuto] = useState(false)
  const [cadence, setCadence] = useState(5)
  const [enCours, setEnCours] = useState(false)
  const [fileAgences, setFileAgences] = useState<Agence[]>([])
  const [chargementFile, setChargementFile] = useState(true)
  const [index, setIndex] = useState(0)
  const [directeId, setDirecteId] = useState<string | null>(null) // une agence appelée hors file
  const [appelees, setAppelees] = useState<Set<string>>(() => new Set())
  const [reserve, setReserve] = useState<string[]>([])
  const [compteursNumero, setCompteursNumero] = useState<Map<string, number>>(() => new Map())
  const [quota, setQuota] = useState(0)
  const [script, setScript] = useState("")
  const [scriptOuvert, setScriptOuvert] = useState(false)
  const [scriptEdit, setScriptEdit] = useState(false)
  const [scriptBrouillon, setScriptBrouillon] = useState("")

  // ── L'agence en cours ──
  const [courante, setCourante] = useState<AgenceComplete | null>(null)
  const [note, setNote] = useState("")
  const [ecoute, setEcoute] = useState(false)
  const [formContact, setFormContact] = useState(false)
  const [nouveauContact, setNouveauContact] = useState(CONTACT_VIDE)
  const [copie, setCopie] = useState("")

  // ── L'appel ──
  const [appel, setAppel] = useState<AppelEnCours | null>(null)
  const [barreVisible, setBarreVisible] = useState(false)
  const [contactEnLigne, setContactEnLigne] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<Resultat | null>(null)
  const [indice, setIndice] = useState("")
  const [enregistrement, setEnregistrement] = useState(false)
  const [compteFin, setCompteFin] = useState<number | null>(null)
  const [maintenant, setMaintenant] = useState(() => Date.now())

  // ── Les à-côtés ──
  const [erreur, setErreur] = useState("")
  const [info, setInfo] = useState("")
  const [recherche, setRecherche] = useState("")
  const [resultats, setResultats] = useState<Agence[] | null>(null)
  const [dialogue, setDialogue] = useState<Action | null>(null)
  const [formAction, setFormAction] = useState({ titre: "", quand: "", type: "telephone" as TypeRdv, note: "" })
  const [envoiPour, setEnvoiPour] = useState<Prospect | null>(null)

  const agenceCouranteId = directeId ?? fileAgences[index]?.id ?? null
  // La fiche affichée : seulement si c'est bien celle de l'agence en cours (pas la précédente pendant le chargement).
  const fiche = courante && courante.agence.id === agenceCouranteId ? courante : null

  // Refs pour les rappels asynchrones (minuteries, surveillance) : toujours la dernière valeur.
  const enVie = useRef(true)
  const autoRef = useRef(auto)
  const enCoursRef = useRef(enCours)
  const appelRef = useRef(appel)
  const barreRef = useRef(barreVisible)
  const couranteRef = useRef(courante)
  const fileRef = useRef(fileAgences)
  const indexRef = useRef(index)
  const directeRef = useRef(directeId)
  const agenceIdRef = useRef(agenceCouranteId)
  const reserveRef = useRef(reserve)
  const noteRef = useRef(note)
  const goTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dicteeRef = useRef<Dictee | null>(null)
  const dernierLancementRef = useRef(0)
  const dernierCallIdRef = useRef("")
  const dejaAffiche = useRef(false)
  const lancerRef = useRef<(numero: string, contactId: string | null) => Promise<void>>(async () => {})
  const avancerRef = useRef<() => void>(() => {})
  useEffect(() => {
    autoRef.current = auto
    enCoursRef.current = enCours
    appelRef.current = appel
    barreRef.current = barreVisible
    couranteRef.current = courante
    fileRef.current = fileAgences
    indexRef.current = index
    directeRef.current = directeId
    agenceIdRef.current = agenceCouranteId
    reserveRef.current = reserve
    noteRef.current = note
  })

  // ── Calculs d'affichage ──
  const attribution = useMemo(() => (fiche && reserve.length ? numeroEmissionPour(fiche.agence, reserve, fileAgences) : null), [fiche, reserve, fileAgences])
  const emissionBloquee = Boolean(attribution?.bloque)
  const numeroEmission = attribution && !attribution.bloque ? attribution.numero : (fiche?.agence.numeroEmission ?? "")
  const jauge = useMemo(() => jaugeDuJour(numeroEmission, compteursNumero, quota), [numeroEmission, compteursNumero, quota])
  const lignes = useMemo(() => (fiche ? lignesNumeros(fiche.agence, fiche.contacts) : []), [fiche])
  const defaut = useMemo(() => (fiche ? numeroParDefaut(fiche.agence, fiche.contacts) : null), [fiche])
  const dateMaintenant = useMemo(() => new Date(maintenant), [maintenant])
  const defautDemain = useMemo(() => demainDixHeures(dateMaintenant), [dateMaintenant])
  const compte = compteARebours(compteFin, maintenant)
  const libre = appel === null && !barreVisible // on peut composer
  const fileTerminee = fileAgences.length > 0 && index >= fileAgences.length
  const contactsActifs = fiche ? fiche.contacts.filter((c) => !c.parti) : []

  // ── Lectures ──
  const chargerReglages = useCallback(async () => {
    const [q, s] = await Promise.all([lireParametre("quota_appels_jour").catch(() => null), lireParametre("script_appel").catch(() => null)])
    if (!enVie.current) return
    setQuota(Number(q) || 0)
    setScript(s ?? "")
  }, [])

  // Les repères : secteurs, compteurs des files, appels du jour, réserve de numéros.
  const chargerReperes = useCallback(async () => {
    const m = new Date()
    const [sect, cpt, app, parNumero, res] = await Promise.all([
      chargerSecteurs().catch(() => [] as Secteur[]), compterFiles(m), agencesAppeleesAujourdHui(m), compterAppelsDuJourParNumero(m), chargerNumeros().catch(() => null),
    ])
    if (!enVie.current) return
    setSecteurs(sect)
    setCompteurs(cpt)
    setAppelees(app)
    setCompteursNumero(parNumero)
    if (res) setReserve(res)
    setMaintenant(Date.now())
  }, [])

  // La file : rechargée quand on change de file, de secteur, ou la case des déjà appelées.
  const chargerLaFile = useCallback(async () => {
    setChargementFile(true)
    try {
      const m = new Date()
      const [agences, app] = await Promise.all([chargerFile(file, m, secteurDuJour || null), agencesAppeleesAujourdHui(m)])
      if (!enVie.current) return
      setAppelees(app)
      const retenues = agences
        .filter((a) => !etapeFiltre || a.etape === etapeFiltre)
        .filter((a) => sourcage === "" || (sourcage === "sourcees" ? a.nbContacts > 0 : a.nbContacts === 0))
      setFileAgences(constituerFile(retenues, { file, appeleesAujourdHui: app, inclureDejaAppelees }))
      setIndex(0)
    } catch (e) {
      if (enVie.current) setErreur(`Lecture de la file : ${messageDe(e)}`)
    } finally {
      if (enVie.current) setChargementFile(false)
    }
  }, [file, secteurDuJour, etapeFiltre, sourcage, inclureDejaAppelees])

  useEffect(() => {
    enVie.current = true
    const t = setTimeout(() => {
      void chargerReglages()
      void chargerReperes()
    }, 0)
    return () => {
      enVie.current = false
      clearTimeout(t)
    }
  }, [chargerReglages, chargerReperes])

  useEffect(() => {
    const t = setTimeout(() => void chargerLaFile(), 0)
    return () => clearTimeout(t)
  }, [chargerLaFile])

  // De retour sur la page : les repères, et la file seulement hors session.
  // (La dernière version de `chargerLaFile` passe par une ref : cet effet ne doit
  // réagir qu'à `actif`, pas à chaque changement de file.)
  const chargerLaFileRef = useRef(chargerLaFile)
  useEffect(() => {
    chargerLaFileRef.current = chargerLaFile
  }, [chargerLaFile])
  useEffect(() => {
    if (!actif) return
    if (!dejaAffiche.current) {
      dejaAffiche.current = true // le montage vient de tout charger
      return
    }
    const t = setTimeout(() => {
      void chargerReperes()
      if (!enCoursRef.current && !barreRef.current) void chargerLaFileRef.current()
    }, 0)
    return () => clearTimeout(t)
  }, [actif, chargerReperes])

  // Une autre page demande d'appeler cette agence : elle devient l'agence en cours, hors file.
  useEffect(() => {
    if (!agenceInitiale) return
    const t = setTimeout(() => setDirecteId(agenceInitiale), 0)
    return () => clearTimeout(t)
  }, [agenceInitiale])

  // L'agence en cours : sa fiche, ses contacts, son fil. Tout ce qui tient à l'appel précédent est remis à zéro.
  useEffect(() => {
    if (!agenceCouranteId) return
    let annule = false
    const t = setTimeout(async () => {
      try {
        let c = await chargerAgence(agenceCouranteId)
        if (annule) return
        // Première fois qu'on l'appelle : on lui attribue un numéro d'émission, écrit sur la fiche.
        const res = reserveRef.current
        if (!c.agence.numeroEmission && res.length) {
          const numero = numeroLeMoinsAttribue(res, fileRef.current)
          if (numero) {
            const id = c.agence.id
            c = { ...c, agence: { ...c.agence, numeroEmission: numero } }
            majAgence(id, { numeroEmission: numero }).catch((e) => setErreur(`Enregistrement du numéro d'émission : ${messageDe(e)}`))
            setFileAgences((arr) => arr.map((x) => (x.id === id ? { ...x, numeroEmission: numero } : x)))
          }
        }
        setCourante(c)
        setNote("")
        setAppel(null)
        setBarreVisible(false)
        setSuggestion(null)
        setIndice("")
        setContactEnLigne(null)
        setFormContact(false)
        setCopie("")
      } catch (e) {
        if (!annule) setErreur(`Lecture de l'agence : ${messageDe(e)}`)
      }
    }, 0)
    return () => {
      annule = true
      clearTimeout(t)
    }
  }, [agenceCouranteId])

  // Relire la fiche sans toucher à l'appel en cours (après un contact, une tâche, une note…).
  const rafraichirCourante = useCallback(async () => {
    const id = agenceIdRef.current
    if (!id) return
    try {
      const c = await chargerAgence(id)
      if (!enVie.current || agenceIdRef.current !== id) return
      setCourante((prev) => (prev && prev.agence.id === id ? { ...c, agence: { ...c.agence, numeroEmission: c.agence.numeroEmission || prev.agence.numeroEmission } } : c))
    } catch (e) {
      if (enVie.current) setErreur(`Lecture de l'agence : ${messageDe(e)}`)
    }
  }, [])

  // La recherche « appeler une agence directement ».
  useEffect(() => {
    const q = recherche.trim()
    if (!q) {
      const t = setTimeout(() => setResultats(null), 0)
      return () => clearTimeout(t)
    }
    let annule = false
    const t = setTimeout(async () => {
      try {
        const r = await chargerAgences({ recherche: q, limite: 8 })
        if (!annule) setResultats(r)
      } catch (e) {
        if (!annule) setErreur(`Recherche : ${messageDe(e)}`)
      }
    }, 300)
    return () => {
      annule = true
      clearTimeout(t)
    }
  }, [recherche])

  // ── Avancer, reculer, passer ──
  const couperMinuterie = useCallback(() => {
    if (goTimerRef.current) {
      clearTimeout(goTimerRef.current)
      goTimerRef.current = null
    }
    setCompteFin(null)
  }, [])

  const avancer = useCallback(() => {
    dicteeRef.current?.stop()
    couperMinuterie()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    if (directeRef.current) {
      setDirecteId(null) // après un appel direct, retour à la file là où on l'avait laissée
      return
    }
    const i = indexRef.current
    const n = fileRef.current.length
    if (i >= n - 1) {
      setIndex(n) // au-delà de la dernière : « file terminée »
      setEnCours(false)
      setAuto(false)
    } else setIndex(i + 1)
  }, [couperMinuterie])
  useEffect(() => {
    avancerRef.current = avancer
  }, [avancer])

  function reculer() {
    dicteeRef.current?.stop()
    couperMinuterie()
    if (directeId) {
      setDirecteId(null)
      return
    }
    setIndex((i) => Math.max(0, i - 1))
  }
  function allerA(i: number) {
    dicteeRef.current?.stop()
    couperMinuterie()
    setDirecteId(null)
    setIndex(i)
  }
  function demarrer() {
    if (!fileAgences.length) return
    setDirecteId(null)
    if (index >= fileAgences.length) setIndex(0)
    setEnCours(true)
    setErreur("")
  }
  function arreter() {
    setAuto(false)
    setEnCours(false)
    couperMinuterie()
  }

  // ── Lancer un appel ──
  const lancerAppel = useCallback(
    async (numeroAppele: string, contactId: string | null) => {
      const c = couranteRef.current
      if (!c) return
      if (appelRef.current || barreRef.current) {
        setErreur("Note d'abord le résultat de l'appel en cours.")
        return
      }
      if (entrantActif()) {
        setErreur("Quelqu'un est en train de t'appeler : on ne compose pas par-dessus.")
        return
      }
      if (!numeroValide(numeroAppele)) {
        setErreur("Numéro incorrect ou incomplet : corrige-le sur la fiche avant d'appeler.")
        return
      }
      // L'agence est TOUJOURS appelée depuis son numéro attitré. Sorti de la réserve → bloqué.
      let from = c.agence.numeroEmission
      const res = reserveRef.current
      if (res.length) {
        const att = numeroEmissionPour(c.agence, res, fileRef.current)
        if (att.bloque) {
          setErreur(`Appel bloqué : ${c.agence.nom} a toujours été appelée depuis le ${formaterTelephone(att.numero)}, qui n'est plus dans la réserve. Réattribue-lui un numéro (bouton ci-dessous) ou réactive celui-ci dans Réglages.`)
          if (autoRef.current) goTimerRef.current = setTimeout(() => avancerRef.current(), 1500)
          return
        }
        from = att.numero
        if (att.aEnregistrer && att.numero) {
          const id = c.agence.id
          majAgence(id, { numeroEmission: att.numero }).catch((e) => setErreur(`Enregistrement du numéro d'émission : ${messageDe(e)}`))
          setCourante((prev) => (prev && prev.agence.id === id ? { ...prev, agence: { ...prev.agence, numeroEmission: att.numero } } : prev))
          setFileAgences((arr) => arr.map((x) => (x.id === id ? { ...x, numeroEmission: att.numero } : x)))
        }
      }
      // Anti double-appel : un 2e déclenchement trop rapproché (double-clic, minuterie) est ignoré.
      const t = Date.now()
      if (t - dernierLancementRef.current < DELAI_ANTI_DOUBLE_APPEL_MS) return
      dernierLancementRef.current = t
      couperMinuterie()
      setErreur("")
      setInfo("")
      setIndice("")
      setSuggestion(null)
      setMaintenant(t)
      setAppel({ agenceId: c.agence.id, numeroAppele, contactId, numeroEmission: from, callId: "", debut: t, enLigneDepuis: null, fin: null, etape: "attente", manuel: false })
      setBarreVisible(true)
      setContactEnLigne(contactId)
      const r = await lancerAppelRingover(numeroAppele, from)
      if (!enVie.current) return
      if (!r.ok) {
        // L'appel n'est pas parti : rien à noter, et on le dit avec la vraie raison.
        setAppel((a) => (a && a.debut === t ? null : a))
        setBarreVisible(false)
        if (autoRef.current) {
          setAuto(false)
          setErreur(`Mode automatique arrêté : l'appel n'est pas parti${r.message ? " — " + r.message : ""}. Vérifie Ringover puis relance.`)
        } else setErreur(`L'appel n'est pas parti${r.message ? " — " + r.message : ""}. Réessaie.`)
        return
      }
      dernierCallIdRef.current = r.callId ?? ""
      setAppel((a) => (a && a.debut === t ? { ...a, callId: r.callId ?? "" } : a))
    },
    [couperMinuterie],
  )
  useEffect(() => {
    lancerRef.current = lancerAppel
  }, [lancerAppel])

  function appelerMaintenant() {
    if (defaut) void lancerAppel(defaut.numero, defaut.contactId)
  }

  // Un appel passé autrement (poste fixe, portable) : on note le résultat quand même.
  function noterSansRingover() {
    if (!fiche) return
    const t = Date.now()
    setErreur("")
    setInfo("")
    setSuggestion(null)
    setIndice("")
    setMaintenant(t)
    setAppel({ agenceId: fiche.agence.id, numeroAppele: defaut?.numero ?? "", contactId: defaut?.contactId ?? null, numeroEmission, callId: "", debut: t, enLigneDepuis: null, fin: null, etape: "sans_suivi", manuel: true })
    setBarreVisible(true)
    setContactEnLigne(defaut?.contactId ?? null)
  }

  // ── Surveiller l'appel : toutes les 4 s, « cet appel est-il en ligne ? » ──
  const debutAppel = appel?.debut ?? null
  const appelManuel = appel?.manuel ?? false
  useEffect(() => {
    if (!debutAppel || appelManuel) return
    const debut: number = debutAppel // capturé : les fonctions hissées ci-dessous ne voient pas la garde
    let annule = false
    let etat = SURVEILLANCE_INITIALE
    let enVol = false
    let detailLance = false
    const horloge = setInterval(() => setMaintenant(Date.now()), 1000)

    // Le relevé final de Ringover (jusqu'à ~90 s) : numéro invalide ? répondeur ? → une suggestion.
    async function resoudreDetail(callId: string) {
      for (let i = 0; i < ESSAIS_DETAIL && !annule; i++) {
        const det = await detailAppelRingover(callId)
        if (annule) return
        if (det.ok && det.trouve && det.last_state) {
          const s = suggestionDepuisDetail(det.last_state, det.is_failed)
          if (s.resultat) setSuggestion(s.resultat)
          if (s.texte) setIndice(s.texte)
          return
        }
        await new Promise((r) => setTimeout(r, PAUSE_DETAIL_MS))
      }
    }
    function finir(verdict: Verdict) {
      clearInterval(sondage)
      const fin = Date.now()
      setAppel((a) => {
        if (!a || a.debut !== debut) return a
        if (verdict === "indisponible") return { ...a, etape: "sans_suivi" }
        return { ...a, etape: "termine", fin }
      })
      if (verdict === "pas_de_reponse") setSuggestion("pas_de_reponse")
      if (verdict === "indisponible") setErreur("Statut Ringover indisponible : note le résultat à la main quand tu auras raccroché.")
      const callId = appelRef.current?.callId ?? ""
      if (callId && !detailLance) {
        detailLance = true
        void resoudreDetail(callId)
      }
    }
    async function sonder() {
      if (annule || enVol) return
      // Sans identifiant d'appel, le relais répond « y a-t-il un appel en ligne » (toute l'équipe) :
      // on laisse 8 s à l'identifiant pour arriver avant de s'y fier.
      const callId = appelRef.current?.callId ?? ""
      if (!callId && Date.now() - debut < 8000) return
      enVol = true
      let st: { ok: boolean; actif: boolean }
      try {
        st = await statutAppelsRingover(callId || undefined)
      } finally {
        enVol = false
      }
      if (annule) return
      const { suite, verdict } = observerAppel(etat, { ok: st.ok, actif: st.ok && st.actif })
      etat = suite
      if (suite.vuActif) {
        const t = Date.now()
        setAppel((a) => (a && a.debut === debut && a.etape === "attente" ? { ...a, etape: "en_cours", enLigneDepuis: t } : a))
      }
      if (verdict !== "continuer") finir(verdict)
    }
    const sondage = setInterval(() => void sonder(), INTERVALLE_SURVEILLANCE_MS)
    const premier = setTimeout(() => void sonder(), 1500)
    return () => {
      annule = true
      clearInterval(sondage)
      clearTimeout(premier)
      clearInterval(horloge)
    }
  }, [debutAppel, appelManuel])

  // ── Mode automatique : compte à rebours, puis l'appel du numéro par défaut ──
  const courantePrete = Boolean(fiche)
  useEffect(() => {
    if (!auto || !enCours || !libre || !courantePrete || !agenceCouranteId) return
    const c = couranteRef.current
    if (!c || c.agence.id !== agenceCouranteId) return
    const d = numeroParDefaut(c.agence, c.contacts)
    const res = reserveRef.current
    const att = res.length ? numeroEmissionPour(c.agence, res, fileRef.current) : null
    if (!numeroValide(d.numero) || att?.bloque) {
      // Pas d'appel dans le vide, pas d'appel en douce : on prévient et on saute.
      const t = setTimeout(() => {
        setErreur(att?.bloque ? `${c.agence.nom} : son numéro d'émission n'est plus dans la réserve — sautée.` : `${c.agence.nom} : numéro incorrect ou absent — sautée.`)
        avancerRef.current()
      }, 1500)
      return () => clearTimeout(t)
    }
    const delai = Math.max(2, cadence)
    const fin = Date.now() + delai * 1000
    const demarrage = setTimeout(() => {
      setMaintenant(Date.now())
      setCompteFin(fin)
    }, 0)
    const tic = setInterval(() => setMaintenant(Date.now()), 1000)
    let statutsKo = 0
    async function tenter() {
      goTimerRef.current = null
      // Quelqu'un t'appelle → on attend. L'appel précédent encore en ligne → on attend aussi.
      if (entrantActif()) {
        goTimerRef.current = setTimeout(() => void tenter(), 3000)
        return
      }
      const precedent = dernierCallIdRef.current
      if (precedent) {
        const st = await statutAppelsRingover(precedent)
        if (st.ok && st.actif) {
          statutsKo = 0
          goTimerRef.current = setTimeout(() => void tenter(), 3000)
          return
        }
        if (!st.ok && ++statutsKo < 5) {
          goTimerRef.current = setTimeout(() => void tenter(), 3000)
          return
        }
      }
      // Toujours d'actualité ? (pendant l'attente, l'utilisateur a pu avancer ou arrêter)
      if (!enCoursRef.current || !autoRef.current) return
      if (agenceIdRef.current !== agenceCouranteId) return
      if (appelRef.current || barreRef.current) return
      setCompteFin(null)
      void lancerRef.current(d.numero, d.contactId)
    }
    goTimerRef.current = setTimeout(() => void tenter(), delai * 1000)
    return () => {
      clearTimeout(demarrage)
      clearInterval(tic)
      if (goTimerRef.current) {
        clearTimeout(goTimerRef.current)
        goTimerRef.current = null
      }
    }
  }, [auto, enCours, libre, courantePrete, agenceCouranteId, cadence])

  // ── Valider le résultat : LA seule écriture de l'appel ──
  const validerResultat = useCallback(
    async (choix: ChoixResultat) => {
      const c = couranteRef.current
      const a = appelRef.current
      if (!c) return
      setEnregistrement(true)
      try {
        const dureeS = a && !a.manuel && a.fin && a.enLigneDepuis ? dureeAppel(a.enLigneDepuis, a.fin) : null
        const bilan = await enregistrerAppel({
          agenceId: c.agence.id, contactId: choix.contactId, resultat: choix.resultat, issue: choix.issue, motif: choix.motif, note: noteRef.current.trim(),
          numero: a?.numeroEmission ?? "", dureeS, callId: a?.callId ?? "", rappelLe: choix.rappelLe, rdvLe: choix.rdvLe, rdvType: choix.rdvType, compteNom, source: "session",
        })
        if (!enVie.current) return
        const m = new Date()
        setInfo(`${c.agence.nom} : ${resumeEcriture(bilan, choix, m)}`)
        setAppelees((s) => new Set(s).add(c.agence.id))
        const n = chiffresTel(a?.numeroEmission ?? "")
        if (n) {
          setCompteursNumero((prev) => {
            const suite = new Map(prev)
            suite.set(n, (suite.get(n) ?? 0) + 1)
            return suite
          })
        }
        setFileAgences((arr) =>
          arr.map((x) => (x.id === c.agence.id ? { ...x, etape: bilan.etape, tentatives: bilan.tentatives, jointFois: bilan.jointFois, dernierAppelLe: m.toISOString(), dernierResultat: choix.resultat, nbAppels: x.nbAppels + 1 } : x)),
        )
        setAppel(null)
        setBarreVisible(false)
        setNote("")
        setSuggestion(null)
        setIndice("")
        setErreur("")
        compterFiles(m)
          .then((x) => {
            if (enVie.current) setCompteurs(x)
          })
          .catch(() => {})
        avancerRef.current()
      } catch (e) {
        if (enVie.current) setErreur(`Enregistrement de l'appel : ${messageDe(e)}`)
      } finally {
        if (enVie.current) setEnregistrement(false)
      }
    },
    [compteNom],
  )

  // ── Le numéro d'émission : réattribution consciente (le seul chemin autorisé) ──
  function reattribuerNumero() {
    if (!fiche || !reserve.length) return
    const numero = numeroLeMoinsAttribue(reserve, fileAgences)
    if (!numero) return
    const id = fiche.agence.id
    majAgence(id, { numeroEmission: numero }).catch((e) => setErreur(`Enregistrement du numéro d'émission : ${messageDe(e)}`))
    setCourante((prev) => (prev && prev.agence.id === id ? { ...prev, agence: { ...prev.agence, numeroEmission: numero } } : prev))
    setFileAgences((arr) => arr.map((x) => (x.id === id ? { ...x, numeroEmission: numero } : x)))
    setErreur("")
    setInfo(`Nouveau numéro attribué à ${fiche.agence.nom} : ${formaterTelephone(numero)}. Tu peux appeler.`)
  }

  // ── La dictée : on parle, ça s'ajoute à la note de l'appel ──
  function dicter() {
    if (!FABRIQUE_DICTEE) {
      setErreur("La dictée vocale n'est pas disponible sur ce navigateur : utilise Google Chrome ou Edge.")
      return
    }
    if (dicteeRef.current) {
      dicteeRef.current.stop()
      return
    }
    const cible = agenceCouranteId
    if (!cible) return
    const reco = new FABRIQUE_DICTEE()
    reco.lang = "fr-FR"
    reco.continuous = true
    reco.interimResults = false
    reco.onresult = (e) => {
      let txt = ""
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) txt += e.results[i][0].transcript
      txt = txt.trim()
      if (!txt || agenceIdRef.current !== cible) return // on a changé d'agence : la phrase en retard est ignorée
      setNote((n) => (n && !/\s$/.test(n) ? n + " " : n) + txt)
    }
    reco.onend = () => {
      setEcoute(false)
      dicteeRef.current = null
    }
    reco.onerror = () => {
      setEcoute(false)
      dicteeRef.current = null
    }
    dicteeRef.current = reco
    reco.start()
    setEcoute(true)
  }

  // ── Contacts, actions, e-mail, copie, script ──
  async function creerLeContact() {
    if (!fiche) return
    const k = nouveauContact
    if (!k.prenom.trim() && !k.nom.trim()) {
      setErreur("Donne au moins un prénom ou un nom au contact.")
      return
    }
    try {
      const cree = await creerContact(fiche.agence.id, { prenom: k.prenom, nom: k.nom, role: k.role, ligneDirecte: formaterTelephone(k.ligneDirecte), mobile: formaterTelephone(k.mobile), email: k.email })
      if (!enVie.current) return
      setFormContact(false)
      setNouveauContact(CONTACT_VIDE)
      setContactEnLigne(cree.id)
      setErreur("")
      await rafraichirCourante()
    } catch (e) {
      setErreur(`Création du contact : ${messageDe(e)}`)
    }
  }
  function ouvrirAction(type: Exclude<Action, "passer">) {
    setFormAction({ titre: type === "tache" ? "Rappeler" : type === "rdv" ? "Rendez-vous" : "", quand: demainDixHeures(new Date()), type: "telephone", note: "" })
    setDialogue(type)
  }
  async function validerAction() {
    if (!fiche || !dialogue || dialogue === "passer") return
    const agenceId = fiche.agence.id
    const contactId = contactEnLigne ?? defaut?.contactId ?? null
    try {
      if (dialogue === "note") {
        if (!formAction.note.trim()) return
        await creerNote({ agenceId, contactId, compteNom, note: formAction.note.trim() })
      } else {
        const echeance = versIso(formAction.quand)
        if (!echeance) {
          setErreur("Choisis une date et une heure.")
          return
        }
        if (dialogue === "tache") await creerTache({ agenceId, contactId, compteNom, titre: formAction.titre.trim() || "Rappeler", echeance, note: formAction.note })
        else await creerRdv({ agenceId, contactId, compteNom, titre: formAction.titre.trim() || "Rendez-vous", echeance, rdvType: formAction.type, note: formAction.note })
      }
      if (!enVie.current) return
      setDialogue(null)
      setErreur("")
      await rafraichirCourante()
      compterFiles(new Date())
        .then((x) => {
          if (enVie.current) setCompteurs(x)
        })
        .catch(() => {})
    } catch (e) {
      setErreur(`Enregistrement : ${messageDe(e)}`)
    }
  }
  function ouvrirEmail() {
    if (!fiche) return
    const k = fiche.contacts.find((x) => x.id === (contactEnLigne ?? defaut?.contactId)) ?? fiche.contacts.find((x) => x.principal && !x.parti) ?? null
    setEnvoiPour(prospectDepuisAgence(fiche.agence, k))
  }
  function copier(numero: string) {
    navigator.clipboard
      ?.writeText(numero)
      .then(() => {
        setCopie(numero)
        setTimeout(() => setCopie((c) => (c === numero ? "" : c)), 1500)
      })
      .catch(() => {})
  }
  function basculerScriptEdit() {
    if (scriptEdit) {
      ecrireParametre("script_appel", scriptBrouillon)
        .then(() => setScript(scriptBrouillon))
        .catch((e) => setErreur(`Enregistrement du script : ${messageDe(e)}`))
      setScriptEdit(false)
    } else {
      setScriptBrouillon(script)
      setScriptEdit(true)
      setScriptOuvert(true)
    }
  }

  // ── L'état de l'appel, en une ligne ──
  const dureeAffichee = appel
    ? appel.etape === "en_cours" && appel.enLigneDepuis
      ? dureeLisible(dureeAppel(appel.enLigneDepuis, maintenant))
      : appel.fin && appel.enLigneDepuis
        ? dureeLisible(dureeAppel(appel.enLigneDepuis, appel.fin))
        : ""
    : ""

  return (
    <div className="page">
      <EnTetePage
        titre="Sessions de call"
        sousTitre={enCours ? `Session en cours · ${Math.min(index + 1, fileAgences.length)} / ${fileAgences.length}${auto ? " · mode automatique" : ""}` : "Choisis une file, un secteur, et démarre."}
        droite={
          <>
            <div className="flex flex-wrap gap-1.5">
              {FILES.map((f) => {
                const choisi = f.code === file
                const n = compteurs?.[f.code]
                return (
                  <button key={f.code} type="button" disabled={enCours} title={f.aide} onClick={() => setFile(f.code)} className="rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature focus-visible:ring-offset-2 disabled:opacity-60">
                    <Pastille role={choisi ? "info" : "inerte"} point={choisi}>
                      {f.libelle}
                      {n !== undefined ? <span className="chiffres font-semibold">{n}</span> : null}
                    </Pastille>
                  </button>
                )
              })}
            </div>
            <Selecteur value={secteurDuJour} onChange={(e) => setSecteurDuJour(e.target.value)} disabled={enCours} className="w-44" aria-label="Secteur du jour">
              <option value="">Tous les secteurs</option>
              {secteurs.map((s) => (
                <option key={s.code} value={s.code}>{s.libelle}</option>
              ))}
            </Selecteur>
            <Selecteur value={etapeFiltre} onChange={(e) => setEtapeFiltre(e.target.value)} disabled={enCours} className="w-48" aria-label="Étape" title="N'appeler que les agences de cette étape (dans la file choisie)">
              <option value="">Toutes les étapes</option>
              {ETAPES.map((e) => (
                <option key={e.code} value={e.code}>{e.libelle}</option>
              ))}
              {SORTIES.map((s) => (
                <option key={s.code} value={s.code}>{s.libelle}</option>
              ))}
            </Selecteur>
            <Selecteur value={sourcage} onChange={(e) => setSourcage(e.target.value as "" | "sourcees" | "non_sourcees")} disabled={enCours} className="w-52" aria-label="Sourçage" title="Sourcée = on connaît au moins un gestionnaire (nom, ligne directe ou e-mail)">
              <option value="">Sourcées et non sourcées</option>
              <option value="sourcees">Sourcées · gestionnaire connu</option>
              <option value="non_sourcees">Non sourcées · standard seul</option>
            </Selecteur>
            <label className="flex items-center gap-2 text-legende text-encre">
              <Interrupteur allume={auto} onChange={setAuto} libelle="Mode automatique" /> Mode automatique
            </label>
            <label className="flex items-center gap-1.5 text-legende text-encre-2">
              cadence
              <Champ type="number" min={2} max={120} value={cadence || ""} onChange={(e) => setCadence(Number(e.target.value) || 0)} className="chiffres w-16" aria-label="Cadence en secondes (2 au minimum)" />
              s
            </label>
            {enCours ? (
              <Bouton variante="plein" icone={<Square />} onClick={arreter}>Arrêter</Bouton>
            ) : (
              <Bouton variante="plein" icone={<Play />} onClick={demarrer} disabled={!fileAgences.length || chargementFile}>Démarrer</Bouton>
            )}
          </>
        }
      />

      {erreur ? (
        <Bandeau role="alerte" className="mb-4" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur("")}>OK</Bouton>}>{erreur}</Bandeau>
      ) : null}
      {info ? (
        <Bandeau role="ok" className="mb-4" action={<Bouton taille="sm" variante="discret" onClick={() => setInfo("")}>OK</Bouton>}>{info}</Bandeau>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr_380px]">
        {/* ── 1. La file ── */}
        <Carte className="flex flex-col lg:max-h-[calc(100vh-200px)]">
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <h2 className="text-sous-titre font-semibold text-encre">La file</h2>
            <span className="chiffres text-legende text-encre-2">{Math.min(index + 1, fileAgences.length)} / {fileAgences.length}</span>
          </div>
          <div className="px-4 pb-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-encre-3" />
              <Champ value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Appeler une agence directement…" className="pl-8" aria-label="Appeler une agence directement" />
            </div>
            {resultats ? (
              <div className="mt-1 overflow-hidden rounded-4 border border-trait bg-fond shadow-flottante">
                {resultats.length === 0 ? (
                  <div className="px-3 py-2 text-legende text-encre-2">Aucune agence trouvée.</div>
                ) : (
                  resultats.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setDirecteId(a.id)
                        setRecherche("")
                      }}
                      className="block w-full border-b border-fond-4 px-3 py-2 text-left hover:bg-fond-2 last:border-0"
                    >
                      <div className="truncate text-legende font-medium text-encre">{a.nom}</div>
                      <div className="truncate text-colonne text-encre-2">
                        {[a.secteurLibelle, formaterTelephone(a.telephone), a.contactPrincipal].filter(Boolean).join(" · ") || "sans numéro"}
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1 border-b border-trait px-4 pb-3">
            <Bouton taille="sm" icone={<ChevronLeft />} onClick={reculer} disabled={barreVisible || (index === 0 && !directeId)}>Précédente</Bouton>
            <Bouton taille="sm" icone={<ChevronRight />} onClick={avancer} disabled={barreVisible || fileTerminee || !fileAgences.length}>Suivante</Bouton>
          </div>
          <div className="border-b border-fond-4 px-4 py-2">
            <Case texte="inclure les agences déjà appelées aujourd'hui" checked={inclureDejaAppelees} onChange={(e) => setInclureDejaAppelees(e.target.checked)} disabled={enCours} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {chargementFile ? (
              <Chargement texte="Lecture de la file…" />
            ) : fileAgences.length === 0 ? (
              <Vide titre="Rien à appeler dans cette file" texte={FILES.find((f) => f.code === file)?.aide} />
            ) : (
              fileAgences.map((a, i) => <LigneFile key={a.id} agence={a} courante={!directeId && i === index} appelee={appelees.has(a.id)} maintenant={dateMaintenant} onClick={() => allerA(i)} />)
            )}
          </div>
        </Carte>

        {/* ── 2. L'agence en cours ── */}
        <div className="min-w-0 space-y-4">
          {auto && enCours && libre && compte !== null ? (
            <Bandeau
              role="info"
              action={
                <>
                  <Bouton taille="sm" icone={<Phone />} onClick={appelerMaintenant} disabled={!defaut}>Appeler maintenant</Bouton>
                  <Bouton taille="sm" variante="discret" onClick={() => setAuto(false)} className="ml-1">Stop auto</Bouton>
                </>
              }
            >
              Appel automatique dans <b className="chiffres">{compte} s</b>
              {fiche ? ` — ${fiche.agence.nom}` : ""}
            </Bandeau>
          ) : null}

          {!agenceCouranteId ? (
            <Carte>
              {fileTerminee ? (
                <Vide titre="File terminée" texte="Toutes les agences de cette file ont été vues. Change de file ou de secteur, ou reviens en arrière." action={<Bouton icone={<ChevronLeft />} onClick={reculer}>Revenir à la dernière</Bouton>} />
              ) : (
                <Vide titre="Aucune agence en cours" texte={chargementFile ? "La file se charge…" : "Choisis une file à gauche, ou cherche une agence pour l'appeler directement."} />
              )}
            </Carte>
          ) : !fiche ? (
            <Carte>
              <Chargement texte="Lecture de l'agence…" />
            </Carte>
          ) : (
            <>
              <Carte className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-section font-semibold tracking-[-0.015em] text-encre">{fiche.agence.nom}</h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {fiche.agence.enseigne ? <Pastille>{fiche.agence.enseigne}</Pastille> : null}
                      {fiche.agence.secteurLibelle ? <Pastille>{fiche.agence.secteurLibelle}</Pastille> : null}
                      <Pastille>{libelleType(fiche.agence.type)}</Pastille>
                      <Pastille role={pastilleEtape(fiche.agence.etape)} point>{libelleEtape(fiche.agence.etape)}</Pastille>
                      <span className="chiffres text-legende text-encre-2">
                        {fiche.agence.tentatives} tentative{fiche.agence.tentatives > 1 ? "s" : ""} · joint {fiche.agence.jointFois} fois
                      </span>
                    </div>
                    {fiche.agence.adresse ? <div className="mt-1 text-legende text-encre-2">{fiche.agence.adresse}</div> : null}
                  </div>
                  {onOuvrirAgence ? (
                    <div className="flex items-center gap-1">
                      <Bouton variante="discret" icone={<ArrowRightLeft />} onClick={() => onOuvrirAgence(fiche.agence.id, { etape: true })}>Changer l'étape</Bouton>
                      <Bouton variante="discret" icone={<ExternalLink />} onClick={() => onOuvrirAgence(fiche.agence.id)}>Ouvrir la fiche</Bouton>
                    </div>
                  ) : null}
                </div>
                {directeId ? (
                  <Bandeau role="info" className="mt-3" action={<Bouton taille="sm" variante="discret" onClick={() => setDirecteId(null)}>Revenir à la file</Bouton>}>
                    Appel direct, hors file.
                  </Bandeau>
                ) : null}

                {/* Numéros */}
                <Section
                  titre="Numéros"
                  droite={
                    <Bouton taille="sm" variante="discret" icone={<StickyNote />} onClick={noterSansRingover} disabled={barreVisible}>Noter un appel sans Ringover</Bouton>
                  }
                >
                  {lignes.length === 0 ? (
                    <Vide titre="Aucun numéro" texte="Complète le standard sur la fiche, ou ajoute un contact avec sa ligne directe." />
                  ) : (
                    <div className="divide-y divide-fond-4">
                      {lignes.map((l) => (
                        <div key={l.cle} className="flex flex-wrap items-center gap-3 py-2">
                          <div className="min-w-0 flex-1">
                            <div className={"chiffres text-sous-titre font-semibold " + (l.valide ? "text-encre" : "text-alerte")}>{formaterTelephone(l.numero) || l.numero}</div>
                            <div className="text-legende text-encre-2">
                              {l.libelle} · {l.detail}
                              {!l.valide ? " · numéro incomplet" : ""}
                            </div>
                          </div>
                          <Bouton variante="discret" taille="icone" aria-label="Copier le numéro" title="Copier" onClick={() => copier(l.numero)}>
                            {copie === l.numero ? <Check className="text-ok" /> : <Copy />}
                          </Bouton>
                          <Bouton
                            variante={l.parDefaut ? "plein" : "contour"}
                            icone={<Phone />}
                            disabled={!l.valide || emissionBloquee || !libre}
                            title={emissionBloquee ? "Numéro d'émission hors réserve : voir le bandeau" : !libre ? "Note d'abord le résultat de l'appel en cours" : undefined}
                            onClick={() => void lancerAppel(l.numero, l.contactId)}
                          >
                            Appeler
                          </Bouton>
                        </div>
                      ))}
                    </div>
                  )}
                  {appel && !appel.manuel ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-legende text-encre">
                      <Pastille role={appel.etape === "en_cours" ? "fait" : appel.etape === "termine" ? "info" : appel.etape === "sans_suivi" ? "attente" : "actif"} point>
                        {appel.etape === "en_cours" ? "En ligne" : appel.etape === "termine" ? "Terminé" : appel.etape === "sans_suivi" ? "Sans suivi" : "Appel lancé"}
                      </Pastille>
                      {dureeAffichee ? <span className="chiffres font-medium">{dureeAffichee}</span> : null}
                      <span className="text-encre-2">{TEXTES_APPEL[appel.etape]}</span>
                    </div>
                  ) : null}
                </Section>

                {/* Numéro d'émission + jauge */}
                {emissionBloquee && attribution ? (
                  <Bandeau role="alerte" className="mt-3" action={<Bouton taille="sm" onClick={reattribuerNumero}>Réattribuer un numéro</Bouton>}>
                    Appel bloqué : cette agence a toujours été appelée depuis le <b className="chiffres">{formaterTelephone(attribution.numero)}</b>, qui n'est plus dans la réserve. On n'appelle jamais en douce avec un autre numéro : réactive-le dans Réglages, ou réattribue en connaissance de cause.
                  </Bandeau>
                ) : (
                  <div className="mt-3 rounded-4 border border-trait bg-fond-2 px-3 py-2 text-legende text-encre">
                    {numeroEmission ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            Tu appelles depuis le <b className="chiffres">{formaterTelephone(numeroEmission)}</b>
                          </span>
                          <span className={"chiffres " + (jauge.depasse ? "font-medium text-alerte" : "text-encre-2")}>{jauge.texte}</span>
                        </div>
                        {jauge.quota > 0 ? (
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fond-4" role="progressbar" aria-valuemin={0} aria-valuemax={jauge.quota} aria-valuenow={jauge.utilises}>
                            <div className={"h-full rounded-full " + (jauge.depasse ? "bg-alerte" : "bg-signature")} style={{ width: `${Math.round(jauge.part * 100)}%` }} />
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-encre-2">Aucun numéro d'émission réglé : Ringover choisira le sien. La réserve se règle dans Réglages › Numéros d'appel.</span>
                    )}
                  </div>
                )}

                {/* Contacts */}
                <Section
                  titre="Contacts"
                  droite={
                    <Bouton taille="sm" variante="discret" icone={<Plus />} onClick={() => setFormContact((v) => !v)}>contact</Bouton>
                  }
                >
                  {contactsActifs.length === 0 && !formContact ? (
                    <p className="text-legende text-encre-2">Aucun contact connu. Qui décroche ? Ajoute-le pendant l'appel.</p>
                  ) : (
                    <div className="divide-y divide-fond-4">
                      {contactsActifs.map((k) => (
                        <div key={k.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5 text-legende">
                          <span className="font-medium text-encre">{nomContact(k)}</span>
                          <span className="text-encre-2">{libelleRole(k.role)}</span>
                          {k.principal ? <Pastille role="info">principal</Pastille> : null}
                          {k.email ? <span className="truncate text-encre-2">· {k.email}</span> : null}
                        </div>
                      ))}
                    </div>
                  )}
                  {formContact ? (
                    <div className="mt-2 rounded-4 border border-trait bg-fond-2 p-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <Etiquette texte="Prénom"><Champ value={nouveauContact.prenom} onChange={(e) => setNouveauContact({ ...nouveauContact, prenom: e.target.value })} autoFocus /></Etiquette>
                        <Etiquette texte="Nom"><Champ value={nouveauContact.nom} onChange={(e) => setNouveauContact({ ...nouveauContact, nom: e.target.value })} /></Etiquette>
                        <Etiquette texte="Rôle">
                          <Selecteur value={nouveauContact.role} onChange={(e) => setNouveauContact({ ...nouveauContact, role: e.target.value as RoleContact })}>
                            {ROLES_CONTACT.map((r) => (
                              <option key={r.code} value={r.code}>{r.libelle}</option>
                            ))}
                          </Selecteur>
                        </Etiquette>
                        <Etiquette texte="Ligne directe"><Champ value={nouveauContact.ligneDirecte} onChange={(e) => setNouveauContact({ ...nouveauContact, ligneDirecte: e.target.value })} placeholder="01 …" /></Etiquette>
                        <Etiquette texte="Mobile"><Champ value={nouveauContact.mobile} onChange={(e) => setNouveauContact({ ...nouveauContact, mobile: e.target.value })} placeholder="06 …" /></Etiquette>
                        <Etiquette texte="E-mail"><Champ type="email" value={nouveauContact.email} onChange={(e) => setNouveauContact({ ...nouveauContact, email: e.target.value })} /></Etiquette>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <Bouton taille="sm" variante="discret" onClick={() => setFormContact(false)}>Annuler</Bouton>
                        <Bouton taille="sm" icone={<Plus />} onClick={() => void creerLeContact()}>Ajouter le contact</Bouton>
                      </div>
                    </div>
                  ) : null}
                </Section>

                {/* Note de l'appel */}
                <Section
                  titre="Note de l'appel"
                  droite={
                    FABRIQUE_DICTEE ? (
                      <Bouton taille="sm" variante={ecoute ? "danger" : "discret"} icone={ecoute ? <MicOff /> : <Mic />} onClick={dicter}>{ecoute ? "Arrêter la dictée" : "Dicter"}</Bouton>
                    ) : null
                  }
                >
                  <Zone value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Ce qui s'est dit pendant l'appel… La note part avec le résultat." />
                </Section>

                {/* Autres actions */}
                <div className="mt-4 flex flex-wrap gap-2 border-t border-fond-4 pt-3">
                  <Bouton icone={<Mail />} onClick={ouvrirEmail}>E-mail</Bouton>
                  <Bouton icone={<SquareCheck />} onClick={() => ouvrirAction("tache")}>Tâche</Bouton>
                  <Bouton icone={<CalendarClock />} onClick={() => ouvrirAction("rdv")}>RDV</Bouton>
                  <Bouton icone={<StickyNote />} onClick={() => ouvrirAction("note")}>Note</Bouton>
                </div>
              </Carte>

              {barreVisible ? (
                <BarreResultat
                  agence={fiche.agence}
                  contacts={fiche.contacts}
                  contactId={contactEnLigne}
                  onContactChange={setContactEnLigne}
                  onNouveauContact={() => setFormContact(true)}
                  suggestion={suggestion}
                  indice={indice}
                  defautRappel={defautDemain}
                  defautRdv={defautDemain}
                  raccourcis={!dialogue && !envoiPour}
                  enregistrement={enregistrement}
                  onValider={validerResultat}
                />
              ) : null}

              {/* Script d'appel, repliable */}
              <Carte>
                <button type="button" onClick={() => setScriptOuvert((v) => !v)} aria-expanded={scriptOuvert} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left">
                  <span className="text-sous-titre font-semibold text-encre">Script d'appel</span>
                  <span className="flex items-center gap-2 text-legende text-encre-2">
                    {!scriptOuvert && script.trim() ? <span className="max-w-[40ch] truncate">{script.trim().split("\n")[0]}</span> : null}
                    {scriptOuvert ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </button>
                {scriptOuvert ? (
                  <div className="border-t border-fond-4 px-5 py-4">
                    {scriptEdit ? (
                      <Zone value={scriptBrouillon} onChange={(e) => setScriptBrouillon(e.target.value)} rows={8} placeholder="Ton accroche, tes arguments, les objections types…" />
                    ) : script.trim() ? (
                      <p className="whitespace-pre-line text-corps text-encre">{script}</p>
                    ) : (
                      <p className="text-legende text-encre-2">Aucun script. Écris ton accroche et tes arguments : ils resteront affichés pendant les appels.</p>
                    )}
                    <div className="mt-3 flex justify-end gap-2">
                      {scriptEdit ? <Bouton taille="sm" variante="discret" onClick={() => setScriptEdit(false)}>Annuler</Bouton> : null}
                      <Bouton taille="sm" onClick={basculerScriptEdit}>{scriptEdit ? "Enregistrer" : "Modifier"}</Bouton>
                    </div>
                  </div>
                ) : null}
              </Carte>
            </>
          )}
        </div>

        {/* ── 3. Le fil ── */}
        <Carte className="flex flex-col lg:max-h-[calc(100vh-200px)]">
          <div className="px-4 pb-2 pt-4">
            <h2 className="text-sous-titre font-semibold text-encre">Le fil</h2>
            {fiche ? (
              <p className="text-legende text-encre-2">
                {fiche.activites.length} activité{fiche.activites.length > 1 ? "s" : ""} · les plus récentes en haut
              </p>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {!fiche ? (
              <Vide titre="Aucune agence en cours" />
            ) : (
              <>
                {fiche.messages.length ? (
                  <div className="mb-3 border-b border-fond-4 pb-2">
                    <div className="mb-1 text-colonne font-semibold uppercase tracking-[0.07em] text-encre-2">Boîte de réception</div>
                    {fiche.messages.slice(0, 3).map((m) => (
                      <LigneMessage key={m.id} m={m} />
                    ))}
                  </div>
                ) : null}
                {fiche.activites.length === 0 ? (
                  <Vide titre="Rien encore" texte="Le premier appel ouvrira le fil." />
                ) : (
                  <ol className="divide-y divide-fond-4">
                    {fiche.activites.map((a) => (
                      <LigneFil key={a.id} a={a} />
                    ))}
                  </ol>
                )}
              </>
            )}
          </div>
        </Carte>
      </div>

      {/* ── Dialogues ── */}
      {dialogue === "tache" || dialogue === "rdv" || dialogue === "note" ? (
        <Dialogue
          titre={dialogue === "tache" ? "Nouvelle tâche" : dialogue === "rdv" ? "Nouveau rendez-vous" : "Nouvelle note"}
          description={fiche?.agence.nom}
          onFermer={() => setDialogue(null)}
          pied={
            <>
              <Bouton variante="discret" onClick={() => setDialogue(null)}>Annuler</Bouton>
              <Bouton variante="plein" icone={<Check />} onClick={() => void validerAction()} disabled={dialogue === "note" ? !formAction.note.trim() : !formAction.quand}>
                Enregistrer
              </Bouton>
            </>
          }
        >
          <div className="space-y-3">
            {dialogue !== "note" ? (
              <>
                <Etiquette texte="Titre"><Champ value={formAction.titre} onChange={(e) => setFormAction({ ...formAction, titre: e.target.value })} autoFocus /></Etiquette>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Etiquette texte={dialogue === "rdv" ? "Le" : "Pour le"}>
                    <Champ type="datetime-local" value={formAction.quand} onChange={(e) => setFormAction({ ...formAction, quand: e.target.value })} />
                  </Etiquette>
                  {dialogue === "rdv" ? (
                    <Etiquette texte="Type">
                      <Selecteur value={formAction.type} onChange={(e) => setFormAction({ ...formAction, type: e.target.value as TypeRdv })}>
                        {TYPES_RDV.map((t) => (
                          <option key={t.code} value={t.code}>{t.libelle}</option>
                        ))}
                      </Selecteur>
                    </Etiquette>
                  ) : null}
                </div>
              </>
            ) : null}
            <Etiquette texte={dialogue === "note" ? "Note" : "Précisions"}>
              <Zone value={formAction.note} onChange={(e) => setFormAction({ ...formAction, note: e.target.value })} rows={4} autoFocus={dialogue === "note"} />
            </Etiquette>
          </div>
        </Dialogue>
      ) : null}
      {envoiPour ? (
        <EnvoyerEmailModal
          prospect={envoiPour}
          onClose={() => {
            setEnvoiPour(null)
            void rafraichirCourante()
          }}
        />
      ) : null}
    </div>
  )
}
