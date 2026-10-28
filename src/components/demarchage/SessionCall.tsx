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
//
// L'écran est découpé (14/10) : un fichier par rôle dans `session/` (en-tête, file, fiche,
// numéros, contacts, script, fil, dialogue ; dictée, surveillance, onglet unique). Ce fichier
// garde l'état, les lectures, la logique de l'appel, et assemble les morceaux.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { versionPerimee } from "../../lib/versionEnLigne"
import { ChevronLeft, ChevronRight, Phone } from "lucide-react"
import { destinataireDepuis, type Destinataire } from "../../lib/destinataire"
import { entrantActif } from "../../lib/appelEntrantActif"
import { useSession } from "../../lib/auth"
import { estAdmin, listerComptes, nomAffiche } from "../../lib/comptes"
import { CLE_CHOIX_LOCAL, CLE_NON_ATTRIBUEES, nonAttribueesPourTous, normaliserChoix, optionsBase, proprietaireDepuisChoix } from "../../demarchage/attribution"
import { chargerNumerosDuCompte, estDansLaReserve } from "../../lib/numerosEmission"
import { lireParametre } from "../../lib/parametresDb"
import { lancerAppelRingover, statutAppelsRingover } from "../../lib/ringover"
import { chiffresTel, formaterTelephone, numeroValide } from "../../lib/telephone"
import {
  agencesAppeleesAujourdHui, chargerAgence, chargerAgences, chargerPile, passerApporteur, chargerSecteurs, compterAppelsDuJourParNumero, compterPiles, creerContact, creerRdv, creerTache,
  appelLance, appelVerifier, enregistrerAppel, majAgence, type AgenceComplete,
} from "../../demarchage/db"
import {
  libelleEtape, numeroParDefaut,
  type Activite, type Agence, type Contact, type File, type Resultat, type Secteur,
  RESULTAT_LANCE,
} from "../../demarchage/modele"
import {
  DELAI_ANTI_DOUBLE_APPEL_MS,
  compteARebours, dateHeureCourte, demainALHeure, dureeAppel, jaugeDuJour, lignesNumeros, numeroEmissionPour, numeroLeMoinsAttribue,
  resumeEcriture, toursSansDemarrage, versIso,
  type ChoixResultat, type TypeRdv,
} from "../../demarchage/sessionOutils"
import { useReglages } from "../../demarchage/reglages"
import { Bandeau, Bouton, Carte, Chargement, EnTetePage, Vide } from "../../ui"
import EnvoyerEmailModal from "../EnvoyerEmailModal"
import { lancerAnalyseAppel, monAppelSansResultat, type AppelEnAttente } from "../../demarchage/appelsIa"
import BarreResultat from "./BarreResultat"
import ContactFormulaire from "./ContactFormulaire"
import BlocContacts from "./session/BlocContacts"
import BlocNumeros from "./session/BlocNumeros"
import ColonneFil from "./session/ColonneFil"
import ColonneFile from "./session/ColonneFile"
import DialogueAction from "./session/DialogueAction"
import EnTeteSession from "./session/EnTeteSession"
import FicheEnCours from "./session/FicheEnCours"
import ScriptAppel from "./session/ScriptAppel"
import { CONTACT_VIDE, appelNonNote, horsDeLaPile, messageDe, type Action, type AppelEnCours, type Dictee } from "./session/outils"
import { useDictee } from "./session/useDictee"
import { useOngletUnique } from "./session/useOngletUnique"
import { useScriptAppel } from "./session/useScriptAppel"
import { useSurveillanceAppel } from "./session/useSurveillanceAppel"

export default function SessionCall({ actif = true, agenceInitiale = null, onOuvrirAgence, versionAgences = 0 }: { actif?: boolean; agenceInitiale?: string | null; onOuvrirAgence?: (id: string, options?: { etape?: boolean }) => void; versionAgences?: number }) {
  const session = useSession()
  const compteNom = nomAffiche(session)
  // Tous les réglages des règles viennent de la base (Réglages › Démarchage › Objectif et règles d'appel) : aucun n'est écrit ici.
  const { reglages, erreur: erreurReglages } = useReglages()

  // ── Les réglages et la file ──
  const [file, setFile] = useState<File>("a_prospecter")
  const [compteurs, setCompteurs] = useState<Record<File, number> | null>(null)
  const [secteurs, setSecteurs] = useState<Secteur[]>([])
  const [secteurDuJour, setSecteurDuJour] = useState("")
  // L'attribution de la base (Mahdi, 11/10) : un téléprospecteur n'appelle que SA base ; un admin
  // choisit la base qu'il regarde. Le choix est mémorisé sur le poste.
  const [choixBase, setChoixBase] = useState<string>(() => { try { return localStorage.getItem(CLE_CHOIX_LOCAL) || "moi" } catch { return "moi" } })
  const [comptesListe, setComptesListe] = useState<{ id: string; nom: string }[]>([])
  const [nonAttribueesLibres, setNonAttribueesLibres] = useState(false) // réglage : les non attribuées sont visibles par tous
  const admin = estAdmin(session)
  const moiId = session?.user?.id ?? ""
  const proprietaire = useMemo(() => proprietaireDepuisChoix(choixBase, moiId, admin, nonAttribueesLibres), [choixBase, moiId, admin, nonAttribueesLibres])
  const optionsDeBase = useMemo(() => optionsBase(admin, nonAttribueesLibres, comptesListe, moiId), [admin, nonAttribueesLibres, comptesListe, moiId])
  useEffect(() => {
    if (!session) return
    lireParametre(CLE_NON_ATTRIBUEES).then((v) => setNonAttribueesLibres(nonAttribueesPourTous(v))).catch(() => undefined)
    if (estAdmin(session)) listerComptes().then((l) => setComptesListe(l.map((c) => ({ id: c.id, nom: c.nom || c.email })))).catch(() => undefined)
  }, [session])
  const choisirBase = (v: string) => { const c = normaliserChoix(v, admin, nonAttribueesLibres); setChoixBase(c); try { localStorage.setItem(CLE_CHOIX_LOCAL, c) } catch { /* poste sans stockage */ } }
  // Mahdi, 09/10 : « si je veux appeler les gestionnaires joints, je fais comment ? »
  // → un filtre par étape sur la file ("" = toutes les étapes de la file).
  const [etapeFiltre, setEtapeFiltre] = useState("")
  // Mahdi, 09/10 : « une agence où on a le nom et le mail du gestionnaire est plus
  // qualitative : il faut différencier les sourcées des non sourcées ».
  // Sourcée = au moins un gestionnaire connu (un contact sur la fiche).
  const [sourcage, setSourcage] = useState<"" | "sourcees" | "non_sourcees">("")
  const [inclureDejaAppelees, setInclureDejaAppelees] = useState(false)
  const [auto, setAuto] = useState(false)
  // Ouvrir une fiche depuis la session coupe le mode automatique : on ne compose pas pendant qu'on lit.
  const ouvrirAgence = onOuvrirAgence
    ? (id: string, options?: { etape?: boolean }) => {
        setAuto(false)
        onOuvrirAgence(id, options)
      }
    : undefined
  // Un autre onglet a déjà la session ouverte (BroadcastChannel) : celui-ci ne compose pas.
  const autreOnglet = useOngletUnique()
  // La cadence du mode automatique : celle des Réglages, modifiable pour la session.
  const [cadenceChoisie, setCadence] = useState<number | null>(null)
  const cadence = cadenceChoisie ?? reglages?.cadence_auto_secondes ?? null
  const [enCours, setEnCours] = useState(false)
  const [fileAgences, setFileAgences] = useState<Agence[]>([])
  const [chargementFile, setChargementFile] = useState(true)
  const [index, setIndex] = useState(0)
  const [directeId, setDirecteId] = useState<string | null>(null) // une agence appelée hors file
  // LE VERROU DU COMPTE (Mahdi, 24/10/2026) : « à partir du moment où tu as passé ton call, tu es obligé de rentrer
  // les états ; tu ne peux pas faire suivant ou précédent ». Mon plus ancien appel lancé sans résultat, relu en base :
  // il survit à un onglet fermé ou rechargé (c'est par là que 10 appels avaient échappé entre le 19 et le 22/10).
  const [appelBloquant, setAppelBloquant] = useState<AppelEnAttente | null>(null)
  const bloquantRef = useRef<AppelEnAttente | null>(null)
  const [nbResultats, setNbResultats] = useState(0) // relit les « Mails à envoyer » après chaque résultat
  const [appelees, setAppelees] = useState<Set<string>>(() => new Set())
  const [reserve, setReserve] = useState<string[]>([])
  const [autresNumeros, setAutresNumeros] = useState<string[]>([]) // les numéros des collègues (13/10)
  const autresNumerosRef = useRef<string[]>([])
  const [sansNumero, setSansNumero] = useState(false) // des numéros sont attribués, aucun à moi
  const [compteursNumero, setCompteursNumero] = useState<Map<string, number>>(() => new Map())
  const quota = reglages?.quota_appels_jour ?? 0

  // ── L'agence en cours ──
  const [courante, setCourante] = useState<AgenceComplete | null>(null)
  const [note, setNote] = useState("")
  const [formContact, setFormContact] = useState(false)
  const [nouveauContact, setNouveauContact] = useState(CONTACT_VIDE)
  // Mahdi, 09/10 : « souvent il y a des erreurs, il faut pouvoir modifier les contacts » → depuis la session aussi.
  const [contactAModifier, setContactAModifier] = useState<Contact | null>(null)
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
  const [envoiPour, setEnvoiPour] = useState<Destinataire | null>(null)

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
  const sansNumeroRef = useRef(sansNumero)
  const noteRef = useRef(note)
  const goTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dicteeRef = useRef<Dictee | null>(null)
  const dernierLancementRef = useRef(0)
  const lancementRef = useRef<{ debut: number; promesse: Promise<string | null> } | null>(null) // l'écriture du clic, en route
  const jetonCompteurs = useRef(0) // la lecture des compteurs la plus récente (14/10)
  const jetonFile = useRef(0) // la lecture de la file la plus récente
  const dernierCallIdRef = useRef("")
  const dejaAffiche = useRef(false)
  const lancerRef = useRef<(numero: string, contactId: string | null, depuisAuto?: boolean) => Promise<void>>(async () => {})
  const avancerRef = useRef<() => void>(() => {})
  const noterAppelEnSuspensRef = useRef<(ligne: Activite) => void>(() => {})
  const enregistrementEnCours = useRef(false) // un résultat en route : le 2e clic est ignoré
  const apporteurEnCours = useRef(false) // un passage en apporteur en route : le 2e clic est ignoré
  const verificationEnCours = useRef(false) // les vérifications avant de composer, en route
  const directeEnAttente = useRef<string | null>(null) // une agence demandée d'ailleurs pendant un résultat à noter
  const pileRef = useRef(file)
  const toursMaxRef = useRef(0) // la sonnerie réglée, en tours de surveillance
  const relanceJoursRef = useRef(0)
  const etapeFiltreRef = useRef(etapeFiltre)
  const autreOngletRef = useRef(autreOnglet)
  useEffect(() => {
    toursMaxRef.current = reglages ? toursSansDemarrage(reglages.sonnerie_secondes) : 0
    relanceJoursRef.current = reglages?.relance_interesse_jours ?? 0
    pileRef.current = file
    etapeFiltreRef.current = etapeFiltre
    autreOngletRef.current = autreOnglet
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
    sansNumeroRef.current = sansNumero
    noteRef.current = note
  })

  // ── La dictée : on parle, ça s'ajoute à la note de l'appel ──
  const { ecoute, dicter } = useDictee({ dicteeRef, agenceCouranteId, agenceIdRef, setNote, setErreur })
  // ── Le script d'appel : lu au montage, modifiable sur place ──
  const scriptAppel = useScriptAppel(setErreur)

  // ── Calculs d'affichage ──
  const attribution = useMemo(() => (fiche && reserve.length ? numeroEmissionPour(fiche.agence, reserve, fileAgences, autresNumeros) : null), [fiche, reserve, fileAgences, autresNumeros])
  const emissionBloquee = Boolean(attribution?.bloque)
  const numeroEmission = attribution && !attribution.bloque ? attribution.numero : (fiche?.agence.numeroEmission ?? "")
  const jauge = useMemo(() => jaugeDuJour(numeroEmission, compteursNumero, quota), [numeroEmission, compteursNumero, quota])
  const lignes = useMemo(() => (fiche ? lignesNumeros(fiche.agence, fiche.contacts) : []), [fiche])
  const defaut = useMemo(() => (fiche ? numeroParDefaut(fiche.agence, fiche.contacts) : null), [fiche])
  const dateMaintenant = useMemo(() => new Date(maintenant), [maintenant])
  const heureRelance = reglages?.heure_relance ?? null
  const defautDemain = useMemo(() => (heureRelance === null ? "" : demainALHeure(dateMaintenant, heureRelance)), [dateMaintenant, heureRelance])
  const compte = compteARebours(compteFin, maintenant)
  const libre = appel === null && !barreVisible // on peut composer
  const fileTerminee = fileAgences.length > 0 && index >= fileAgences.length
  const contactsActifs = fiche ? fiche.contacts.filter((c) => !c.parti) : []
  const appelEnSuspens = fiche ? appelNonNote(fiche.activites, appel?.appelId) : null
  // L'appel en cours de composition n'est pas « bloquant » : c'est lui dont on attend le résultat.
  const bloquant = appelBloquant && appelBloquant.id !== appel?.appelId ? appelBloquant : null
  useEffect(() => { bloquantRef.current = bloquant }, [bloquant])
  const verifierAppelBloquant = useCallback(async () => {
    try { setAppelBloquant(await monAppelSansResultat()) } catch { /* réseau : on garde l'état connu */ }
  }, [])
  useEffect(() => {
    if (!actif) return
    const premier = setTimeout(() => void verifierAppelBloquant(), 0)
    const t = setInterval(() => { if (document.visibilityState === "visible") void verifierAppelBloquant() }, 60_000)
    return () => { clearTimeout(premier); clearInterval(t) }
  }, [actif, verifierAppelBloquant])
  // La session retourne d'elle-même sur l'agence de l'appel à noter…
  useEffect(() => {
    if (!bloquant || appel || barreVisible || agenceCouranteId === bloquant.agenceId) return
    const t = setTimeout(() => {
      setAuto(false)
      setDirecteId(bloquant.agenceId)
      setErreur(`Note d'abord le résultat de ton appel du ${dateHeureCourte(bloquant.date)} à ${bloquant.agenceNom || "cette agence"} : rien d'autre n'est possible avant.`)
    }, 0)
    return () => clearTimeout(t)
  }, [bloquant, appel, barreVisible, agenceCouranteId])
  // … et ouvre sa barre de résultat.
  useEffect(() => {
    if (!bloquant || appel || barreVisible || !fiche || fiche.agence.id !== bloquant.agenceId) return
    const ligne = fiche.activites.find((x) => x.id === bloquant.id)
    if (!ligne) return
    const t = setTimeout(() => noterAppelEnSuspensRef.current(ligne), 0)
    return () => clearTimeout(t)
  }, [bloquant, appel, barreVisible, fiche])
  // Un appel lancé sans résultat noté : on ne recompose pas avant de l'avoir complété (Mahdi, 13/10).
  const titreSuspens = appelEnSuspens ? `Note d'abord le résultat de l'appel du ${dateHeureCourte(appelEnSuspens.date)}` : undefined
  const bloqueOnglet = autreOnglet ? "La session est ouverte dans un autre onglet" : undefined

  // ── Lectures ──
  // Les repères : secteurs, compteurs des files, appels du jour, réserve de numéros.
  // Les chiffres de MA base, toujours (Mahdi, 14/10 : « 2 100, puis 646 quand je clique ») :
  // rien n'est compté tant que le compte n'est pas connu (sinon on compterait toute la base),
  // et une réponse arrivée en retard n'écrase jamais une plus récente (jeton).
  const chargerReperes = useCallback(async () => {
    if (!moiId) return
    const jeton = ++jetonCompteurs.current
    const m = new Date()
    const [sect, cpt, app, parNumero, res] = await Promise.all([
      // Un comptage en échec reste null : la pastille affiche « — », jamais un faux chiffre.
      chargerSecteurs().catch(() => [] as Secteur[]), compterPiles(proprietaire).catch(() => null), agencesAppeleesAujourdHui(m), compterAppelsDuJourParNumero(m), chargerNumerosDuCompte(moiId).catch(() => null),
    ])
    if (!enVie.current || jeton !== jetonCompteurs.current) return
    setSecteurs(sect)
    setCompteurs(cpt)
    // Le matin (Mahdi, 10/10) : d'abord « À rappeler aujourd'hui » s'il y en a, puis « À prospecter ».
    if (premierReperes.current) {
      premierReperes.current = false
      if (cpt && cpt.rappels > 0) setFile("rappels")
    }
    setAppelees(app)
    setCompteursNumero(parNumero)
    if (res) {
      // Mes numéros seulement (Ringover fait sonner le PROPRIÉTAIRE du numéro) ; ceux des collègues à part.
      setReserve(res.miens)
      autresNumerosRef.current = res.autres
      setAutresNumeros(res.autres)
      setSansNumero(res.parCompte && res.miens.length === 0)
    }
    setMaintenant(Date.now())
  }, [proprietaire, moiId])
  const premierReperes = useRef(true)
  const proprietaireRef = useRef(proprietaire)
  useEffect(() => {
    proprietaireRef.current = proprietaire
  }, [proprietaire])
  // Recompter les piles (après un résultat, une tâche, un apporteur) ; en échec : « — ».
  const recompterFiles = useCallback(() => {
    const jeton = ++jetonCompteurs.current
    compterPiles(proprietaireRef.current)
      .then((x) => {
        if (enVie.current && jeton === jetonCompteurs.current) setCompteurs(x)
      })
      .catch(() => {
        if (enVie.current && jeton === jetonCompteurs.current) setCompteurs(null)
      })
  }, [])

  // La file : rechargée quand on change de pile, de secteur, d'étape, de sourçage, ou la case des
  // déjà appelées. LA BASE la calcule (pile_demarchage : l'ordre, le repos, un numéro = un appel
  // par jour, la base de chacun) ; l'écran l'affiche telle quelle. Une étape choisie = TOUTES les
  // agences de cette étape, quelle que soit la pile (Mahdi, 09/10 : « je ne vois pas mes intéressés »).
  const chargerLaFile = useCallback(async () => {
    if (!moiId) return // la base n'est connue qu'avec le compte
    const jeton = ++jetonFile.current
    setChargementFile(true)
    try {
      const [agences, app] = await Promise.all([
        chargerPile(file, { proprietaire, etape: etapeFiltre as Agence["etape"] | "", secteur: secteurDuJour || null, sourcage, inclureAppelees: inclureDejaAppelees }),
        agencesAppeleesAujourdHui(new Date()),
      ])
      if (!enVie.current || jeton !== jetonFile.current) return // une lecture plus récente est en route
      setAppelees(app)
      setFileAgences(agences)
      setIndex(0)
    } catch (e) {
      if (enVie.current) setErreur(`Lecture de la file : ${messageDe(e)}`)
    } finally {
      if (enVie.current && jeton === jetonFile.current) setChargementFile(false)
    }
  }, [file, secteurDuJour, etapeFiltre, sourcage, inclureDejaAppelees, proprietaire, moiId])

  useEffect(() => {
    enVie.current = true
    const t = setTimeout(() => {
      void chargerReperes()
    }, 0)
    return () => {
      enVie.current = false
      clearTimeout(t)
    }
  }, [chargerReperes])

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
  // Un résultat reste à noter : changer d'agence effacerait l'appel en cours. La demande attend que
  // la barre se ferme (Mahdi, 13/10 : jamais d'appel perdu parce qu'on a cliqué « Appeler » dans l'agenda).
  useEffect(() => {
    if (!agenceInitiale) return
    const t = setTimeout(() => {
      if (appelRef.current || barreRef.current) {
        if (agenceInitiale === agenceIdRef.current) return
        directeEnAttente.current = agenceInitiale
        setErreur("Note d'abord le résultat de l'appel en cours. L'agence demandée s'ouvrira ensuite.")
        return
      }
      setDirecteId(agenceInitiale)
    }, 0)
    return () => clearTimeout(t)
  }, [agenceInitiale])
  useEffect(() => {
    if (barreVisible || appel || !directeEnAttente.current) return
    const t = setTimeout(() => {
      const id = directeEnAttente.current
      directeEnAttente.current = null
      if (id) setDirecteId(id)
    }, 0)
    return () => clearTimeout(t)
  }, [barreVisible, appel])

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
        if (res.length && (!c.agence.numeroEmission || estDansLaReserve(c.agence.numeroEmission, autresNumerosRef.current))) {
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
  const rafraichirCourante = useCallback(async (): Promise<AgenceComplete | null> => {
    const id = agenceIdRef.current
    if (!id) return null
    try {
      const c = await chargerAgence(id)
      if (!enVie.current || agenceIdRef.current !== id) return null
      setCourante((prev) => (prev && prev.agence.id === id ? { ...c, agence: { ...c.agence, numeroEmission: c.agence.numeroEmission || prev.agence.numeroEmission } } : c))
      return c
    } catch (e) {
      if (enVie.current) setErreur(`Lecture de l'agence : ${messageDe(e)}`)
      return null
    }
  }, [])

  // Une agence modifiée depuis sa fiche (App incrémente `versionAgences`) : hors session, la file est
  // relue ; en session, la fiche en cours est relue et sort de la file si elle n'a plus rien à y faire
  // (Mahdi, 13/10 : « je l'ai passée pas intéressée, la session me la propose encore »).
  const versionVue = useRef(versionAgences)
  useEffect(() => {
    if (versionVue.current === versionAgences) return
    versionVue.current = versionAgences
    const t = setTimeout(async () => {
      if (!enCoursRef.current && !barreRef.current && !appelRef.current) {
        void chargerLaFileRef.current()
        return
      }
      const c = await rafraichirCourante()
      if (!c || !enVie.current) return
      const arr = fileRef.current
      const i = arr.findIndex((x) => x.id === c.agence.id)
      if (i < 0) return
      if (!horsDeLaPile(c.agence, pileRef.current, etapeFiltreRef.current)) {
        setFileAgences(arr.map((x) => (x.id === c.agence.id ? { ...x, ...c.agence, numeroEmission: c.agence.numeroEmission || x.numeroEmission } : x)))
        return
      }
      const courante = !directeRef.current && i === indexRef.current
      if (courante && (barreRef.current || appelRef.current)) return // le résultat d'abord ; la file avancera ensuite
      setFileAgences(arr.filter((x) => x.id !== c.agence.id))
      if (!directeRef.current && i < indexRef.current) setIndex(indexRef.current - 1)
      if (courante) setInfo(`${c.agence.nom} : ${libelleEtape(c.agence.etape)}, sortie de la file.`)
    }, 0)
    return () => clearTimeout(t)
  }, [versionAgences, rafraichirCourante])

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
    if (bloquantRef.current) {
      setErreur(`Note d'abord le résultat de ton appel du ${dateHeureCourte(bloquantRef.current.date)} à ${bloquantRef.current.agenceNom || "cette agence"}.`)
      return
    }
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
    if (bloquantRef.current) {
      setErreur(`Note d'abord le résultat de ton appel du ${dateHeureCourte(bloquantRef.current.date)} à ${bloquantRef.current.agenceNom || "cette agence"}.`)
      return
    }
    dicteeRef.current?.stop()
    couperMinuterie()
    if (directeId) {
      setDirecteId(null)
      return
    }
    setIndex((i) => Math.max(0, i - 1))
  }
  function allerA(i: number) {
    if (bloquantRef.current) {
      setErreur(`Note d'abord le résultat de ton appel du ${dateHeureCourte(bloquantRef.current.date)} à ${bloquantRef.current.agenceNom || "cette agence"}.`)
      return
    }
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

  // Deux onglets sur la session (Mahdi, 13/10) : voir `useOngletUnique`. Un autre onglet ouvert
  // coupe le mode automatique et la minuterie de celui-ci.
  useEffect(() => {
    if (!autreOnglet) return
    const t = setTimeout(() => {
      setAuto(false)
      couperMinuterie()
    }, 0)
    return () => clearTimeout(t)
  }, [autreOnglet, couperMinuterie])

  // Fermer l'onglet ou recharger avec un résultat à noter : le navigateur demande confirmation.
  useEffect(() => {
    if (!barreVisible) return
    const retenir = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", retenir)
    return () => window.removeEventListener("beforeunload", retenir)
  }, [barreVisible])

  // ── Lancer un appel ──
  const lancerAppel = useCallback(
    async (numeroAppele: string, contactId: string | null, depuisAuto = false) => {
      const c = couranteRef.current
      if (!c || verificationEnCours.current) return // un 2e clic pendant les vérifications : ignoré
      if (appelRef.current || barreRef.current) {
        setErreur("Note d'abord le résultat de l'appel en cours.")
        return
      }
      if (autreOngletRef.current) {
        setErreur("La session de call est déjà ouverte dans un autre onglet : ferme l'un des deux pour ne pas appeler deux fois le même numéro.")
        return
      }
      const suspens = appelNonNote(c.activites)
      if (suspens) {
        setErreur(`Note d'abord le résultat de l'appel du ${dateHeureCourte(suspens.date)} (bouton « Noter le résultat »).`)
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
      // Aucun numéro Ringover à moi : on n'appelle pas avec celui d'un collègue (ça le ferait sonner, lui).
      if (sansNumeroRef.current) {
        setErreur("Aucun numéro Ringover n'est attribué à ton compte : un administrateur le règle dans Comptes (colonne « Numéro Ringover »). (Tu peux toujours copier le numéro.)")
        if (depuisAuto) setAuto(false)
        return
      }
      // L'agence est TOUJOURS appelée depuis son numéro attitré. Sorti de la réserve → bloqué.
      let from = c.agence.numeroEmission
      const res = reserveRef.current
      if (res.length) {
        const att = numeroEmissionPour(c.agence, res, fileRef.current, autresNumerosRef.current)
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
      if (Date.now() - dernierLancementRef.current < DELAI_ANTI_DOUBLE_APPEL_MS) return
      dernierLancementRef.current = Date.now()
      // À la main, juste avant de composer (le mode automatique fait déjà ses vérifications) :
      // l'appel précédent est-il raccroché ? ce standard a-t-il déjà été composé aujourd'hui,
      // par toi, un collègue ou un autre onglet ? Une vérification en panne ne bloque pas.
      // La garde AVANT de composer, en base (Mahdi, 13/10 : « on ne tue pas les numéros ») : même
      // règle pour tout le monde, mode auto compris — appel non noté, même numéro déjà composé
      // aujourd'hui (hors rappel daté), agence au repos ou sortie (hors appel direct).
      // « Copier le numéro » n'est jamais bloqué.
      if (versionPerimee()) {
        // Un onglet sur une ancienne version n'appelle pas (les règles ont pu changer).
        setErreur("Une nouvelle version du logiciel est en ligne : recharge la page avant d'appeler. (Tu peux toujours copier le numéro.)")
        if (depuisAuto) setAuto(false)
        return
      }
      verificationEnCours.current = true
      try {
        const precedent = depuisAuto ? "" : dernierCallIdRef.current
        const [st, garde] = await Promise.all([
          precedent ? statutAppelsRingover(precedent).catch(() => null) : Promise.resolve(null),
          appelVerifier(c.agence.id, numeroAppele, Boolean(directeRef.current)).catch(() => undefined),
        ])
        if (!enVie.current) return
        if (st?.ok && st.actif) {
          setErreur("Ton appel précédent est encore en ligne sur Ringover : raccroche avant d'en lancer un autre.")
          return
        }
        // La garde n'a pas répondu (réseau) : on ne compose pas à l'aveugle (Mahdi, 14/10 : verrouillé).
        const refus = garde === undefined ? "La vérification avant d'appeler n'a pas pu se faire (réseau) : réessaie dans un instant." : garde
        if (refus) {
          if (depuisAuto) {
            setInfo(`${c.agence.nom} passée : ${refus}`)
            goTimerRef.current = setTimeout(() => avancerRef.current(), 1200)
          } else setErreur(refus + " (Tu peux toujours copier le numéro.)")
          return
        }
      } finally {
        verificationEnCours.current = false
      }
      // Pendant la vérification, on a pu changer d'agence ou noter un autre appel.
      if (agenceIdRef.current !== c.agence.id || appelRef.current || barreRef.current) return
      const t = Date.now()
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
      // L'appel est parti : il est écrit TOUT DE SUITE sur l'agence et dans son fil
      // (Mahdi, 13/10). Le résultat choisi ensuite complétera cette ligne.
      const agenceId = c.agence.id
      const envoi = appelLance({ agenceId, contactId, numero: from, callId: r.callId ?? "", compteNom })
      lancementRef.current = { debut: t, promesse: envoi.then((l) => l.id, () => null) }
      try {
        const { id, ligne } = await envoi
        if (!enVie.current) return
        // L'id suffit pour que le résultat complète CETTE ligne ; la ligne relue sert au fil (absente si la relecture a échoué).
        setAppel((a) => (a && a.debut === t ? { ...a, appelId: id } : a))
        setAppelees((s) => new Set(s).add(agenceId))
        const n = chiffresTel(from)
        if (n) setCompteursNumero((prev) => new Map(prev).set(n, (prev.get(n) ?? 0) + 1))
        const date = ligne?.date ?? new Date().toISOString()
        setFileAgences((arr) => arr.map((x) => (x.id === agenceId ? { ...x, dernierAppelLe: date, dernierResultat: ligne?.resultat ?? RESULTAT_LANCE, nbAppels: x.nbAppels + 1 } : x)))
        setCourante((prev) =>
          prev && prev.agence.id === agenceId
            ? { ...prev, agence: { ...prev.agence, dernierAppelLe: date, nbAppels: prev.agence.nbAppels + 1 }, activites: ligne ? [ligne, ...prev.activites] : prev.activites }
            : prev,
        )
      } catch (e) {
        // L'appel est parti quand même : le résultat, une fois noté, l'écrira.
        if (enVie.current) setErreur(`L'appel est parti, mais sa date n'a pas pu être écrite tout de suite : ${messageDe(e)}. Note bien le résultat.`)
      }
    },
    [couperMinuterie, compteNom],
  )
  useEffect(() => {
    lancerRef.current = lancerAppel
  }, [lancerAppel])

  function appelerMaintenant() {
    if (defaut) void lancerAppel(defaut.numero, defaut.contactId)
  }

  // Un appel passé autrement (poste fixe, portable) : on note le résultat quand même.
  // Un appel lancé sans résultat noté (Mahdi, 13/10 : « je l'ai joint, la fiche dit 0 ») : on le complète.
  // « Apporteur d'affaires » (Mahdi, 13/10) : pendant ou après l'appel, un clic suffit — l'agence
  // part chez les apporteurs, l'appel lancé est clos par la base (« passée en apporteur », rien
  // d'autre à cocher) et la session passe à la fiche suivante. Plus jamais grisé en session.
  async function passerEnApporteur() {
    const c = couranteRef.current
    if (!c || apporteurEnCours.current) return
    apporteurEnCours.current = true
    const id = c.agence.id
    const a = appelRef.current
    try {
      if (a && !a.manuel && !a.appelId && lancementRef.current?.debut === a.debut) await lancementRef.current.promesse // la ligne du clic, d'abord écrite
      await passerApporteur(id, compteNom)
      if (!enVie.current) return
      if (a && a.agenceId === id) {
        setAppel(null)
        setBarreVisible(false)
        setNote("")
        setSuggestion(null)
      }
      setInfo(`${c.agence.nom} : passée en apporteur d'affaires, elle ne sera plus démarchée.`)
      setAppelees((s) => new Set(s).add(id))
      // ⚠ 27/10 (Horlann : « des fois ça ne passe pas au numéro suivant ») : la base vient de clore l'appel
      // lancé, mais le verrou « note d'abord ton résultat » le gardait en mémoire jusqu'à une minute et
      // ramenait aussitôt sur cette agence. On l'oublie tout de suite, puis on relit la base.
      if (bloquantRef.current?.agenceId === id) bloquantRef.current = null
      setAppelBloquant((prev) => (prev && prev.agenceId === id ? null : prev))
      void verifierAppelBloquant()
      // Elle sort de la file DANS TOUS LES CAS (avant : en appel direct, on revenait à la file où elle
      // était encore, à la même place — même agence à l'écran). La suivante prend sa place.
      const arr = fileRef.current
      const pos = arr.findIndex((x) => x.id === id)
      if (directeRef.current === id) setDirecteId(null)
      if (pos >= 0) {
        setFileAgences(arr.filter((x) => x.id !== id))
        if (pos < indexRef.current) setIndex(indexRef.current - 1)
        else setIndex(Math.min(indexRef.current, Math.max(0, arr.length - 2)))
      }
      recompterFiles()
    } catch (e) {
      setErreur(messageDe(e))
    } finally {
      apporteurEnCours.current = false
    }
  }

  noterAppelEnSuspensRef.current = (ligne: Activite) => noterAppelEnSuspens(ligne)
  function noterAppelEnSuspens(ligne: Activite) {
    if (!fiche) return
    const t = Date.now()
    setErreur("")
    setInfo("")
    setSuggestion(null)
    setIndice("")
    setMaintenant(t)
    setAppel({ agenceId: fiche.agence.id, numeroAppele: "", contactId: ligne.contactId, numeroEmission: ligne.numeroUtilise, callId: ligne.callId, debut: t, enLigneDepuis: null, fin: null, etape: "sans_suivi", manuel: true, appelId: ligne.id })
    setBarreVisible(true)
    setContactEnLigne(ligne.contactId)
  }

  function noterSansRingover() {
    if (!fiche || appelEnSuspens) return // l'appel en suspens se complète, il ne se double pas
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
  useSurveillanceAppel({ debutAppel, appelManuel, appelRef, toursMaxRef, setMaintenant, setAppel, setSuggestion, setIndice, setErreur })

  // ── Mode automatique : compte à rebours, puis l'appel du numéro par défaut ──
  const courantePrete = Boolean(fiche)
  useEffect(() => {
    if (!auto || !enCours || !libre || !courantePrete || !agenceCouranteId || autreOnglet || cadence === null) return
    const c = couranteRef.current
    if (!c || c.agence.id !== agenceCouranteId) return
    // Un appel lancé sans résultat noté sur cette agence : on ne recompose pas par-dessus.
    // Le mode automatique s'arrête ici, pour qu'on le note (Mahdi, 13/10).
    const suspens = appelNonNote(c.activites)
    if (suspens) {
      const t = setTimeout(() => {
        setAuto(false)
        setErreur(`Mode automatique arrêté : l'appel du ${dateHeureCourte(suspens.date)} à ${c.agence.nom} attend son résultat. Note-le (« Noter le résultat »), puis relance.`)
      }, 0)
      return () => clearTimeout(t)
    }
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
      if (appelRef.current || barreRef.current || autreOngletRef.current) return
      setCompteFin(null)
      // Le numéro est relu MAINTENANT (Mahdi, 13/10) : pendant le compte à rebours, un contact a pu
      // être ajouté, corrigé ou marqué parti. Jamais le numéro d'il y a 5 secondes.
      const fraiche = couranteRef.current
      if (!fraiche || fraiche.agence.id !== agenceCouranteId) return
      const suspensFrais = appelNonNote(fraiche.activites)
      if (suspensFrais) {
        setAuto(false)
        setErreur(`Mode automatique arrêté : l'appel du ${dateHeureCourte(suspensFrais.date)} à ${fraiche.agence.nom} attend son résultat. Note-le (« Noter le résultat »), puis relance.`)
        return
      }
      const dFrais = numeroParDefaut(fraiche.agence, fraiche.contacts)
      if (!numeroValide(dFrais.numero)) {
        setErreur(`${fraiche.agence.nom} : numéro incorrect ou absent — sautée.`)
        goTimerRef.current = setTimeout(() => avancerRef.current(), 1500)
        return
      }
      void lancerRef.current(dFrais.numero, dFrais.contactId, true)
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
  }, [auto, enCours, libre, courantePrete, agenceCouranteId, cadence, autreOnglet])

  // ── Valider le résultat : LA seule écriture de l'appel ──
  const validerResultat = useCallback(
    async (choix: ChoixResultat) => {
      const c = couranteRef.current
      const a = appelRef.current
      if (!c) return
      // Un double clic (ou Entrée + clic) avant que l'écran ne se mette à jour : un seul envoi.
      if (enregistrementEnCours.current) return
      enregistrementEnCours.current = true
      setEnregistrement(true)
      try {
        const dureeS = a && !a.manuel && a.fin && a.enLigneDepuis ? dureeAppel(a.enLigneDepuis, a.fin) : null
        // L'appel écrit au clic (attendu s'il est encore en route) : le résultat le complète, pas de doublon.
        const appelId = a?.appelId ?? (a && !a.manuel && lancementRef.current?.debut === a.debut ? await lancementRef.current.promesse : null)
        const bilan = await enregistrerAppel({
          agenceId: c.agence.id, contactId: choix.contactId, resultat: choix.resultat, issue: choix.issue, motif: choix.motif, note: noteRef.current.trim(),
          numero: a?.numeroEmission ?? "", dureeS, callId: a?.callId ?? "", rappelLe: choix.rappelLe, rdvLe: choix.rdvLe, rdvType: choix.rdvType, compteNom, source: "session",
          appelId,
        })
        if (!enVie.current) return
        const m = new Date()
        setInfo(`${c.agence.nom} : ${resumeEcriture(bilan, choix, m, relanceJoursRef.current)}`)
        setAppelees((s) => new Set(s).add(c.agence.id))
        const n = appelId ? "" : chiffresTel(a?.numeroEmission ?? "") // déjà compté au clic
        if (n) {
          setCompteursNumero((prev) => {
            const suite = new Map(prev)
            suite.set(n, (suite.get(n) ?? 0) + 1)
            return suite
          })
        }
        setFileAgences((arr) =>
          arr.map((x) => (x.id === c.agence.id ? { ...x, etape: bilan.etape, tentatives: bilan.tentatives, jointFois: bilan.jointFois, dernierAppelLe: appelId ? x.dernierAppelLe : m.toISOString(), dernierResultat: choix.resultat, nbAppels: appelId ? x.nbAppels : x.nbAppels + 1 } : x)),
        )
        setCourante((prev) =>
          prev && prev.agence.id === c.agence.id
            ? {
                ...prev,
                agence: { ...prev.agence, etape: bilan.etape, tentatives: bilan.tentatives, jointFois: bilan.jointFois, dernierAppelLe: appelId ? prev.agence.dernierAppelLe : m.toISOString(), nbAppels: appelId ? prev.agence.nbAppels : prev.agence.nbAppels + 1 },
                activites: appelId ? prev.activites.map((x) => (x.id === appelId ? { ...x, resultat: choix.resultat, issue: choix.issue ?? "" } : x)) : prev.activites,
              }
            : prev,
        )
        // L'IA prépare le mail et analyse l'appel tout de suite (s'il y a eu quelqu'un au bout du fil).
        if (choix.resultat === "joint" || choix.resultat === "standard") lancerAnalyseAppel(bilan.appelId)
        setNbResultats((n) => n + 1)
        // L'appel noté était peut-être celui qui bloquait le compte : la navigation se libère.
        // ⚠ 27/10 : on compare au verrou EN MÉMOIRE (relu une fois par minute), pas à `bloquant` qui exclut
        // l'appel en cours : sinon l'appel qu'on vient de noter restait « à noter » jusqu'à la relecture,
        // et la session ramenait dessus au lieu de passer à la suivante.
        if (bloquantRef.current && bloquantRef.current.id === bilan.appelId) bloquantRef.current = null
        setAppelBloquant((prev) => (prev && prev.id === bilan.appelId ? null : prev))
        void verifierAppelBloquant()
        setAppel(null)
        setBarreVisible(false)
        setNote("")
        setSuggestion(null)
        setIndice("")
        setErreur("")
        recompterFiles()
        avancerRef.current()
      } catch (e) {
        if (enVie.current) setErreur(`Enregistrement de l'appel : ${messageDe(e)}`)
      } finally {
        enregistrementEnCours.current = false
        if (enVie.current) setEnregistrement(false)
      }
    },
    [compteNom, recompterFiles, verifierAppelBloquant],
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

  // ── Contacts, actions, e-mail, copie ──
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
    setFormAction({ titre: type === "tache" ? "Rappeler" : "Rendez-vous", quand: heureRelance === null ? "" : demainALHeure(new Date(), heureRelance), type: "telephone", note: "" })
    setDialogue(type)
  }
  async function validerAction() {
    if (!fiche || !dialogue || dialogue === "passer") return
    const agenceId = fiche.agence.id
    const contactId = contactEnLigne ?? defaut?.contactId ?? null
    try {
      const echeance = versIso(formAction.quand)
      if (!echeance) {
        setErreur("Choisis une date et une heure.")
        return
      }
      if (dialogue === "tache") await creerTache({ agenceId, contactId, compteNom, titre: formAction.titre.trim() || "Rappeler", echeance, note: formAction.note })
      else await creerRdv({ agenceId, contactId, compteNom, titre: formAction.titre.trim() || "Rendez-vous", echeance, rdvType: formAction.type, note: formAction.note })
      if (!enVie.current) return
      setDialogue(null)
      setErreur("")
      await rafraichirCourante()
      recompterFiles()
    } catch (e) {
      setErreur(`Enregistrement : ${messageDe(e)}`)
    }
  }
  function ouvrirEmail() {
    if (!fiche) return
    const k = fiche.contacts.find((x) => x.id === (contactEnLigne ?? defaut?.contactId)) ?? fiche.contacts.find((x) => x.principal && !x.parti) ?? null
    setEnvoiPour(destinataireDepuis(fiche.agence, k))
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

  return (
    <div className="page">
      <EnTetePage
        titre="Sessions de call"
        sousTitre={enCours ? `Session en cours · ${Math.min(index + 1, fileAgences.length)} / ${fileAgences.length}${auto ? " · mode automatique" : ""}` : etapeFiltre ? `Étape « ${libelleEtape(etapeFiltre)} » : toutes les agences de cette étape, quelle que soit la pile.` : "Choisis une pile, un secteur, et démarre."}
        droite={
          <EnTeteSession
            rafraichirMails={nbResultats}
            file={file}
            setFile={setFile}
            etapeFiltre={etapeFiltre}
            setEtapeFiltre={setEtapeFiltre}
            chargementFile={chargementFile}
            nbFile={fileAgences.length}
            compteurs={compteurs}
            enCours={enCours}
            barreVisible={barreVisible}
            optionsDeBase={optionsDeBase}
            valeurBase={normaliserChoix(choixBase, admin, nonAttribueesLibres)}
            choisirBase={choisirBase}
            secteurDuJour={secteurDuJour}
            setSecteurDuJour={setSecteurDuJour}
            secteurs={secteurs}
            sourcage={sourcage}
            setSourcage={setSourcage}
            auto={auto}
            setAuto={setAuto}
            autreOnglet={autreOnglet}
            cadence={cadence}
            setCadence={setCadence}
            arreter={arreter}
            demarrer={demarrer}
            reglagesLus={Boolean(reglages)}
            bloqueOnglet={bloqueOnglet}
          />
        }
      />

      {autreOnglet ? (
        <Bandeau role="alerte" className="mb-4">La session de call est déjà ouverte dans un autre onglet : ferme l'un des deux pour ne pas appeler deux fois le même numéro.</Bandeau>
      ) : null}

      {erreurReglages ? <Bandeau role="alerte" className="mb-4">{erreurReglages} On n'appelle pas sans les réglages : recharge la page.</Bandeau> : null}
      {erreur ? (
        <Bandeau role="alerte" className="mb-4" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur("")}>OK</Bouton>}>{erreur}</Bandeau>
      ) : null}
      {info ? (
        <Bandeau role="ok" className="mb-4" action={<Bouton taille="sm" variante="discret" onClick={() => setInfo("")}>OK</Bouton>}>{info}</Bandeau>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr_380px]">
        {/* ── 1. La file ── */}
        <ColonneFile
          index={index}
          fileAgences={fileAgences}
          file={file}
          recherche={recherche}
          setRecherche={setRecherche}
          resultats={resultats}
          onAppelerDirect={(id) => {
            if (bloquantRef.current) { setErreur("Note d'abord le résultat de ton appel en attente."); return }
            setDirecteId(id)
            setRecherche("")
          }}
          barreVisible={barreVisible || Boolean(bloquant)}
          enCours={enCours}
          directeId={directeId}
          fileTerminee={fileTerminee}
          reculer={reculer}
          avancer={avancer}
          reposJours={reglages?.repos_appel_jours}
          inclureDejaAppelees={inclureDejaAppelees}
          setInclureDejaAppelees={setInclureDejaAppelees}
          chargementFile={chargementFile}
          appelees={appelees}
          dateMaintenant={dateMaintenant}
          allerA={allerA}
        />

        {/* ── 2. L'agence en cours ── */}
        <div className="min-w-0 space-y-4">
          {auto && enCours && libre && compte !== null ? (
            <Bandeau
              role="info"
              action={
                <>
                  <Bouton taille="sm" icone={<Phone />} onClick={appelerMaintenant} disabled={!defaut || Boolean(appelEnSuspens) || autreOnglet} title={titreSuspens ?? bloqueOnglet}>Appeler maintenant</Bouton>
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
                <Vide
                  titre="Pile terminée"
                  texte={file === "a_prospecter" ? "Toutes les agences de cette pile ont été vues. Change de secteur, ou reviens en arrière." : "Toutes les agences de cette pile ont été vues. Enchaîne sur « À prospecter », ou reviens en arrière."}
                  action={
                    <>
                      {file !== "a_prospecter" ? <Bouton variante="plein" icone={<ChevronRight />} onClick={() => { setFile("a_prospecter"); setEtapeFiltre("") }}>Enchaîner sur « À prospecter »</Bouton> : null}
                      <Bouton icone={<ChevronLeft />} onClick={reculer}>Revenir à la dernière</Bouton>
                    </>
                  }
                />
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
              <FicheEnCours
                fiche={fiche}
                ouvrirAgence={ouvrirAgence}
                passerEnApporteur={passerEnApporteur}
                directeId={directeId}
                onRevenirFile={() => setDirecteId(null)}
                appelEnSuspens={appelEnSuspens}
                noterAppelEnSuspens={noterAppelEnSuspens}
                barreVisible={barreVisible}
                blocNumeros={
                  <BlocNumeros
                    lignes={lignes}
                    appel={appel}
                    maintenant={maintenant}
                    barreVisible={barreVisible}
                    appelEnSuspens={Boolean(appelEnSuspens)}
                    titreSuspens={titreSuspens}
                    noterSansRingover={noterSansRingover}
                    copie={copie}
                    copier={copier}
                    emissionBloquee={emissionBloquee}
                    libre={libre}
                    autreOnglet={autreOnglet}
                    bloqueOnglet={bloqueOnglet}
                    lancerAppel={lancerAppel}
                    attribution={attribution}
                    reattribuerNumero={reattribuerNumero}
                    numeroEmission={numeroEmission}
                    jauge={jauge}
                  />
                }
                blocContacts={
                  <BlocContacts
                    contactsActifs={contactsActifs}
                    formContact={formContact}
                    setFormContact={setFormContact}
                    setContactAModifier={setContactAModifier}
                    nouveauContact={nouveauContact}
                    setNouveauContact={setNouveauContact}
                    creerLeContact={creerLeContact}
                  />
                }
                ecoute={ecoute}
                dicter={dicter}
                note={note}
                setNote={setNote}
                ouvrirEmail={ouvrirEmail}
                ouvrirAction={ouvrirAction}
              />

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
                  onApporteur={() => void passerEnApporteur()}
                />
              ) : null}

              {/* Script d'appel, repliable */}
              <ScriptAppel {...scriptAppel} />
            </>
          )}
        </div>

        {/* ── 3. Le fil ── */}
        <ColonneFil fiche={fiche} />
      </div>

      {/* ── Dialogues ── */}
      {contactAModifier && courante ? (
        <ContactFormulaire agenceId={courante.agence.id} contact={contactAModifier} onFermer={() => setContactAModifier(null)} onEnregistre={() => { setContactAModifier(null); rafraichirCourante() }} />
      ) : null}
      {dialogue === "tache" || dialogue === "rdv" ? (
        <DialogueAction
          dialogue={dialogue}
          nomAgence={fiche?.agence.nom}
          formAction={formAction}
          setFormAction={setFormAction}
          onFermer={() => setDialogue(null)}
          onValider={() => void validerAction()}
        />
      ) : null}
      {envoiPour ? (
        <EnvoyerEmailModal
          destinataire={envoiPour}
          onClose={() => {
            setEnvoiPour(null)
            void rafraichirCourante()
          }}
        />
      ) : null}
    </div>
  )
}
