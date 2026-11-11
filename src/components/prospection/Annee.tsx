// L'ANNÉE (Mahdi, 11/11/2026) : « regarder sur l'année comment ça se passe le démarchage, avoir des courbes, voir les
// moments faibles, les moments forts ; un suivi du démarchage agence et sous-traitant qui pourra être facilement analysé ».
// Douze mois (ou depuis janvier), par mois ou par semaine ; le tableau complet s'exporte pour Excel. Calculs : lib/annee.ts.
import { useEffect, useMemo, useState } from "react"
import { Bloc, Chapitre, Table } from "../demarchage/aujourdhui/courtier"
import { fr } from "../demarchage/aujourdhui/outils"
import { bascule } from "../agenda/dessinBureau"
import { compter, depuisLeDebut, fortEtFaible, periodes, versCsv, type Pas, type Periode, type Portee } from "../../lib/annee"
import { chargerAnnee, type DonneesAnnee } from "../../lib/croissanceDb"

type Serie = { nom: string; court: string; v: (number | null)[]; euros?: boolean; aide?: string }
const RECRUTEMENT = new Set(["artisans"])
const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`
const valeur = (s: Serie, n: number) => (s.euros ? euros(n) : fr(Math.round(n * 10) / 10))

function Barres({ s, ps }: { s: Serie; ps: Periode[] }) {
  const v = s.v.map((x) => x ?? 0)
  const { fort, faible } = fortEtFaible(s.v, ps)
  const max = Math.max(1, ...v)
  return (
    <div role="img" aria-label={s.nom} className="grid h-24 items-end gap-[3px]" style={{ gridTemplateColumns: `repeat(${ps.length}, minmax(0, 1fr))` }}>
      {ps.map((p, i) => {
        const couleur = i === fort ? "#111113" : i === faible ? "#E8A29C" : p.enCours ? "#E1E8F7" : "#C9D7F2"
        return (
          <div key={p.cle} className="flex h-full min-w-0 flex-col items-center justify-end gap-1" title={`${p.libelle} : ${s.v[i] === null ? "pas de donnée" : valeur(s, v[i])}${p.enCours ? " (en cours)" : ""}`}>
            <span className="block w-full max-w-[22px] rounded-t-[2px]" style={{ height: `${s.v[i] === null ? 0 : Math.max(2, Math.round((v[i] / max) * 72))}px`, background: couleur }} />
            <span className="h-3 text-[10px] leading-3 text-encre-2">{p.court}</span>
          </div>
        )
      })}
    </div>
  )
}

function Carte({ s, ps, unite }: { s: Serie; ps: Periode[]; unite: string }) {
  const v = s.v.map((x) => x ?? 0)
  const { fort, faible, moyenne } = fortEtFaible(s.v, ps)
  const total = v.reduce((a, b) => a + b, 0)
  return (
    <div className="min-w-0 rounded-lg bg-[#F7F7F9] px-4 pb-3 pt-4" title={s.aide}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] text-[#6B6B70]">{s.nom}</span>
        <span className="shrink-0 text-[12px] text-[#8E8E93]">{valeur(s, moyenne)} par {unite} en moyenne</span>
      </div>
      <div className="mt-0.5 text-[22px] font-medium tabular-nums tracking-[-0.02em]">{s.v.every((x) => x === null) ? "—" : valeur(s, total)}</div>
      <div className="mt-2"><Barres s={s} ps={ps} /></div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-[#6B6B70]">
        {fort !== null ? <span><b className="font-medium text-encre">Fort</b> : {ps[fort].libelle} ({valeur(s, v[fort])})</span> : <span>Pas encore assez de données</span>}
        {faible !== null ? <span><b className="font-medium text-[#C0504D]">Faible</b> : {ps[faible].libelle} ({valeur(s, v[faible])})</span> : null}
      </div>
    </div>
  )
}

export default function Annee({ ca }: { ca: { mois: string[]; v: number[] } | null }) {
  // Mahdi (11/11) : par mois seulement, « ça enlèvera du volume et ça sera plus clair ».
  const pas: Pas = "mois"
  const [portee, setPortee] = useState<Portee>("12mois")
  const [d, setD] = useState<DonneesAnnee | null>(null)
  const [erreur, setErreur] = useState("")
  const maintenant = useMemo(() => new Date(), [])
  useEffect(() => {
    // 13 mois en arrière couvrent les deux vues (12 derniers mois, depuis janvier).
    chargerAnnee(new Date(maintenant.getFullYear(), maintenant.getMonth() - 13, 1)).then(setD).catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
  }, [maintenant])
  const ps = useMemo(() => periodes(maintenant, pas, portee), [maintenant, pas, portee])
  const series = useMemo(() => {
    if (!d) return null
    const de = (base: "demarchage" | "recrutement", l: { le: string; campagne_id: string }[]) => l.filter((x) => (RECRUTEMENT.has(d.bases[x.campagne_id] ?? "") ? "recrutement" : "demarchage") === base).map((x) => x.le)
    const caSerie: Serie | null = ca && pas === "mois" ? { court: "CA facturé", nom: "Chiffre d'affaires facturé", euros: true, aide: "Facturé HT par mois dans STC Bâtiment, agences et particuliers (les 6 derniers mois complets)", v: ps.map((p) => { const i = ca.mois.indexOf(p.cle); return i >= 0 ? ca.v[i] : null }) } : null
    const demarchage: Serie[] = [
      { court: "Appels", nom: "Appels aux agences", v: compter(d.appels.map((a) => a.date), ps) },
      { court: "Joints", nom: "Gestionnaires joints", v: compter(d.appels.filter((a) => a.resultat === "joint").map((a) => a.date), ps) },
      { court: "Intéressés", nom: "Intéressés", v: compter(d.appels.filter((a) => a.issue === "interesse" || a.issue === "rdv").map((a) => a.date), ps), aide: "Appels qui finissent « intéressé » ou en rendez-vous" },
      { court: "RDV", nom: "Rendez-vous pris", v: compter(d.rdv, ps) },
      { court: "Leads", nom: "Leads reçus", v: compter(d.leads, ps) },
      { court: "Clients", nom: "Nouveaux clients", v: compter(d.clients, ps), aide: "Agences qui ont envoyé leur premier ordre de service" },
      { court: "Mails", nom: "Mails de campagne envoyés", v: compter(de("demarchage", d.envois), ps) },
      { court: "Réponses", nom: "Réponses aux campagnes", v: compter(de("demarchage", d.reponses), ps) },
      ...(caSerie ? [caSerie] : []),
    ]
    const recrutement: Serie[] = [
      { court: "Appels", nom: "Artisans appelés", v: compter(d.appelsSt, ps) },
      { court: "Dossiers", nom: "Dossiers déposés", v: compter(d.dossiers, ps) },
      { court: "Contrats", nom: "Contrats signés", v: compter(d.contrats, ps) },
      { court: "Mails", nom: "Mails de campagne envoyés", v: compter(de("recrutement", d.envois), ps) },
      { court: "Réponses", nom: "Réponses aux campagnes", v: compter(de("recrutement", d.reponses), ps) },
    ]
    // Avant la première valeur, l'outil ne suivait pas encore ce chiffre : « pas de donnée », pas « zéro ».
    const net = (l: Serie[]) => l.map((x) => (x.euros ? x : { ...x, v: depuisLeDebut(x.v) }))
    return { demarchage: net(demarchage), recrutement: net(recrutement) }
  }, [d, ps, ca])
  const unite = "mois"
  const exporter = (quoi: "agences" | "sous-traitants", l: Serie[]) => {
    const lien = document.createElement("a")
    lien.href = URL.createObjectURL(new Blob(["﻿" + versCsv(ps, l)], { type: "text/csv;charset=utf-8" }))
    lien.download = `baticom-${quoi}-mois-par-mois-${maintenant.toISOString().slice(0, 10)}.csv`
    lien.click()
    URL.revokeObjectURL(lien.href)
  }
  // Un tableau par activité, jamais mélangés : les agences d'un côté, les sous-traitants de l'autre.
  const tableau = (quoi: "agences" | "sous-traitants", titre: string, l: Serie[]) => (
    <Bloc titre={titre} droite={<button type="button" className="text-[12px] text-[#6B6B70] underline underline-offset-2 hover:text-encre" onClick={() => exporter(quoi, l)}>Exporter pour Excel</button>}>
      <div className="overflow-x-auto">
        <Table colonnes={[{ titre: "Mois" }, ...l.map((x) => ({ titre: x.court, largeur: x.euros ? "120px" : "92px", droite: true }))]}
          lignes={[...ps].reverse().map((p) => { const i = ps.indexOf(p); return { cle: p.cle, cellules: [<span className={p.enCours ? "text-encre-2" : "font-medium"}>{p.libelle}{p.enCours ? " · en cours" : ""}</span>, ...l.map((x) => (x.v[i] === null ? <span className="text-encre-2">—</span> : x.euros ? euros(x.v[i] as number) : fr(x.v[i] as number)))] } })} />
      </div>
    </Bloc>
  )
  return (
    <Chapitre id="annee" titre="L'année" sous="Le démarchage des agences et le recrutement des sous-traitants sur douze mois : les courbes, les moments forts et les moments faibles."
      droite={
        <span className="flex flex-wrap items-center gap-1.5">
          {([["12mois", "12 derniers mois"], ["annee", "Depuis janvier"]] as [Portee, string][]).map(([id, l]) => <button key={id} type="button" aria-pressed={portee === id} className={bascule(portee === id)} onClick={() => setPortee(id)}>{l}</button>)}
        </span>
      }>
      {erreur ? <p className="text-colonne text-alerte">{erreur}</p> : !series ? <p className="text-colonne text-encre-2">Lecture de l'année…</p> : <>
        <p className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#6B6B70]">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-[#111113]" />moment fort</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-[#E8A29C]" />moment faible</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-[#E1E8F7]" />mois en cours (pas fini, jamais compté comme faible)</span>
        </p>
        <Bloc titre="Les agences · démarchage" droite={`${ps[0].libelle} → ${ps[ps.length - 1].libelle}`}>
          <div className="grid gap-3 pt-4 @min-[800px]:grid-cols-2 @min-[1200px]:grid-cols-3">{series.demarchage.map((s) => <Carte key={s.nom} s={s} ps={ps} unite={unite} />)}</div>
        </Bloc>
        <Bloc titre="Les sous-traitants · recrutement" droite={`${ps[0].libelle} → ${ps[ps.length - 1].libelle}`}>
          <div className="grid gap-3 pt-4 @min-[800px]:grid-cols-2 @min-[1200px]:grid-cols-3">{series.recrutement.map((s) => <Carte key={s.nom} s={s} ps={ps} unite={unite} />)}</div>
        </Bloc>
        {tableau("agences", "Les agences, mois par mois", series.demarchage)}
        {tableau("sous-traitants", "Les sous-traitants, mois par mois", series.recrutement)}
      </>}
    </Chapitre>
  )
}
