// L'AGENDA, DANS LE DESSIN DU BUREAU DE STC BÂTIMENT (Mahdi, 11/11/2026) : la grille du mois recopiée de STC Bâtiment
// (src/components/admin/AgendaMois.tsx, dessin « bureau ») et la page qui l'entoure (AgendaVisitesTechniques : « Mes
// agendas » à gauche, une couleur par personne). La vue Semaine, absente de STC Bâtiment, est dessinée pareil.
// Le composant n'affiche que : chaque agenda (gestionnaires, sous-traitants) lui donne ses événements et sa fiche.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { HAUTEUR_HEURE, HEURE_DEBUT, HEURE_FIN, hauteurMaintenant, jourIso, memeJourDate, placerJournee, type Vue } from "../../lib/agendaGrille"
import { estFerie } from "../../prospection/moteur"
import { FENETRE, PETIT_GRIS, PETITE, PIED_FENETRE, PILULE_CLAIRE, ROND_MINI, SOUS_TITRE, TITRE_PAGE, adoucir, couleurDePersonne } from "./dessinBureau"

export type EvAgenda = {
  id: string; agenda: string; titre: string; detail?: string
  /** null : toute la journée (retards, demandes des campagnes). */
  debut: Date | null
  jour: Date
  dureeMin?: number; fait?: boolean; retard?: boolean
  /** La personne (sa couleur) ; vide : sans attribution. */
  personneId?: string | null; personneNom?: string
}
export type Bulle = { quand?: string; lignes: ReactNode; boutons?: ReactNode; icones?: ReactNode }
export type TypeAgenda = { id: string; nom: string }

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
const ROUGE = "#C9302C"
const debutJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const plusJours = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const lundi = (d: Date) => plusJours(debutJour(d), -((d.getDay() + 6) % 7))
const heure = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
const moisAnnee = (d: Date) => d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
const titreSemaine = (l: Date) => { const f = plusJours(l, 6); return l.getMonth() === f.getMonth() ? `Semaine du ${l.getDate()} au ${f.getDate()} ${moisAnnee(f)}` : `Semaine du ${l.getDate()} ${l.toLocaleDateString("fr-FR", { month: "long" })} au ${f.getDate()} ${moisAnnee(f)}` }
function lire(cle: string): string[] { try { const l = JSON.parse(localStorage.getItem(cle) ?? "[]"); return Array.isArray(l) ? l : [] } catch { return [] } }

export default function AgendaBureau(p: {
  cle: string; titre: string; sousTitre?: string
  /** « Commerciaux », « Personnes »… : le groupe des agendas à couleur. */
  groupe: string
  types: TypeAgenda[]; evenements: EvAgenda[]; chargement: boolean; erreur?: ReactNode
  vue: Vue; onVue: (v: Vue) => void; ancre: Date; onAncre: (d: Date) => void; maintenant: Date
  /** Les pilules à droite du titre (créer, Moi / Toute l'équipe). */
  actions?: ReactNode
  /** Un clic dans une case vide (créer ce jour-là). */
  onJour?: (jour: Date) => void; infobulleJour?: string
  bulle: (ev: EvAgenda, fermer: () => void) => Bulle
}) {
  const { vue, ancre, maintenant } = p
  const [masques, setMasques] = useState<string[]>(() => lire(p.cle))
  const [jourDeplie, setJourDeplie] = useState<string | null>(null)
  const [ouvert, setOuvert] = useState<EvAgenda | null>(null)
  const defile = useRef<HTMLDivElement>(null)
  const basculer = (ids: string[], masquer: boolean) => setMasques((m) => { const n = masquer ? [...new Set([...m, ...ids])] : m.filter((x) => !ids.includes(x)); try { localStorage.setItem(p.cle, JSON.stringify(n)) } catch { /* sans mémoire */ } return n })
  const personnes = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of p.evenements) m.set(e.personneId ?? "", e.personneNom || (e.personneId ? "Sans nom" : "Sans attribution"))
    return [...m].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || a[1].localeCompare(b[1], "fr"))
  }, [p.evenements])
  const visibles = useMemo(() => p.evenements.filter((e) => !masques.includes(e.agenda) && !masques.includes(`p:${e.personneId ?? ""}`)), [p.evenements, masques])
  const teinte = (e: EvAgenda) => (e.retard && !e.fait ? ROUGE : adoucir(couleurDePersonne(e.personneId)))
  const ferie = (d: Date) => !masques.includes("_ferie") && estFerie(jourIso(d))
  useEffect(() => { if (defile.current) defile.current.scrollTop = (8 - HEURE_DEBUT) * HAUTEUR_HEURE }, [vue])
  useEffect(() => { if (!ouvert) return; const f = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(null) }; window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f) }, [ouvert])

  const pastille = (e: EvAgenda) => (
    <button key={e.id} type="button" onClick={(ev) => { ev.stopPropagation(); setOuvert(e) }} title={[e.titre, e.detail, e.personneNom].filter(Boolean).join(" · ")}
      style={{ background: teinte(e) + "1A", boxShadow: `inset 2px 0 0 ${teinte(e)}` }}
      className={`mt-[3px] block w-full truncate rounded-[6px] px-1.5 py-[3px] text-left text-[11px] text-[#1C1C1E] hover:brightness-[.96] ${e.fait ? "line-through opacity-55" : ""}`}>
      {e.debut ? <span className="tabular-nums">{heure(e.debut)} </span> : null}{e.titre}
    </button>
  )
  const etiquetteFerie = <span className="mt-[3px] block w-full truncate rounded-[6px] bg-[#F2F2F4] px-1.5 py-[3px] text-[11px] text-[#6B6B70]">Jour férié · aucun envoi</span>
  const decaler = (sens: 1 | -1) => p.onAncre(vue === "mois" ? new Date(ancre.getFullYear(), ancre.getMonth() + sens, 1) : plusJours(ancre, 7 * sens))
  const caseAgenda = (id: string, nom: string, couleur?: string) => (
    <label key={id} className="flex cursor-pointer items-center gap-2 py-[5px] text-[13px]">
      <input type="checkbox" className="h-3.5 w-3.5 accent-[#111113]" checked={!masques.includes(id)} onChange={() => basculer([id], !masques.includes(id))} />
      {couleur ? <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: couleur }} /> : null}
      <span className="truncate">{nom}</span>
    </label>
  )
  const idsPersonnes = personnes.map(([id]) => `p:${id}`)
  const tousCoches = idsPersonnes.length > 0 && idsPersonnes.every((id) => !masques.includes(id))

  // ── La grille du mois (recopiée de STC Bâtiment) ──
  const mois = () => {
    const debut = new Date(ancre.getFullYear(), ancre.getMonth(), 1)
    const nb = new Date(ancre.getFullYear(), ancre.getMonth() + 1, 0).getDate()
    const remplissage = (debut.getDay() + 6) % 7
    const cases: (Date | null)[] = [...Array(remplissage).fill(null), ...Array.from({ length: nb }, (_, i) => new Date(ancre.getFullYear(), ancre.getMonth(), i + 1))]
    return (
      <div className="grid grid-cols-7 overflow-hidden rounded-[10px] border-l-[0.5px] border-t-[0.5px] border-[#E6E6EA]">
        {JOURS.map((j) => <div key={j} className="border-b-[0.5px] border-r-[0.5px] border-b-[#E6E6EA] border-r-[#EEEEF0] bg-[#FAFAFB] px-2 py-[7px] text-[11px] text-[#8E8E93]">{j}</div>)}
        {cases.map((jour, i) => {
          if (!jour) return <div key={`vide-${i}`} className="min-h-[112px] border-b-[0.5px] border-r-[0.5px] border-[#EEEEF0] bg-[#FAFAFB]" />
          const cle = jourIso(jour)
          const evts = visibles.filter((e) => memeJourDate(e.jour, jour)).sort((a, b) => (a.debut?.getTime() ?? 0) - (b.debut?.getTime() ?? 0))
          const deplie = jourDeplie === cle
          const montres = deplie ? evts : evts.slice(0, 3)
          const reste = evts.length - montres.length
          return (
            <div key={cle} onClick={p.onJour ? () => p.onJour!(jour) : undefined} title={p.onJour ? p.infobulleJour : undefined}
              className={`flex min-h-[112px] min-w-0 flex-col border-b-[0.5px] border-r-[0.5px] border-[#EEEEF0] p-1.5 transition-colors ${p.onJour ? "cursor-pointer hover:bg-[#FCFCFD]" : ""}`}>
              <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] tabular-nums ${memeJourDate(jour, maintenant) ? "bg-[#111113] font-semibold text-white" : "text-[#3C3C40]"}`}>{jour.getDate()}</span>
              <div className="min-w-0">
                {ferie(jour) ? etiquetteFerie : null}
                {montres.map(pastille)}
                {reste > 0 || deplie ? (
                  <button type="button" onClick={(ev) => { ev.stopPropagation(); setJourDeplie(deplie ? null : cle) }} title={deplie ? "Replier la journée" : "Voir toute la journée"}
                    className="mt-[3px] w-full cursor-pointer px-1.5 text-left text-[11px] text-[#8E8E93] underline underline-offset-2 hover:text-[#111113]">{deplie ? "− replier" : `+${reste} autre${reste > 1 ? "s" : ""}`}</button>
                ) : null}
              </div>
            </div>
          )
        })}
        {Array.from({ length: (7 - (cases.length % 7)) % 7 }, (_, i) => <div key={`fin-${i}`} aria-hidden="true" className="min-h-[112px] border-b-[0.5px] border-r-[0.5px] border-[#EEEEF0] bg-[#FAFAFB]" />)}
      </div>
    )
  }

  // ── La semaine, dans le même dessin ──
  const semaine = () => {
    const jours = Array.from({ length: 7 }, (_, i) => plusJours(lundi(ancre), i))
    const colonnes = { gridTemplateColumns: "44px repeat(7, minmax(0, 1fr))" }
    return (
      <div className="overflow-hidden rounded-[10px] border-[0.5px] border-[#E6E6EA]">
        <div className="grid" style={colonnes}>
          <div className="border-b-[0.5px] border-r-[0.5px] border-b-[#E6E6EA] border-r-[#EEEEF0] bg-[#FAFAFB]" />
          {jours.map((d, i) => (
            <div key={i} className={`flex items-center gap-1.5 border-b-[0.5px] border-b-[#E6E6EA] px-2 py-[7px] text-[11px] text-[#8E8E93] ${i < 6 ? "border-r-[0.5px] border-r-[#EEEEF0]" : ""} bg-[#FAFAFB]`}>
              {JOURS[i]}
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full tabular-nums ${memeJourDate(d, maintenant) ? "bg-[#111113] font-semibold text-white" : "text-[#3C3C40]"}`}>{d.getDate()}</span>
            </div>
          ))}
          <div className="border-b-[0.5px] border-r-[0.5px] border-b-[#E6E6EA] border-r-[#EEEEF0] px-1 pt-2 text-right text-[10px] text-[#8E8E93]">journée</div>
          {jours.map((d, i) => (
            <div key={i} onClick={p.onJour ? () => p.onJour!(d) : undefined} title={p.onJour ? p.infobulleJour : undefined} className={`min-h-[34px] min-w-0 border-b-[0.5px] border-b-[#E6E6EA] p-1.5 pt-0.5 ${i < 6 ? "border-r-[0.5px] border-r-[#EEEEF0]" : ""} ${i >= 5 ? "bg-[#FAFAFB]" : ""} ${p.onJour ? "cursor-pointer hover:bg-[#FCFCFD]" : ""}`}>
              {ferie(d) ? etiquetteFerie : null}
              {visibles.filter((e) => !e.debut && memeJourDate(e.jour, d)).map(pastille)}
            </div>
          ))}
        </div>
        <div ref={defile} className="max-h-[calc(100vh-290px)] min-h-[420px] overflow-y-auto">
          <div className="grid" style={colonnes}>
            <div className="border-r-[0.5px] border-[#EEEEF0]">
              {Array.from({ length: HEURE_FIN - HEURE_DEBUT }, (_, i) => <div key={i} className="pr-1.5 text-right text-[10px] tabular-nums text-[#8E8E93]" style={{ height: HAUTEUR_HEURE }}><span className="relative top-[2px]">{String(HEURE_DEBUT + i).padStart(2, "0")}:00</span></div>)}
            </div>
            {jours.map((d, i) => {
              const duJour = visibles.filter((e) => e.debut && memeJourDate(e.debut, d))
              const places = placerJournee(duJour.map((e) => ({ id: e.id, debut: e.debut!, dureeMin: e.dureeMin ?? 30 })))
              const ligne = memeJourDate(d, maintenant) ? hauteurMaintenant(maintenant) : null
              return (
                <div key={i} className={`relative ${i < 6 ? "border-r-[0.5px] border-[#EEEEF0]" : ""} ${i >= 5 ? "bg-[#FAFAFB]" : ""}`} style={{ height: (HEURE_FIN - HEURE_DEBUT) * HAUTEUR_HEURE, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HAUTEUR_HEURE - 0.5}px, #EEEEF0 ${HAUTEUR_HEURE - 0.5}px, #EEEEF0 ${HAUTEUR_HEURE}px)` }}>
                  {duJour.map((e) => {
                    const pl = places.get(e.id)!, c = teinte(e)
                    return (
                      <button key={e.id} type="button" onClick={() => setOuvert(e)} title={[e.titre, e.detail, e.personneNom].filter(Boolean).join(" · ")}
                        style={{ top: pl.top + 1, height: pl.hauteur - 1, left: `calc(${pl.gauche}% + 3px)`, width: `calc(${pl.largeur}% - 6px)`, background: "#fff", backgroundImage: `linear-gradient(${c}1A, ${c}1A)`, boxShadow: `inset 2px 0 0 ${c}` }}
                        className={`absolute overflow-hidden rounded-[6px] px-1.5 py-[3px] text-left text-[11px] leading-[14px] text-[#1C1C1E] hover:brightness-[.96] ${e.fait ? "line-through opacity-55" : ""}`}>
                        <span className="tabular-nums">{heure(e.debut!)}</span> {e.titre}
                        {pl.hauteur >= 40 && e.detail ? <span className="block truncate text-[#6B6B70]">{e.detail}</span> : null}
                      </button>
                    )
                  })}
                  {ligne !== null ? <><span aria-hidden="true" className="absolute left-0 right-0 h-px bg-[#111113]" style={{ top: ligne }} /><span aria-hidden="true" className="absolute -left-[3px] h-[7px] w-[7px] rounded-full bg-[#111113]" style={{ top: ligne - 3 }} /></> : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const b = ouvert ? p.bulle(ouvert, () => setOuvert(null)) : null
  return (
    <div className="px-8 pb-10 pt-6 text-[13px] text-[#111113]">
      {/* L'en-tête */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[200px] flex-1">
          <h1 className={TITRE_PAGE}>{p.titre}</h1>
          {p.sousTitre ? <p className={SOUS_TITRE}>{p.sousTitre}</p> : null}
        </div>
        {p.actions}
      </div>
      {p.erreur}

      <div className="mt-[22px] flex flex-col items-start gap-7 lg:flex-row">
        {/* ── Mes agendas ── */}
        <div className="w-full shrink-0 lg:w-[210px]">
          <p className={`${PETIT_GRIS} mb-1`}>Mes agendas</p>
          <label className="mb-0.5 mt-3.5 flex cursor-pointer items-center gap-2 text-[13px] font-medium">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[#111113]" checked={tousCoches} onChange={() => basculer(idsPersonnes, tousCoches)} />{p.groupe}
          </label>
          <div className="max-h-56 overflow-y-auto">
            {personnes.length === 0 ? <p className={PETIT_GRIS}>Rien sur cette période</p> : null}
            {personnes.map(([id, nom]) => caseAgenda(`p:${id}`, nom, adoucir(couleurDePersonne(id || null))))}
          </div>
          <div className="mt-3">
            {p.types.map((t) => caseAgenda(t.id, t.nom))}
            {caseAgenda("_ferie", "Jours fériés")}
          </div>
          {p.chargement ? <p className={`${PETIT_GRIS} mt-3`}>Lecture de l'agenda…</p> : null}
        </div>

        {/* ── Le mois ou la semaine ── */}
        <div className="w-full min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-[21px] font-semibold tracking-[-0.02em] first-letter:uppercase">{vue === "mois" ? moisAnnee(ancre) : titreSemaine(lundi(ancre))}</h2>
            <div role="group" aria-label="Vue" className="inline-flex h-[26px] items-center rounded-full bg-[#F2F2F4] p-[2px]">
              {(["semaine", "mois"] as Vue[]).map((v) => <button key={v} type="button" aria-pressed={vue === v} onClick={() => p.onVue(v)} className={`h-[22px] rounded-full px-[10px] text-[12px] font-medium ${vue === v ? "bg-white text-[#111113] shadow-[0_1px_2px_rgba(17,17,19,.12)]" : "text-[#6B6B70] hover:text-[#111113]"}`}>{v === "semaine" ? "Semaine" : "Mois"}</button>)}
            </div>
            <button type="button" className={`${PILULE_CLAIRE} ${PETITE}`} onClick={() => p.onAncre(new Date())}>Aujourd'hui</button>
            <button type="button" aria-label="Précédent" onClick={() => decaler(-1)} className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#F2F2F4] hover:bg-[#E9E9EC]"><ChevronLeft className="h-[13px] w-[13px]" strokeWidth={1.8} /></button>
            <button type="button" aria-label="Suivant" onClick={() => decaler(1)} className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#F2F2F4] hover:bg-[#E9E9EC]"><ChevronRight className="h-[13px] w-[13px]" strokeWidth={1.8} /></button>
          </div>
          {vue === "mois" ? mois() : semaine()}
        </div>
      </div>

      {/* ── La fiche d'un événement, comme les fenêtres du bureau ── */}
      {ouvert && b ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111113]/20 p-4" onClick={() => setOuvert(null)}>
          <div role="dialog" aria-label={ouvert.titre} className={`${FENETRE} w-full max-w-[460px] overflow-hidden`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 px-[22px] pb-1.5 pt-[18px]">
              <span className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: teinte(ouvert) }} />
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] font-semibold ${ouvert.fait ? "line-through" : ""}`}>{ouvert.titre}</p>
                {b.quand ? <p className={`${PETIT_GRIS} mt-0.5 first-letter:uppercase`}>{b.quand}</p> : null}
              </div>
              <span className="flex shrink-0 gap-0.5">{b.icones}<button type="button" aria-label="Fermer" className={ROND_MINI} onClick={() => setOuvert(null)}><X className="h-3.5 w-3.5" strokeWidth={1.7} /></button></span>
            </div>
            <div className="space-y-2 px-[22px] pb-[18px] pt-1.5">
              {ouvert.personneNom ? <p className={PETIT_GRIS}>{ouvert.personneNom}</p> : null}
              {b.lignes}
            </div>
            {b.boutons ? <div className={PIED_FENETRE}>{b.boutons}</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
