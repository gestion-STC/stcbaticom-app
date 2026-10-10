// ════════════════════════════════════════════════════════════════════════════
// AUJOURD'HUI — l'écran d'accueil du commercial (« petite copie d'Aircall »).
//
// En un coup d'œil : les quatre files et leurs chiffres, ce qu'il y a à faire
// aujourd'hui (RDV, en retard, ce matin, cet après-midi), qui a fait quoi
// (aujourd'hui et ce mois-ci, face à l'objectif d'OS), et où en est la base.
// Rafraîchi toutes les 60 s quand l'onglet est visible. Les calculs sont dans
// src/demarchage/aujourdhuiOutils.ts ; les lectures dans src/demarchage/db.ts.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { ArrowUpRight, CalendarClock, Check, MapPin, Pencil, Phone, RefreshCw, Video } from "lucide-react"
import { chargerTachesDuJour, compterFiles, compterParEtape, compterPremiersOs, deplacerTache, statsAppels, terminerTache, type StatsCompte, type TacheAgenda } from "../../demarchage/db"
import { FILES, dureeLisible, type File } from "../../demarchage/modele"
import {
  composerDate, compterAgencesJamaisJointes, compterReveils, dansNJoursA, dateLongue, debutDeSemaine, debutDuMois, decomposerDate, demainA, estEnRetard, finDeSemaine, finDuMois,
  grouperTaches, heureCourte, libelleRelatif, lireObjectif, progressionObjectif, segmentsBase, tauxJoints, totalStats, type MomentTache,
  PERIODES, bornesPeriode, classer, type Periode,
  majusculeInitiale,
} from "../../demarchage/aujourdhuiOutils"
import { ecrireParametre, lireParametre } from "../../lib/parametresDb"
import { listerComptes } from "../../lib/comptes"
import { Bandeau, Bouton, Carte, Champ, Chargement, Compteurs, Dialogue, Etiquette, EnTetePage, Onglets, Pastille, Tableau, Td, Th, TitreCarte, Vide } from "../../ui"
import ClientsAConfirmer from "./ClientsAConfirmer"

const RAFRAICHIR_MS = 60_000
const CLE_OBJECTIF = "objectif_os_mensuel"
const s = (n: number) => (n > 1 ? "s" : "")
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

type Donnees = {
  files: Record<File, number>
  taches: TacheAgenda[]
  classements: Record<Periode, StatsCompte[]> // tout le monde, classé, pour chaque période
  osRecus: number
  objectif: number
  parEtape: Record<string, number>
  jamaisJointes: number
  reveils: number
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
  // L'heure de la dernière lecture : tout (bornes, retards, « dans 2 h ») s'y rapporte,
  // et le rendu reste pur (pas de new Date() pendant qu'on dessine).
  const [maintenant, setMaintenant] = useState(() => new Date())
  const [erreur, setErreur] = useState("")
  const [occupe, setOccupe] = useState(false)
  const [report, setReport] = useState<{ tache: TacheAgenda; jour: string; heure: string } | null>(null)
  const [editionObjectif, setEditionObjectif] = useState(false)
  const [periode, setPeriode] = useState<Periode>("mois")
  const [saisieObjectif, setSaisieObjectif] = useState("")
  const enVie = useRef(true)

  const charger = useCallback(async () => {
    const now = new Date()
    try {
      // Les comptes du logiciel (réservé aux administrateurs : un télépro verra ceux qui ont des appels).
      const comptes = await listerComptes().then((l) => l.map((c) => ({ id: c.id, nom: c.nom || c.email }))).catch(() => [] as { id: string; nom: string }[])
      const [files, taches, osRecus, objectifBrut, parEtape, jamaisJointes, reveils, ...parPeriode] = await Promise.all([
        compterFiles(now),
        chargerTachesDuJour(now),
        compterPremiersOs(debutDuMois(now), finDuMois(now)),
        lireParametre(CLE_OBJECTIF),
        compterParEtape(),
        compterAgencesJamaisJointes(),
        compterReveils(debutDeSemaine(now), finDeSemaine(now)),
        ...PERIODES.map((p) => { const b = bornesPeriode(p.code, now); return statsAppels(b.de, b.a) }),
      ])
      if (!enVie.current) return
      const classements = Object.fromEntries(PERIODES.map((p, i) => [p.code, classer(parPeriode[i], comptes)])) as Record<Periode, StatsCompte[]>
      setD({ files, taches, classements, osRecus, objectif: lireObjectif(objectifBrut), parEtape, jamaisJointes, reveils })
      setMaintenant(now)
      setErreur("")
    } catch (e) {
      if (enVie.current) setErreur(message(e))
    }
  }, [])

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
    catch (e) { setErreur(message(e)) }
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
    const { jour, heure } = decomposerDate(demainA(new Date()).toISOString())
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
  const progression = progressionObjectif(d.osRecus, d.objectif)
  const segments = segmentsBase(d.parEtape)
  const totalBase = segments.reduce((acc, x) => acc + x.n, 0)

  const ligneTache = (t: TacheAgenda, dansRetard = false) => {
    const retard = estEnRetard(t, maintenant)
    return (
      <li key={t.id} className="flex items-center gap-3 border-b border-fond-4 px-5 py-2 last:border-b-0">
        <span className="w-14 shrink-0">
          <span className={"chiffres block text-legende font-semibold " + (retard ? "text-alerte" : "text-encre")}>{t.echeance ? heureCourte(t.echeance) : "—"}</span>
          {dansRetard && t.echeance ? <span className="block text-colonne text-encre-2">{libelleRelatif(t.echeance, maintenant)}</span> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-corps font-medium text-encre">{t.titre || (t.type === "rdv" ? "RDV" : "Tâche")}</span>
            {t.type === "rdv" ? <Pastille role="info" className="shrink-0">{iconeRdv(t.rdvType)} {libelleRdv(t.rdvType)}</Pastille> : null}
          </span>
          <span className="block truncate text-legende text-encre-2">
            <button type="button" className="font-medium text-encre underline-offset-2 hover:underline" onClick={() => onOuvrirAgence?.(t.agenceId)}>{t.agenceNom || "Agence inconnue"}</button>
            {t.contactNom ? ` · ${t.contactNom}` : ""}
            {t.agenceTelephone ? <span className="chiffres"> · {t.agenceTelephone}</span> : ""}
            {t.note ? ` · ${t.note}` : ""}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          <Bouton variante="discret" taille="sm" icone={<Phone />} disabled={occupe} onClick={() => onOuvrirSession?.(t.agenceId)}>Appeler</Bouton>
          <Bouton variante="discret" taille="sm" icone={<Check />} disabled={occupe} onClick={() => terminer(t)}>Fait</Bouton>
          <Bouton variante="discret" taille="sm" icone={<CalendarClock />} disabled={occupe} onClick={() => ouvrirReport(t)}>Reporter</Bouton>
          <Bouton variante="discret" taille="sm" icone={<ArrowUpRight />} onClick={() => onOuvrirAgence?.(t.agenceId)}>Ouvrir</Bouton>
        </span>
      </li>
    )
  }

  return (
    <div className="page">
      <EnTetePage
        titre="Aujourd'hui"
        sousTitre={majusculeInitiale(dateLongue(maintenant))}
        droite={<>
          <Bouton icone={<RefreshCw />} chargement={occupe} onClick={() => agir(async () => undefined)}>Actualiser</Bouton>
          <Bouton variante="plein" icone={<Phone />} onClick={() => onNaviguer?.("sessions")}>Démarrer une session</Bouton>
        </>}
      />

      {erreur ? <Bandeau role="alerte" className="mb-4" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur("")}>Fermer</Bouton>}>{erreur}</Bandeau> : null}

      {/* ── Les quatre files ── */}
      <div className="mb-4">
        <Compteurs
          valeurs={FILES.map((f) => ({ id: f.code, libelle: f.libelle, valeur: d.files[f.code], detail: f.aide }))}
          onSelect={() => onNaviguer?.("sessions")}
        />
      </div>

      {/* ── Les ordres de service reçus dans STC Bâtiment : à confirmer par un humain ── */}
      <ClientsAConfirmer onOuvrirAgence={onOuvrirAgence} onDecision={() => charger()} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* ── À faire aujourd'hui ── */}
        <Carte className="self-start">
          <TitreCarte droite={<span className="chiffres text-legende text-encre-2">{d.taches.length} à faire</span>}>À faire aujourd'hui</TitreCarte>
          {rienAFaire ? (
            <Vide titre="Rien à faire aujourd'hui" texte="Aucune tâche ni RDV en attente. Une session de call remplira la journée." action={<Bouton onClick={() => onNaviguer?.("agenda")}>Voir l'agenda</Bouton>} />
          ) : (
            <div className="border-t border-trait">
              {groupes.rdv.length ? (
                <section>
                  <h3 className="bg-signature-doux px-5 py-1.5 text-colonne font-semibold uppercase tracking-[0.07em] text-signature">RDV du jour · {groupes.rdv.length}</h3>
                  <ul>{groupes.rdv.map((t) => ligneTache(t))}</ul>
                </section>
              ) : null}
              {MOMENTS.map((m) => {
                const liste = groupes[m.code]
                if (!liste.length) return null
                return (
                  <section key={m.code}>
                    <h3 className={"px-5 py-1.5 text-colonne font-semibold uppercase tracking-[0.07em] " + (m.alerte ? "bg-alerte-fond text-alerte" : "bg-fond-2 text-encre-2")}>{m.libelle} · {liste.length}</h3>
                    <ul>{liste.map((t) => ligneTache(t, m.code === "enRetard"))}</ul>
                  </section>
                )
              })}
            </div>
          )}
        </Carte>

        <div className="grid content-start gap-4">
          {/* ── L'objectif du mois ── */}
          <Carte>
            <TitreCarte droite={<span className="text-legende text-encre-2">{maintenant.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</span>}>Objectif du mois</TitreCarte>
            <div className="px-5 pb-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-legende font-medium text-encre">Premiers OS reçus</span>
                {editionObjectif ? (
                  <form onSubmit={enregistrerObjectif} className="flex items-center gap-1.5">
                    <Champ type="number" min={1} step={1} value={saisieObjectif} onChange={(e) => setSaisieObjectif(e.target.value)} aria-label="Objectif d'OS par mois" className="h-7! w-20" autoFocus />
                    <Bouton type="submit" taille="sm" chargement={occupe}>OK</Bouton>
                    <Bouton taille="sm" variante="discret" onClick={() => setEditionObjectif(false)}>Annuler</Bouton>
                  </form>
                ) : (
                  <button type="button" onClick={ouvrirEditionObjectif} className="inline-flex items-center gap-1 text-legende text-encre-2 hover:text-encre" title="Modifier l'objectif du mois">
                    {d.objectif > 0 ? <>objectif <b className="chiffres font-semibold text-encre">{d.objectif}</b></> : "fixer un objectif"} <Pencil size={12} />
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="chiffres text-section font-semibold text-encre">{d.osRecus}</span>
                {d.objectif > 0 ? <span className="chiffres text-legende text-encre-2">/ {d.objectif}</span> : null}
                {d.objectif > 0 ? <Pastille role={progression.atteint ? "fait" : "attente"} point className="ml-auto">{progression.atteint ? "objectif atteint" : `reste ${progression.reste}`}</Pastille> : null}
              </div>
              <div className="mt-2 h-[10px] w-full overflow-hidden rounded-3 bg-fond-3" role="presentation">
                <i className="block h-full rounded-3 bg-action transition-[width]" style={{ width: `${progression.pct}%` }} />
              </div>
              <p className="mt-1.5 text-colonne text-encre-2">Agences dont le premier ordre de service est daté de ce mois.</p>
            </div>
          </Carte>
        </div>
      </div>

      {/* ── Le classement des commerciaux : tout le monde, même à zéro, pleine largeur ── */}
      <Carte className="mt-4">
        <TitreCarte droite={<Onglets valeur={periode} onChange={setPeriode} options={PERIODES.map((p) => ({ id: p.code, label: p.libelle }))} />}>Classement des commerciaux</TitreCarte>
        <TableauStats stats={d.classements[periode]} vide="Aucun appel sur cette période." />
      </Carte>

      {/* ── Où en est la base ── */}
      <Carte className="mt-4">
        <TitreCarte droite={<span className="chiffres text-legende text-encre-2">{totalBase} agence{s(totalBase)}</span>}>Où en est la base</TitreCarte>
        <div className="px-5 pb-5">
          {totalBase === 0 ? (
            <Vide titre="La base est vide" texte="Aucune agence pour l'instant : ajoute-en depuis la page Agences." action={<Bouton onClick={() => onNaviguer?.("agences")}>Voir les agences</Bouton>} />
          ) : (
            <>
              <div className="flex h-7 w-full overflow-hidden rounded-4 border border-trait" role="img" aria-label={segments.map((x) => `${x.libelle} : ${x.n}`).join(", ")}>
                {segments.filter((x) => x.n > 0).map((x) => (
                  <button type="button" key={x.code} style={{ flexGrow: x.n, flexBasis: 0 }} title={`${x.libelle} : ${x.n} (${x.pct} %) · voir ces agences`} onClick={() => onOuvrirEtape?.(x.code)} className={`chiffres flex min-w-[3px] cursor-pointer items-center justify-center overflow-hidden border-r border-fond text-colonne font-semibold last:border-r-0 hover:brightness-95 ${x.fond} ${x.texte}`}>
                    {x.pct >= 5 ? x.n : ""}
                  </button>
                ))}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-legende">
                {segments.map((x) => (
                  <li key={x.code}>
                    <button type="button" onClick={() => onOuvrirEtape?.(x.code)} title={`Voir les agences « ${x.libelle} »`} className="flex items-center gap-1.5 rounded-3 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature">
                      <span className={`h-2.5 w-2.5 rounded-3 border border-trait ${x.fond}`} />
                      <span className="text-encre-2">{x.libelle}</span>
                      <b className="chiffres font-semibold text-encre">{x.n}</b>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid gap-1 text-legende text-encre-2 sm:grid-cols-2">
                <p><b className="chiffres font-semibold text-encre">{d.jamaisJointes}</b> agence{s(d.jamaisJointes)} active{s(d.jamaisJointes)} jamais jointe{s(d.jamaisJointes)}.</p>
                <p><b className="chiffres font-semibold text-encre">{d.reveils}</b> endormie{s(d.reveils)} qui se réveille{d.reveils > 1 ? "nt" : ""} cette semaine.</p>
              </div>
            </>
          )}
        </div>
      </Carte>

      {/* ── Reporter une tâche ── */}
      {report ? (
        <Dialogue
          titre={`Reporter « ${report.tache.titre || (report.tache.type === "rdv" ? "RDV" : "Tâche")} »`}
          description={`${report.tache.agenceNom}${report.tache.echeance ? ` · prévu ${libelleRelatif(report.tache.echeance, maintenant)} à ${heureCourte(report.tache.echeance)}` : ""}`}
          onFermer={() => setReport(null)}
          pied={<><Bouton onClick={() => setReport(null)}>Annuler</Bouton><Bouton variante="plein" form="form-report" type="submit" chargement={occupe}>Reporter</Bouton></>}
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <Bouton taille="sm" disabled={occupe} onClick={() => reporterA(report.tache, demainA(new Date()))}>Demain 10 h</Bouton>
            <Bouton taille="sm" disabled={occupe} onClick={() => reporterA(report.tache, dansNJoursA(new Date(), 3))}>Dans 3 jours, 10 h</Bouton>
          </div>
          <form id="form-report" onSubmit={validerReportLibre} className="grid gap-3 sm:grid-cols-2">
            <Etiquette texte="Date"><Champ type="date" value={report.jour} onChange={(e) => setReport({ ...report, jour: e.target.value })} required /></Etiquette>
            <Etiquette texte="Heure"><Champ type="time" value={report.heure} onChange={(e) => setReport({ ...report, heure: e.target.value })} required /></Etiquette>
          </form>
        </Dialogue>
      ) : null}
    </div>
  )
}

/** Le classement : rang, commercial, appels, joints (et le taux), intéressés, RDV, pas intéressés, premiers OS, temps de parole. */
function TableauStats({ stats, vide }: { stats: StatsCompte[]; vide: string }) {
  if (stats.length === 0) return <p className="px-5 pb-4 text-legende text-encre-2">{vide}</p>
  const total = totalStats(stats)
  const ligne = (x: StatsCompte, rang: number | null) => (
    <tr key={x.compteId ?? x.compteNom} className={rang === null ? "font-semibold" : rang === 1 && x.appels > 0 ? "bg-signature-doux/40" : ""}>
      <Td num className="w-10 text-encre-2">{rang === null ? "" : rang === 1 && x.appels > 0 ? <span className="font-semibold text-signature">1er</span> : `${rang}e`}</Td>
      <Td className="truncate font-medium">{x.compteNom}</Td>
      <Td num>{x.appels}</Td>
      <Td num>{x.joints} <span className="text-encre-2">· {tauxJoints(x)} %</span></Td>
      <Td num>{x.interesses}</Td>
      <Td num>{x.rdv}</Td>
      <Td num>{x.pasInteresses}</Td>
      <Td num className={x.premiersOs > 0 ? "font-semibold text-ok" : ""}>{x.premiersOs}</Td>
      <Td num>{dureeLisible(x.dureeS) || "—"}</Td>
    </tr>
  )
  return (
    <Tableau className="pb-2">
      <thead><tr><Th num>#</Th><Th>Commercial</Th><Th num>Appels</Th><Th num>Joints</Th><Th num>Intér.</Th><Th num>RDV</Th><Th num>Pas intér.</Th><Th num>1ers OS</Th><Th num>Parole</Th></tr></thead>
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
