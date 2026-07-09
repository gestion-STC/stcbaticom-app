import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Phone } from "lucide-react"
import type { Prospect } from "../data"
import { prospects as prospectsDemo } from "../data"
import type { Rdv } from "../rdv"
import { supabaseConfigure } from "../lib/supabase"
import { chargerProspects } from "../lib/prospectsDb"
import { chargerRdv, creerRdv, supprimerRdv } from "../lib/rdvDb"
import RdvJourModal from "./RdvJourModal"
import BandeauErreur from "./BandeauErreur"

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

function cleDateRelance(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/) // tolère une heure éventuelle après la date
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

export default function Calendrier() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [rdvs, setRdvs] = useState<Rdv[]>([])
  const [jourSel, setJourSel] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const today = new Date()
  const [annee, setAnnee] = useState(today.getFullYear())
  const [mois, setMois] = useState(today.getMonth())

  useEffect(() => {
    if (!supabaseConfigure) {
      setProspects(prospectsDemo)
      return
    }
    chargerProspects()
      .then(setProspects)
      .catch((e) => setErreur(e instanceof Error ? e.message : "Erreur inconnue"))
    rechargerRdv()
  }, [])

  function rechargerRdv() {
    chargerRdv()
      .then(setRdvs)
      .catch(() => {})
  }

  const relancesParDate = useMemo(() => {
    const m: Record<string, Prospect[]> = {}
    prospects.forEach((p) => {
      const k = cleDateRelance(p.prochaineRelance)
      if (k) (m[k] ??= []).push(p)
    })
    return m
  }, [prospects])

  const rdvParDate = useMemo(() => {
    const m: Record<string, Rdv[]> = {}
    rdvs.forEach((r) => (m[r.date] ??= []).push(r))
    return m
  }, [rdvs])

  const cellules = useMemo(() => {
    const premier = new Date(annee, mois, 1)
    const nbJours = new Date(annee, mois + 1, 0).getDate()
    let debut = premier.getDay()
    debut = debut === 0 ? 6 : debut - 1
    const cells: (number | null)[] = []
    for (let i = 0; i < debut; i++) cells.push(null)
    for (let j = 1; j <= nbJours; j++) cells.push(j)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [annee, mois])

  function changerMois(delta: number) {
    let m = mois + delta
    let a = annee
    if (m < 0) { m = 11; a-- }
    if (m > 11) { m = 0; a++ }
    setMois(m)
    setAnnee(a)
  }

  const cle = (j: number) =>
    `${annee}-${String(mois + 1).padStart(2, "0")}-${String(j).padStart(2, "0")}`
  const estAujourdhui = (j: number) =>
    annee === today.getFullYear() && mois === today.getMonth() && j === today.getDate()

  function ajouterRdv(r: {
    prospectId: string | null
    titre: string
    telephone: string
    type: string
    heure: string
    note: string
  }) {
    if (!jourSel) return
    creerRdv({ ...r, date: jourSel })
      .then(rechargerRdv)
      .catch(() => {})
  }
  function retirerRdv(id: string) {
    supprimerRdv(id).then(rechargerRdv).catch(() => {})
  }

  const jourLisible = jourSel
    ? `${Number(jourSel.slice(8, 10))} ${MOIS[Number(jourSel.slice(5, 7)) - 1]} ${jourSel.slice(0, 4)}`
    : ""

  return (
    <div className="px-8 pb-10">
      {erreur && <BandeauErreur message={erreur} />}
      {jourSel && (
        <RdvJourModal
          dateLisible={jourLisible}
          rdvs={rdvParDate[jourSel] ?? []}
          prospects={prospects}
          onClose={() => setJourSel(null)}
          onAjouter={ajouterRdv}
          onSupprimer={retirerRdv}
        />
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold capitalize text-slate-900">
            {MOIS[mois]} {annee}
          </h2>
          <div className="flex gap-1">
            <button onClick={() => changerMois(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => { setAnnee(today.getFullYear()); setMois(today.getMonth()) }}
              className="rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50"
            >
              Aujourd'hui
            </button>
            <button onClick={() => changerMois(1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400">
          {JOURS.map((j) => (
            <div key={j} className="py-1">{j}</div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {cellules.map((j, i) => {
            if (j === null) return <div key={i} className="min-h-20 rounded-lg" />
            const k = cle(j)
            const relances = relancesParDate[k] ?? []
            const rdvJour = rdvParDate[k] ?? []
            return (
              <button
                key={i}
                onClick={() => setJourSel(k)}
                className={
                  "min-h-20 rounded-lg border p-1.5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/30 " +
                  (estAujourdhui(j) ? "border-blue-400 bg-blue-50/40" : "border-slate-100")
                }
              >
                <span className={"text-xs font-medium " + (estAujourdhui(j) ? "text-blue-600" : "text-slate-500")}>
                  {j}
                </span>
                <div className="mt-1 space-y-1">
                  {rdvJour.slice(0, 2).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-1 truncate rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700"
                      title={`RDV ${r.heure} — ${r.entreprise}`}
                    >
                      <Phone size={9} /> {r.heure} {r.entreprise}
                    </div>
                  ))}
                  {relances.slice(0, 1).map((p, m) => (
                    <div key={m} className="truncate rounded bg-orange-50 px-1.5 py-0.5 text-[11px] text-orange-700" title={`Relance : ${p.entreprise}`}>
                      {p.entreprise}
                    </div>
                  ))}
                  {rdvJour.length + relances.length > 3 && (
                    <div className="px-1 text-[11px] text-slate-400">
                      +{rdvJour.length + relances.length - 3}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          <span className="mr-3"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500 align-middle" />RDV (cliquez un jour pour en ajouter)</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-400 align-middle" />Relances</span>
        </p>
      </div>
    </div>
  )
}
