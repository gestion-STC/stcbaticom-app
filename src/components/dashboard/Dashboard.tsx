import { useEffect, useMemo, useState } from "react"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
} from "recharts"
import { Users, Flag, PhoneOutgoing, PhoneCall, Target, Repeat, Trophy, Mail } from "lucide-react"
import { palette, statutsParDefaut, type Statut } from "../../statuts"
import type { Prospect } from "../../data"
import { prospects as prospectsDemo } from "../../data"
import type { Appel } from "../../appels"
import { supabaseConfigure } from "../../lib/supabase"
import { chargerProspects } from "../../lib/prospectsDb"
import { chargerStatuts } from "../../lib/statutsDb"
import { chargerAppels } from "../../lib/appelsDb"
import { chargerEmailsEnvoyes, type EmailEnvoye } from "../../lib/emailsEnvoyesDb"
import BandeauErreur from "../BandeauErreur"

const OBJECTIF_MENSUEL = 20

function dateAujourdhui(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
}

export default function Dashboard() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [statuts, setStatuts] = useState<Statut[]>(statutsParDefaut)
  const [appels, setAppels] = useState<Appel[]>([])
  const [emailsEnvoyes, setEmailsEnvoyes] = useState<EmailEnvoye[]>([])
  const [periode, setPeriode] = useState<"jour" | "semaine" | "mois">("semaine")
  const [erreur, setErreur] = useState<string | null>(null)

  const labelPeriode =
    periode === "jour" ? "aujourd'hui" : periode === "semaine" ? "7 jours" : "30 jours"

  // Appels dans la période sélectionnée
  const appelsPeriode = useMemo(() => {
    const now = new Date()
    let limite: number
    if (periode === "jour") {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      limite = d.getTime()
    } else {
      limite = now.getTime() - (periode === "semaine" ? 7 : 30) * 86400000
    }
    return appels.filter((a) => a.horodatage && new Date(a.horodatage).getTime() >= limite)
  }, [appels, periode])

  useEffect(() => {
    if (!supabaseConfigure) {
      setProspects(prospectsDemo)
      return
    }
    chargerProspects()
      .then(setProspects)
      .catch((e) => setErreur(e instanceof Error ? e.message : "Erreur inconnue"))
    chargerStatuts()
      .then((rows) => rows.length && setStatuts(rows))
      .catch(() => {})
    chargerAppels()
      // Les stats de prospection ne comptent que les appels SORTANTS (un appel entrant
      // n'est ni une tentative de démarchage, ni un « décroché » à créditer).
      .then((rows) => setAppels(rows.filter((a) => a.sens !== "entrant")))
      .catch(() => {})
    chargerEmailsEnvoyes()
      .then(setEmailsEnvoyes)
      .catch(() => {})
  }, [])

  // Stratégie de démarchage : 1er contact gagnant + recette moyenne avant l'OS
  const strategie = useMemo(() => {
    const objectifLibelles = statuts.filter((s) => s.estObjectif).map((s) => s.libelle)
    const convertis = new Set(
      prospects.filter((p) => p.id && objectifLibelles.includes(p.statut)).map((p) => p.id),
    )
    type Agg = { appels: number; emails: number; events: { type: "email" | "appel"; ts: string }[] }
    const parProspect: Record<string, Agg> = {}
    const get = (id: string) => (parProspect[id] ??= { appels: 0, emails: 0, events: [] })
    appels.forEach((a) => {
      const d = get(a.prospectId)
      d.appels++
      if (a.horodatage) d.events.push({ type: "appel", ts: a.horodatage })
    })
    emailsEnvoyes.forEach((e) => {
      const d = get(e.prospectId)
      d.emails++
      if (e.envoyeLe) d.events.push({ type: "email", ts: e.envoyeLe })
    })
    let emailFirst = 0, emailFirstConv = 0, appelFirst = 0, appelFirstConv = 0
    let nbConv = 0, convEmails = 0, convAppels = 0
    Object.entries(parProspect).forEach(([id, d]) => {
      if (!d.events.length) return
      d.events.sort((a, b) => (a.ts < b.ts ? -1 : 1))
      const premier = d.events[0].type
      const conv = convertis.has(id)
      if (premier === "email") { emailFirst++; if (conv) emailFirstConv++ }
      else { appelFirst++; if (conv) appelFirstConv++ }
      if (conv) { nbConv++; convEmails += d.emails; convAppels += d.appels }
    })
    return {
      nbConv,
      tauxEmail: emailFirst ? Math.round((emailFirstConv / emailFirst) * 100) : null,
      tauxAppel: appelFirst ? Math.round((appelFirstConv / appelFirst) * 100) : null,
      moyEmails: nbConv ? Math.round((convEmails / nbConv) * 10) / 10 : null,
      moyAppels: nbConv ? Math.round((convAppels / nbConv) * 10) / 10 : null,
    }
  }, [prospects, statuts, appels, emailsEnvoyes])

  const stats = useMemo(() => {
    const parEtat: Record<string, number> = {}
    prospects.forEach((p) => (parEtat[p.statut] = (parEtat[p.statut] ?? 0) + 1))
    const objectifLibelles = statuts.filter((s) => s.estObjectif).map((s) => s.libelle)
    const demandesOS = prospects.filter((p) => objectifLibelles.includes(p.statut)).length
    const auj = dateAujourdhui()
    // tolère une heure après la date ("JJ/MM/AAAA HH:MM")
    const relancesAuj = prospects.filter((p) => (p.prochaineRelance || "").startsWith(auj)).length
    return { parEtat, demandesOS, relancesAuj }
  }, [prospects, statuts])

  // Activité d'appels sur la période + taux de décroché
  const activite = useMemo(() => {
    const total = appelsPeriode.length
    const decroche = appelsPeriode.filter((a) => a.resultat === "Décroché").length
    return { total, decroche, taux: total ? Math.round((decroche / total) * 100) : 0 }
  }, [appelsPeriode])

  // Transformation sur la période : conversions + appels avant la 1re demande d'OS
  const transformation = useMemo(() => {
    const objectifLibelles = statuts.filter((s) => s.estObjectif).map((s) => s.libelle)
    const appelsParProspect: Record<string, number> = {}
    appelsPeriode.forEach((a) => {
      appelsParProspect[a.prospectId] = (appelsParProspect[a.prospectId] ?? 0) + 1
    })
    // Prospects convertis dans la période = appel de la période ayant amené à un état objectif
    const convertisIds = new Set(
      appelsPeriode.filter((a) => objectifLibelles.includes(a.nouvelEtat)).map((a) => a.prospectId),
    )
    const prospectsAppeles = new Set(appelsPeriode.map((a) => a.prospectId)).size
    const nb = convertisIds.size
    const totalAppels = [...convertisIds].reduce((s, id) => s + (appelsParProspect[id] ?? 0), 0)
    return {
      nb,
      prospectsAppeles,
      taux: prospectsAppeles ? Math.round((nb / prospectsAppeles) * 100) : null,
      moyenneAppels: nb ? Math.round((totalAppels / nb) * 10) / 10 : null,
    }
  }, [statuts, appelsPeriode])

  // Courbe : appels par jour sur 14 jours (décroché vs autres)
  const evolution = useMemo(() => {
    const map: Record<string, { decroche: number; autres: number }> = {}
    appels.forEach((a) => {
      const d = (a.horodatage ?? "").slice(0, 10)
      if (!d) return
      map[d] = map[d] ?? { decroche: 0, autres: 0 }
      if (a.resultat === "Décroché") map[d].decroche++
      else map[d].autres++
    })
    const t = new Date()
    const jours = []
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(t.getFullYear(), t.getMonth(), t.getDate() - i)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
      const m = map[key] ?? { decroche: 0, autres: 0 }
      jours.push({
        jour: `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`,
        decroche: m.decroche,
        autres: m.autres,
      })
    }
    return jours
  }, [appels])

  const aDesAppels = appels.length > 0

  const donut = useMemo(
    () =>
      statuts
        .map((s) => ({
          libelle: s.libelle,
          valeur: stats.parEtat[s.libelle] ?? 0,
          couleur: palette[s.couleur].dot,
        }))
        .filter((d) => d.valeur > 0),
    [statuts, stats],
  )

  const progression = Math.min(100, Math.round((stats.demandesOS / OBJECTIF_MENSUEL) * 100))

  return (
    <div className="space-y-5 px-8 pb-10">
      {erreur && <BandeauErreur message={erreur} />}
      {/* Sélecteur de période (pilote les chiffres d'activité) */}
      <div className="flex items-center justify-end gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm w-fit ml-auto">
        {([
          ["jour", "Aujourd'hui"],
          ["semaine", "7 jours"],
          ["mois", "30 jours"],
        ] as const).map(([id, lib]) => (
          <button
            key={id}
            onClick={() => setPeriode(id)}
            className={
              "rounded-md px-3 py-1.5 font-medium transition-colors " +
              (periode === id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50")
            }
          >
            {lib}
          </button>
        ))}
      </div>

      {/* Cartes de chiffres */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Carte label="Prospects au total" valeur={prospects.length.toLocaleString("fr-FR")} icon={Users} teinte="bg-blue-50" couleur="text-blue-600" />
        <Carte label="Demandes d'OS envoyées" valeur={String(stats.demandesOS)} icon={Flag} teinte="bg-emerald-50" couleur="text-emerald-600" />
        <Carte label="Relances aujourd'hui" valeur={String(stats.relancesAuj)} icon={PhoneOutgoing} teinte="bg-orange-50" couleur="text-orange-500" />
        <Carte
          label={`Appels (${labelPeriode})`}
          valeur={activite.total > 0 ? String(activite.total) : "—"}
          sousLigne={activite.total > 0 ? `${activite.taux}% décroché` : "aucun appel sur la période"}
          icon={PhoneCall}
          teinte="bg-violet-50"
          couleur="text-violet-600"
        />
      </div>

      {/* Transformation */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-emerald-600" />
            <h2 className="text-base font-semibold text-slate-900">Taux de transformation</h2>
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {transformation.taux != null ? `${transformation.taux} %` : "—"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {transformation.nb} demande{transformation.nb > 1 ? "s" : ""} d'OS sur{" "}
            {transformation.prospectsAppeles} prospect
            {transformation.prospectsAppeles > 1 ? "s" : ""} appelé
            {transformation.prospectsAppeles > 1 ? "s" : ""} ({labelPeriode})
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Repeat size={18} className="text-violet-600" />
            <h2 className="text-base font-semibold text-slate-900">
              Appels avant la 1re demande d'OS
            </h2>
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900">
            {transformation.moyenneAppels != null ? transformation.moyenneAppels : "—"}
            {transformation.moyenneAppels != null && (
              <span className="ml-1 text-base font-normal text-slate-400">appels en moyenne</span>
            )}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Nombre moyen d'appels avant qu'un gestionnaire envoie son 1er ordre de service
          </p>
        </div>
      </div>

      {/* Stratégie de démarchage qui marche */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-amber-500" />
          <h2 className="text-base font-semibold text-slate-900">
            Stratégie de démarchage qui marche
          </h2>
        </div>
        {strategie.nbConv === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            Ces analyses se rempliront avec vos premières conversions (prospects
            qui envoient un OS). Le logiciel comparera l'efficacité du 1er contact
            (email vs appel) et trouvera votre « recette gagnante ».
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                1er contact gagnant
              </p>
              <div className="mt-2 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <Mail size={14} className="text-blue-600" /> Email d'abord
                  </span>
                  <span className="font-semibold text-slate-900">
                    {strategie.tauxEmail != null ? `${strategie.tauxEmail} %` : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <PhoneCall size={14} className="text-violet-600" /> Appel d'abord
                  </span>
                  <span className="font-semibold text-slate-900">
                    {strategie.tauxAppel != null ? `${strategie.tauxAppel} %` : "—"}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">taux de conversion selon le 1er contact</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Recette moyenne avant l'OS
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {strategie.moyEmails ?? 0} mail{(strategie.moyEmails ?? 0) > 1 ? "s" : ""}
                <span className="text-slate-400"> · </span>
                {strategie.moyAppels ?? 0} appel{(strategie.moyAppels ?? 0) > 1 ? "s" : ""}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                sur {strategie.nbConv} prospect{strategie.nbConv > 1 ? "s" : ""} converti
                {strategie.nbConv > 1 ? "s" : ""}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Objectif mensuel + Anneau */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Objectif du mois</h2>
          <p className="mt-1 text-sm text-slate-500">Demandes d'ordre de service</p>
          <div className="mt-5 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900">{stats.demandesOS}</span>
            <span className="text-sm text-slate-400">/ {OBJECTIF_MENSUEL}</span>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progression}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-400">{progression}% de l'objectif</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Répartition par état</h2>
          <div className="mt-3 flex items-center gap-5">
            <div className="relative h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="valeur" nameKey="libelle" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="none">
                    {donut.map((d) => (
                      <Cell key={d.libelle} fill={d.couleur} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-slate-900">{prospects.length.toLocaleString("fr-FR")}</span>
                <span className="text-xs text-slate-400">Total</span>
              </div>
            </div>
            <ul className="flex-1 space-y-1.5">
              {donut.map((d) => (
                <li key={d.libelle} className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.couleur }} />
                    {d.libelle}
                  </span>
                  <span className="text-slate-400">{d.valeur}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Évolution des appels */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Appels par jour (14 jours)</h2>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Décroché</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Autres</span>
          </div>
        </div>
        {aDesAppels ? (
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evolution} barCategoryGap="20%">
                <XAxis dataKey="jour" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={1} />
                <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                <Bar dataKey="decroche" stackId="a" fill="#10b981" name="Décroché" radius={[0, 0, 0, 0]} />
                <Bar dataKey="autres" stackId="a" fill="#cbd5e1" name="Autres" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-4 py-8 text-center text-sm text-slate-400">
            Les appels apparaîtront ici dès que vous mènerez des sessions de call.
          </p>
        )}
      </div>
    </div>
  )
}

function Carte({
  label,
  valeur,
  sousLigne,
  icon: Icon,
  teinte,
  couleur,
}: {
  label: string
  valeur: string
  sousLigne?: string
  icon: typeof Users
  teinte: string
  couleur: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${teinte}`}>
        <Icon size={20} className={couleur} />
      </div>
      <p className="mt-3 text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{valeur}</p>
      {sousLigne && <p className="mt-1 text-xs text-slate-400">{sousLigne}</p>}
    </div>
  )
}
