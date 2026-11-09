// ── LEADS REÇUS, RANGÉS COMME META (Mahdi, 09/11/2026, maquette validée) ──
// À gauche d'où ils viennent (les campagnes, regroupées par base), en haut l'étape (Nouveaux, Contactés, Qualifiés,
// Gagnés, Perdus), une seule liste avec les mêmes colonnes pour tout le monde. Un clic sur la ligne ouvre toujours
// la fiche, sur place : le dossier d'un artisan, ou la fiche d'une agence avec le bouton Appeler.
import { useCallback, useEffect, useMemo, useState } from "react"
import { ExternalLink, Phone, RefreshCw } from "lucide-react"
import type { Session } from "@supabase/supabase-js"
import DossierDepuisLead from "./recrutement/DossierDepuisLead"
import { Bandeau, Bouton, Chargement, Onglets, Panneau, Pastille } from "../ui"
import { estAdmin } from "../lib/comptes"
import type { Espace } from "../lib/messagesDb"
import { NOM_BASE } from "../lib/perimetre"
import { ETAPES_LEAD, leadsVisibles, sourceDe, sourcesDe, trierLeads, type EtapeLead, type LeadRecu, type Niveau } from "../lib/leadsRecus"
import { chargerLeadsRecus } from "../lib/leadsRecusDb"

const NIVEAU: Record<Niveau, { libelle: string; role: "fait" | "actif" | "inerte" }> = { fiche: { libelle: "Fiche", role: "fait" }, reponse: { libelle: "Réponse", role: "actif" }, interet: { libelle: "Clic", role: "inerte" } }
const quandCourt = (iso: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "—")

function Source({ actif, nom, n, nouveaux, onClick }: { actif: boolean; nom: string; n: number; nouveaux: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-current={actif ? "true" : undefined} className={"flex min-h-[30px] w-full items-center gap-2 rounded-4 px-2 py-1 text-left text-legende " + (actif ? "bg-fond-4 font-medium text-encre" : "text-[#3c3c40] hover:bg-fond-3")}>
      <span className="min-w-0 flex-1 leading-tight">{nom}</span>
      {nouveaux ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-signature" title={`${nouveaux} nouveau${nouveaux > 1 ? "x" : ""}`} /> : null}
      <span className="chiffres shrink-0 text-colonne text-encre-2">{n}</span>
    </button>
  )
}

export default function LeadsRecus({ session, espaces, onAppelerAgence, onOuvrirAgence }: {
  session: Session | null
  espaces: Espace[]
  onAppelerAgence: (agenceId: string) => void
  onOuvrirAgence: (agenceId: string) => void
}) {
  const admin = estAdmin(session)
  const moiId = session?.user?.id ?? ""
  const [leads, setLeads] = useState<LeadRecu[] | null>(null)
  const [erreur, setErreur] = useState("")
  const [source, setSource] = useState("tous")
  const [etape, setEtape] = useState<EtapeLead>("nouveaux")
  const [ouvert, setOuvert] = useState<LeadRecu | null>(null)

  const charger = useCallback(() => {
    chargerLeadsRecus(new Date())
      .then((d) => { setLeads(d.leads); setErreur("") })
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => {
    const t = setTimeout(charger, 0)
    const iv = setInterval(charger, 120_000)
    return () => { clearTimeout(t); clearInterval(iv) }
  }, [charger])

  const miens = useMemo(() => leadsVisibles(leads ?? [], espaces, moiId, admin), [leads, espaces, moiId, admin])
  const sources = useMemo(() => sourcesDe(miens), [miens])
  const sourceValide = source === "tous" || sources.some((s) => s.id === source) ? source : "tous"
  const dela = miens.filter((l) => sourceValide === "tous" || sourceDe(l) === sourceValide)
  const lignes = trierLeads(dela.filter((l) => l.etape === etape))
  const nomSource = (l: LeadRecu) => l.campagne?.nom ?? "Hors campagne"
  const tousColonne = sourceValide === "tous"

  const groupe = (e: Espace) => {
    const l = sources.filter((s) => s.espace === e)
    if (!l.length) return null
    return (
      <div key={e}>
        {espaces.length > 1 ? <p className="px-2 pb-1 pt-4 text-colonne text-encre-2">{NOM_BASE[e]}</p> : <div className="h-3" />}
        {l.map((s) => <Source key={s.id} actif={sourceValide === s.id} nom={s.nom} n={s.n} nouveaux={s.nouveaux} onClick={() => setSource(s.id)} />)}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b-[0.5px] border-trait px-10">
        <h1 className="text-sous-titre font-semibold text-encre">Leads reçus</h1>
        <Bouton taille="sm" variante="discret" icone={<RefreshCw />} onClick={charger}>Actualiser</Bouton>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="w-[270px] shrink-0 overflow-y-auto border-r-[0.5px] border-trait px-3 py-4">
          <p className="px-2 pb-2 text-colonne text-encre-2">D'où ils viennent</p>
          <Source actif={tousColonne} nom="Tous les leads" n={miens.length} nouveaux={miens.filter((m) => m.etape === "nouveaux").length} onClick={() => setSource("tous")} />
          {groupe("demarchage")}
          {groupe("recrutement")}
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto px-10 pb-12 pt-3">
          {erreur ? <Bandeau role="alerte" className="mb-3">{erreur}</Bandeau> : null}
          <div className="flex flex-wrap items-end justify-between gap-x-6 border-b-[0.5px] border-trait">
            <Onglets<EtapeLead> className="!border-b-0" valeur={etape} onChange={setEtape} options={ETAPES_LEAD.map((e) => ({ id: e.id, label: e.label, badge: dela.filter((l) => l.etape === e.id).length || undefined }))} />
            <span className="pb-2.5 text-colonne text-encre-2">{ETAPES_LEAD.find((e) => e.id === etape)!.aide}</span>
          </div>
          {!leads && !erreur ? <Chargement texte="Lecture des leads…" /> : lignes.length === 0 ? <p className="py-10 text-center text-legende text-encre-2">Aucun lead à cette étape.</p> : (
            <table className="mt-1 w-full table-fixed border-collapse text-left">
              <colgroup><col /><col style={{ width: "38%" }} />{tousColonne ? <col style={{ width: "24%" }} /> : null}<col style={{ width: "76px" }} /></colgroup>
              <thead><tr className="h-9 text-[10px] font-medium uppercase tracking-[0.08em] text-encre-2"><th className="font-medium">Qui</th><th className="font-medium">Ce qu'il a fait</th>{tousColonne ? <th className="font-medium">Campagne</th> : null}<th className="text-right font-medium">Quand</th></tr></thead>
              <tbody>
                {lignes.slice(0, 300).map((l) => (
                  <tr key={l.id} onClick={() => setOuvert(l)} className="h-[52px] cursor-pointer border-t-[0.5px] border-trait text-legende hover:bg-fond-2">
                    <td className="truncate pr-4"><b className="block truncate font-medium text-encre">{l.nom}</b><span className="block truncate text-colonne text-encre-2">{[l.detail || NOM_BASE[l.espace], l.etat?.texte].filter(Boolean).join(" · ")}</span></td>
                    <td className="pr-4"><span className="flex min-w-0 items-center gap-2"><span className="shrink-0"><Pastille role={NIVEAU[l.niveau].role} point>{NIVEAU[l.niveau].libelle}</Pastille></span><span className="truncate text-encre-2">{l.signal}</span></span></td>
                    {tousColonne ? <td className="truncate pr-4 text-encre-2">{nomSource(l)}</td> : null}
                    <td className="chiffres text-right text-encre-2">{quandCourt(l.quand)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {lignes.length > 300 ? <p className="mt-2 text-colonne text-encre-3">Les 300 premiers affichés sur {lignes.length}.</p> : null}
        </div>
      </div>

      {ouvert?.cible.type === "dossier" ? <DossierDepuisLead id={ouvert.cible.id} onFermer={() => setOuvert(null)} onChange={charger} /> : null}
      {ouvert?.cible.type === "agence" ? (() => {
        const agenceId = ouvert.cible.id
        return (
          <Panneau titre={ouvert.nom} sousTitre={<span>{nomSource(ouvert)}</span>} onFermer={() => setOuvert(null)} largeur="w-[720px]"
            pied={<><Bouton icone={<ExternalLink />} onClick={() => { setOuvert(null); onOuvrirAgence(agenceId) }}>Fiche de l'agence</Bouton><Bouton variante="plein" icone={<Phone />} onClick={() => { setOuvert(null); onAppelerAgence(agenceId) }}>Appeler</Bouton></>}>
            <div className="flex flex-wrap items-center gap-2 text-legende"><Pastille role={NIVEAU[ouvert.niveau].role} point>{NIVEAU[ouvert.niveau].libelle}</Pastille><span className="text-encre">{ouvert.signal}</span><span className="text-encre-2">le {quandCourt(ouvert.quand)}</span></div>
            {ouvert.detail ? <p className="mt-5 whitespace-pre-wrap text-legende leading-relaxed text-encre">{ouvert.detail}</p> : null}
          </Panneau>
        )
      })() : null}
    </div>
  )
}
