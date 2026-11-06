// ════════════════════════════════════════════════════════════════════════════
// AUJOURD'HUI — l'écran d'accueil des commerciaux (refonte du 06/11/2026, maquette validée).
//
// Deux vues, au choix (mémorisé sur le poste) :
//   · « L'équipe en direct » : l'objectif du mois et son rythme, le podium et le classement,
//     les victoires du jour, les leads et l'à-faire, ma base de prospection et de leads,
//     le parcours de la semaine, les piles ;
//   · « Tableau de bord » : quatre chiffres, le parcours, les meilleures heures, les mêmes
//     leads / à-faire / bases, ce qui bouge chez les agences, les mails, le conseil IA,
//     l'objectif, et le classement complet.
// Une seule grille (./aujourdhui/grille.tsx). Rafraîchi toutes les 60 s quand l'onglet est
// visible. Calculs : src/demarchage/aujourdhuiOutils.ts et tableauOutils.ts ; lectures : db.ts.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { ArrowUpRight, CalendarClock, Check, MapPin, Phone, RefreshCw, Sparkles, Video } from "lucide-react"
import { BoutonMailsIa } from "./MailsIa"
import { useReglages } from "../../demarchage/reglages"
import {
  appelsSortants, bilanMails, chargerLeads, chargerTachesDuJour, compterPiles, compterPremiersOs, deplacerTache, derniersSignaux, etapesDeLaBase, leadsBilanLignes, premiersOsListe,
  resultatsAppelsDepuis, santeDemarchage, statsAppels, terminerTache, type EcartSante, type Lead, type StatsCompte, type TacheAgenda,
} from "../../demarchage/db"
import { FILES, dureeLisible, jourLocal, type Agence, type File } from "../../demarchage/modele"
import { appelsIaPeriode } from "../../demarchage/appelsIa"
import { statsArguments, statsObjections } from "../../demarchage/analyseOutils"
import { attenteCourte, couleurAttente, minutesDepuis } from "../../demarchage/leadsOutils"
import {
  bilanLeads, bilanProspection, ecart, evolution, parcoursDepuis, rythmeObjectif, tauxJointParHeure, victoiresDepuis,
  type AppelLu, type LeadBilan, type LigneHeure,
} from "../../demarchage/tableauOutils"
import { Bloc, Chiffre, EnTete, H_GRAPHE, Mention, MentionEnTete, Rangee } from "./aujourdhui/grille"
import { BaseLeads, BaseProspection, BlocHeures, BlocMails, BlocObjectif, BlocParcours, CeQuiBouge, ClassementCompact, Conseil, ListeLeads, Podium, Quatre, Victoires } from "./aujourdhui/blocs"
import {
  composerDate, compterAgencesJamaisJointes, compterReveils, dansNJoursA, dateLongue, debutDeSemaine, debutDuJour, debutDuMois, decomposerDate, estEnRetard, finDeSemaine, finDuMois,
  grouperTaches, heureCourte, libelleRelatif, lireObjectif, tauxConversionInteresses, tauxConversionPremiersOs, tauxJoints, totalStats, type MomentTache,
  PERIODES, bornesPeriode, classer, type Periode,
  majusculeInitiale, dansLaBase, libelleBase, baseConversion,
} from "../../demarchage/aujourdhuiOutils"
import { ecrireParametre, lireParametre } from "../../lib/parametresDb"
import { estAdmin, listerComptes } from "../../lib/comptes"
import { useSession } from "../../lib/auth"
import { CLE_CHOIX_LOCAL, CLE_NON_ATTRIBUEES, nonAttribueesPourTous, normaliserChoix, proprietaireDepuisChoix } from "../../demarchage/attribution"
import { chargerFonctions, estAuClassement } from "../../lib/fonctionsComptes"
import { Bandeau, Bouton, Champ, Chargement, Dialogue, Etiquette, EnTetePage, Onglets, Pastille, Tableau, Td, Th, Vide } from "../../ui"
import ClientsAConfirmer from "./ClientsAConfirmer"

const RAFRAICHIR_MS = 60_000
const CLE_OBJECTIF = "objectif_os_mensuel"
const CLE_VUE = "aujourdhui_vue"
type Vue = "equipe" | "tableau"
type Extra = {
  heures: LigneHeure[]
  signaux: { id: string; date: string; titre: string; agenceId: string; agenceNom: string }[]
  mails: { envoyes: number; ouverts: number; recus: number; rebonds: number } | null
  objection: { libelle: string; appels: number; joints: number } | null
  reponse: string
  argument: { libelle: string; aboutis: number; appels: number } | null
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

type Donnees = {
  files: Record<File, number> | null // null = comptage en échec : on affiche « — », jamais un faux chiffre
  base: string // la base comptée, comme dans la session : « Ma base », « Base de X », « Toute la base »
  taches: TacheAgenda[]
  classements: Record<Periode, StatsCompte[]> // tout le monde, classé, pour chaque période
  objectif: number
  jamaisJointes: number
  reveils: number
  comptes: { id: string; nom: string }[]
  appelsSemaine: AppelLu[] // cette semaine (le jour, les victoires, le parcours)
  appelsAvant: AppelLu[] // la semaine dernière (les comparaisons)
  osMois: { agenceId: string; nom: string; date: string; commercialId: string | null }[]
  osSemaine: number
  osAvant: number
  leads: { agence: Agence; lead: Lead }[]
  etapes: { etape: string }[] // la base choisie
  leadsBilan: LeadBilan[] // la base choisie
}

const MOMENTS: { code: Exclude<MomentTache, "rdv" | "plusTard">; libelle: string; alerte?: boolean }[] = [
  { code: "enRetard", libelle: "En retard", alerte: true },
  { code: "ceMatin", libelle: "Ce matin" },
  { code: "cetApresMidi", libelle: "Cet après-midi" },
]

export default function Aujourdhui({ onOuvrirSession, onOuvrirAgence, onNaviguer, onOuvrirEtape }: {
  onOuvrirSession?: (agenceId: string) => void
  onOuvrirAgence?: (agenceId: string) => void
  onNaviguer?: (page: "sessions" | "agences" | "agenda") => void
  onOuvrirEtape?: (etape: string) => void // ouvre Agences filtrée sur cette étape
}) {
  const [d, setD] = useState<Donnees | null>(null)
  const heureRelance = useReglages().reglages?.heure_relance ?? null // Réglages : l'heure des relances
  // L'heure de la dernière lecture : tout (bornes, retards, « dans 2 h ») s'y rapporte,
  // et le rendu reste pur (pas de new Date() pendant qu'on dessine).
  const [maintenant, setMaintenant] = useState(() => new Date())
  const [erreur, setErreur] = useState("")
  // Les contrôles de santé (13/10) : null = pas encore lus ou pas installés ; [] = tout est à 0.
  const [sante, setSante] = useState<EcartSante[] | null>(null)
  const [santeErreur, setSanteErreur] = useState("")
  const [occupe, setOccupe] = useState(false)
  const [report, setReport] = useState<{ tache: TacheAgenda; jour: string; heure: string } | null>(null)
  const [editionObjectif, setEditionObjectif] = useState(false)
  const [periode, setPeriode] = useState<Periode>("mois")
  const [saisieObjectif, setSaisieObjectif] = useState("")
  const enVie = useRef(true)
  // La même base que la session (Mahdi, 13/10 : des chiffres IDENTIQUES partout) : le choix mémorisé sur le poste.
  const session = useSession()
  const admin = estAdmin(session)
  const moiId = session?.user?.id ?? ""

  const jetonCharge = useRef(0)
  const charger = useCallback(async () => {
    // Les piles de MA base (14/10) : pas de chiffres avant que le compte soit connu, et une
    // lecture arrivée en retard n'écrase pas une plus récente.
    if (!moiId) return
    const jeton = ++jetonCharge.current
    const now = new Date()
    try {
      // Les comptes du logiciel (réservé aux administrateurs : un télépro verra ceux qui ont des appels).
      const comptes = await listerComptes().then((l) => l.map((c) => ({ id: c.id, nom: c.nom || c.email }))).catch(() => [] as { id: string; nom: string }[])
      // La fonction de chaque compte (Comptes) : seuls les commerciaux sont classés.
      const fonctions = await chargerFonctions().catch(() => ({}) as Record<string, never>)
      const horsClassement = new Set(Object.entries(fonctions).filter(([, f]) => !estAuClassement(f)).map(([id]) => id))
      const libre = nonAttribueesPourTous(await lireParametre(CLE_NON_ATTRIBUEES).catch(() => null))
      let choixBrut: string | null = null
      try { choixBrut = localStorage.getItem(CLE_CHOIX_LOCAL) } catch { /* poste sans stockage : « Ma base » */ }
      const proprietaire = proprietaireDepuisChoix(choixBrut, moiId, admin, libre)
      const base = libelleBase(moiId ? normaliserChoix(choixBrut, admin, libre) : "tous", comptes)
      const lundi = debutDeSemaine(now), lundiAvant = new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() - 7)
      const [files, taches, objectifBrut, jamaisJointes, reveils, appelsSemaine, appelsAvant, osMois, osSemaine, osAvant, leads, etapes, leadsBilan, ...parPeriode] = await Promise.all([
        compterPiles(proprietaire).catch(() => null), // LE calcul de la base, le même que la session
        chargerTachesDuJour(now).then((l) => l.filter((t) => dansLaBase(t.agenceCommercialId, proprietaire))),
        lireParametre(CLE_OBJECTIF),
        compterAgencesJamaisJointes(),
        compterReveils(lundi, finDeSemaine(now)),
        appelsSortants(lundi, finDeSemaine(now)),
        appelsSortants(lundiAvant, lundi),
        premiersOsListe(debutDuMois(now), finDuMois(now)),
        compterPremiersOs(lundi, finDeSemaine(now)),
        compterPremiersOs(lundiAvant, lundi),
        chargerLeads(proprietaire).catch(() => [] as { agence: Agence; lead: Lead }[]), // SQL des leads absent : aucun lead
        etapesDeLaBase().then((l) => l.filter((x) => dansLaBase(x.commercialId, proprietaire))),
        leadsBilanLignes().then((l) => l.filter((x) => dansLaBase(x.commercialId, proprietaire))),
        ...PERIODES.map((p) => { const b = bornesPeriode(p.code, now); return statsAppels(b.de, b.a) }),
      ])
      if (!enVie.current || jeton !== jetonCharge.current) return
      const classements = Object.fromEntries(PERIODES.map((p, i) => [p.code, classer(parPeriode[i], comptes, horsClassement)])) as Record<Periode, StatsCompte[]>
      setD({ files, base, taches, classements, objectif: lireObjectif(objectifBrut), jamaisJointes, reveils, comptes, appelsSemaine, appelsAvant, osMois, osSemaine, osAvant, leads, etapes, leadsBilan })
      santeDemarchage()
        .then((s) => { if (enVie.current) { setSante(s ? s.filter((e) => e.code !== "appel_non_note") : s); setSanteErreur("") } })
        .catch((e) => { if (enVie.current) setSanteErreur(message(e)) })
      setMaintenant(now)
      setErreur("")
    } catch (e) {
      if (enVie.current) setErreur(message(e))
    }
  }, [moiId, admin])

  useEffect(() => {
    enVie.current = true
    const premier = setTimeout(charger, 0)
    // Toutes les 60 s, seulement si l'onglet est visible ; et dès qu'il le redevient.
    const t = setInterval(() => { if (document.visibilityState === "visible") charger() }, RAFRAICHIR_MS)
    const surVisible = () => { if (document.visibilityState === "visible") charger() }
    document.addEventListener("visibilitychange", surVisible)
    return () => { enVie.current = false; clearTimeout(premier); clearInterval(t); document.removeEventListener("visibilitychange", surVisible) }
  }, [charger])

  const agir = async (f: () => Promise<void>) => {
    setOccupe(true); setErreur("")
    try { await f(); await charger() }
    catch (e) {
      // Refus de la base (tache_terminer…) : on le montre, et on recharge pour remettre la ligne retirée d'avance.
      setErreur(message(e))
      await charger()
      setErreur(message(e))
    }
    finally { setOccupe(false) }
  }

  const terminer = (t: TacheAgenda) => agir(async () => {
    // On retire la ligne tout de suite : le rechargement confirme derrière.
    setD((x) => (x ? { ...x, taches: x.taches.filter((y) => y.id !== t.id) } : x))
    await terminerTache(t.id)
  })
  const reporterA = (t: TacheAgenda, date: Date) => agir(async () => {
    setD((x) => (x ? { ...x, taches: x.taches.filter((y) => y.id !== t.id) } : x))
    setReport(null)
    await deplacerTache(t.id, date.toISOString())
  })
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

  // ── La vue choisie (06/11/2026) : « L'équipe en direct » ou « Tableau de bord », mémorisée sur le poste ──
  const [vue, setVueBrute] = useState<Vue>(() => { try { return localStorage.getItem(CLE_VUE) === "tableau" ? "tableau" : "equipe" } catch { return "equipe" } })
  const setVue = (v: Vue) => { setVueBrute(v); try { localStorage.setItem(CLE_VUE, v) } catch { /* poste sans stockage */ } }
  const [periodeEquipe, setPeriodeEquipe] = useState<Periode>("semaine")

  // Les à-côtés du tableau de bord (heures, signaux, mails, analyse IA) : lus à l'ouverture de la vue,
  // puis toutes les 10 min ; ils ne bougent pas à la minute.
  const [extra, setExtra] = useState<Extra | null>(null)
  const extraLu = useRef(0)
  useEffect(() => {
    if (vue !== "tableau" || Date.now() - extraLu.current < 10 * 60_000) return
    extraLu.current = Date.now()
    const now = new Date()
    Promise.all([
      resultatsAppelsDepuis(new Date(now.getTime() - 90 * 86_400_000)).catch(() => []),
      derniersSignaux(new Date(now.getTime() - 7 * 86_400_000)).catch(() => []),
      bilanMails(new Date(now.getTime() - 7 * 86_400_000)).catch(() => null),
      appelsIaPeriode(new Date(now.getTime() - 30 * 86_400_000), now).catch(() => []),
    ]).then(([res, signaux, mails, ia]) => {
      if (!enVie.current) return
      const objections = statsObjections(ia)
      const argument = statsArguments(ia).find((a) => a.fiable) ?? null
      const analyses = ia.filter((a) => a.statut === "pret" && a.analyse).length
      setExtra({
        heures: tauxJointParHeure(res), signaux, mails,
        objection: objections[0] ? { libelle: objections[0].libelle, appels: objections[0].appels, joints: analyses } : null,
        reponse: objections[0]?.meilleureReponse ?? "",
        argument: argument ? { libelle: argument.libelle, aboutis: argument.aboutis, appels: argument.appels } : null,
      })
    })
  }, [vue, d])

  if (!d) {
    return (
      <div className="page">
        <EnTetePage titre="Aujourd'hui" sousTitre={dateLongue(maintenant)} />
        {erreur ? <Bandeau role="alerte" action={<Bouton taille="sm" onClick={() => charger()}>Réessayer</Bouton>}>{erreur}</Bandeau> : <Chargement texte="Lecture de la journée…" />}
      </div>
    )
  }

  const groupes = grouperTaches(d.taches, maintenant)
  const rienAFaire = d.taches.length === 0
  const rythme = rythmeObjectif(d.osMois.length, d.objectif, debutDuMois(maintenant), finDuMois(maintenant), maintenant)
  const aujourdHui = debutDuJour(maintenant)
  const appelsDuJour = d.appelsSemaine.filter((a) => new Date(a.date) >= aujourdHui)
  const memeJourAvant = d.appelsAvant.filter((a) => { const t = new Date(a.date); return t >= new Date(aujourdHui.getTime() - 7 * 86_400_000) && t < new Date(aujourdHui.getTime() - 6 * 86_400_000) }).length
  const parcours = parcoursDepuis(d.appelsSemaine, d.osSemaine)
  const parcoursAvant = parcoursDepuis(d.appelsAvant, d.osAvant)
  const nomDuCompte = (id: string | null) => d.comptes.find((c) => c.id === id)?.nom ?? ""
  const victoires = victoiresDepuis(appelsDuJour, d.osMois.filter((o) => o.date === jourLocal(maintenant)).map((o) => ({ ...o, commercialNom: nomDuCompte(o.commercialId) })))
  const plusAncien = d.leads.length ? Math.max(...d.leads.map((l) => minutesDepuis(l.lead.creeLe, maintenant))) : 0
  const bilanBase = bilanProspection(d.etapes)
  const bilanDesLeads = bilanLeads(d.leadsBilan)
  const ouvrirSession = (id: string) => onOuvrirSession?.(id)

  const ligneTache = (t: TacheAgenda, dansRetard = false) => {
    const retard = estEnRetard(t, maintenant)
    return (
      // Les boutons passent sous le texte quand le bloc est étroit, au lieu d'en sortir (14/10).
      <li key={t.id} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 border-b-[0.5px] border-trait py-2 last:border-b-0">
        <span className="w-14 shrink-0">
          <span className={"chiffres block text-legende font-semibold " + (retard ? "text-alerte" : "text-encre")}>{t.echeance ? heureCourte(t.echeance) : "—"}</span>
          {dansRetard && t.echeance ? <span className="block text-colonne text-encre-2">{libelleRelatif(t.echeance, maintenant)}</span> : null}
        </span>
        <span className="min-w-[12rem] flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-legende font-medium text-encre">{t.titre || (t.type === "rdv" ? "RDV" : "Tâche")}</span>
            {t.type === "rdv" ? <Pastille role="info" className="shrink-0">{iconeRdv(t.rdvType)} {libelleRdv(t.rdvType)}</Pastille> : null}
          </span>
          <span className="block truncate text-colonne text-encre-2">
            <button type="button" className="font-medium text-encre underline-offset-2 hover:underline" onClick={() => onOuvrirAgence?.(t.agenceId)}>{t.agenceNom || "Agence inconnue"}</button>
            {t.contactNom ? ` · ${t.contactNom}` : ""}
            {t.agenceTelephone ? <span className="chiffres"> · {t.agenceTelephone}</span> : ""}
            {t.note ? ` · ${t.note}` : ""}
          </span>
        </span>
        <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-0.5">
          <Bouton variante="discret" taille="sm" icone={<Phone />} disabled={occupe} onClick={() => onOuvrirSession?.(t.agenceId)}>Appeler</Bouton>
          <Bouton variante="discret" taille="sm" icone={<Check />} disabled={occupe} onClick={() => terminer(t)}>Fait</Bouton>
          <Bouton variante="discret" taille="sm" icone={<CalendarClock />} disabled={occupe} onClick={() => ouvrirReport(t)}>Reporter</Bouton>
          <Bouton variante="discret" taille="sm" icone={<ArrowUpRight />} onClick={() => onOuvrirAgence?.(t.agenceId)}>Ouvrir</Bouton>
        </span>
      </li>
    )
  }

  // ── Les blocs communs aux deux vues ──
  const blocObjectif = (
    <BlocObjectif recus={d.osMois.length} objectif={d.objectif} attendu={rythme.attendu} projection={rythme.projection} restants={rythme.restants} part={rythme.part} noms={d.osMois.map((o) => o.nom)}
      edition={editionObjectif} saisie={saisieObjectif} setSaisie={setSaisieObjectif} ouvrirEdition={ouvrirEditionObjectif} fermerEdition={() => setEditionObjectif(false)} enregistrer={enregistrerObjectif} occupe={occupe} />
  )
  const ceQuiAttend = (
    <Rangee colonnes="@min-[1100px]:grid-cols-12">
      <Bloc className="@min-[1100px]:col-span-5">
        <EnTete titre="Les leads" droite={<MentionEnTete>{d.leads.length ? `${d.leads.length} à appeler dans l'heure · le plus ancien d'abord` : "à appeler dans l'heure"}</MentionEnTete>} />
        <ListeLeads leads={d.leads} maintenant={maintenant} onAppeler={ouvrirSession} />
      </Bloc>
      <Bloc className="@min-[1100px]:col-span-7">
        <EnTete titre="À faire aujourd'hui" droite={<MentionEnTete>{d.base} · {d.taches.length} à faire</MentionEnTete>} />
        {rienAFaire ? (
          <Vide titre="Rien à faire aujourd'hui" texte="Aucune tâche ni RDV en attente. Une session de call remplira la journée." action={<Bouton onClick={() => onNaviguer?.("agenda")}>Voir l'agenda</Bouton>} />
        ) : (
          <div>
            {groupes.rdv.length ? <section><h3 className="h-7 bg-fond-3 px-3 text-colonne font-medium leading-7 text-encre-2">RDV du jour · {groupes.rdv.length}</h3><ul>{groupes.rdv.map((t) => ligneTache(t))}</ul></section> : null}
            {MOMENTS.map((m) => {
              const liste = groupes[m.code]
              if (!liste.length) return null
              return (
                <section key={m.code}>
                  <h3 className={"h-7 px-3 text-colonne font-medium leading-7 " + (m.alerte ? "bg-alerte-fond text-alerte" : "bg-fond-2 text-encre-2")}>{m.libelle} · {liste.length}</h3>
                  <ul>{liste.map((t) => ligneTache(t, m.code === "enRetard"))}</ul>
                </section>
              )
            })}
          </div>
        )}
      </Bloc>
    </Rangee>
  )
  const mesBases = (
    <Rangee colonnes="@min-[1100px]:grid-cols-2">
      <Bloc>
        <EnTete titre="Ma base de prospection" droite={<MentionEnTete>{d.base}</MentionEnTete>} />
        <BaseProspection b={bilanBase} rappels={d.files ? d.files.rappels : null} jamaisJointes={d.jamaisJointes} reveils={d.reveils} onOuvrirEtape={onOuvrirEtape} onSession={() => onNaviguer?.("sessions")} />
      </Bloc>
      <Bloc>
        <EnTete titre="Ma base de leads" droite={<MentionEnTete>{d.base} · depuis le début</MentionEnTete>} />
        <BaseLeads b={bilanDesLeads} />
      </Bloc>
    </Rangee>
  )
  const leParcours = <Bloc><EnTete titre="Le parcours de la semaine" droite={<MentionEnTete>taux de passage · écart avec la semaine dernière</MentionEnTete>} /><BlocParcours p={parcours} avant={parcoursAvant} /></Bloc>

  return (
    // La largeur mesurée est celle de la page entière (le conteneur n'a pas de marge) : à 1 100 px de
    // zone et plus, les blocs se rangent côte à côte (Mac 13 pouces compris, fenêtre non maximisée aussi).
    <div className="@container w-full"><div className="px-10 pb-12 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-5">
        <div className="min-w-0">
          <Mention>{majusculeInitiale(dateLongue(maintenant))}</Mention>
          <h1 className="mt-0.5 text-h1 font-semibold text-encre">Aujourd'hui</h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <BoutonMailsIa />
          <Bouton icone={<RefreshCw />} chargement={occupe} onClick={() => { extraLu.current = 0; agir(async () => undefined) }}>Actualiser</Bouton>
          <Bouton variante="plein" icone={<Phone />} onClick={() => onNaviguer?.("sessions")}>Démarrer une session</Bouton>
        </div>
      </div>
      <Onglets valeur={vue} onChange={setVue} options={[{ id: "equipe", label: "L'équipe en direct" }, { id: "tableau", label: "Tableau de bord" }]} />

      <div className="mt-6">
        {erreur ? <Bandeau role="alerte" className="mb-4" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur("")}>Fermer</Bouton>}>{erreur}</Bandeau> : null}
        {/* La santé du démarchage : un écart se voit le matin même (contrôle du 13/10). */}
        {santeErreur ? <Bandeau role="attention" className="mb-4">Contrôle de la base indisponible : {santeErreur}</Bandeau> : null}
        {sante && sante.length ? (
          <Bandeau role="alerte" className="mb-4">
            <div className="space-y-1">
              <p className="font-semibold">Contrôle de la base : {sante.length} écart{sante.length > 1 ? "s" : ""} à corriger</p>
              <ul className="space-y-0.5">
                {sante.map((e) => (
                  <li key={e.code}><b className="chiffres">{e.nombre}</b> · {e.libelle}{e.exemples ? <span className="text-encre-2"> — {e.exemples.length > 160 ? e.exemples.slice(0, 160) + "…" : e.exemples}</span> : null}</li>
                ))}
              </ul>
            </div>
          </Bandeau>
        ) : null}
        {/* Les ordres de service reçus dans STC Bâtiment : à confirmer par un humain */}
        <ClientsAConfirmer onOuvrirAgence={onOuvrirAgence} onDecision={() => charger()} />
      </div>

      {vue === "equipe" ? (
        <div className="space-y-12">
          {blocObjectif}
          <Rangee colonnes="@min-[1100px]:grid-cols-12">
            <Bloc className="@min-[1100px]:col-span-7">
              <EnTete titre="Le classement" droite={<Onglets className="!border-b-0" valeur={periodeEquipe} onChange={setPeriodeEquipe} options={PERIODES.map((p) => ({ id: p.code, label: p.libelle }))} />} />
              <Podium stats={d.classements[periodeEquipe]} />
              <div className="mt-6"><ClassementCompact stats={d.classements[periodeEquipe]} /></div>
            </Bloc>
            <Bloc className="@min-[1100px]:col-span-5">
              <EnTete titre="Les victoires du jour" droite={<span className="flex items-center gap-1.5 pb-2.5 text-colonne text-ok"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />en direct</span>} />
              <Victoires victoires={victoires} maintenant={maintenant} onOuvrirAgence={onOuvrirAgence} />
            </Bloc>
          </Rangee>
          {ceQuiAttend}
          {mesBases}
          <Rangee colonnes="@min-[1100px]:grid-cols-12">
            <div className="@min-[1100px]:col-span-7">{leParcours}</div>
            <Bloc className="@min-[1100px]:col-span-5">
              <EnTete titre="Les piles" droite={<MentionEnTete>{d.base} · la session de call</MentionEnTete>} />
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {FILES.map((f) => <Chiffre key={f.code} libelle={f.libelle} valeur={d.files ? d.files[f.code] : "—"} ton={f.code === "rappels" && d.files?.rappels ? "text-alerte" : "text-encre"} detail="ouvrir la session" title={d.files ? f.aide : "Comptage impossible pour l'instant (Actualiser)"} onClick={() => onNaviguer?.("sessions")} />)}
              </div>
            </Bloc>
          </Rangee>
        </div>
      ) : (
        <div className="space-y-12">
          <Quatre cases={[
            { libelle: "Leads à traiter", valeur: d.leads.length, detail: d.leads.length ? `le plus ancien : ${attenteCourte(plusAncien)}` : "aucun en attente", ton: d.leads.length ? couleurAttente(plusAncien) : "text-ok", onClick: () => onNaviguer?.("sessions") },
            { libelle: "Appels aujourd'hui", valeur: appelsDuJour.length, detail: evolution(appelsDuJour.length, memeJourAvant) ? `${evolution(appelsDuJour.length, memeJourAvant)} vs le même jour la semaine dernière` : "premier jour de comparaison", ton: appelsDuJour.length >= memeJourAvant ? "text-ok" : "text-attention" },
            { libelle: "RDV cette semaine", valeur: parcours.rdv, detail: `${ecart(parcours.rdv, parcoursAvant.rdv)} vs la semaine dernière`, ton: parcours.rdv >= parcoursAvant.rdv ? "text-ok" : "text-attention" },
            { libelle: "Premiers OS du mois", valeur: d.osMois.length, detail: `projection fin de mois : ${rythme.projection}${d.objectif ? ` · objectif ${d.objectif}` : ""}`, ton: !d.objectif || rythme.projection >= d.objectif ? "text-ok" : "text-attention" },
          ]} />
          <Rangee colonnes="@min-[1100px]:grid-cols-12">
            <div className="@min-[1100px]:col-span-7">
              <Bloc><EnTete titre="Le parcours de la semaine" droite={<MentionEnTete>taux de passage · écart avec la semaine dernière</MentionEnTete>} /><div style={{ height: H_GRAPHE + 44 }} className="flex flex-col justify-center"><BlocParcours p={parcours} avant={parcoursAvant} /></div></Bloc>
            </div>
            <Bloc className="@min-[1100px]:col-span-5"><EnTete titre="Quand joindre un gestionnaire" droite={<MentionEnTete>sur 3 mois</MentionEnTete>} /><BlocHeures heures={extra?.heures ?? []} /></Bloc>
          </Rangee>
          {ceQuiAttend}
          {mesBases}
          <Rangee colonnes="@min-[1000px]:grid-cols-3">
            <Bloc><EnTete titre="Ce qui bouge" droite={<MentionEnTete>les agences chaudes · 7 jours</MentionEnTete>} /><CeQuiBouge signaux={extra?.signaux ?? []} maintenant={maintenant} onAppeler={ouvrirSession} /></Bloc>
            <Bloc><EnTete titre="Les mails" droite={<MentionEnTete>7 derniers jours</MentionEnTete>} /><BlocMails m={extra ? extra.mails : null} /></Bloc>
            <Bloc><EnTete titre="Le conseil du mois" droite={<span className="pb-2.5"><Sparkles size={14} className="text-signature" /></span>} /><Conseil objection={extra?.objection ?? null} reponse={extra?.reponse ?? ""} argument={extra?.argument ?? null} /></Bloc>
          </Rangee>
          {blocObjectif}
          <Bloc>
            <EnTete titre="Le classement des commerciaux" droite={<Onglets className="!border-b-0" valeur={periode} onChange={setPeriode} options={PERIODES.map((p) => ({ id: p.code, label: p.libelle }))} />} />
            <TableauStats stats={d.classements[periode]} vide="Aucun appel sur cette période." />
          </Bloc>
        </div>
      )}

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
            <Etiquette texte="Date"><Champ type="date" value={report.jour} onChange={(e) => setReport({ ...report, jour: e.target.value })} required /></Etiquette>
            <Etiquette texte="Heure"><Champ type="time" value={report.heure} onChange={(e) => setReport({ ...report, heure: e.target.value })} required /></Etiquette>
          </form>
        </Dialogue>
      ) : null}
    </div></div>
  )
}

/** Le classement : rang, commercial, appels, joints (et le taux), intéressés, RDV, pas intéressés, apporteurs, premiers OS, temps de parole. */
function TableauStats({ stats, vide }: { stats: StatsCompte[]; vide: string }) {
  if (stats.length === 0) return <p className="px-5 pb-4 text-legende text-encre-2">{vide}</p>
  const total = totalStats(stats)
  const ligne = (x: StatsCompte, rang: number | null) => (
    <tr key={x.compteId ?? x.compteNom} className={rang === null ? "font-semibold" : rang === 1 && x.appels > 0 ? "bg-fond-2" : ""}>
      <Td num className="w-10 text-encre-2">{rang === null ? "" : rang === 1 && x.appels > 0 ? <span className="font-semibold text-encre">1er</span> : `${rang}e`}</Td>
      <Td className="truncate font-medium">{x.compteNom}</Td>
      <Td num>{x.appels}</Td>
      <Td num>{x.joints} <span className="text-encre-2">· {tauxJoints(x)} %</span></Td>
      <Td num>{x.interesses}</Td>
      <Td num>{x.rdv}</Td>
      <Td num>{x.pasInteresses}</Td>
      <Td num>{x.apporteurs}</Td>
      <Td num className={tauxConversionInteresses(x) > 0 ? "font-semibold" : "text-encre-2"} title={`${x.agencesInteressees ?? x.interesses + x.rdv} agence(s) intéressée(s) ou en RDV sur ${baseConversion(x)} agence(s) jointe(s)`}>{baseConversion(x) > 0 ? `${tauxConversionInteresses(x)} %` : "—"}</Td>
      <Td num className={x.premiersOs > 0 ? "font-semibold text-ok" : ""}>{x.premiersOs}</Td>
      <Td num className={x.premiersOs > 0 ? "font-semibold text-ok" : "text-encre-2"} title={`${x.premiersOs} premier(s) OS sur ${baseConversion(x)} agence(s) jointe(s)`}>{baseConversion(x) > 0 ? `${tauxConversionPremiersOs(x)} %` : "—"}</Td>
      <Td num>{dureeLisible(x.dureeS) || "—"}</Td>
    </tr>
  )
  return (
    <Tableau className="pb-2">
      <thead><tr><Th num>#</Th><Th>Commercial</Th><Th num>Appels</Th><Th num>Joints</Th><Th num>Intér.</Th><Th num>RDV</Th><Th num>Pas intér.</Th><Th num title="Agences passées en apporteur d'affaires pendant un appel sur la période">Apporteurs</Th><Th num title="Taux de conversion sur les intéressés : agences devenues intéressées (premier intérêt) ou passées en RDV sur la période ÷ agences distinctes jointes sur la période">Conv. intéressés</Th><Th num>1ers OS</Th><Th num title="Taux de conversion sur les premiers OS : premiers ordres de service reçus sur la période ÷ agences distinctes jointes sur la période (plafonné à 100 %)">Conv. 1ers OS</Th><Th num>Parole</Th></tr></thead>
      <tbody>
        {stats.map((x, i) => ligne(x, i + 1))}
        {stats.length > 1 ? ligne(total, null) : null}
      </tbody>
    </Tableau>
  )
}

function iconeRdv(type: string) {
  if (type === "visio") return <Video size={12} />
  if (type === "sur_place") return <MapPin size={12} />
  return <Phone size={12} />
}
function libelleRdv(type: string): string {
  if (type === "visio") return "visio"
  if (type === "sur_place") return "sur place"
  return "téléphone"
}
