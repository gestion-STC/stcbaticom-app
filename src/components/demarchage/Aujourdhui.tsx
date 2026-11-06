// ════════════════════════════════════════════════════════════════════════════
// AUJOURD'HUI — l'écran d'accueil des commerciaux, au STYLE COURTIER (maquette validée le 06/11/2026).
//
// Une seule longue page (titre « Dashboard », sans barre d'actions), trois chapitres :
//   · Ma journée : le bandeau de cotes, les leads, ce qui est à rappeler (retards en tête),
//     ma performance sur 14 jours ouvrés, mon portefeuille d'agences, ma file d'appel, mes leads ;
//   · L'équipe : la semaine de l'équipe, l'objectif du mois, le classement (5 périodes), les victoires ;
//   · Analyse : les mails, le parcours, quand appeler, les agences qui bougent, le conseil de l'IA.
// Rien de l'ancienne page n'est perdu (santé de la base, clients à confirmer, Fait / Reporter,
// objectif modifiable ; les mails à envoyer restent dans la session de call). Rafraîchi toutes les 60 s quand l'onglet est visible.
// Calculs : src/demarchage/aujourdhuiOutils.ts et tableauOutils.ts ; lectures : db.ts.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { ArrowUpRight, CalendarClock, Check, Pencil, Phone, Sparkles, Trophy } from "lucide-react"
import { useReglages } from "../../demarchage/reglages"
import {
  appelsSortants, bilanMails, chargerLeads, chargerTachesDuJour, compterPiles, deplacerTache, derniersSignaux, etapesDeLaBase, leadsBilanLignes, premiersOsListe,
  resultatsAppelsDepuis, santeDemarchage, statsAppels, terminerTache, type EcartSante, type Lead, type StatsCompte, type TacheAgenda,
} from "../../demarchage/db"
import { dureeLisible, libelleEtape, type Agence, type File } from "../../demarchage/modele"
import { appelsIaPeriode } from "../../demarchage/appelsIa"
import { statsArguments, statsObjections } from "../../demarchage/analyseOutils"
import { attenteCourte, minutesDepuis } from "../../demarchage/leadsOutils"
import {
  bilanLeads, bilanProspection, joursDeRetard, joursOuvresRecents, rangsEntre, regrouperSignaux, rythmeObjectif, serieParJour, sommeJours, tauxJointParHeure, victoiresDepuis,
  type AppelLu, type GroupeSignal, type Jour6, type LeadBilan, type LigneHeure,
} from "../../demarchage/tableauOutils"
import {
  compterAgencesJamaisJointes, compterReveils, composerDate, dansNJoursA, dateLongue, debutDeSemaine, debutDuMois, decomposerDate, finDeSemaine, finDuMois,
  heureCourte, libelleRelatif, lireObjectif, bornesPeriode, classer, majusculeInitiale, dansLaBase, libelleBase, tauxConversionInteresses, baseConversion,
} from "../../demarchage/aujourdhuiOutils"
import { ecrireParametre, lireParametre } from "../../lib/parametresDb"
import { estAdmin, listerComptes } from "../../lib/comptes"
import { useSession } from "../../lib/auth"
import { CLE_CHOIX_LOCAL, CLE_NON_ATTRIBUEES, nonAttribueesPourTous, normaliserChoix, optionsBase, proprietaireDepuisChoix, type Proprietaire } from "../../demarchage/attribution"
import { chargerFonctions, estAuClassement } from "../../lib/fonctionsComptes"
import { Bandeau as BandeauAlerte, Bouton, Champ, Chargement, Dialogue, Etiquette as EtiquetteChamp, Onglets, Selecteur } from "../../ui"
import ClientsAConfirmer from "./ClientsAConfirmer"
import { Bandeau, Bloc, Chapitre, Courbe, Etiquette, Table, Variation } from "./aujourdhui/courtier"
import { fr, pct, pctTxt } from "./aujourdhui/outils"

const RAFRAICHIR_MS = 60_000
const CLE_OBJECTIF = "objectif_os_mensuel"
const JOURS_TENDANCE = 14
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// Les cinq périodes du classement (Mahdi, 06/11 : « il faut pouvoir continuer à regarder la semaine, le mois… »).
type PeriodeC = "jour" | "semaine" | "mois" | "moisDernier" | "tout"
const PERIODES_C: { id: PeriodeC; label: string }[] = [{ id: "jour", label: "Aujourd'hui" }, { id: "semaine", label: "Cette semaine" }, { id: "mois", label: "Ce mois-ci" }, { id: "moisDernier", label: "Mois dernier" }, { id: "tout", label: "Depuis le début" }]
function bornesC(p: PeriodeC, m: Date): { de: Date; a: Date } {
  if (p === "moisDernier") return { de: new Date(m.getFullYear(), m.getMonth() - 1, 1), a: new Date(m.getFullYear(), m.getMonth(), 1) }
  return bornesPeriode(p, m)
}
const METRIQUES: { libelle: string; cle: keyof Jour6 }[] = [{ libelle: "Appels", cle: "appels" }, { libelle: "Décrochés", cle: "decroches" }, { libelle: "Gestionnaires joints", cle: "joints" }, { libelle: "Intéressés", cle: "interesses" }, { libelle: "RDV", cle: "rdv" }, { libelle: "Apporteurs trouvés", cle: "apporteurs" }]
const ETAPES_PARCOURS: { libelle: string; cle: keyof Jour6 }[] = [{ libelle: "Appels", cle: "appels" }, { libelle: "Décrochés", cle: "decroches" }, { libelle: "Gestionnaires joints", cle: "joints" }, { libelle: "Intéressés", cle: "interesses" }, { libelle: "RDV", cle: "rdv" }]
const ETAPES_PORTEFEUILLE = ["a_prospecter", "gestionnaire_joint", "interesse", "rdv_planifie", "client", "pas_interesse", "endormie", "hors_cible"]
const sortie = (e: string) => e === "pas_interesse" || e === "endormie" || e === "hors_cible"

type Donnees = {
  files: Record<File, number> | null
  base: string
  choix: string
  options: { value: string; label: string }[]
  proprietaire: Proprietaire
  taches: TacheAgenda[]
  classements: Record<PeriodeC, StatsCompte[]>
  objectif: number
  jamaisJointes: number
  reveils: number
  comptes: { id: string; nom: string }[]
  jours: Date[] // les jours ouvrés de la tendance, du plus ancien à aujourd'hui
  appels: AppelLu[] // les appels de ces jours-là (toute l'équipe)
  osMois: { agenceId: string; nom: string; date: string; commercialId: string | null }[]
  leads: { agence: Agence; lead: Lead }[]
  etapes: { etape: string }[]
  leadsBilan: LeadBilan[]
}
type Extra = {
  heures: LigneHeure[]
  signaux: GroupeSignal[]
  mails: { envoyes: number; ouverts: number; recus: number; rebonds: number } | null
  objection: { libelle: string; appels: number; levees: number; sansReponse: number; reponse: string } | null
  argument: { libelle: string; aboutis: number; appels: number } | null
  piege: { libelle: string; taux: number } | null
  analyses: number
}

export default function Aujourdhui({ onOuvrirSession, onOuvrirAgence, onNaviguer, onOuvrirEtape }: {
  onOuvrirSession?: (agenceId: string) => void
  onOuvrirAgence?: (agenceId: string) => void
  onNaviguer?: (page: "sessions" | "agences" | "agenda") => void
  onOuvrirEtape?: (etape: string) => void // ouvre Agences filtrée sur cette étape
}) {
  const [d, setD] = useState<Donnees | null>(null)
  const heureRelance = useReglages().reglages?.heure_relance ?? null
  const [maintenant, setMaintenant] = useState(() => new Date())
  const [erreur, setErreur] = useState("")
  const [sante, setSante] = useState<EcartSante[] | null>(null)
  const [santeErreur, setSanteErreur] = useState("")
  const [occupe, setOccupe] = useState(false)
  const [report, setReport] = useState<{ tache: TacheAgenda; jour: string; heure: string } | null>(null)
  const [editionObjectif, setEditionObjectif] = useState(false)
  const [saisieObjectif, setSaisieObjectif] = useState("")
  const [periode, setPeriode] = useState<PeriodeC>("semaine")
  const [extra, setExtra] = useState<Extra | null>(null)
  const [choixLocal, setChoixLocal] = useState<string | null>(() => { try { return localStorage.getItem(CLE_CHOIX_LOCAL) } catch { return null } })
  const enVie = useRef(true)
  const session = useSession()
  const admin = estAdmin(session)
  const moiId = session?.user?.id ?? ""

  const jetonCharge = useRef(0)
  const charger = useCallback(async () => {
    if (!moiId) return
    const jeton = ++jetonCharge.current
    const now = new Date()
    try {
      const comptes = await listerComptes().then((l) => l.map((c) => ({ id: c.id, nom: c.nom || c.email }))).catch(() => [] as { id: string; nom: string }[])
      const fonctions = await chargerFonctions().catch(() => ({}) as Record<string, never>)
      const horsClassement = new Set(Object.entries(fonctions).filter(([, f]) => !estAuClassement(f)).map(([id]) => id))
      const libre = nonAttribueesPourTous(await lireParametre(CLE_NON_ATTRIBUEES).catch(() => null))
      const choix = normaliserChoix(choixLocal, admin, libre)
      const proprietaire = proprietaireDepuisChoix(choixLocal, moiId, admin, libre)
      const jours = joursOuvresRecents(now, JOURS_TENDANCE)
      const [files, taches, objectifBrut, jamaisJointes, reveils, appels, osMois, leads, etapes, leadsBilan, ...parPeriode] = await Promise.all([
        compterPiles(proprietaire).catch(() => null),
        chargerTachesDuJour(now).then((l) => l.filter((t) => dansLaBase(t.agenceCommercialId, proprietaire))),
        lireParametre(CLE_OBJECTIF),
        compterAgencesJamaisJointes(),
        compterReveils(debutDeSemaine(now), finDeSemaine(now)),
        appelsSortants(jours[0], new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)),
        premiersOsListe(debutDuMois(now), finDuMois(now)),
        chargerLeads(proprietaire).catch(() => [] as { agence: Agence; lead: Lead }[]),
        etapesDeLaBase().then((l) => l.filter((x) => dansLaBase(x.commercialId, proprietaire))),
        leadsBilanLignes().then((l) => l.filter((x) => dansLaBase(x.commercialId, proprietaire))),
        ...PERIODES_C.map((p) => { const b = bornesC(p.id, now); return statsAppels(b.de, b.a) }),
      ])
      if (!enVie.current || jeton !== jetonCharge.current) return
      const classements = Object.fromEntries(PERIODES_C.map((p, i) => [p.id, classer(parPeriode[i], comptes, horsClassement)])) as Record<PeriodeC, StatsCompte[]>
      setD({
        files, base: libelleBase(choix, comptes), choix, options: optionsBase(admin, libre, comptes, moiId), proprietaire, taches, classements,
        objectif: lireObjectif(objectifBrut), jamaisJointes, reveils, comptes: comptes.filter((c) => !horsClassement.has(c.id)), jours, appels, osMois, leads, etapes, leadsBilan,
      })
      santeDemarchage()
        .then((s) => { if (enVie.current) { setSante(s ? s.filter((e) => e.code !== "appel_non_note") : s); setSanteErreur("") } })
        .catch((e) => { if (enVie.current) setSanteErreur(message(e)) })
      setMaintenant(now)
      setErreur("")
    } catch (e) {
      if (enVie.current) setErreur(message(e))
    }
  }, [moiId, admin, choixLocal])

  useEffect(() => {
    enVie.current = true
    const premier = setTimeout(charger, 0)
    const t = setInterval(() => { if (document.visibilityState === "visible") charger() }, RAFRAICHIR_MS)
    const surVisible = () => { if (document.visibilityState === "visible") charger() }
    document.addEventListener("visibilitychange", surVisible)
    return () => { enVie.current = false; clearTimeout(premier); clearInterval(t); document.removeEventListener("visibilitychange", surVisible) }
  }, [charger])

  // L'analyse (heures, signaux, mails, IA) : lue une fois, puis toutes les 10 min ; elle ne bouge pas à la minute.
  const extraLu = useRef(0)
  useEffect(() => {
    if (!d || Date.now() - extraLu.current < 10 * 60_000) return
    extraLu.current = Date.now()
    const now = new Date()
    Promise.all([
      resultatsAppelsDepuis(new Date(now.getTime() - 90 * 86_400_000)).catch(() => []),
      derniersSignaux(new Date(now.getTime() - 7 * 86_400_000), 500).catch(() => []),
      bilanMails(new Date(now.getTime() - 7 * 86_400_000)).catch(() => null),
      appelsIaPeriode(new Date(now.getTime() - 30 * 86_400_000), now).catch(() => []),
    ]).then(([res, signaux, mails, ia]) => {
      if (!enVie.current) return
      const objections = statsObjections(ia)
      const args = statsArguments(ia).filter((a) => a.fiable)
      const meilleur = args[0] ?? null
      const plusUtilise = [...args].sort((x, y) => y.appels - x.appels)[0] ?? null
      const o = objections[0]
      setExtra({
        heures: tauxJointParHeure(res), signaux: regrouperSignaux(signaux), mails,
        objection: o ? { libelle: o.libelle, appels: o.appels, levees: o.levees, sansReponse: Math.max(0, o.appels - o.levees), reponse: o.meilleureReponse } : null,
        argument: meilleur ? { libelle: meilleur.libelle, aboutis: meilleur.aboutis, appels: meilleur.appels } : null,
        piege: plusUtilise && meilleur && plusUtilise.libelle !== meilleur.libelle && plusUtilise.taux !== null ? { libelle: plusUtilise.libelle, taux: Math.round(plusUtilise.taux * 100) } : null,
        analyses: ia.filter((a) => a.statut === "pret").length,
      })
    })
  }, [d])

  const agir = async (f: () => Promise<void>) => {
    setOccupe(true); setErreur("")
    try { await f(); await charger() }
    catch (e) { setErreur(message(e)); await charger(); setErreur(message(e)) }
    finally { setOccupe(false) }
  }
  const terminer = (t: TacheAgenda) => agir(async () => { setD((x) => (x ? { ...x, taches: x.taches.filter((y) => y.id !== t.id) } : x)); await terminerTache(t.id) })
  const reporterA = (t: TacheAgenda, date: Date) => agir(async () => { setD((x) => (x ? { ...x, taches: x.taches.filter((y) => y.id !== t.id) } : x)); setReport(null); await deplacerTache(t.id, date.toISOString()) })
  const ouvrirReport = (t: TacheAgenda) => {
    if (heureRelance === null) return
    const { jour, heure } = decomposerDate(dansNJoursA(new Date(), 1, heureRelance).toISOString())
    setReport({ tache: t, jour, heure })
  }
  const validerReportLibre = (e: FormEvent) => {
    e.preventDefault()
    if (!report) return
    const date = composerDate(report.jour, report.heure)
    if (!date) { setErreur("Choisis une date et une heure."); return }
    reporterA(report.tache, date)
  }
  const ouvrirEditionObjectif = () => { setSaisieObjectif(d?.objectif ? String(d.objectif) : ""); setEditionObjectif(true) }
  const enregistrerObjectif = (e: FormEvent) => {
    e.preventDefault()
    const n = lireObjectif(saisieObjectif)
    if (n <= 0) { setErreur("L'objectif doit être un nombre entier supérieur à 0."); return }
    agir(async () => { await ecrireParametre(CLE_OBJECTIF, String(n)); setEditionObjectif(false) })
  }
  // La base affichée (« Ma base », « Base de X »…) : la même que la session de call, mémorisée sur le poste.
  const choisirBase = (v: string) => { try { localStorage.setItem(CLE_CHOIX_LOCAL, v) } catch { /* poste sans stockage */ } setChoixLocal(v) }

  // ── Les séries jour par jour : la mienne (la base choisie), celle de l'équipe, celle de chaque commercial ──
  const calc = useMemo(() => {
    if (!d) return null
    const n = d.jours.length
    const lundi = debutDeSemaine(maintenant), lundiAvant = new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() - 7)
    const rSemaine = rangsEntre(d.jours, lundi, finDeSemaine(maintenant)), rAvant = rangsEntre(d.jours, lundiAvant, lundi)
    const filtre = (a: AppelLu) => (typeof d.proprietaire === "object" ? a.compteId === d.proprietaire.compteId : true)
    const moi = serieParJour(d.appels, d.jours, filtre)
    const equipe = serieParJour(d.appels, d.jours)
    const parCompte = new Map(d.comptes.map((c) => [c.id, serieParJour(d.appels, d.jours, (a) => a.compteId === c.id)]))
    const auj = sommeJours(moi, [n - 1]), memeJour = sommeJours(moi, n > 5 ? [n - 6] : [])
    return { n, moi, equipe, parCompte, auj, memeJour, sMoi: sommeJours(moi, rSemaine), sMoiAvant: sommeJours(moi, rAvant), sEq: sommeJours(equipe, rSemaine), sEqAvant: sommeJours(equipe, rAvant) }
  }, [d, maintenant])

  if (!d || !calc) {
    return (
      <div className="page">
        <h1 className="text-h1 font-semibold text-encre">Dashboard</h1>
        <p className="mb-4 text-legende text-encre-2">{majusculeInitiale(dateLongue(maintenant))}</p>
        {erreur ? <BandeauAlerte role="alerte" action={<Bouton taille="sm" onClick={() => charger()}>Réessayer</Bouton>}>{erreur}</BandeauAlerte> : <Chargement texte="Lecture de la journée…" />}
      </div>
    )
  }

  const rappels = [...d.taches].sort((a, b) => (a.echeance ?? "").localeCompare(b.echeance ?? ""))
  const enRetard = rappels.filter((t) => t.echeance && new Date(t.echeance) < maintenant).length
  const plusVieux = rappels.length ? joursDeRetard(rappels[0].echeance, maintenant) : 0
  const bb = bilanProspection(d.etapes)
  const bl = bilanLeads(d.leadsBilan)
  const rythme = rythmeObjectif(d.osMois.length, d.objectif, debutDuMois(maintenant), finDuMois(maintenant), maintenant)
  const jourAujourdhui = d.jours[calc.n - 1]
  const appelsDuJour = d.appels.filter((a) => new Date(a.date) >= jourAujourdhui)
  const nomDuCompte = (id: string | null) => d.comptes.find((c) => c.id === id)?.nom ?? ""
  const aujIso = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, "0")}-${String(maintenant.getDate()).padStart(2, "0")}`
  const victoires = victoiresDepuis(appelsDuJour, d.osMois.filter((o) => o.date === aujIso).map((o) => ({ ...o, commercialNom: nomDuCompte(o.commercialId) })))
  const tauxSem = pct(calc.sMoi.joints, calc.sMoi.appels), tauxSemAvant = pct(calc.sMoiAvant.joints, calc.sMoiAvant.appels)
  const classement = d.classements[periode]
  const total = classement.reduce((t, x) => ({ appels: t.appels + x.appels, joints: t.joints + x.joints, interesses: t.interesses + x.interesses, pasInteresses: t.pasInteresses + x.pasInteresses, rdv: t.rdv + x.rdv, apporteurs: t.apporteurs + x.apporteurs, premiersOs: t.premiersOs + x.premiersOs, dureeS: t.dureeS + x.dureeS }), { appels: 0, joints: 0, interesses: 0, pasInteresses: 0, rdv: 0, apporteurs: 0, premiersOs: 0, dureeS: 0 })
  const bornesChoisies = bornesC(periode, maintenant)
  const detailPeriode = periode === "tout" ? "tout l'historique" : periode === "jour" ? majusculeInitiale(dateLongue(maintenant)) : `du ${bornesChoisies.de.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} au ${new Date(bornesChoisies.a.getTime() - 1).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`
  const meilleure = extra?.heures.length ? extra.heures.reduce((a, b) => (b.taux > a.taux ? b : a)) : null

  return (
    <div className="@container w-full">
      {/* ── Le titre de la page, seul (Mahdi, 06/11 : « dégage toute la barre, mets juste Dashboard ») ── */}
      <div className="flex h-14 items-center border-b-[0.5px] border-trait px-10"><h1 className="text-sous-titre font-semibold text-encre">Dashboard</h1></div>

      <div className="px-10 pb-16">
        <div className="space-y-4 pt-6 empty:hidden">
          {erreur ? <BandeauAlerte role="alerte" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur("")}>Fermer</Bouton>}>{erreur}</BandeauAlerte> : null}
          {santeErreur ? <BandeauAlerte role="attention">Contrôle de la base indisponible : {santeErreur}</BandeauAlerte> : null}
          {sante && sante.length ? (
            <BandeauAlerte role="alerte">
              <div className="space-y-1">
                <p className="font-semibold">Contrôle de la base : {sante.length} écart{sante.length > 1 ? "s" : ""} à corriger</p>
                <ul className="space-y-0.5">{sante.map((e) => <li key={e.code}><b className="chiffres">{e.nombre}</b> · {e.libelle}{e.exemples ? <span className="text-encre-2"> — {e.exemples.length > 160 ? e.exemples.slice(0, 160) + "…" : e.exemples}</span> : null}</li>)}</ul>
              </div>
            </BandeauAlerte>
          ) : null}
          <ClientsAConfirmer onOuvrirAgence={onOuvrirAgence} onDecision={() => charger()} />
        </div>

        {/* ═══ MA JOURNÉE ═══ */}
        <Chapitre id="journee" titre="Ma journée" sous="Ce que j'ai à faire, où j'en suis, où en est ma base."
          droite={d.options.length > 1 ? <Selecteur value={d.choix} onChange={(e) => choisirBase(e.target.value)} aria-label="La base affichée" className="w-52">{d.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Selecteur> : <Etiquette>{d.base}</Etiquette>}>
          <Bandeau cases={[
            { libelle: "Appels aujourd'hui", valeur: fr(calc.auj.appels), variation: <Variation n={calc.auj.appels} avant={calc.memeJour.appels} />, title: "Comparé au même jour la semaine dernière" },
            { libelle: "Joints aujourd'hui", valeur: fr(calc.auj.joints), variation: <Variation n={calc.auj.joints} avant={calc.memeJour.joints} />, title: "Comparé au même jour la semaine dernière" },
            { libelle: "Taux de joint (semaine)", valeur: pctTxt(tauxSem, 1), variation: <Variation unite="pts" n={tauxSem ?? 0} avant={tauxSemAvant ?? 0} /> },
            { libelle: "Leads à traiter", valeur: d.leads.length, ton: d.leads.length ? "text-signature" : "text-encre", onClick: () => onNaviguer?.("sessions") },
            { libelle: "À rappeler aujourd'hui", valeur: rappels.length, ton: enRetard ? "text-alerte" : "text-encre", variation: enRetard ? <span className="text-colonne text-alerte">{enRetard} en retard</span> : undefined },
            { libelle: "Clients signés", valeur: bb.clients, ton: "text-ok", variation: <span className="chiffres text-colonne text-encre-2">{pctTxt(bb.tauxSignature, 1)}</span>, title: "Taux de signature : clients ÷ agences travaillées" },
          ]} />

          <div className="grid gap-x-10 gap-y-10 @min-[1100px]:grid-cols-2">
            <Bloc titre="Leads à traiter" compte={d.leads.length} droite="le plus ancien d'abord · objectif : 1 h">
              <Table vide="Aucun lead à traiter. Le prochain apparaîtra dès qu'une agence se manifeste."
                colonnes={[{ titre: "Agence" }, { titre: "Signal", largeur: "38%" }, { titre: "Attente", largeur: "76px", droite: true }, { titre: "", largeur: "108px", droite: true }]}
                lignes={d.leads.map(({ agence, lead }) => ({ cle: lead.id, cellules: [
                  <button type="button" className="flex min-w-0 items-center gap-2 hover:underline" onClick={() => onOuvrirAgence?.(agence.id)}><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-signature" /><span className="truncate">{agence.nom}</span></button>,
                  <span className="text-encre-2">{lead.signal}</span>,
                  <span className={minutesDepuis(lead.creeLe, maintenant) > 60 ? "text-alerte" : "text-ok"}>{attenteCourte(minutesDepuis(lead.creeLe, maintenant))}</span>,
                  <Bouton taille="sm" icone={<Phone />} onClick={() => onOuvrirSession?.(agence.id)}>Appeler</Bouton>,
                ] }))} />
            </Bloc>
            <Bloc titre="À rappeler aujourd'hui" compte={rappels.length} droite={enRetard ? <span className="text-alerte">{enRetard} en retard · le plus ancien : {plusVieux} j</span> : rappels.length ? "à jour" : ""}>
              <div className="max-h-[396px] overflow-y-auto">
                <Table vide="Rien à rappeler aujourd'hui."
                  colonnes={[{ titre: "Dû le", largeur: "64px" }, { titre: "Retard", largeur: "60px", droite: true }, { titre: "Agence" }, { titre: "Tâche", largeur: "24%" }, { titre: "", largeur: "176px", droite: true }]}
                  lignes={rappels.map((t) => {
                    const r = joursDeRetard(t.echeance, maintenant)
                    return { cle: t.id, cellules: [
                      <span className="chiffres text-encre-2">{t.echeance ? new Date(t.echeance).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "—"}</span>,
                      r ? <span className="font-medium text-alerte">{r} j</span> : <span className="text-encre-2">{t.echeance ? heureCourte(t.echeance) : "auj."}</span>,
                      <button type="button" className="truncate hover:underline" title={t.agenceNom} onClick={() => onOuvrirAgence?.(t.agenceId)}>{t.agenceNom || "Agence inconnue"}</button>,
                      <span className="text-encre-2" title={t.note || undefined}>{t.titre || (t.type === "rdv" ? "RDV" : "Tâche")}</span>,
                      <span className="flex justify-end gap-0.5">
                        <Bouton taille="icone" variante="discret" icone={<Check />} aria-label="Fait" title="Fait" disabled={occupe} onClick={() => terminer(t)} />
                        <Bouton taille="icone" variante="discret" icone={<CalendarClock />} aria-label="Reporter" title="Reporter" disabled={occupe} onClick={() => ouvrirReport(t)} />
                        <Bouton taille="icone" variante="discret" icone={<ArrowUpRight />} aria-label="Ouvrir la fiche" title="Ouvrir la fiche" onClick={() => onOuvrirAgence?.(t.agenceId)} />
                        <Bouton taille="sm" icone={<Phone />} disabled={occupe} onClick={() => onOuvrirSession?.(t.agenceId)}>Appeler</Bouton>
                      </span>,
                    ] }
                  })} />
              </div>
            </Bloc>
          </div>

          <Bloc titre="Ma performance" droite={`aujourd'hui · cette semaine · évolution vs la semaine dernière · ${calc.n} derniers jours ouvrés`}>
            <Table colonnes={[{ titre: "Indicateur" }, { titre: "Aujourd'hui", largeur: "96px", droite: true }, { titre: "Semaine", largeur: "88px", droite: true }, { titre: "Sem. dernière", largeur: "104px", droite: true }, { titre: "Évolution", largeur: "96px", droite: true }, { titre: "Tendance", largeur: "120px", droite: true }]}
              lignes={METRIQUES.map(({ libelle, cle }) => ({ cle, cellules: [libelle, fr(calc.auj[cle]), <b className="font-semibold">{fr(calc.sMoi[cle])}</b>, <span className="text-encre-2">{fr(calc.sMoiAvant[cle])}</span>, <Variation unite={cle === "rdv" ? "nb" : "%"} n={calc.sMoi[cle]} avant={calc.sMoiAvant[cle]} />, <span className="flex justify-end"><Courbe valeurs={calc.moi.map((j) => j[cle])} /></span>] }))} />
          </Bloc>

          <div className="grid gap-x-10 gap-y-10 @min-[1100px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Bloc titre="Mon portefeuille d'agences" compte={fr(bb.total)} droite={<>taux de signature <b className="chiffres font-medium text-encre">{pctTxt(bb.tauxSignature, 1)}</b> sur {fr(bb.travaillees)} travaillées · {fr(d.jamaisJointes)} jamais jointes</>}>
              <Table colonnes={[{ titre: "Étape" }, { titre: "Agences", largeur: "80px", droite: true }, { titre: "Part", largeur: "64px", droite: true }, { titre: "", largeur: "40%" }]}
                lignes={ETAPES_PORTEFEUILLE.map((e) => {
                  const n = bb.parEtape[e] ?? 0
                  const ton = e === "client" ? "text-ok" : sortie(e) ? "text-encre-2" : "text-encre"
                  return { cle: e, cellules: [
                    <button type="button" className="hover:underline" onClick={() => onOuvrirEtape?.(e)}>{libelleEtape(e)}{e === "endormie" && d.reveils ? <span className="text-encre-2"> · {d.reveils} se réveille{d.reveils > 1 ? "nt" : ""} cette semaine</span> : null}</button>,
                    <span className={ton}>{fr(n)}</span>, <span className="text-encre-2">{pctTxt(pct(n, bb.total), 1)}</span>,
                    <div className="h-[6px] rounded-full bg-fond-3"><div className={`h-full rounded-full ${e === "client" ? "bg-ok" : sortie(e) ? "bg-encre-3" : "bg-info"}`} style={{ width: `${bb.total ? Math.max(n ? 1 : 0, (n / bb.total) * 100) : 0}%` }} /></div>,
                  ] }
                })} />
            </Bloc>
            <div className="space-y-10">
              <Bloc titre="Ma file d'appel" droite="la session de call">
                <Table colonnes={[{ titre: "Pile" }, { titre: "Agences", largeur: "90px", droite: true }]}
                  lignes={[
                    { cle: "p", cellules: ["À prospecter", d.files ? fr(d.files.a_prospecter) : "—"] },
                    { cle: "r", cellules: [<span className={d.files?.rappels ? "text-alerte" : ""}>À rappeler aujourd'hui</span>, <span className={d.files?.rappels ? "font-semibold text-alerte" : ""}>{d.files ? d.files.rappels : "—"}</span>] },
                    { cle: "i", cellules: ["Intéressés à relancer", d.files ? fr(d.files.sans_nouvelle) : "—"] },
                    { cle: "a", cellules: ["À réveiller", d.files ? fr(d.files.a_reveiller) : "—"] },
                  ]} />
              </Bloc>
              <Bloc titre="Mes leads" droite={bl.delaiMoyenMin !== null ? `délai moyen de traitement : ${attenteCourte(bl.delaiMoyenMin)}` : "depuis le début"}>
                <Table colonnes={[{ titre: "Reçus", droite: true }, { titre: "À traiter", droite: true }, { titre: "Traités", droite: true }, { titre: "Retombés", droite: true }, { titre: "RDV", droite: true }, { titre: "Clients", droite: true }]}
                  lignes={[{ cle: "l", cellules: [bl.recus, <span className={bl.aTraiter ? "text-signature" : ""}>{bl.aTraiter}</span>, bl.traites, bl.retombes, <>{bl.rdv} <span className="text-encre-2">{pctTxt(bl.tauxRdv)}</span></>, <span className={bl.clients ? "text-ok" : ""}>{bl.clients} <span className="text-encre-2">{pctTxt(bl.tauxClient, 1)}</span></span>] }]} />
              </Bloc>
            </div>
          </div>
        </Chapitre>

        {/* ═══ L'ÉQUIPE ═══ */}
        <Chapitre id="equipe" titre="L'équipe" sous="L'objectif du mois, le classement des commerciaux, les victoires du jour.">
          <Bandeau cases={[
            { libelle: "Appels de l'équipe (semaine)", valeur: fr(calc.sEq.appels), variation: <Variation n={calc.sEq.appels} avant={calc.sEqAvant.appels} /> },
            { libelle: "Joints (semaine)", valeur: fr(calc.sEq.joints), variation: <Variation n={calc.sEq.joints} avant={calc.sEqAvant.joints} /> },
            { libelle: "Intéressés (semaine)", valeur: fr(calc.sEq.interesses), variation: <Variation n={calc.sEq.interesses} avant={calc.sEqAvant.interesses} /> },
            { libelle: "RDV (semaine)", valeur: fr(calc.sEq.rdv), variation: <Variation unite="nb" n={calc.sEq.rdv} avant={calc.sEqAvant.rdv} /> },
            { libelle: "Premiers OS (mois)", valeur: <>{d.osMois.length}{d.objectif ? <span className="text-sous-titre text-encre-2"> / {d.objectif}</span> : null}</>, ton: d.objectif && d.osMois.length < rythme.attendu ? "text-alerte" : "text-ok" },
          ]} />

          <Bloc titre="Objectif du mois · premiers OS" droite={editionObjectif ? (
            <form onSubmit={enregistrerObjectif} className="flex items-center gap-1.5">
              <Champ type="number" min={1} step={1} value={saisieObjectif} onChange={(e) => setSaisieObjectif(e.target.value)} aria-label="Objectif de premiers OS par mois" className="h-7! w-20" autoFocus />
              <Bouton type="submit" taille="sm" chargement={occupe}>OK</Bouton>
              <Bouton taille="sm" variante="discret" onClick={() => setEditionObjectif(false)}>Annuler</Bouton>
            </form>
          ) : (
            <span className="flex items-center gap-3">
              {d.objectif ? <span className={d.osMois.length >= rythme.attendu ? "text-ok" : "text-alerte"}>{d.osMois.length >= rythme.attendu ? "en avance" : "en retard"} sur le rythme : {rythme.attendu} attendu{rythme.attendu > 1 ? "s" : ""} à cette date · projection {rythme.projection} · {rythme.restants} jours ouvrés restants</span> : null}
              <button type="button" onClick={ouvrirEditionObjectif} className="flex items-center gap-1 hover:text-encre"><Pencil size={11} />{d.objectif ? "modifier" : "fixer l'objectif"}</button>
            </span>
          )}>
            <div className="relative mt-4 h-[10px] rounded-full bg-fond-3" role="img" aria-label={`${d.osMois.length} premiers OS sur ${d.objectif || "?"}`}>
              <div className="h-full rounded-full bg-ok transition-[width] duration-700" style={{ width: `${d.objectif ? Math.min(100, (d.osMois.length / d.objectif) * 100) : 0}%` }} />
              {d.objectif ? <span className="absolute top-1/2 h-[16px] w-[2px] -translate-y-1/2 bg-encre/50" style={{ left: `${rythme.part * 100}%` }} title="Rythme attendu à cette date" /> : null}
            </div>
            <p className="mt-2 text-colonne text-encre-2">{d.osMois.length ? `Reçus : ${d.osMois.map((o) => o.nom).join(", ")}.` : "Aucun premier ordre de service reçu depuis le 1er du mois."}</p>
          </Bloc>

          <Bloc titre="Le classement des commerciaux" droite={detailPeriode}>
            <Onglets className="mt-2" valeur={periode} onChange={setPeriode} options={PERIODES_C} />
            <Table vide="Aucun appel sur cette période."
              colonnes={[{ titre: "Rang", largeur: "56px" }, { titre: "Commercial" }, { titre: "Appels", largeur: "76px", droite: true }, { titre: "Joints", largeur: "64px", droite: true }, { titre: "Taux", largeur: "64px", droite: true }, { titre: "Intér.", largeur: "56px", droite: true }, { titre: "Pas intér.", largeur: "84px", droite: true }, { titre: "RDV", largeur: "48px", droite: true }, { titre: "Apport.", largeur: "76px", droite: true }, { titre: "1ers OS", largeur: "64px", droite: true }, { titre: "Conv. intér.", largeur: "96px", droite: true }, { titre: "Parole", largeur: "72px", droite: true }, { titre: "Tendance", largeur: "112px", droite: true }]}
              lignes={[
                ...classement.map((x, i) => ({ cle: x.compteId ?? x.compteNom, cellules: [
                  i === 0 && x.appels ? <span className="flex items-center gap-1 font-semibold"><Trophy size={13} className="text-attention" />1er</span> : <span className="chiffres text-encre-2">{i + 1}e</span>,
                  <span className={i === 0 && x.appels ? "font-semibold" : ""}>{x.compteNom}</span>,
                  <b className="font-semibold">{fr(x.appels)}</b>, fr(x.joints), <span className="text-encre-2">{pctTxt(pct(x.joints, x.appels), 1)}</span>, x.interesses, <span className="text-encre-2">{x.pasInteresses}</span>, x.rdv, x.apporteurs,
                  <span className={x.premiersOs ? "font-semibold text-ok" : ""}>{x.premiersOs}</span>,
                  <span className="text-encre-2" title={`${x.agencesInteressees ?? x.interesses + x.rdv} agence(s) intéressée(s) ou en RDV sur ${baseConversion(x)} jointe(s)`}>{baseConversion(x) > 0 ? `${tauxConversionInteresses(x)} %` : "—"}</span>,
                  <span className="text-encre-2">{dureeLisible(x.dureeS) || "—"}</span>,
                  <span className="flex justify-end">{x.compteId && calc.parCompte.get(x.compteId) ? <Courbe valeurs={calc.parCompte.get(x.compteId)!.map((j) => j.appels)} /> : null}</span>,
                ] })),
                ...(classement.length > 1 ? [{ cle: "equipe", cellules: [<span />, <b className="font-semibold">Équipe</b>, <b className="font-semibold">{fr(total.appels)}</b>, <b>{fr(total.joints)}</b>, <span className="text-encre-2">{pctTxt(pct(total.joints, total.appels), 1)}</span>, <b>{total.interesses}</b>, <span className="text-encre-2">{total.pasInteresses}</span>, <b>{total.rdv}</b>, <b>{total.apporteurs}</b>, <b className={total.premiersOs ? "text-ok" : ""}>{total.premiersOs}</b>, <span />, <span className="text-encre-2">{dureeLisible(total.dureeS) || "—"}</span>, <span className="flex justify-end"><Courbe valeurs={calc.equipe.map((j) => j.appels)} /></span>] }] : []),
              ]} />
          </Bloc>

          <Bloc titre="Les victoires du jour" droite={<span className="flex items-center gap-1.5 text-ok"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />en direct</span>}>
            <Table vide="Pas encore de RDV, d'agence intéressée ni d'apporteur aujourd'hui : le premier, c'est pour bientôt."
              colonnes={[{ titre: "Qui", largeur: "140px" }, { titre: "Quoi" }, { titre: "Quand", largeur: "120px", droite: true }]}
              lignes={victoires.slice(0, 12).map((v) => ({ cle: v.id, cellules: [<b className="font-medium">{v.qui}</b>, <button type="button" className="truncate hover:underline" onClick={() => onOuvrirAgence?.(v.agenceId)}>{v.quoi}</button>, <span className="text-encre-2">{v.quandTexte ?? heureCourte(v.date)}</span>] }))} />
          </Bloc>
        </Chapitre>

        {/* ═══ ANALYSE ═══ */}
        <Chapitre id="analyse" titre="Analyse" sous="Ce qui marche, quand appeler, les agences qui bougent, les mails, le conseil de l'IA.">
          <Bandeau cases={[
            { libelle: "Mails envoyés (7 j)", valeur: extra?.mails ? fr(extra.mails.envoyes) : "—" },
            { libelle: "Ouvertures", valeur: extra?.mails ? fr(extra.mails.ouverts) : "—", variation: extra?.mails && extra.mails.ouverts <= extra.mails.envoyes ? <span className="chiffres text-colonne text-encre-2">{pctTxt(pct(extra.mails.ouverts, extra.mails.envoyes))}</span> : undefined, title: "Chaque ouverture compte, une agence peut ouvrir plusieurs fois" },
            { libelle: "Réponses reçues", valeur: extra?.mails ? fr(extra.mails.recus) : "—", ton: "text-ok" },
            { libelle: "Revenus en erreur", valeur: extra?.mails ? fr(extra.mails.rebonds) : "—", ton: extra?.mails?.rebonds ? "text-alerte" : "text-encre", variation: extra?.mails?.rebonds && extra.mails.rebonds <= extra.mails.envoyes ? <span className="chiffres text-colonne text-alerte">{pctTxt(pct(extra.mails.rebonds, extra.mails.envoyes))}</span> : undefined },
            { libelle: "Meilleure heure", valeur: meilleure ? `${meilleure.heure} h` : "—", variation: meilleure ? <span className="chiffres text-colonne text-encre-2">{meilleure.taux} % joints</span> : undefined },
          ]} />

          <div className="grid gap-x-10 gap-y-10 @min-[1100px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Bloc titre="Le parcours · équipe" droite="cette semaine vs la semaine dernière">
              <Table colonnes={[{ titre: "Étape" }, { titre: "Semaine", largeur: "84px", droite: true }, { titre: "Passage", largeur: "76px", droite: true }, { titre: "Sem. dernière", largeur: "104px", droite: true }, { titre: "Évolution", largeur: "92px", droite: true }]}
                lignes={ETAPES_PARCOURS.map((e, i) => ({ cle: e.cle, cellules: [e.libelle, <b className="font-semibold">{fr(calc.sEq[e.cle])}</b>, <span className="text-encre-2">{i ? pctTxt(pct(calc.sEq[e.cle], calc.sEq[ETAPES_PARCOURS[i - 1].cle])) : ""}</span>, <span className="text-encre-2">{fr(calc.sEqAvant[e.cle])}</span>, <Variation unite={e.cle === "rdv" ? "nb" : "%"} n={calc.sEq[e.cle]} avant={calc.sEqAvant[e.cle]} />] }))} />
            </Bloc>
            <Bloc titre="Quand appeler" droite="taux de gestionnaires joints par heure · 90 jours">
              {extra?.heures.length ? (
                <>
                  <div className="mt-4 flex h-[136px] items-end gap-2">
                    {extra.heures.map((x) => (
                      <div key={x.heure} className="flex h-full flex-1 flex-col justify-end" title={`${x.heure} h : ${x.taux} % sur ${x.appels} appels`}>
                        <span className={`chiffres mb-1 text-center text-[10px] ${x.heure === meilleure?.heure ? "font-semibold text-encre" : "text-encre-2"}`}>{x.taux} %</span>
                        <div className={`rounded-t-[3px] ${x.heure === meilleure?.heure ? "bg-info" : "bg-info/25"}`} style={{ height: `${meilleure ? Math.max(2, (x.taux / Math.max(1, meilleure.taux)) * 100) : 0}%` }} />
                      </div>
                    ))}
                  </div>
                  <div className="flex h-6 items-center gap-2 border-t-[0.5px] border-trait">{extra.heures.map((x) => <span key={x.heure} className={`chiffres flex-1 text-center text-colonne ${x.heure === meilleure?.heure ? "font-medium text-encre" : "text-encre-2"}`}>{x.heure} h</span>)}</div>
                </>
              ) : <p className="py-6 text-legende text-encre-2">{extra ? "Pas encore assez d'appels pour le dire." : "Lecture…"}</p>}
            </Bloc>
          </div>

          <Bloc titre="Les agences qui bougent" compte={extra?.signaux.length} droite="7 derniers jours · regroupées par agence">
            <Table vide={extra ? "Rien de nouveau ces 7 derniers jours." : "Lecture…"}
              colonnes={[{ titre: "Agence" }, { titre: "Signaux", largeur: "34%" }, { titre: "Nombre", largeur: "72px", droite: true }, { titre: "Dernier", largeur: "104px", droite: true }, { titre: "Commercial", largeur: "120px" }, { titre: "", largeur: "108px", droite: true }]}
              lignes={(extra?.signaux ?? []).slice(0, 12).map((x) => ({ cle: x.agenceId, cellules: [
                <button type="button" className="truncate font-medium hover:underline" onClick={() => onOuvrirAgence?.(x.agenceId)}>{x.agenceNom}</button>,
                <span className="text-encre-2">{x.detail}</span>, <b className={x.n >= 4 ? "font-semibold text-ok" : "font-normal"}>{x.n}</b>,
                <span className="text-encre-2">{new Date(x.dernier).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>,
                <span className="text-encre-2">{nomDuCompte(x.commercialId).split(" ")[0] || "—"}</span>,
                <Bouton taille="sm" icone={<Phone />} onClick={() => onOuvrirSession?.(x.agenceId)}>Appeler</Bouton>,
              ] }))} />
          </Bloc>

          <Bloc titre="Le conseil" droite={extra ? `analyse IA de ${extra.analyses} appels · 30 derniers jours` : ""}>
            {extra && (extra.objection || extra.argument) ? (
              <div className="mt-4 grid gap-x-10 gap-y-4 @min-[1100px]:grid-cols-3">
                {extra.objection ? <div><Etiquette>Objection n° 1</Etiquette><p className="mt-1 text-legende text-encre">« {extra.objection.libelle} » : <b className="chiffres font-semibold">{extra.objection.appels}</b> fois, levée {extra.objection.levees} fois{extra.objection.sansReponse ? <span className="text-alerte">, non levée {extra.objection.sansReponse} fois</span> : null}.{extra.objection.reponse ? <span className="block text-encre-2">Ce qui a marché : « {extra.objection.reponse} »</span> : null}</p></div> : null}
                {extra.argument ? <div><Etiquette>Argument qui marche</Etiquette><p className="mt-1 text-legende text-encre">« {extra.argument.libelle} » : <b className="chiffres font-semibold text-ok">{extra.argument.aboutis} abouti{extra.argument.aboutis > 1 ? "s" : ""} sur {extra.argument.appels}</b> ({pctTxt(pct(extra.argument.aboutis, extra.argument.appels))}).</p></div> : null}
                {extra.piege ? <div><Etiquette>Argument à éviter</Etiquette><p className="mt-1 text-legende text-encre">« {extra.piege.libelle} » : le plus utilisé, mais <span className="text-alerte">{extra.piege.taux} %</span> seulement aboutissent. <Sparkles size={12} className="inline text-signature" /></p></div> : null}
              </div>
            ) : <p className="py-6 text-legende text-encre-2">{extra ? "Pas encore assez d'appels analysés." : "Lecture…"}</p>}
          </Bloc>
        </Chapitre>
      </div>

      {/* ── Reporter une tâche ── */}
      {report ? (
        <Dialogue
          titre={`Reporter « ${report.tache.titre || (report.tache.type === "rdv" ? "RDV" : "Tâche")} »`}
          description={`${report.tache.agenceNom}${report.tache.echeance ? ` · prévu ${libelleRelatif(report.tache.echeance, maintenant)} à ${heureCourte(report.tache.echeance)}` : ""}`}
          onFermer={() => setReport(null)}
          pied={<><Bouton onClick={() => setReport(null)}>Annuler</Bouton><Bouton variante="plein" form="form-report" type="submit" chargement={occupe}>Reporter</Bouton></>}
        >
          <div className="mb-4 flex flex-wrap gap-2">
            {heureRelance !== null ? (
              <>
                <Bouton taille="sm" disabled={occupe} onClick={() => reporterA(report.tache, dansNJoursA(new Date(), 1, heureRelance))}>Demain {heureRelance} h</Bouton>
                <Bouton taille="sm" disabled={occupe} onClick={() => reporterA(report.tache, dansNJoursA(new Date(), 3, heureRelance))}>Dans 3 jours, {heureRelance} h</Bouton>
              </>
            ) : null}
          </div>
          <form id="form-report" onSubmit={validerReportLibre} className="grid gap-3 sm:grid-cols-2">
            <EtiquetteChamp texte="Date"><Champ type="date" value={report.jour} onChange={(e) => setReport({ ...report, jour: e.target.value })} required /></EtiquetteChamp>
            <EtiquetteChamp texte="Heure"><Champ type="time" value={report.heure} onChange={(e) => setReport({ ...report, heure: e.target.value })} required /></EtiquetteChamp>
          </form>
        </Dialogue>
      ) : null}
    </div>
  )
}
