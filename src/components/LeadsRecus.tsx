// ── LEADS REÇUS, RANGÉS COMME META (Mahdi, 09/11/2026, maquette validée) ──
// À gauche d'où ils viennent (les campagnes, regroupées par base), en haut l'étape (Nouveaux, Contactés, Qualifiés,
// Gagnés, Perdus), une seule liste avec les mêmes colonnes pour tout le monde. Un clic sur la ligne ouvre toujours
// la fiche, sur place : le dossier d'un artisan, ou la fiche d'une agence avec le bouton Appeler.
import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, ExternalLink, Phone, RefreshCw } from "lucide-react"
import type { Session } from "@supabase/supabase-js"
import DossierDepuisLead from "./recrutement/DossierDepuisLead"
import { Bandeau, Bouton, Chargement, Onglets, Panneau, Pastille } from "../ui"
import { estAdmin } from "../lib/comptes"
import type { Espace } from "../lib/messagesDb"
import { NOM_BASE } from "../lib/perimetre"
import { ETAPES_LEAD, leadsVisibles, sourceDe, sourcesDe, trierLeads, type EtapeLead, type LeadRecu, type Niveau } from "../lib/leadsRecus"
import { chargerLeadsRecus, validerEtape } from "../lib/leadsRecusDb"
import { nomAffiche } from "../lib/comptes"
import FormulaireAppel from "./prospection/moteur/FormulaireAppel"

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

// Le parcours du lead dans sa fiche : ce qui est fait, ce qui reste ; une étape « à la main » se valide ici.
function Parcours({ l, onValider, parNom, onEnregistre }: { l: LeadRecu; onValider: (etapeId: string, valide: boolean) => void; parNom: string; onEnregistre: () => void }) {
  const p = l.parcours
  const [ouvert, setOuvert] = useState<string | null>(null)
  if (!p) return null
  const remplis = p.formulaires.filter((k) => p.reponses[k.id])
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-colonne font-medium text-encre-2">Parcours · {l.campagne?.nom}{l.qualite ? ` · niveau ${l.qualite}` : ""}</h3>
      <ol className="space-y-1">
        {p.etapes.map((e) => {
          const fait = p.atteintes.includes(e.id), main = p.valides.includes(e.id)
          return (
            <li key={e.id} className={"flex items-center gap-2.5 rounded-4 px-2 py-1.5 text-legende " + (p.courante === e.id ? "bg-fond-3" : "")}>
              <span className={"flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full " + (fait ? "bg-ok text-white" : "border border-trait-fort")}>{fait ? <Check size={11} /> : null}</span>
              <span className={"min-w-0 flex-1 truncate " + (fait ? "text-encre" : "text-encre-2")}>{e.nom}</span>
              {e.id === p.leadA ? <span className="rounded-full bg-signature px-2 text-[10px] font-medium leading-4 text-white">LEAD</span> : null}
              {e.id === p.gagneA ? <span className="rounded-full bg-ok px-2 text-[10px] font-medium leading-4 text-white">GAGNÉ</span> : null}
              {/* Le test de l'application n'a pas encore d'interface : il se valide à la main en attendant. */}
              {e.type === "Formulaire rempli au téléphone" && e.formulaireId && l.campagne ? <Bouton taille="sm" variante="discret" onClick={() => setOuvert(ouvert === e.id ? null : e.id)}>{p.reponses[e.formulaireId] ? "Modifier" : "Remplir"}</Bouton> : (e.validation === "À la main" || e.type === "Test de l'application") && (!fait || main) ? <Bouton taille="sm" variante="discret" onClick={() => onValider(e.id, !main)}>{main ? "Annuler" : "Valider"}</Bouton> : null}
            </li>
          )
        })}
      </ol>
      {(() => { const e = p.etapes.find((x) => x.id === ouvert); const k = p.formulaires.find((x) => x.id === e?.formulaireId); return k && l.campagne ? <div className="mt-3 rounded-4 border-[0.5px] border-trait p-3"><FormulaireAppel key={k.id} campagneId={l.campagne.id} contactRef={l.contactRef} formulaire={k} reponses={p.reponses[k.id] ?? null} parNom={parNom} onEnregistre={onEnregistre} /></div> : null })()}
      {remplis.map((k) => <div key={k.id} className="mt-4"><h3 className="mb-1 text-colonne font-medium text-encre-2">{k.nom}</h3><div className="divide-y divide-fond-4">{k.questions.filter((q) => p.reponses[k.id][q.id]).map((q) => <div key={q.id} className="flex justify-between gap-6 py-2 text-legende"><span className="text-encre-2">{q.libelle}</span><span className="whitespace-pre-wrap text-right text-encre">{p.reponses[k.id][q.id]}</span></div>)}</div></div>)}
    </div>
  )
}

export default function LeadsRecus({ session, espaces, onAppelerAgence, onOuvrirAgence, onSessionArtisans }: {
  session: Session | null
  espaces: Espace[]
  onAppelerAgence: (agenceId: string) => void
  onOuvrirAgence: (agenceId: string) => void
  onSessionArtisans: () => void
}) {
  const admin = estAdmin(session)
  const moiId = session?.user?.id ?? ""
  const [leads, setLeads] = useState<LeadRecu[] | null>(null)
  const [erreur, setErreur] = useState("")
  const [source, setSource] = useState("tous")
  const [etape, setEtape] = useState<EtapeLead>("nouveaux")
  const [ouvertId, setOuvertId] = useState<string | null>(null)
  const [bloc, setBloc] = useState<string | null>(null)

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
  const aEtape = dela.filter((l) => l.etape === etape)
  // Dans « Qualifiés », les blocs du parcours de la campagne choisie, avec le nombre de leads dans chacun.
  const blocs = etape === "qualifies" && sourceValide !== "tous" ? (aEtape[0]?.parcours?.etapes ?? []).map((e) => ({ e, n: aEtape.filter((l) => l.parcours?.courante === e.id).length })).filter((x) => x.n) : []
  const blocValide = blocs.some((x) => x.e.id === bloc) ? bloc : null
  const lignes = trierLeads(aEtape.filter((l) => !blocValide || l.parcours?.courante === blocValide))
  const ouvert = (leads ?? []).find((l) => l.id === ouvertId) ?? null
  const setOuvert = (l: LeadRecu | null) => setOuvertId(l?.id ?? null)
  const valider = (l: LeadRecu, etapeId: string, valide: boolean) => { if (l.campagne) validerEtape(l.campagne.id, l.contactRef, etapeId, valide, nomAffiche(session)).then(charger).catch((e) => setErreur(e instanceof Error ? e.message : String(e))) }
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
          {blocs.length ? <div className="mt-3 flex flex-wrap gap-1.5"><button type="button" onClick={() => setBloc(null)} className={`h-7 rounded-full px-3 text-colonne ${!blocValide ? "bg-action text-white" : "border-[0.5px] border-trait text-encre-2 hover:bg-fond-2"}`}>Tous · {aEtape.length}</button>{blocs.map(({ e, n }) => <button key={e.id} type="button" onClick={() => setBloc(e.id)} className={`h-7 rounded-full px-3 text-colonne ${blocValide === e.id ? "bg-action text-white" : "border-[0.5px] border-trait text-encre-2 hover:bg-fond-2"}`}>{e.nom} · {n}</button>)}</div> : null}
          {!leads && !erreur ? <Chargement texte="Lecture des leads…" /> : lignes.length === 0 ? <p className="py-10 text-center text-legende text-encre-2">Aucun lead à cette étape.</p> : (
            <table className="mt-1 w-full table-fixed border-collapse text-left">
              <colgroup><col /><col style={{ width: "38%" }} />{tousColonne ? <col style={{ width: "24%" }} /> : null}<col style={{ width: "76px" }} /></colgroup>
              <thead><tr className="h-9 text-[10px] font-medium uppercase tracking-[0.08em] text-encre-2"><th className="font-medium">Qui</th><th className="font-medium">Ce qu'il a fait</th>{tousColonne ? <th className="font-medium">Campagne</th> : null}<th className="text-right font-medium">Quand</th></tr></thead>
              <tbody>
                {lignes.slice(0, 300).map((l) => (
                  <tr key={l.id} onClick={() => setOuvert(l)} className="h-[52px] cursor-pointer border-t-[0.5px] border-trait text-legende hover:bg-fond-2">
                    <td className="truncate pr-4"><b className="block truncate font-medium text-encre">{l.nom}</b><span className="block truncate text-colonne text-encre-2">{[l.detail || NOM_BASE[l.espace], l.etat?.texte].filter(Boolean).join(" · ")}</span></td>
                    <td className="pr-4"><span className="flex min-w-0 items-center gap-2"><span className="shrink-0"><Pastille role={NIVEAU[l.niveau].role} point>{NIVEAU[l.niveau].libelle}</Pastille></span><span className="truncate text-encre-2">{l.signal}</span>{l.qualite ? <span className="chiffres shrink-0 rounded-full bg-fond-4 px-1.5 text-[10px] font-medium leading-4 text-encre">{l.qualite}</span> : null}</span></td>
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

      {ouvert?.cible.type === "dossier" ? <DossierDepuisLead id={ouvert.cible.id} onFermer={() => setOuvert(null)} onChange={charger} avant={<Parcours l={ouvert} parNom={nomAffiche(session)} onEnregistre={charger} onValider={(e, v) => valider(ouvert, e, v)} />} /> : null}
      {ouvert && ouvert.cible.type !== "dossier" ? (() => {
        const cible = ouvert.cible
        const agenceId = cible.type === "agence" ? cible.id : null
        return (
          <Panneau titre={ouvert.nom} sousTitre={<span>{nomSource(ouvert)}</span>} onFermer={() => setOuvert(null)} largeur="w-[720px]"
            pied={agenceId ? <><Bouton icone={<ExternalLink />} onClick={() => { setOuvert(null); onOuvrirAgence(agenceId) }}>Fiche de l'agence</Bouton><Bouton variante="plein" icone={<Phone />} onClick={() => { setOuvert(null); onAppelerAgence(agenceId) }}>Appeler</Bouton></> : <Bouton variante="plein" icone={<Phone />} onClick={() => { setOuvert(null); onSessionArtisans() }}>Aller à la session de call</Bouton>}>
            <Parcours l={ouvert} parNom={nomAffiche(session)} onEnregistre={charger} onValider={(e, v) => valider(ouvert, e, v)} />
            <div className="flex flex-wrap items-center gap-2 text-legende"><Pastille role={NIVEAU[ouvert.niveau].role} point>{NIVEAU[ouvert.niveau].libelle}</Pastille><span className="text-encre">{ouvert.signal}</span><span className="text-encre-2">le {quandCourt(ouvert.quand)}</span></div>
            {ouvert.detail ? <p className="mt-5 whitespace-pre-wrap text-legende leading-relaxed text-encre">{ouvert.detail}</p> : null}
          </Panneau>
        )
      })() : null}
    </div>
  )
}
