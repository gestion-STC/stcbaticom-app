import { useEffect, useState, type ReactNode } from "react"
import { Loader2, AlertTriangle, Send, MousePointerClick, FileCheck2, Target, FileText, Flame } from "lucide-react"
import type { SousTraitant, PilotageST } from "../../recrutement"
import { supabaseConfigure } from "../../lib/supabase"
import { chargerSousTraitants } from "../../lib/sousTraitantsDb"
import { chargerPilotage } from "../../lib/pilotageStDb"

const JOUR_MS = 86_400_000

export default function SuiviST() {
  const [liste, setListe] = useState<SousTraitant[]>([])
  const [pilotage, setPilotage] = useState<PilotageST | null>(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState("")

  useEffect(() => {
    if (!supabaseConfigure) {
      setErreur("Base non configurée.")
      setChargement(false)
      return
    }
    Promise.all([chargerSousTraitants(), chargerPilotage()])
      .then(([l, p]) => {
        setListe(l)
        setPilotage(p)
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
      .finally(() => setChargement(false))
  }, [])

  if (chargement)
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
        <Loader2 size={18} className="animate-spin" /> Chargement…
      </div>
    )

  // Étapes du tunnel (mesures cumulées, pas des statuts exclusifs).
  const base = liste.length
  const contactes = liste.filter((s) => s.demarreLe).length // entrés en séquence (au moins un envoi programmé)
  const impressions = liste.filter((s) => s.dernierClicLe).length // ont cliqué le lien
  const conversions = liste.filter((s) => s.deposeLe || s.statut === "depose").length // ont déposé

  // Signaux d'intérêt à relancer À LA MAIN.
  const aDepose = (s: SousTraitant) => !!s.deposeLe || s.statut === "depose"
  const baremeVus = liste
    .filter((s) => s.baremeVuLe)
    .sort((a, b) => new Date(b.baremeVuLe!).getTime() - new Date(a.baremeVuLe!).getTime())
  // Intéressés « chauds » : ont cliqué candidater mais N'ONT PAS déposé leur dossier.
  const candidatSansDepot = liste
    .filter((s) => s.candidatureClicLe && !aDepose(s))
    .sort((a, b) => new Date(b.candidatureClicLe!).getTime() - new Date(a.candidatureClicLe!).getTime())

  // Objectif de la semaine (7 jours glissants).
  const depuis7j = Date.now() - 7 * JOUR_MS
  const convSemaine = liste.filter((s) => s.deposeLe && new Date(s.deposeLe).getTime() >= depuis7j).length
  const objectif = pilotage?.objectifHebdo ?? 0

  const pct = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 100) : 0)

  const etapes = [
    { label: "Contactés", valeur: contactes, ref: base, icone: <Send size={16} />, couleur: "bg-blue-500", texte: "text-blue-700" },
    { label: "Impressions (clics)", valeur: impressions, ref: contactes, icone: <MousePointerClick size={16} />, couleur: "bg-amber-500", texte: "text-amber-600" },
    { label: "Conversions (dossiers déposés)", valeur: conversions, ref: impressions, icone: <FileCheck2 size={16} />, couleur: "bg-emerald-500", texte: "text-emerald-600" },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-8 pb-10">
      {erreur && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {erreur}
        </div>
      )}

      {/* Objectif de la semaine */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Target size={16} className="text-blue-600" /> Objectif de la semaine
        </div>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-3xl font-bold text-slate-900">{convSemaine}</span>
          <span className="mb-1 text-sm text-slate-500">/ {objectif} sous-traitant(s) recruté(s) (7 derniers jours)</span>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${objectif > 0 ? Math.min(100, (convSemaine / objectif) * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* Le tunnel */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold text-slate-700">Tunnel de conversion</h3>
        <p className="mb-4 text-xs text-slate-400">
          Sur {base} sous-traitant(s) dans la base. Chaque pourcentage compare une étape à la précédente.
        </p>
        <div className="space-y-4">
          {etapes.map((e) => (
            <div key={e.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className={e.texte}>{e.icone}</span> {e.label}
                </span>
                <span className="text-slate-500">
                  <b className="text-slate-800">{e.valeur}</b>
                  <span className="ml-2 text-xs text-slate-400">{pct(e.valeur, e.ref)}% de l'étape précédente</span>
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={"h-full rounded-full transition-all " + e.couleur} style={{ width: `${pct(e.valeur, base)}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Taux global base → dépôt */}
        <div className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-600">
          Taux global : <b className="text-emerald-600">{pct(conversions, base)}%</b> de la base a déposé un dossier.
        </div>
      </div>

      {/* Signaux d'intérêt — à relancer À LA MAIN */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ListeInteresses
          titre="Ont consulté le barème"
          icone={<FileText size={16} className="text-blue-600" />}
          items={baremeVus}
          dateOf={(s) => s.baremeVuLe ?? null}
          vide="Personne n'a encore ouvert le barème."
        />
        <ListeInteresses
          titre="« Candidater » cliqué, sans dépôt"
          icone={<Flame size={16} className="text-orange-500" />}
          items={candidatSansDepot}
          dateOf={(s) => s.candidatureClicLe ?? null}
          vide="Aucun intéressé en attente de dépôt."
        />
      </div>
    </div>
  )
}

// Carte listant des sous-traitants « intéressés » (barème vu / candidature cliquée
// sans dépôt) — la matière à relancer à la main.
function ListeInteresses({
  titre,
  icone,
  items,
  dateOf,
  vide,
}: {
  titre: string
  icone: ReactNode
  items: SousTraitant[]
  dateOf: (s: SousTraitant) => string | null
  vide: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">{icone} {titre}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">{vide}</p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {items.map((s) => {
            const d = dateOf(s)
            return (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5 text-[13px]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{s.entreprise || s.contact || "—"}</span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {[s.metier, s.telephone || s.email].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                {d && <span className="shrink-0 text-[11px] text-slate-400">{new Date(d).toLocaleDateString("fr-FR")}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
