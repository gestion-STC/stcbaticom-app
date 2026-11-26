// ════════════════════════════════════════════════════════════════════════════
// GESTIONNAIRES › DASHBOARD : LE COCKPIT DE LA TÉLÉPROSPECTION (proposition 1 validée par le gérant le 26/11/2026).
// Une rangée de cotes sur toute la largeur, lue de gauche à droite de l'année au jour ; la trajectoire à 6 mois en une
// bande ; puis des listes de suivi côte à côte (par commercial, le mois, les premiers OS, le portefeuille, quand appeler,
// la semaine, leads et mails, à faire aujourd'hui, agences qui bougent). Tout est lu EN DIRECT, rafraîchi toutes les
// 60 s quand l'onglet est visible. La base regardée (Ma base, Base de X, Toute la base…) est celle de la session de call.
// Calculs : lib/cockpitTelepro.ts, lib/prevision.ts ; lectures : demarchage/db.ts, lib/cockpitDb.ts, cockpit/donnees.ts.
// Restent en bas : les clients à confirmer, et le contrôle de la base pour les administrateurs.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Phone } from "lucide-react"
import { useReglages } from "../../demarchage/reglages"
import { bilanMails, chargerLeads, chargerTachesDuJour, deplacerTache, resultatsAppelsDepuis, santeDemarchage, type EcartSante, type Lead, type TacheAgenda } from "../../demarchage/db"
import { libelleEtape, type Agence } from "../../demarchage/modele"
import { HEURES_OUVREES, bilanProspection, tauxJointParHeure, type LigneHeure } from "../../demarchage/tableauOutils"
import { composerDate, dansLaBase, dansNJoursA, decomposerDate, heureCourte, libelleBase, libelleRelatif } from "../../demarchage/aujourdhuiOutils"
import { lireParametre } from "../../lib/parametresDb"
import { estAdmin, listerComptes } from "../../lib/comptes"
import { useSession } from "../../lib/auth"
import { CLE_CHOIX_TABLEAU, CLE_NON_ATTRIBUEES, choixParDefautPourRegarder, nonAttribueesPourTous, normaliserChoix, optionsBase, proprietaireDepuisChoix, type Proprietaire } from "../../demarchage/attribution"
import { Bandeau as BandeauAlerte, Bouton, Champ, Chargement, Dialogue, Etiquette as EtiquetteChamp, Selecteur } from "../../ui"
import ClientsAConfirmer from "./ClientsAConfirmer"
import { Entonnoir } from "./aujourdhui/courtier"
import { chargerTachesCampagne } from "../../lib/tachesCampagne"
import { tacheCampagnePourMoi } from "../../lib/perimetre"
import { agencesQuiBougent, attenduMois, bornes, cadence, equipeEtReste, joursDuMois, leadsPeriode, lundisRecents, moyenneJour, repartirAAppeler, semaineJours, stats, statsParCompte, STATS_ZERO, type PeriodeCockpit, type StatsCockpit } from "../../lib/cockpitTelepro"
import { baseDesAgences, signauxDepuis } from "../../lib/cockpitDb"
import { chargerCommun } from "../cockpit/donnees"
import { lecturesPartielles, useRafraichi } from "../cockpit/useRafraichi"
import { PrevisionCompacte } from "../cockpit/PanneauPrevision"
import { BandeauCotes, Barre, Colonnes, Cote, Direct, Grille, Jauge, Legende, MiniCourbe, Panneau, TeteEcran, Tuile, Unites } from "../cockpit/pieces"
import { fr, moisCourt, pct } from "../cockpit/format"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** Le premier mois de Baticom : l'objectif des premiers OS court depuis juillet 2026. */
const DEBUT_BATICOM = "2026-07"
const ETAPES_PORTEFEUILLE = ["a_prospecter", "gestionnaire_joint", "interesse", "rdv_planifie", "client", "pas_interesse", "endormie", "hors_cible"]
const sortie = (e: string) => e === "pas_interesse" || e === "endormie" || e === "hors_cible"
const jourCourt = (d: Date | string) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
const lundiCourt = (d: Date) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
const seance = (d: Date) => `Séance du ${d.toLocaleDateString("fr-FR", { weekday: "short" })} ${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
const joursEntre = (de: Date, a: Date) => Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() - new Date(de.getFullYear(), de.getMonth(), de.getDate()).getTime()) / 86_400_000)
const moisIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
const jourSemaine = (d: Date) => { const s = d.toLocaleDateString("fr-FR", { weekday: "short" }); return `${s[0].toUpperCase()}${s.slice(1)} ${d.getDate()}` }

type Choix = { choix: string; options: { value: string; label: string }[]; proprietaire: Proprietaire; base: string }
type Extra = { heures: LigneHeure[]; signaux: Awaited<ReturnType<typeof signauxDepuis>>; mails: Awaited<ReturnType<typeof bilanMails>> | null }

async function lire(maintenant: Date, choixLocal: string | null, moiId: string, admin: boolean) {
  const comptes = await listerComptes().then((l) => l.map((c) => ({ id: c.id, nom: c.nom || c.email }))).catch(() => [] as { id: string; nom: string }[])
  const libre = nonAttribueesPourTous(await lireParametre(CLE_NON_ATTRIBUEES).catch(() => null))
  // Un administrateur regarde toute la base par défaut ; un téléprospecteur, la sienne (09/11/2026).
  const choix = normaliserChoix(choixLocal, admin, libre, choixParDefautPourRegarder(admin))
  const proprietaire = proprietaireDepuisChoix(choixLocal, moiId, admin, libre, choixParDefautPourRegarder(admin))
  // Leads et appels demandés par les campagnes : en échec, la liste « À faire » reste affichée, et l'erreur est dite.
  const { manques, repli } = lecturesPartielles()
  const [commun, base, leads, taches, campagne] = await Promise.all([
    chargerCommun(maintenant),
    baseDesAgences(),
    chargerLeads(proprietaire).catch(repli("les leads", [] as { agence: Agence; lead: Lead }[])),
    chargerTachesDuJour(maintenant).then((l) => l.filter((t) => dansLaBase(t.agenceCommercialId, proprietaire))),
    chargerTachesCampagne().then((l) => [...new Set(l.filter((t) => t.type === "appel" && t.baseId === "agences" && tacheCampagnePourMoi(t, moiId, admin, ["demarchage"])).map((t) => t.contactRef))]).catch(repli("les appels demandés par les campagnes", [] as string[])),
  ])
  const choixBase: Choix = { choix, options: optionsBase(admin, libre, comptes, moiId), proprietaire, base: libelleBase(choix, comptes) }
  return { commun, base, leads, taches, campagne, choixBase, manques }
}

export default function Aujourdhui({ onOuvrirSession, onOuvrirAgence, onNaviguer, onOuvrirEtape }: {
  onOuvrirSession?: (agenceId: string) => void
  onOuvrirAgence?: (agenceId: string) => void
  onNaviguer?: (page: "sessions" | "agences" | "agenda") => void
  onOuvrirEtape?: (etape: string) => void // ouvre Agences filtrée sur cette étape
}) {
  const session = useSession()
  const admin = estAdmin(session)
  const moiId = session?.user?.id ?? ""
  const heureRelance = useReglages().reglages?.heure_relance ?? null
  const [choixLocal, setChoixLocal] = useState<string | null>(() => { try { return localStorage.getItem(CLE_CHOIX_TABLEAU) } catch { return null } })
  const { d, erreur, recharger } = useRafraichi((m) => lire(m, choixLocal, moiId, admin), `${choixLocal}|${moiId}|${admin}`)
  const [periode, setPeriode] = useState<PeriodeCockpit>("semaine")
  const [choisi, setChoisi] = useState<string>("equipe")
  const [filtre, setFiltre] = useState<"tout" | "leads" | "rappels">("tout")
  const [extra, setExtra] = useState<Extra | null>(null)
  const [sante, setSante] = useState<EcartSante[] | null>(null)
  const [santeErreur, setSanteErreur] = useState("")
  const [occupe, setOccupe] = useState(false)
  const [erreurAction, setErreurAction] = useState("")
  const [report, setReport] = useState<{ tache: TacheAgenda; jour: string; heure: string } | null>(null)
  // Les tâches reportées, cachées le temps de la relecture (27/11/2026) : seulement après un report réussi, et pour
  // CETTE lecture-là ; les données relues font foi (une tâche reportée à 16 h aujourd'hui revient dans « À faire »).
  const [masques, setMasques] = useState<{ pour: unknown; ids: Set<string> }>({ pour: null, ids: new Set() })

  // L'analyse (heures, signaux, mails) et le contrôle de la base : lus une fois, puis toutes les 10 min.
  useEffect(() => {
    let vivant = true
    const lireExtra = () => {
      const now = new Date()
      Promise.all([
        resultatsAppelsDepuis(new Date(now.getTime() - 90 * 86_400_000)).catch(() => []),
        signauxDepuis(new Date(now.getTime() - 7 * 86_400_000)).catch(() => []),
        bilanMails(lundisRecents(now, 1)[0]).catch(() => null),
      ]).then(([res, signaux, mails]) => { if (vivant) setExtra({ heures: tauxJointParHeure(res), signaux, mails }) })
      if (admin) {
        santeDemarchage()
          .then((s) => { if (vivant) { setSante(s ? s.filter((e) => e.code !== "appel_non_note") : s); setSanteErreur("") } })
          .catch((e) => { if (vivant) setSanteErreur(message(e)) })
      }
    }
    lireExtra()
    const t = setInterval(() => { if (document.visibilityState === "visible") lireExtra() }, 10 * 60_000)
    return () => { vivant = false; clearInterval(t) }
  }, [admin])

  const choisirBase = (v: string) => { try { localStorage.setItem(CLE_CHOIX_TABLEAU, v) } catch { /* poste sans stockage */ } setChoixLocal(v) }

  const c = useMemo(() => {
    if (!d) return null
    const C = d.commun, m = C.maintenant, p = d.choixBase.proprietaire
    const compteVu = typeof p === "object" ? p.compteId : null
    // La base regardée : un commercial voit ses appels et ses agences ; « toute la base », tout.
    const appels = compteVu ? C.appels.filter((a) => a.compteId === compteVu) : C.appels
    const os = C.os.filter((o) => dansLaBase(o.commercialId, p))
    const leadsBase = C.leads.filter((l) => dansLaBase(l.commercialId, p))
    const b = (x: PeriodeCockpit) => bornes(x, m)
    const bA = b("annee"), bM = b("mois"), bS = b("semaine"), bJ = b("jour")
    const annee = stats(appels, os, bA.de, bA.a)
    const mois = stats(appels, os, bM.de, bM.a), moisAvant = stats(appels, os, bM.avantDe, bM.avantA)
    const sem = stats(appels, os, bS.de, bS.a), semAvant = stats(appels, os, bS.avantDe, bS.avantA)
    const jour = stats(appels, os, bJ.de, bJ.a)
    const lundis = lundisRecents(m, 8)
    const ids = C.commerciaux.map((x) => x.id)
    const parPeriode = Object.fromEntries((["jour", "semaine", "mois", "moisDernier", "annee"] as PeriodeCockpit[]).map((x) => [x, statsParCompte(C.appels, C.os, ids, b(x).de, b(x).a)])) as Record<PeriodeCockpit, Record<string, StatsCockpit>>
    const cadences = Object.fromEntries(ids.map((id) => [id, cadence(C.appels.filter((a) => a.compteId === id), lundis, m)]))
    const cadenceBase = cadence(appels, lundis, m)
    const osMois = os.filter((o) => o.date.slice(0, 7) === moisIso(m))
    const moisOs: string[] = []
    for (let x = new Date(Number(DEBUT_BATICOM.slice(0, 4)), Number(DEBUT_BATICOM.slice(5, 7)) - 1, 1); moisIso(x) <= moisIso(m); x = new Date(x.getFullYear(), x.getMonth() + 1, 1)) moisOs.push(moisIso(x))
    const osDepuisJuillet = os.filter((o) => o.date.slice(0, 7) >= DEBUT_BATICOM).length
    // À faire : leads d'abord (le plus ancien en tête), puis rappels (le plus en retard en tête).
    const rappels = [...d.taches].sort((x, y) => (x.echeance ?? "").localeCompare(y.echeance ?? ""))
    const aAppeler = repartirAAppeler(d.leads.map((l) => l.agence.id), d.campagne, rappels.map((t) => t.agenceId))
    const bb = bilanProspection(d.base.lignes.filter((x) => dansLaBase(x.commercialId, p)))
    return {
      m, P: C.prevision, appels, os, annee, mois, moisAvant, sem, semAvant, jour, lundis, parPeriode, cadences, cadenceBase, osMois, moisOs, osDepuisJuillet,
      osParMois: moisOs.map((x) => os.filter((o) => o.date.slice(0, 7) === x).length), osAnnee: os.filter((o) => o.date.slice(0, 4) === String(m.getFullYear())).length,
      leadsMois: leadsPeriode(leadsBase, bM.de, bM.a), leadsAvant: leadsPeriode(leadsBase, bM.avantDe, bM.avantA),
      joursMois: joursDuMois(appels, m), semJours: semaineJours(appels, m), moyJour: moyenneJour(appels, m),
      rappels, aAppeler, bb, commerciaux: C.commerciaux, objectif: C.objectifOs, proprietaire: p,
    }
  }, [d])

  if (!d || !c) {
    return (
      <div className="@container w-full">
        <TeteEcran titre="Dashboard" sous="Téléprospection" />
        <div className="p-4">{erreur ? <BandeauAlerte role="alerte" action={<Bouton taille="sm" onClick={recharger}>Réessayer</Bouton>}>{erreur}</BandeauAlerte> : <Chargement texte="Lecture de la journée…" />}</div>
      </div>
    )
  }

  const { m, annee, mois, moisAvant, sem, semAvant, jour } = c
  const obj = c.objectif
  const moisDepuisJuillet = c.moisOs.length
  const objectifAnnee = obj * moisDepuisJuillet
  const att = attenduMois(obj, m)
  const attenduAnnee = Math.round(obj * (moisDepuisJuillet - 1 + att.jour / att.jours))
  const enRetard = obj > 0 && c.osMois.length < att.attendu
  const projection = att.projection(c.osMois.length)
  const auJour = `${m.getDate()}/${String(m.getMonth() + 1).padStart(2, "0")}`
  const moisAvantCourt = moisCourt(moisIso(new Date(m.getFullYear(), m.getMonth() - 1, 1)))

  // Par commercial, sur la période choisie.
  const lignesCom = c.commerciaux.map((x) => ({ ...x, st: c.parPeriode[periode][x.id] ?? STATS_ZERO })).sort((a, b) => b.st.appels - a.st.appels || b.st.joints - a.st.joints || a.nom.localeCompare(b.nom, "fr"))
  const bP = bornes(periode, m)
  // « Équipe » = les commerciaux affichés ; le reste (comptes hors classement, agences sans commercial) est dit à part.
  const { equipe: totalCom, horsClassement, sansCommercial } = equipeEtReste(d.commun.appels, d.commun.os, c.commerciaux.map((x) => x.id), bP.de, bP.a)
  const idsCom = new Set(c.commerciaux.map((x) => x.id))
  const equipeCad = cadence(d.commun.appels.filter((a) => a.compteId && idsCom.has(a.compteId)), c.lundis, m)
  const serie = choisi === "equipe" ? equipeCad : (c.cadences[choisi] ?? equipeCad)
  const nomChoisi = choisi === "equipe" ? "Équipe" : (c.commerciaux.find((x) => x.id === choisi)?.nom ?? "Équipe")
  const LIBELLE: Record<PeriodeCockpit, string> = { jour: "aujourd'hui", semaine: `depuis lundi ${lundiCourt(c.lundis[c.lundis.length - 1])}`, mois: `du 1er au ${m.getDate()} ${moisCourt(moisIso(m))}`, moisDernier: `${moisAvantCourt} entier`, annee: "depuis janvier" }
  const PERIODES: { id: PeriodeCockpit; label: string; title: string }[] = [
    { id: "jour", label: "J", title: "Aujourd'hui" }, { id: "semaine", label: "S", title: "Cette semaine, depuis lundi" },
    { id: "mois", label: "M", title: "Ce mois-ci, depuis le 1er" }, { id: "moisDernier", label: "M−1", title: "Le mois dernier entier" }, { id: "annee", label: "A", title: "Depuis le 1er janvier" },
  ]

  // À faire aujourd'hui : les leads puis les rappels (masqués dès qu'on les a reportés).
  const lignes = [
    ...[...d.leads].sort((x, y) => x.lead.creeLe.localeCompare(y.lead.creeLe)).map(({ agence, lead }) => ({ type: "Lead" as const, cle: `l-${lead.id}`, agenceId: agence.id, agence: agence.nom, motif: lead.signal || lead.detail, quand: lead.creeLe, tache: null as TacheAgenda | null })),
    ...c.rappels.filter((t) => masques.pour !== d || !masques.ids.has(t.id)).map((t) => ({ type: "Rappel" as const, cle: `r-${t.id}`, agenceId: t.agenceId, agence: t.agenceNom, motif: t.titre || (t.type === "rdv" ? "RDV" : "Rappeler"), quand: t.echeance ?? t.date, tache: t as TacheAgenda | null })),
  ]
  const rappelsEnRetard = c.rappels.filter((t) => t.echeance && joursEntre(new Date(t.echeance), m) > 0).length
  const visibles = lignes.filter((l) => filtre === "tout" || (filtre === "leads" ? l.type === "Lead" : l.type === "Rappel"))
  const meilleur = extra?.heures.length ? Math.max(...extra.heures.map((h) => h.taux)) : 0
  const heuresMuettes = extra ? HEURES_OUVREES.filter((h) => h < 18 && !extra.heures.some((x) => x.heure === h)) : []
  const bougent = extra ? agencesQuiBougent(extra.signaux.filter((x) => dansLaBase(x.commercialId, c.proprietaire))) : []
  const ms = extra?.mails ?? null, lm = c.leadsMois
  const tot = c.bb.total

  const agir = async (f: () => Promise<void>) => {
    setOccupe(true); setErreurAction("")
    try { await f(); recharger() } catch (e) { setErreurAction(message(e)); recharger() } finally { setOccupe(false) }
  }
  const reporterA = (t: TacheAgenda, date: Date) => agir(async () => {
    setReport(null)
    await deplacerTache(t.id, date.toISOString())
    setMasques((x) => ({ pour: d, ids: new Set(x.pour === d ? x.ids : []).add(t.id) }))
  })
  const validerReportLibre = (e: FormEvent) => {
    e.preventDefault()
    if (!report) return
    const date = composerDate(report.jour, report.heure)
    if (!date) { setErreurAction("Choisis une date et une heure."); return }
    reporterA(report.tache, date)
  }

  return (
    <div className="@container w-full">
      <TeteEcran titre="Dashboard" sous={`Téléprospection · ${d.choixBase.base.toLowerCase()} · de gauche à droite : l'année → le jour`}
        droite={<>
          {d.choixBase.options.length > 1 ? <Selecteur value={d.choixBase.choix} onChange={(e) => choisirBase(e.target.value)} aria-label="La base affichée" className="w-48">{d.choixBase.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Selecteur> : null}
          <Direct texte={seance(m)} />
          <Bouton variante="plein" icone={<Phone />} onClick={() => onNaviguer?.("sessions")}>Démarrer la session</Bouton>
        </>} />

      <div className="space-y-2 bg-fond-2 p-3">
        {erreur ? <BandeauAlerte role="attention">Dernière mise à jour impossible : {erreur}</BandeauAlerte> : null}
        {d.manques.length ? <BandeauAlerte role="attention" action={<Bouton taille="sm" variante="discret" onClick={recharger}>Réessayer</Bouton>}>Lecture incomplète, ces chiffres manquent : {d.manques.join(" · ")}</BandeauAlerte> : null}
        {erreurAction ? <BandeauAlerte role="alerte" action={<Bouton taille="sm" variante="discret" onClick={() => setErreurAction("")}>Fermer</Bouton>}>{erreurAction}</BandeauAlerte> : null}

        {/* ═══ LE BANDEAU DE COTES : l'année → le mois → la semaine → le jour ═══ */}
        <BandeauCotes>
          <Tuile periode="année" libelle="Premiers OS" valeur={c.osAnnee} accent={obj ? (c.osDepuisJuillet < attenduAnnee ? "alerte" : "ok") : undefined}
            repere={obj ? <>{moisCourt(`${DEBUT_BATICOM}-01`)}→ : {c.osDepuisJuillet} / {objectifAnnee} · attendu {attenduAnnee}</> : <>depuis {moisCourt(`${DEBUT_BATICOM}-01`)} : {c.osDepuisJuillet}</>}
            title={obj ? `Depuis juillet (début de Baticom) : ${c.osDepuisJuillet} sur un objectif de ${objectifAnnee} (${obj} par mois), ${attenduAnnee} attendus au ${auJour}.` : "Pas d'objectif mensuel réglé (Réglages › Objectifs)."}
            courbe={<MiniCourbe barres valeurs={c.osParMois} objectif={obj || undefined} enCours />} />
          <Tuile periode="année" libelle="Appels" valeur={fr(annee.appels)} repere={<>joints {fr(annee.joints)} · {pct(annee.joints, annee.appels)}</>}
            title="Appels sortants depuis le 1er janvier. Courbe : appels par semaine, 8 semaines." courbe={<MiniCourbe valeurs={c.cadenceBase.appels} />} />
          <Tuile periode="mois" libelle="Premiers OS" valeur={<>{c.osMois.length}{obj ? <span className="text-[14px] font-normal text-encre-2"> / {obj}</span> : null}</>} ton={obj ? (enRetard ? "text-alerte" : "text-ok") : "text-encre"} accent={obj ? (enRetard ? "alerte" : "ok") : undefined}
            cote={<Cote n={mois.premiersOs} avant={moisAvant.premiersOs} unite="nb" />} repere={obj ? <>attendu {att.attendu} · projection {projection}</> : "objectif à régler dans Réglages"}
            title={`Reçus : ${c.osMois.map((o) => o.nom).join(", ") || "aucun"}. Trait bleu : attendus au ${auJour} ; trait noir : objectif.`}
            courbe={obj ? <Jauge realise={c.osMois.length} objectif={obj} attendu={att.attendu} ton={enRetard ? "bg-alerte" : "bg-ok"} h={6} /> : null} />
          <Tuile periode="mois" libelle="Appels" valeur={fr(mois.appels)} cote={<Cote n={mois.appels} avant={moisAvant.appels} />} repere={<>vs {fr(moisAvant.appels)} du 1er au {Math.min(m.getDate(), new Date(m.getFullYear(), m.getMonth(), 0).getDate())} {moisAvantCourt}</>}
            courbe={<MiniCourbe barres valeurs={c.joursMois.map((x) => x.appels)} />} title="Appels sortants par jour ce mois-ci" />
          <Tuile periode="mois" libelle="Joints" valeur={fr(mois.joints)} cote={<Cote n={mois.joints} avant={moisAvant.joints} />} repere={<>{pct(mois.joints, mois.appels)} · {moisAvantCourt} {pct(moisAvant.joints, moisAvant.appels)}</>}
            courbe={<MiniCourbe barres ton="encre" valeurs={c.joursMois.map((x) => x.joints)} />} title="Gestionnaires joints par jour ce mois-ci" />
          <Tuile periode="mois" libelle="Intéressées" valeur={mois.interesses} cote={<Cote n={mois.interesses} avant={moisAvant.interesses} />} repere={<>{pct(mois.interesses, mois.joints)} des joints · vs {moisAvant.interesses}</>}
            courbe={<MiniCourbe valeurs={c.cadenceBase.interesses} ton="ok" />} title="Agences distinctes intéressées ou RDV. Courbe : par semaine, 8 semaines." />
          <Tuile periode="mois" libelle="Leads reçus" valeur={lm.recus} cote={<Cote n={lm.recus} avant={c.leadsAvant.recus} />} repere={<>{lm.aTraiter} à traiter · {lm.clients} clients</>}
            courbe={<MiniCourbe barres valeurs={[lm.recus, lm.traites, lm.clients]} ton="info" />} title="Leads hors robots depuis le 1er du mois. Barres : reçus, traités, devenus clients." />
          <Tuile periode="semaine" libelle="Appels" valeur={sem.appels} cote={<Cote n={sem.appels} avant={semAvant.appels} />} repere={<>vs {semAvant.appels} à la même heure</>}
            courbe={<MiniCourbe barres valeurs={c.semJours.map((x) => x.appels ?? 0)} enCours />} title="Lundi → vendredi, comparé à la semaine dernière à la même heure" />
          <Tuile periode="semaine" libelle="Joints" valeur={sem.joints} cote={<Cote n={sem.joints} avant={semAvant.joints} />} repere={<>{pct(sem.joints, sem.appels)} · vs {semAvant.joints} sem. dern.</>}
            courbe={<MiniCourbe barres ton="encre" valeurs={c.semJours.map((x) => x.joints ?? 0)} enCours />} />
          <Tuile periode="semaine" libelle="Mails envoyés" valeur={ms ? ms.envoyes : "—"} repere={ms ? <>{ms.ouverts} ouverts · {ms.recus} réponses</> : "lecture…"}
            courbe={ms ? <MiniCourbe barres valeurs={[ms.envoyes, ms.ouverts, ms.recus]} /> : null} title={ms ? `Mails de démarchage rattachés à une agence, depuis lundi (toute l'équipe). Revenus en erreur : ${ms.rebonds}.` : undefined} />
          <Tuile periode="jour" libelle="Appels" valeur={jour.appels} repere={<>moy. {c.moyJour.appels} / jour · joints {jour.joints}</>}
            courbe={<MiniCourbe valeurs={c.joursMois.slice(-8).map((x) => x.appels)} />} title={`Moyenne sur les ${c.moyJour.jours} jours ouvrés avec appels écoulés du mois. Courbe : 8 derniers jours.`} />
          <Tuile periode="jour" libelle="À appeler" valeur={c.aAppeler.total} ton={c.aAppeler.total ? "text-alerte" : "text-encre"} accent={c.aAppeler.total ? "alerte" : undefined}
            repere={<>{c.aAppeler.leads.length} leads · {c.aAppeler.campagne.length ? `${c.aAppeler.campagne.length} campagnes · ` : ""}{rappelsEnRetard} rappels en retard</>}
            courbe={<MiniCourbe barres ton="alerte" valeurs={[c.aAppeler.leads.length, c.aAppeler.campagne.length, c.aAppeler.rappels.length]} />} title="Agences distinctes à appeler aujourd'hui : leads, appels demandés par les campagnes, rappels (une agence compte une fois, dans son groupe le plus urgent). La session de call les enchaîne." />
        </BandeauCotes>

        {/* ═══ LA TRAJECTOIRE À 6 MOIS, en une bande ═══ */}
        <PrevisionCompacte P={c.P} />

        {/* ═══ LES LISTES DE SUIVI ═══ */}
        <div className="grid grid-cols-1 gap-2 @min-[760px]:grid-cols-2 @min-[1100px]:grid-cols-3 @min-[1500px]:grid-cols-4 @min-[2100px]:grid-cols-5">
          {/* Par commercial */}
          <Panneau className="@min-[760px]:col-span-2" titre="Par commercial" compte={lignesCom.length} droite={LIBELLE[periode]}
            outils={<Unites valeur={periode} options={PERIODES} onChange={setPeriode} />}>
            <Grille
              colonnes={[{ titre: "Commercial" }, { titre: "Appels", largeur: "66px", droite: true }, { titre: "Joints", largeur: "58px", droite: true }, { titre: "Taux", largeur: "58px", droite: true, title: "Taux de joint : joints / appels" },
                { titre: "Intér.", largeur: "52px", droite: true, title: "Agences distinctes intéressées (ou RDV)" }, { titre: "RDV", largeur: "44px", droite: true }, { titre: "1ers OS", largeur: "58px", droite: true }, { titre: "Conv.", largeur: "56px", droite: true, title: "Premiers OS / intéressées" }, { titre: "8 sem.", largeur: "96px", droite: true, title: `Appels par semaine depuis le ${lundiCourt(c.lundis[0])}` }]}
              lignes={lignesCom.map(({ id, nom, st }) => ({
                cle: id, actif: choisi === id, onClick: () => setChoisi(id), title: "Cliquer : la cadence de ce commercial en dessous",
                ton: st.appels ? "" : "text-encre-2",
                cellules: [<span className="font-medium">{nom}</span>, fr(st.appels), fr(st.joints), pct(st.joints, st.appels), st.interesses, st.rdv, <b className="font-semibold">{st.premiersOs}</b>, pct(st.premiersOs, st.interesses),
                  <span className="ml-auto block w-[88px]"><MiniCourbe valeurs={c.cadences[id]?.appels ?? []} h={18} /></span>],
              }))}
              pied={[<button type="button" className={`underline-offset-4 hover:underline ${choisi === "equipe" ? "" : "text-encre-2"}`} onClick={() => setChoisi("equipe")}>Équipe</button>, fr(totalCom.appels), fr(totalCom.joints), pct(totalCom.joints, totalCom.appels), totalCom.interesses, totalCom.rdv,
                totalCom.premiersOs, pct(totalCom.premiersOs, totalCom.interesses), <span className="ml-auto block w-[88px]"><MiniCourbe valeurs={equipeCad.appels} h={18} ton="encre" /></span>]} />
            {horsClassement.appels || horsClassement.premiersOs || sansCommercial ? (
              <p className="mt-1 text-colonne text-encre-2">
                Hors de ce tableau : {[
                  horsClassement.appels || horsClassement.premiersOs ? `${fr(horsClassement.appels)} appel${horsClassement.appels > 1 ? "s" : ""} et ${horsClassement.premiersOs} premier${horsClassement.premiersOs > 1 ? "s" : ""} OS des comptes hors classement (direction, recrutement)` : "",
                  sansCommercial ? `${sansCommercial} premier${sansCommercial > 1 ? "s" : ""} OS d'agence${sansCommercial > 1 ? "s" : ""} sans commercial attribué` : "",
                ].filter(Boolean).join(" · ")}.
              </p>
            ) : null}
            <div className="mt-2 border-t-[0.5px] border-trait pt-2">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-colonne text-encre"><b className="font-semibold">{nomChoisi}</b> <span className="text-encre-2">· appels et joints par semaine, depuis le {lundiCourt(c.lundis[0])}</span></span>
                <Legende items={[{ puce: "bg-info", texte: "appels" }, { puce: "bg-encre", texte: "dont joints" }]} />
              </div>
              <Colonnes h={78} valeurs={serie.appels} second={serie.joints} etiquettes={c.lundis.map(lundiCourt)} enCours={c.lundis.length - 1}
                titre={(i) => `Semaine du ${lundiCourt(c.lundis[i])} : ${serie.appels[i]} appels, ${serie.joints[i]} joints (${pct(serie.joints[i], serie.appels[i])})${i === c.lundis.length - 1 ? " — en cours" : ""}`} />
            </div>
          </Panneau>

          {/* Le mois · entonnoir */}
          <Panneau titre="Le mois · entonnoir" droite={`vs mêmes jours de ${moisAvantCourt}`}>
            <div className="pt-1"><Entonnoir marches={[{ libelle: "Appels", valeur: mois.appels, avant: moisAvant.appels }, { libelle: "Joints", valeur: mois.joints, avant: moisAvant.joints }, { libelle: "Intéressées", valeur: mois.interesses, avant: moisAvant.interesses }, { libelle: "Premiers OS", valeur: c.osMois.length, avant: moisAvant.premiersOs }]} /></div>
            <div className="mt-2 grid grid-cols-3 gap-2 border-t-[0.5px] border-trait pt-2 text-colonne text-encre-2">
              <span>joint <b className="chiffres block text-legende font-semibold text-encre">{pct(mois.joints, mois.appels)}</b></span>
              <span>intéressées <b className="chiffres block text-legende font-semibold text-encre">{pct(mois.interesses, mois.joints)}</b></span>
              <span>signées <b className="chiffres block text-legende font-semibold text-encre">{pct(c.osMois.length, mois.interesses)}</b></span>
            </div>
            <div className="mt-2 border-t-[0.5px] border-trait pt-2">
              <div className="flex items-baseline justify-between text-colonne"><span className="text-encre">Premiers OS <b className="chiffres font-semibold">{c.osMois.length}{obj ? ` / ${obj}` : ""}</b></span>{obj ? <span className={enRetard ? "text-alerte" : "text-ok"}>{enRetard ? `${att.attendu - c.osMois.length} de retard` : "dans les temps"}</span> : null}</div>
              {obj ? <Jauge realise={c.osMois.length} objectif={obj} attendu={att.attendu} ton={enRetard ? "bg-alerte" : "bg-ok"} /> : null}
              <ul className="mt-1.5 space-y-0.5 text-colonne text-encre-2">{c.osMois.map((o) => <li key={o.agenceId} className="truncate">✓ <button type="button" className="hover:underline" onClick={() => onOuvrirAgence?.(o.agenceId)}>{o.nom}</button> ({jourCourt(o.date)})</li>)}</ul>
            </div>
          </Panneau>

          {/* Les premiers OS mois par mois */}
          <Panneau titre="Premiers OS par mois" droite={obj ? `objectif ${obj} / mois` : "pas d'objectif réglé"}>
            <div className="pt-4"><Colonnes h={110} valeurs={c.osParMois} etiquettes={c.moisOs.map(moisCourt)} enCours={c.moisOs.length - 1} ligne={obj || undefined} ligneLibelle={obj ? `obj. ${obj}` : undefined} /></div>
            <div className="mt-2 flex items-baseline justify-between gap-2 border-t-[0.5px] border-trait pt-2 text-colonne text-encre-2">
              <span>depuis janvier <b className="chiffres text-legende font-semibold text-encre">{c.osAnnee}</b></span>
              <span>depuis {moisCourt(`${DEBUT_BATICOM}-01`)} <b className="chiffres text-legende font-semibold text-encre">{c.osDepuisJuillet}</b>{obj ? ` / ${objectifAnnee}` : ""}</span>
            </div>
            {obj ? <>
              <div className="mt-1.5"><Jauge realise={c.osDepuisJuillet} objectif={objectifAnnee} attendu={attenduAnnee} ton={c.osDepuisJuillet < attenduAnnee ? "bg-alerte" : "bg-ok"} h={6} /></div>
              <p className="mt-1 text-colonne text-encre-2">trait bleu : {attenduAnnee} attendus au {auJour}{c.osDepuisJuillet < attenduAnnee ? <> · <span className="text-alerte">{attenduAnnee - c.osDepuisJuillet} de retard</span></> : null}</p>
            </> : null}
          </Panneau>

          {/* Le portefeuille par étape */}
          <Panneau titre="Portefeuille" compte={fr(tot)} droite="agences par étape, hors apporteurs">
            <Grille colonnes={[{ titre: "Étape" }, { titre: "Agences", largeur: "76px", droite: true }, { titre: "Part", largeur: "38%" }]}
              lignes={ETAPES_PORTEFEUILLE.map((e) => {
                const n = c.bb.parEtape[e] ?? 0
                return { cle: e, ton: e === "client" ? "font-semibold" : "", onClick: onOuvrirEtape ? () => onOuvrirEtape(e) : undefined, title: "Ouvrir Agences sur cette étape", cellules: [libelleEtape(e), fr(n),
                  <span className="flex items-center gap-2"><Barre v={n} max={Math.max(1, ...ETAPES_PORTEFEUILLE.map((x) => c.bb.parEtape[x] ?? 0))} ton={e === "client" ? "bg-ok" : sortie(e) ? "bg-encre-3" : "bg-info"} /><span className="chiffres w-10 shrink-0 text-right text-colonne text-encre-2">{pct(n, tot)}</span></span>] }
              })} />
          </Panneau>

          {/* Quand appeler */}
          <Panneau className="@min-[2100px]:col-span-2" titre="Quand appeler" droite="taux de joint par heure · 90 j">
            {extra?.heures.length ? <>
              <div className="space-y-1 pt-2">
                {extra.heures.map((h) => (
                  <div key={h.heure} className="grid grid-cols-[34px_minmax(0,1fr)_40px_56px] items-center gap-2 text-[12.5px]" title={`${h.heure} h : ${h.joints} joints sur ${h.appels} appels`}>
                    <span className="chiffres text-encre-2">{h.heure} h</span>
                    <Barre v={h.taux} max={meilleur} ton={h.taux === meilleur ? "bg-ok" : "bg-info"} h={10} />
                    <span className={`chiffres text-right font-semibold ${h.taux === meilleur ? "text-ok" : "text-encre"}`}>{h.taux} %</span>
                    <span className="chiffres text-right text-colonne text-encre-2">{fr(h.appels)} app.</span>
                  </div>
                ))}
              </div>
              {heuresMuettes.length ? <p className="mt-2 text-colonne text-encre-2">{heuresMuettes.map((h) => `${h} h`).join(", ")} : moins de 10 appels, pas de taux.</p> : null}
            </> : <p className="py-6 text-colonne text-encre-2">{extra ? "Pas encore assez d'appels pour le dire." : "Lecture…"}</p>}
          </Panneau>

          {/* La semaine jour par jour */}
          <Panneau className="@min-[1100px]:col-span-2 @min-[1500px]:col-span-1 @min-[2100px]:col-span-2" titre="La semaine" droite={<Legende items={[{ puce: "bg-info", texte: "appels" }, { puce: "bg-encre", texte: "joints" }]} />}>
            <div className="pt-3"><Colonnes h={108} valeurs={c.semJours.map((x) => x.appels)} second={c.semJours.map((x) => x.joints)} etiquettes={c.semJours.map((x) => jourSemaine(x.jour))} enCours={c.semJours.findIndex((x) => x.enCours)}
              titre={(i) => { const x = c.semJours[i]; return x.appels === null ? `${jourSemaine(x.jour)} : à venir` : `${jourSemaine(x.jour)} : ${x.appels} appels, ${x.joints} joints` }} /></div>
            <div className="mt-2 grid grid-cols-2 gap-2 border-t-[0.5px] border-trait pt-2 text-colonne text-encre-2">
              <span>appels <b className="chiffres text-legende font-semibold text-encre">{sem.appels}</b> <Cote n={sem.appels} avant={semAvant.appels} /></span>
              <span>joints <b className="chiffres text-legende font-semibold text-encre">{sem.joints}</b> <Cote n={sem.joints} avant={semAvant.joints} /></span>
            </div>
          </Panneau>

          {/* Leads et mails */}
          <Panneau titre="Leads du mois · mails de la semaine">
            <Grille colonnes={[{ titre: "" }, { titre: "", largeur: "56px", droite: true }, { titre: "", largeur: "56px", droite: true }]}
              lignes={[
                { cle: "lr", cellules: ["Leads reçus (hors robots)", <b className="font-semibold">{lm.recus}</b>, ""] },
                { cle: "lt", cellules: ["à traiter", <span className={lm.aTraiter ? "text-alerte" : ""}>{lm.aTraiter}</span>, <span className="text-encre-2">{pct(lm.aTraiter, lm.recus)}</span>] },
                { cle: "ltr", cellules: ["traités", lm.traites, <span className="text-encre-2">{pct(lm.traites, lm.recus)}</span>] },
                { cle: "lc", cellules: ["devenus clients", <b className="font-semibold text-ok">{lm.clients}</b>, <span className="text-encre-2">{pct(lm.clients, lm.recus)}</span>] },
                { cle: "me", cellules: ["Mails envoyés depuis lundi", <b className="font-semibold">{ms ? ms.envoyes : "—"}</b>, ""] },
                { cle: "mo", cellules: ["ouverts", ms ? ms.ouverts : "—", <span className="text-encre-2">{ms ? pct(ms.ouverts, ms.envoyes) : ""}</span>] },
                { cle: "mr", cellules: ["réponses reçues", ms ? ms.recus : "—", ""] },
                { cle: "mb", cellules: ["revenus en erreur", ms ? <span className={ms.rebonds ? "text-alerte" : ""}>{ms.rebonds}</span> : "—", ""] },
              ]} />
          </Panneau>

          {/* À faire aujourd'hui : la liste d'action */}
          <Panneau className="@min-[760px]:col-span-2 @min-[2100px]:col-span-3" titre="À faire aujourd'hui" compte={lignes.length}
            droite={<span>{d.leads.length} leads · <span className={rappelsEnRetard ? "text-alerte" : ""}>{rappelsEnRetard} rappels en retard</span>{c.aAppeler.campagne.length ? ` · ${c.aAppeler.campagne.length} demandés par les campagnes (session)` : ""}</span>}
            outils={<Unites valeur={filtre} onChange={setFiltre} options={[{ id: "tout", label: "Tout" }, { id: "leads", label: "Leads" }, { id: "rappels", label: "Rappels" }]} />}>
            <div className="max-h-[392px] overflow-y-auto">
              {visibles.length ? (
                <Grille colonnes={[{ titre: "", largeur: "64px" }, { titre: "Agence" }, { titre: "Motif", largeur: "30%" }, { titre: "Depuis", largeur: "120px", droite: true }, { titre: "", largeur: "196px", droite: true }]}
                  lignes={visibles.map((l) => {
                    const n = joursEntre(new Date(l.quand), m)
                    return { cle: l.cle, cellules: [
                      <span className={`inline-flex items-center gap-1.5 text-colonne ${l.type === "Lead" ? "text-signature" : "text-encre-2"}`}><span className={`h-1.5 w-1.5 rounded-full ${l.type === "Lead" ? "bg-signature" : "bg-encre-3"}`} />{l.type}</span>,
                      <button type="button" className="truncate font-medium hover:underline" title={l.agence} onClick={() => onOuvrirAgence?.(l.agenceId)}>{l.agence}</button>,
                      <span className="text-encre-2" title={l.motif}>{l.motif}</span>,
                      l.type === "Lead" ? <span className="text-encre-2">{n === 0 ? "aujourd'hui" : n === 1 ? "hier" : `${n} j`} <span className="text-encre-3">· {jourCourt(l.quand)}</span></span>
                        : n > 0 ? <span className="text-alerte">+{n} j <span className="text-encre-3">· {jourCourt(l.quand)}</span></span> : <span>{heureCourte(l.quand)}</span>,
                      <span className="inline-flex justify-end gap-1">
                        {l.tache ? <Bouton taille="sm" variante="discret" disabled={occupe} onClick={() => setReport({ tache: l.tache!, ...decomposerDate(l.tache!.echeance) })}>Reporter</Bouton> : null}
                        <Bouton taille="sm" icone={<Phone />} onClick={() => onOuvrirSession?.(l.agenceId)}>Appeler</Bouton>
                      </span>,
                    ] }
                  })} />
              ) : <p className="py-6 text-colonne text-encre-2">Rien à faire de ce côté pour l'instant.</p>}
            </div>
          </Panneau>

          {/* Les agences qui bougent */}
          <Panneau className="@min-[760px]:col-span-2 @min-[1100px]:col-span-1 @min-[1500px]:col-span-2" titre="Agences qui bougent" compte={bougent.length} droite="7 j · plaquette et mails ouverts">
            {bougent.length ? <>
              <div className="max-h-[392px] overflow-y-auto @min-[1500px]:hidden">
                <Grille colonnes={[{ titre: "Agence" }, { titre: "Signaux", largeur: "76px", droite: true }, { titre: "Dernier", largeur: "62px", droite: true }]}
                  lignes={bougent.map((x) => ({ cle: x.agenceId, title: `${x.agenceNom} — étape : ${libelleEtape(x.etape)}`, onClick: () => onOuvrirAgence?.(x.agenceId), cellules: [
                    <span className="font-medium">{x.agenceNom}</span>,
                    <span className="text-encre-2">{[x.plaquette ? `plaq. ×${x.plaquette}` : "", x.mail ? `mail ×${x.mail}` : ""].filter(Boolean).join(" ")}</span>,
                    <span className="text-encre-2">{jourCourt(x.dernier)}</span>,
                  ] }))} />
              </div>
              <div className="hidden max-h-[392px] overflow-y-auto @min-[1500px]:block">
                <Grille colonnes={[{ titre: "Agence" }, { titre: "Étape", largeur: "130px" }, { titre: "Plaquette", largeur: "80px", droite: true }, { titre: "Mail ouvert", largeur: "90px", droite: true }, { titre: "Dernier", largeur: "96px", droite: true }, { titre: "", largeur: "92px", droite: true }]}
                  lignes={bougent.map((x) => ({ cle: x.agenceId, title: `${x.agenceNom} — étape : ${libelleEtape(x.etape)}`, cellules: [
                    <button type="button" className="truncate font-medium hover:underline" onClick={() => onOuvrirAgence?.(x.agenceId)}>{x.agenceNom}</button>, <span className="text-encre-2">{libelleEtape(x.etape)}</span>,
                    x.plaquette || <span className="text-encre-3">·</span>, x.mail || <span className="text-encre-3">·</span>,
                    <span className="text-encre-2">{new Date(x.dernier).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>,
                    <Bouton taille="sm" icone={<Phone />} onClick={() => onOuvrirSession?.(x.agenceId)}>Appeler</Bouton>,
                  ] }))} />
              </div>
            </> : <p className="py-6 text-colonne text-encre-2">{extra ? "Rien de nouveau ces 7 derniers jours." : "Lecture…"}</p>}
          </Panneau>
        </div>

        {/* Les clients signalés par STC Bâtiment à confirmer (inchangé). */}
        <ClientsAConfirmer onOuvrirAgence={onOuvrirAgence} onDecision={recharger} />

        {/* Le contrôle de la base : administrateurs seulement, tout en bas. */}
        {admin && santeErreur ? <BandeauAlerte role="attention">Contrôle de la base indisponible : {santeErreur}</BandeauAlerte> : null}
        {admin && sante && sante.length ? (
          <BandeauAlerte role="alerte">
            <div className="space-y-1">
              <p className="font-semibold">Contrôle de la base : {sante.length} écart{sante.length > 1 ? "s" : ""} à corriger</p>
              <ul className="space-y-0.5">{sante.map((e) => <li key={e.code}><b className="chiffres">{e.nombre}</b> · {e.libelle}{e.exemples ? <span className="text-encre-2"> — {e.exemples.length > 160 ? e.exemples.slice(0, 160) + "…" : e.exemples}</span> : null}</li>)}</ul>
            </div>
          </BandeauAlerte>
        ) : null}
      </div>

      {/* ── Reporter un rappel ── */}
      {report ? (
        <Dialogue
          titre={`Reporter « ${report.tache.titre || (report.tache.type === "rdv" ? "RDV" : "Tâche")} »`}
          description={`${report.tache.agenceNom}${report.tache.echeance ? ` · prévu ${libelleRelatif(report.tache.echeance, m)} à ${heureCourte(report.tache.echeance)}` : ""}`}
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
