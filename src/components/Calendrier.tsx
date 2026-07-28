import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Phone } from "lucide-react"
import type { Prospect } from "../data"
import { prospects as prospectsDemo } from "../data"
import type { Rdv } from "../rdv"
import { supabaseConfigure } from "../lib/supabase"
import { chargerProspects, majProspect } from "../lib/prospectsDb"
import { chargerRdv, creerRdv, supprimerRdv, majRdv } from "../lib/rdvDb"
import { chargerNumeros, numeroPourProspect } from "../lib/numerosEmission"
import { lancerAppelRingover } from "../lib/ringover"
import { entrantActif } from "../lib/appelEntrantActif"
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
  // Appel Ringover depuis le calendrier (même moteur que les Sessions de call).
  const [numerosPool, setNumerosPool] = useState<string[]>([])
  const [appelMsg, setAppelMsg] = useState<{ ok: boolean; texte: string } | null>(null)
  const [appelEnCours, setAppelEnCours] = useState(false)
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
    chargerNumeros().then(setNumerosPool).catch(() => {})
    rechargerRdv()
  }, [])

  // Remonte la VRAIE raison d'un échec au lieu de l'avaler en silence : sans ça,
  // un RDV qui ne se déplace pas laisse croire à un simple bug d'affichage.
  function signaler(contexte: string) {
    return (e: unknown) => {
      console.error(contexte, e)
      setErreur(`${contexte} : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

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
      .catch(signaler("Création du RDV"))
  }
  function retirerRdv(id: string) {
    supprimerRdv(id).then(rechargerRdv).catch(signaler("Suppression du RDV"))
  }
  function modifierRdv(
    id: string,
    champs: Partial<{
      titre: string
      telephone: string
      type: string
      date: string // déplacer le RDV à un autre jour
      heure: string
      note: string
    }>,
  ) {
    majRdv(id, champs)
      .then(rechargerRdv)
      .catch(signaler(champs.date ? "Déplacement du RDV" : "Modification du RDV"))
  }

  // Appelle le contact d'un RDV via Ringover (comme dans les Sessions de call).
  // Mêmes garde-fous : jamais par-dessus un appel entrant, et un prospect est toujours
  // appelé avec SON numéro d'émission attribué (anti-spam).
  async function appelerRdv(r: Rdv) {
    const fiche = r.prospectId ? prospects.find((p) => p.id === r.prospectId) : undefined
    const numero = (fiche?.telephone || r.telephone || "").trim()
    if (!numero || appelEnCours) return

    if (entrantActif()) {
      setAppelMsg({ ok: false, texte: "Quelqu'un est en train de vous appeler — répondez d'abord." })
      setTimeout(() => setAppelMsg(null), 5000)
      return
    }

    let from = ""
    if (fiche && numerosPool.length) {
      const attribution = numeroPourProspect(fiche, numerosPool, prospects)
      if (attribution.bloque) {
        setAppelMsg({
          ok: false,
          texte:
            `Appel bloqué : ${fiche.entreprise || "ce prospect"} a toujours été appelé avec le ` +
            `${attribution.numero}, qui n'est plus en rotation. Réactivez-le dans le Paramétrage.`,
        })
        setTimeout(() => setAppelMsg(null), 8000)
        return
      }
      from = attribution.numero
      // 1re fois qu'on l'appelle : on lui attribue son numéro et on le retient.
      if (attribution.aEnregistrer && attribution.numero && fiche.id) {
        const id = fiche.id
        setProspects((arr) => arr.map((x) => (x.id === id ? { ...x, numeroEmission: attribution.numero } : x)))
        majProspect(id, { numero_emission: attribution.numero }).catch(() => {})
      }
    }

    setAppelEnCours(true)
    const res = await lancerAppelRingover(numero, from)
    setAppelEnCours(false)
    setAppelMsg(
      res.ok
        ? { ok: true, texte: "Appel lancé via Ringover — décrochez sur votre appli Ringover." }
        : { ok: false, texte: res.message ?? "L'appel n'a pas pu être lancé." },
    )
    setTimeout(() => setAppelMsg(null), res.ok ? 5000 : 8000)
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
          onModifier={modifierRdv}
          onAppeler={appelerRdv}
          appelMsg={appelMsg}
          appelEnCours={appelEnCours}
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
