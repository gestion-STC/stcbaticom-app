// L'AGENDA FAÇON GOOGLE AGENDA (Mahdi, 11/11/2026, maquette validée) : la grille commune aux deux agendas
// (gestionnaires, sous-traitants). Chaque agenda lui donne SES agendas à cocher, ses événements et sa bulle.
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react"
import { HAUTEUR_HEURE, HEURE_DEBUT, HEURE_FIN, hauteurMaintenant, joursDuMois, jourIso, memeJourDate, placerJournee, type Vue } from "../../lib/agendaGrille"
export type { Vue } from "../../lib/agendaGrille"
import { estFerie } from "../../prospection/moteur"

export type AgendaDef = { id: string; nom: string; couleur: string }
export type EvAgenda = {
  id: string; agenda: string; titre: string; detail?: string
  /** null : toute la journée (retards, appels de campagne, jours fériés). */
  debut: Date | null
  jour: Date
  dureeMin?: number; fait?: boolean; retard?: boolean
}
export type Bulle = { quand?: string; lignes: ReactNode; boutons?: ReactNode; icones?: ReactNode }

const JOURS_COURTS = ["LUN.", "MAR.", "MER.", "JEU.", "VEN.", "SAM.", "DIM."]
const COULEUR_FERIE = "#6b6b70"
const debutJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const plusJours = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const lundi = (d: Date) => plusJours(debutJour(d), -((d.getDay() + 6) % 7))
const heure = (d: Date) => (d.getMinutes() ? `${d.getHours()} h ${String(d.getMinutes()).padStart(2, "0")}` : `${d.getHours()} h`)
const moisAnnee = (d: Date) => { const s = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); return s.charAt(0).toUpperCase() + s.slice(1) }
const numeroSemaine = (d: Date) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const j = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - j); const a = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t.getTime() - a.getTime()) / 86_400_000 + 1) / 7) }

function lireCaches(cle: string): string[] { try { const l = JSON.parse(localStorage.getItem(cle) ?? "[]"); return Array.isArray(l) ? l : [] } catch { return [] } }

export default function CalendrierGoogle(p: {
  cle: string; titre: string; sousTitre?: string
  agendas: AgendaDef[]; evenements: EvAgenda[]; chargement: boolean; erreur?: ReactNode
  vue: Vue; onVue: (v: Vue) => void; ancre: Date; onAncre: (d: Date) => void; maintenant: Date
  creer?: { libelle: string; onClick: () => void }[]
  barre?: ReactNode
  bulle: (ev: EvAgenda, fermer: () => void) => Bulle
}) {
  const { vue, ancre, maintenant } = p
  const [caches, setCaches] = useState<string[]>(() => lireCaches(p.cle))
  const [mini, setMini] = useState(() => new Date(ancre.getFullYear(), ancre.getMonth(), 1))
  const [menuCreer, setMenuCreer] = useState(false)
  const [ouvert, setOuvert] = useState<{ ev: EvAgenda; x: number; y: number } | null>(null)
  const defile = useRef<HTMLDivElement>(null)
  const basculer = (id: string) => setCaches((c) => { const n = c.includes(id) ? c.filter((x) => x !== id) : [...c, id]; try { localStorage.setItem(p.cle, JSON.stringify(n)) } catch { /* sans mémoire */ } return n })
  const couleur = useMemo(() => new Map(p.agendas.map((a) => [a.id, a.couleur])), [p.agendas])
  const visibles = useMemo(() => p.evenements.filter((e) => !caches.includes(e.agenda)), [p.evenements, caches])
  const jours = useMemo(() => (vue === "jour" ? [debutJour(ancre)] : vue === "semaine" ? Array.from({ length: 7 }, (_, i) => plusJours(lundi(ancre), i)) : []), [vue, ancre])
  const fermer = () => setOuvert(null)
  useEffect(() => { if (defile.current) defile.current.scrollTop = (8 - HEURE_DEBUT) * HAUTEUR_HEURE }, [vue])
  useEffect(() => { if (!ouvert) return; const f = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(null) }; window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f) }, [ouvert])

  const decaler = (sens: 1 | -1) => p.onAncre(vue === "jour" ? plusJours(ancre, sens) : vue === "semaine" ? plusJours(ancre, 7 * sens) : new Date(ancre.getFullYear(), ancre.getMonth() + sens, 1))
  const ouvrir = (ev: EvAgenda, e: MouseEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); setOuvert({ ev, x: r.right, y: r.top }) }
  const ferie = (d: Date) => estFerie(jourIso(d))
  const styleEv = (ev: EvAgenda) => {
    const c = ev.retard && !ev.fait ? "#c9302c" : couleur.get(ev.agenda) ?? "#6b6b70"
    return ev.fait ? { background: `${c}1f`, color: "#6b6b70", textDecoration: "line-through" } : { background: c, color: "#fff" }
  }
  const puce = (ev: EvAgenda) => (
    <button key={ev.id} type="button" onClick={(e) => ouvrir(ev, e)} title={[ev.titre, ev.detail].filter(Boolean).join(" · ")} style={styleEv(ev)}
      className="block w-full truncate rounded-[4px] px-1.5 py-[3px] text-left text-[12px] font-medium leading-[16px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signature">
      {ev.debut ? <b className="mr-1 font-semibold">{heure(ev.debut)}</b> : null}{ev.titre}
    </button>
  )
  const titrePeriode = vue === "mois" ? moisAnnee(ancre) : vue === "semaine" ? moisAnnee(jours[3] ?? ancre) : ancre.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

  return (
    <div className="flex min-h-[calc(100vh-24px)] flex-col bg-fond text-encre">
      {/* ── La barre du haut ── */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-[0.5px] border-trait px-6 py-3">
        <h1 className="min-w-[160px] text-[20px] font-medium">{p.titre}</h1>
        <button type="button" onClick={() => p.onAncre(new Date())} className="h-9 rounded-[6px] border-[0.5px] border-trait-fort px-4 text-legende font-medium hover:bg-fond-3">Aujourd'hui</button>
        <span className="flex">
          <button type="button" aria-label="Précédent" onClick={() => decaler(-1)} className="flex h-9 w-9 items-center justify-center rounded-full text-encre-2 hover:bg-fond-3"><ChevronLeft size={18} /></button>
          <button type="button" aria-label="Suivant" onClick={() => decaler(1)} className="flex h-9 w-9 items-center justify-center rounded-full text-encre-2 hover:bg-fond-3"><ChevronRight size={18} /></button>
        </span>
        <h2 className="text-[22px] font-normal first-letter:uppercase">{titrePeriode}</h2>
        {vue === "semaine" ? <span className="text-colonne text-encre-2">Semaine {numeroSemaine(jours[0] ?? ancre)}{p.sousTitre ? ` · ${p.sousTitre}` : ""}</span> : p.sousTitre ? <span className="text-colonne text-encre-2">{p.sousTitre}</span> : null}
        <span className="flex-1" />
        {p.barre}
        <div role="group" aria-label="Vue" className="flex overflow-hidden rounded-[6px] border-[0.5px] border-trait-fort">
          {(["jour", "semaine", "mois"] as Vue[]).map((v, i) => <button key={v} type="button" aria-pressed={vue === v} onClick={() => p.onVue(v)} className={`h-9 px-3.5 text-colonne ${i ? "border-l-[0.5px] border-trait-fort" : ""} ${vue === v ? "bg-fond-4 font-medium text-encre" : "text-encre-2 hover:bg-fond-3"}`}>{v === "jour" ? "Jour" : v === "semaine" ? "Semaine" : "Mois"}</button>)}
        </div>
      </header>
      {p.erreur}

      <div className="flex min-h-0 flex-1">
        {/* ── La colonne de gauche ── */}
        <aside className="hidden w-[256px] shrink-0 flex-col gap-6 p-4 lg:flex">
          {p.creer?.length ? (
            <div className="relative self-start">
              <button type="button" onClick={() => (p.creer!.length === 1 ? p.creer![0].onClick() : setMenuCreer((x) => !x))} className="flex h-[52px] items-center gap-3 rounded-[16px] bg-fond pl-4 pr-6 text-legende font-medium shadow-[0_1px_3px_rgba(17,17,19,0.18),0_4px_10px_rgba(17,17,19,0.08)] hover:bg-fond-2">
                <Plus size={22} className="text-signature" />Créer
              </button>
              {menuCreer ? <ul className="absolute left-0 top-full z-20 mt-1 w-48 rounded-[8px] bg-fond py-1 shadow-flottante">{p.creer.map((c) => <li key={c.libelle}><button type="button" className="w-full px-4 py-2 text-left text-legende hover:bg-fond-3" onClick={() => { setMenuCreer(false); c.onClick() }}>{c.libelle}</button></li>)}</ul> : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between text-legende font-medium">
              <span>{moisAnnee(mini)}</span>
              <span className="flex text-encre-2">
                <button type="button" aria-label="Mois précédent" onClick={() => setMini((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-fond-3"><ChevronLeft size={15} /></button>
                <button type="button" aria-label="Mois suivant" onClick={() => setMini((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-fond-3"><ChevronRight size={15} /></button>
              </span>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] text-encre-2">
              {["L", "M", "M", "J", "V", "S", "D"].map((j, i) => <span key={i} className="leading-6">{j}</span>)}
              {joursDuMois(mini).map((d) => {
                const auj = memeJourDate(d, maintenant), choisi = jours.some((j) => memeJourDate(j, d))
                return <button key={d.getTime()} type="button" onClick={() => p.onAncre(d)} aria-label={d.toLocaleDateString("fr-FR")} className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full leading-none ${auj ? "bg-signature font-semibold text-white" : choisi ? "bg-signature-doux text-encre" : d.getMonth() === mini.getMonth() ? "text-encre hover:bg-fond-3" : "text-encre-3 hover:bg-fond-3"}`}>{d.getDate()}</button>
              })}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-colonne font-semibold">Mes agendas</p>
            {p.agendas.map((a) => (
              <label key={a.id} className="flex min-h-[30px] cursor-pointer items-center gap-2.5 text-legende">
                <input type="checkbox" checked={!caches.includes(a.id)} onChange={() => basculer(a.id)} className="h-4 w-4" style={{ accentColor: a.couleur }} />{a.nom}
              </label>
            ))}
            <label className="flex min-h-[30px] cursor-pointer items-center gap-2.5 text-legende">
              <input type="checkbox" checked={!caches.includes("_ferie")} onChange={() => basculer("_ferie")} className="h-4 w-4" style={{ accentColor: COULEUR_FERIE }} />Jours fériés
            </label>
          </div>
        </aside>

        {/* ── La grille ── */}
        <main className="min-w-0 flex-1 border-l-[0.5px] border-trait">
          {p.chargement ? <p className="px-6 py-3 text-colonne text-encre-2">Lecture de l'agenda…</p> : null}
          {vue === "mois" ? (
            <div className="grid grid-cols-7">
              {JOURS_COURTS.map((j) => <span key={j} className="border-b-[0.5px] border-trait py-2 text-center text-[11px] font-medium tracking-[0.06em] text-encre-2">{j}</span>)}
              {joursDuMois(ancre).map((d) => {
                const duJour = visibles.filter((e) => memeJourDate(e.jour, d)).sort((a, b) => (a.debut?.getTime() ?? 0) - (b.debut?.getTime() ?? 0))
                const auj = memeJourDate(d, maintenant), hors = d.getMonth() !== ancre.getMonth()
                return (
                  <div key={d.getTime()} className={`min-h-[118px] border-b-[0.5px] border-l-[0.5px] border-trait p-1 first:border-l-0 ${hors ? "bg-fond-2" : ""}`}>
                    <button type="button" onClick={() => { p.onAncre(d); p.onVue("jour") }} className={`mx-auto mb-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] ${auj ? "bg-signature font-semibold text-white" : hors ? "text-encre-3" : "text-encre hover:bg-fond-3"}`}>{d.getDate()}</button>
                    <div className="space-y-0.5">
                      {ferie(d) && !caches.includes("_ferie") ? <span className="block truncate rounded-[4px] bg-fond-4 px-1.5 py-[2px] text-[11px] text-slate-700">Jour férié · aucun envoi</span> : null}
                      {duJour.slice(0, 3).map(puce)}
                      {duJour.length > 3 ? <button type="button" onClick={() => { p.onAncre(d); p.onVue("jour") }} className="w-full rounded-[4px] px-1.5 text-left text-[12px] font-medium text-encre-2 hover:bg-fond-3">{duJour.length - 3} de plus</button> : null}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <>
              {/* Les jours */}
              <div className="grid border-b-[0.5px] border-trait" style={{ gridTemplateColumns: `56px repeat(${jours.length}, minmax(0, 1fr))` }}>
                <span />
                {jours.map((d) => {
                  const auj = memeJourDate(d, maintenant), we = d.getDay() === 0 || d.getDay() === 6
                  return (
                    <div key={d.getTime()} className={`flex flex-col items-center gap-1 pb-1.5 pt-2.5 ${we ? "bg-fond-2" : ""}`}>
                      <span className={`text-[11px] tracking-[0.06em] ${auj ? "font-semibold text-signature" : "font-medium text-encre-2"}`}>{JOURS_COURTS[(d.getDay() + 6) % 7]}</span>
                      <button type="button" onClick={() => { p.onAncre(d); p.onVue("jour") }} className={`flex h-11 w-11 items-center justify-center rounded-full text-[24px] ${auj ? "bg-signature text-white" : we ? "text-encre-2 hover:bg-fond-3" : "text-encre hover:bg-fond-3"}`}>{d.getDate()}</button>
                    </div>
                  )
                })}
              </div>
              {/* Toute la journée */}
              <div className="grid border-b-[0.5px] border-trait-fort" style={{ gridTemplateColumns: `56px repeat(${jours.length}, minmax(0, 1fr))` }}>
                <span className="pr-2 pt-2 text-right text-[10px] text-encre-2">journée</span>
                {jours.map((d) => (
                  <div key={d.getTime()} className={`min-h-[30px] space-y-0.5 border-l-[0.5px] border-trait p-[3px] ${d.getDay() === 0 || d.getDay() === 6 ? "bg-fond-2" : ""}`}>
                    {ferie(d) && !caches.includes("_ferie") ? <span className="block truncate rounded-[4px] bg-fond-4 px-1.5 py-[3px] text-[12px] text-slate-700">Jour férié · aucun envoi</span> : null}
                    {visibles.filter((e) => !e.debut && memeJourDate(e.jour, d)).map(puce)}
                  </div>
                ))}
              </div>
              {/* Les heures */}
              <div ref={defile} className="max-h-[calc(100vh-250px)] min-h-[420px] overflow-y-auto">
                <div className="grid" style={{ gridTemplateColumns: `56px repeat(${jours.length}, minmax(0, 1fr))` }}>
                  <div>
                    {Array.from({ length: HEURE_FIN - HEURE_DEBUT }, (_, i) => <div key={i} className="relative pr-2 text-right text-[10px] text-encre-2" style={{ height: HAUTEUR_HEURE }}>{i ? <span className="relative -top-[7px]">{HEURE_DEBUT + i} h</span> : null}</div>)}
                  </div>
                  {jours.map((d) => {
                    const duJour = visibles.filter((e) => e.debut && memeJourDate(e.debut, d))
                    const places = placerJournee(duJour.map((e) => ({ id: e.id, debut: e.debut!, dureeMin: e.dureeMin ?? 30 })))
                    const ligne = memeJourDate(d, maintenant) ? hauteurMaintenant(maintenant) : null
                    return (
                      <div key={d.getTime()} className={`relative border-l-[0.5px] border-trait ${d.getDay() === 0 || d.getDay() === 6 ? "bg-fond-2" : ""}`} style={{ height: (HEURE_FIN - HEURE_DEBUT) * HAUTEUR_HEURE, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HAUTEUR_HEURE - 0.5}px, var(--color-trait) ${HAUTEUR_HEURE - 0.5}px, var(--color-trait) ${HAUTEUR_HEURE}px)` }}>
                        {duJour.map((ev) => {
                          const pl = places.get(ev.id)!, court = pl.hauteur < 34
                          return (
                            <button key={ev.id} type="button" onClick={(e) => ouvrir(ev, e)} title={[ev.titre, ev.detail].filter(Boolean).join(" · ")} style={{ ...styleEv(ev), top: pl.top, height: pl.hauteur, left: `calc(${pl.gauche}% + 2px)`, width: `calc(${pl.largeur}% - 8px)` }}
                              className="absolute overflow-hidden rounded-[4px] px-1.5 py-[2px] text-left text-[12px] leading-[15px] shadow-[0_0_0_1px_#fff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signature">
                              {court ? <span className="block truncate leading-[18px]"><b className="font-semibold">{heure(ev.debut!)}</b> {ev.titre}</span> : <><b className="block truncate font-semibold">{ev.titre}</b><span className="block truncate">{heure(ev.debut!)}{ev.detail ? ` · ${ev.detail}` : ""}</span></>}
                            </button>
                          )
                        })}
                        {ligne !== null ? <><span aria-hidden="true" className="absolute -left-[5px] right-0 h-[2px] bg-alerte" style={{ top: ligne }} /><span aria-hidden="true" className="absolute -left-[6px] h-3 w-3 rounded-full bg-alerte" style={{ top: ligne - 5 }} /></> : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* ── La bulle d'un événement ── */}
      {ouvert ? (() => {
        const b = p.bulle(ouvert.ev, fermer)
        const large = 360, gauche = ouvert.x + 10 + large > window.innerWidth ? Math.max(8, ouvert.x - large - 140) : ouvert.x + 10
        const haut = Math.min(Math.max(8, ouvert.y - 20), window.innerHeight - 340)
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={fermer} aria-hidden="true" />
            <div role="dialog" aria-label={ouvert.ev.titre} className="fixed z-50 flex max-h-[80vh] flex-col gap-3 overflow-y-auto rounded-[8px] bg-fond px-4 pb-4 pt-2 shadow-[0_4px_12px_rgba(17,17,19,0.14),0_16px_32px_rgba(17,17,19,0.12)]" style={{ left: gauche, top: haut, width: large }}>
              <div className="flex justify-end gap-0.5">{b.icones}<button type="button" aria-label="Fermer" onClick={fermer} className="flex h-9 w-9 items-center justify-center rounded-full text-encre-2 hover:bg-fond-3"><X size={18} /></button></div>
              <div className="flex items-start gap-3.5">
                <span className="mt-[5px] h-3.5 w-3.5 shrink-0 rounded-[4px]" style={{ background: ouvert.ev.retard && !ouvert.ev.fait ? "#c9302c" : couleur.get(ouvert.ev.agenda) }} />
                <div className="min-w-0">
                  <p className="text-[20px] leading-[26px]" style={ouvert.ev.fait ? { textDecoration: "line-through" } : undefined}>{ouvert.ev.titre}</p>
                  {b.quand ? <p className="text-colonne text-encre-2">{b.quand}</p> : null}
                </div>
              </div>
              <div className="space-y-2 pl-7 text-colonne">{b.lignes}</div>
              {b.boutons ? <div className="flex flex-wrap gap-2 pl-7">{b.boutons}</div> : null}
            </div>
          </>
        )
      })() : null}
    </div>
  )
}
