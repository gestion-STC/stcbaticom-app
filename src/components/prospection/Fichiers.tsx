// CAMPAGNES › FICHIERS (Mahdi, 10/11/2026) : un seul endroit pour tous les fichiers importés, par base : ce qu'ils
// contiennent, ce qu'ils rapportent, et leur passage en session de call.
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Archive, Check, FileSpreadsheet, Phone, Upload } from "lucide-react"
import type { Session } from "@supabase/supabase-js"
import { Bandeau, Bouton, Champ, Chargement, Compteurs, Dialogue, EnTetePage, Etiquette, Ligne, Onglets, Panneau, Pastille, Selecteur, Tableau, Td, Th, Tr, Vide } from "../../ui"
import { Bloc } from "../demarchage/aujourdhui/courtier"
import { chargerFichiers, creerFichier, majFichier, type Fichier } from "../../lib/fichiersDb"
import { listerComptes, nomAffiche, type Compte } from "../../lib/comptes"
import { analyserLignesDuFichier, executerImport, lireFichier, type Analyse, type FichierLu } from "../../demarchage/importAgences"
import { construire, dedoublonner } from "../../lib/importSousTraitants"
import { chargerSousTraitants, insererSousTraitants } from "../../lib/sousTraitantsDb"
import { chargerExclusions } from "../../lib/machineDb"
import type { SousTraitant } from "../../recrutement"
import { IGNORER, appliquerColonnes, champsDe, devinerColonnes, indexEntete } from "../../prospection/colonnesImport"

const BASES = [{ id: "agences", nom: "Gestionnaires" }, { id: "apporteurs", nom: "Apporteurs d'affaires" }, { id: "artisans", nom: "Sous-traitants" }]
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const fr = (n: number) => n.toLocaleString("fr-FR")
const pct = (a: number, b: number) => (b ? `${(Math.round((a / b) * 1000) / 10).toLocaleString("fr-FR")} %` : "—")
const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR")
const nomBase = (id: string) => BASES.find((b) => b.id === id)?.nom ?? id
const etatDe = (f: Fichier): { texte: string; role: "actif" | "attente" | undefined } => (f.enCours > 0 ? { texte: "En campagne", role: "actif" } : f.touches > 0 ? { texte: "Déjà sollicité", role: undefined } : f.enSession ? { texte: "En session de call", role: "actif" } : { texte: "Prêt à cibler", role: "attente" })

type Previsions = { lignes: number; nouveaux: number; deja: number; ignores: number; desinscrits: number; mails: number; sansMail: number }
type Plan = { type: "agences"; analyse: Analyse; previsions: Previsions } | { type: "artisans"; aAjouter: Partial<SousTraitant>[]; previsions: Previsions }

function Importer({ session, onFermer, onImporte }: { session: Session | null; onFermer: () => void; onImporte: () => void }) {
  const [etape, setEtape] = useState(1)
  const [base, setBase] = useState("agences")
  const [nom, setNom] = useState("")
  const [source, setSource] = useState("")
  const [zone, setZone] = useState("")
  const [lu, setLu] = useState<FichierLu | null>(null)
  const [choix, setChoix] = useState<string[]>([])
  const [plan, setPlan] = useState<Plan | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [progres, setProgres] = useState("")
  const [erreur, setErreur] = useState("")
  const entree = useRef<HTMLInputElement>(null)
  const entete = lu ? lu.lignes[indexEntete(lu.lignes)] ?? [] : []

  const choisir = (f?: File) => {
    if (!f) return
    setErreur(""); setOccupe(true)
    lireFichier(f).then((r) => { setLu(r); setNom((n) => n || f.name.replace(/\.[^.]+$/, "")); setChoix(devinerColonnes(r.lignes[indexEntete(r.lignes)] ?? [], base)) }).catch((e) => setErreur(message(e))).finally(() => setOccupe(false))
  }
  const changerBase = (b: string) => { setBase(b); if (lu) setChoix(devinerColonnes(entete, b)) }

  const analyser = async () => {
    if (!lu) return
    setOccupe(true); setErreur("")
    try {
      const lignes = appliquerColonnes(lu.lignes, choix)
      if (base === "artisans") {
        const [fiches, exclusions] = await Promise.all([chargerSousTraitants(), chargerExclusions()])
        const c = construire(lignes)
        const d = dedoublonner(c.sousTraitants.map((s) => ({ ...s, source: s.source || source.trim() })), fiches, exclusions)
        const mails = d.aAjouter.filter((s) => s.email).length
        setPlan({ type: "artisans", aAjouter: d.aAjouter, previsions: { lignes: c.sousTraitants.length + c.ignorees, nouveaux: d.aAjouter.length, deja: d.doublons, ignores: c.ignorees, desinscrits: d.exclus, mails, sansMail: d.aAjouter.length - mails } })
      } else {
        const a = await analyserLignesDuFichier({ lignes, feuille: lu.feuille })
        if (base === "apporteurs") for (const l of a.aCreer) l.type = "apporteur"
        const mails = a.aCreer.filter((l) => l.email || l.contactEmail).length
        setPlan({ type: "agences", analyse: a, previsions: { lignes: a.total, nouveaux: a.aCreer.length, deja: a.dejaLa.length, ignores: a.ignorees.length, desinscrits: 0, mails, sansMail: a.aCreer.length - mails } })
      }
      setEtape(3)
    } catch (e) { setErreur(message(e)) } finally { setOccupe(false) }
  }

  const importer = async () => {
    if (!plan) return
    setOccupe(true); setErreur("")
    try {
      const p = plan.previsions
      const id = await creerFichier({ nom: nom.trim(), baseId: base, source: source.trim(), zone: zone.trim(), lignes: p.lignes, importes: 0, deja: p.deja + p.desinscrits, ignores: p.ignores, creePar: nomAffiche(session) })
      let importes = 0
      if (plan.type === "artisans") importes = await insererSousTraitants(plan.aAjouter, id)
      else {
        const b = await executerImport(plan.analyse, (x) => setProgres(`${x.fait} / ${x.total}`), { fichierId: id, source: source.trim() })
        importes = b.agencesCreees
        if (b.erreurs.length) setErreur(`${b.erreurs.length} ligne(s) n'ont pas pu être importées.`)
      }
      await majFichier(id, { importes })
      onImporte()
    } catch (e) { setErreur(message(e)); setOccupe(false) }
  }

  const p = plan?.previsions
  const peutContinuer = etape === 1 ? Boolean(lu && nom.trim() && source.trim()) : etape === 2 ? choix.some((c) => c !== IGNORER) : Boolean(p?.nouveaux)
  return (
    <Dialogue titre="Importer un fichier" description={`Étape ${etape} sur 3`} largeur="max-w-2xl" onFermer={occupe ? () => undefined : onFermer} pied={<>{etape > 1 ? <Bouton disabled={occupe} onClick={() => setEtape(etape - 1)}>Retour</Bouton> : <Bouton onClick={onFermer}>Annuler</Bouton>}{etape === 1 ? <Bouton variante="plein" disabled={!peutContinuer} onClick={() => setEtape(2)}>Continuer</Bouton> : etape === 2 ? <Bouton variante="plein" chargement={occupe} disabled={!peutContinuer} onClick={() => void analyser()}>Continuer</Bouton> : <Bouton variante="plein" icone={<Check />} chargement={occupe} disabled={!peutContinuer} onClick={() => void importer()}>{`Importer ${fr(p?.nouveaux ?? 0)} contacts`}</Bouton>}</>}>
      {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
      {etape === 1 ? (
        <div className="grid gap-4">
          <input ref={entree} type="file" accept=".xlsx,.csv,.txt" className="hidden" aria-label="Choisir un fichier" onChange={(e) => { choisir(e.target.files?.[0]); e.target.value = "" }} />
          <button type="button" onClick={() => entree.current?.click()} className="flex h-24 items-center justify-center gap-2 rounded-6 border border-dashed border-trait-fort text-legende text-encre-2 hover:bg-fond-2"><FileSpreadsheet size={18} />{occupe ? "Lecture…" : lu ? `${fr(lu.lignes.length)} lignes lues · changer de fichier` : "Choisir le fichier Excel ou CSV"}</button>
          <div className="grid gap-3 sm:grid-cols-2">
            <Etiquette texte="Dans quelle base ?"><Selecteur value={base} onChange={(e) => changerBase(e.target.value)}>{BASES.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}</Selecteur></Etiquette>
            <Etiquette texte="Nom du fichier"><Champ value={nom} placeholder="gestionnaires_pagesjaunes_92_2026-11" onChange={(e) => setNom(e.target.value)} /></Etiquette>
            <Etiquette texte="D'où viennent ces contacts ?"><Champ value={source} placeholder="Pages Jaunes, salon, réseau…" onChange={(e) => setSource(e.target.value)} /></Etiquette>
            <Etiquette texte="Zone"><Champ value={zone} placeholder="Hauts-de-Seine" onChange={(e) => setZone(e.target.value)} /></Etiquette>
          </div>
        </div>
      ) : etape === 2 ? (
        <div className="space-y-3">
          <p className="text-legende text-encre-2">Baticom a reconnu ces colonnes. Corrige-les si besoin.</p>
          <div className="divide-y-[0.5px] divide-trait">{entete.map((c, i) => <div key={i} className="flex items-center justify-between gap-4 py-2 text-legende"><span className="min-w-0 truncate font-medium text-encre">{c || `Colonne ${i + 1}`}</span><span className="w-60 shrink-0"><Selecteur value={choix[i] ?? IGNORER} aria-label={c || `Colonne ${i + 1}`} onChange={(e) => setChoix((l) => l.map((x, n) => (n === i ? e.target.value : x)))}><option>{IGNORER}</option>{champsDe(base).map((x) => <option key={x}>{x}</option>)}</Selecteur></span></div>)}</div>
        </div>
      ) : p ? (
        <div className="space-y-4">
          <Bandeau role="info">{occupe && progres ? `Import en cours : ${progres}. Ne ferme pas cette fenêtre.` : "Rien n'est encore importé : voici ce qui va se passer."}</Bandeau>
          <div className="divide-y-[0.5px] divide-trait">
            <Ligne libelle="Lignes dans le fichier">{fr(p.lignes)}</Ligne>
            <Ligne libelle="Nouveaux contacts à importer"><b className="font-medium">{fr(p.nouveaux)}</b></Ligne>
            <Ligne libelle="Déjà dans Baticom">{fr(p.deja)}</Ligne>
            <Ligne libelle="Écartés (doublons du fichier, lignes inutilisables)">{fr(p.ignores)}</Ligne>
            {p.desinscrits ? <Ligne libelle="Désinscrits : jamais importés">{fr(p.desinscrits)}</Ligne> : null}
            <Ligne libelle="Avec un mail">{fr(p.mails)}</Ligne>
            <Ligne libelle="Sans mail : appel uniquement">{fr(p.sansMail)}</Ligne>
          </div>
        </div>
      ) : null}
    </Dialogue>
  )
}

function Detail({ f, onFermer, onChange }: { f: Fichier; onFermer: () => void; onChange: () => void }) {
  const [comptes, setComptes] = useState<Compte[]>([])
  const [enSession, setEnSession] = useState(f.enSession)
  const [attribue, setAttribue] = useState(f.attribueA)
  const [erreur, setErreur] = useState("")
  useEffect(() => { listerComptes().then(setComptes).catch(() => setComptes([])) }, [])
  const enregistrer = (champs: Parameters<typeof majFichier>[1]) => majFichier(f.id, champs).then(onChange).catch((e) => setErreur(message(e)))
  const basculer = () => { const v = !enSession; setEnSession(v); void enregistrer({ en_session: v }) }
  const attribuer = (id: string) => { const l = attribue.includes(id) ? attribue.filter((x) => x !== id) : [...attribue, id]; setAttribue(l); void enregistrer({ attribue_a: l }) }
  return (
    <Panneau titre={f.nom} sousTitre={`${nomBase(f.baseId)} · importé le ${date(f.creeLe)}`} largeur="w-[520px]" onFermer={onFermer} pied={<><Bouton icone={<Archive />} onClick={() => { void enregistrer({ archive_le: new Date().toISOString() }).then(onFermer) }}>Archiver</Bouton><Bouton variante={enSession ? undefined : "plein"} icone={<Phone />} onClick={basculer}>{enSession ? "Retirer de la session de call" : "Mettre en session de call"}</Bouton></>}>
      <div className="space-y-6">
        {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
        {enSession ? <Bloc titre="Qui l'appelle"><div className="mt-2 flex flex-wrap gap-1.5">{comptes.map((c) => <button key={c.id} type="button" aria-pressed={attribue.includes(c.id)} onClick={() => attribuer(c.id)} className={`h-7 rounded-full px-3 text-colonne ${attribue.includes(c.id) ? "bg-action text-white" : "border-[0.5px] border-trait text-encre hover:bg-fond-2"}`}>{c.nom || c.email}</button>)}</div><p className="mt-2 text-colonne text-encre-2">{attribue.length ? "Le fichier apparaît dans la session de call de ces personnes." : "Personne de choisi : tout le service le voit."}</p></Bloc> : null}
        <Bloc titre="Ce qu'il contient"><div className="mt-2 divide-y-[0.5px] divide-trait"><Ligne libelle="Source">{f.source || "—"}</Ligne><Ligne libelle="Zone">{f.zone || "—"}</Ligne><Ligne libelle="Lignes du fichier">{fr(f.lignes)}</Ligne><Ligne libelle="Contacts importés">{fr(f.contacts)}</Ligne><Ligne libelle="Déjà dans Baticom">{fr(f.deja)}</Ligne><Ligne libelle="Écartés">{fr(f.ignores)}</Ligne><Ligne libelle="Avec un mail">{fr(f.mails)}</Ligne><Ligne libelle="Avec un mobile">{fr(f.mobiles)}</Ligne></div></Bloc>
        <Bloc titre="Ce qu'il a rapporté"><div className="mt-2 divide-y-[0.5px] divide-trait"><Ligne libelle="Touchés par mail ou SMS">{fr(f.touches)}</Ligne><Ligne libelle="Réponses">{f.touches ? `${fr(f.reponses)} · ${pct(f.reponses, f.touches)}` : "—"}</Ligne><Ligne libelle="Appels">{fr(f.appels)}</Ligne><Ligne libelle="Joints">{fr(f.joints)}</Ligne><Ligne libelle="Leads">{fr(f.leads)}</Ligne><Ligne libelle="Gagnés">{fr(f.gagnes)}</Ligne></div></Bloc>
        <Bloc titre="Utilisé dans">{f.campagnes.length ? <ul className="mt-2 space-y-1 text-legende">{f.campagnes.map((c) => <li key={c}>{c}</li>)}</ul> : <p className="mt-2 text-legende text-encre-2">Aucune campagne pour l'instant. Il se choisit dans Audience, en créant une campagne.</p>}</Bloc>
      </div>
    </Panneau>
  )
}

export default function Fichiers({ session }: { session: Session | null }) {
  const [fichiers, setFichiers] = useState<Fichier[] | null>(null)
  const [erreur, setErreur] = useState("")
  const [base, setBase] = useState("tout")
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [imports, setImports] = useState(false)
  const charger = useCallback(() => { chargerFichiers().then((l) => { setFichiers(l); setErreur("") }).catch((e) => setErreur(message(e))) }, [])
  useEffect(() => { const t = setTimeout(charger, 0); return () => clearTimeout(t) }, [charger])
  const visibles = useMemo(() => (fichiers ?? []).filter((f) => base === "tout" || f.baseId === base), [fichiers, base])
  const somme = (cle: "contacts" | "mails" | "reponses" | "leads") => visibles.reduce((s, f) => s + f[cle], 0)
  const courant = fichiers?.find((f) => f.id === ouvert) ?? null
  return (
    <div className="page">
      <EnTetePage titre="Fichiers" sousTitre="Tous les fichiers importés, ce qu'ils contiennent et ce qu'ils rapportent." droite={<Bouton variante="plein" icone={<Upload />} onClick={() => setImports(true)}>Importer un fichier</Bouton>} />
      {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
      <div className="mb-5"><Compteurs valeurs={[{ id: "f", libelle: "Fichiers", valeur: fr(visibles.length) }, { id: "c", libelle: "Contacts importés", valeur: fr(somme("contacts")) }, { id: "m", libelle: "Avec un mail", valeur: fr(somme("mails")) }, { id: "r", libelle: "Réponses", valeur: fr(somme("reponses")) }, { id: "l", libelle: "Leads", valeur: fr(somme("leads")) }]} /></div>
      <Onglets valeur={base} onChange={setBase} className="mb-4" options={[{ id: "tout", label: "Toutes les bases" }, ...BASES.map((b) => ({ id: b.id, label: b.nom }))]} />
      {!fichiers && !erreur ? <Chargement /> : null}
      {fichiers && !visibles.length ? <Vide titre="Aucun fichier" texte="Importe un premier fichier pour pouvoir le cibler dans une campagne." /> : null}
      {visibles.length ? (
        <Tableau>
          <thead><tr><Th>Fichier</Th><Th>Base</Th><Th>Importé le</Th><Th num>Contacts</Th><Th num>Mails</Th><Th num>Touchés</Th><Th num>Réponses</Th><Th num>Leads</Th><Th num>Gagnés</Th><Th>État</Th></tr></thead>
          <tbody>
            {visibles.map((f) => { const e = etatDe(f); return (
              <Tr key={f.id} onClick={() => setOuvert(f.id)}>
                <Td><span className="block max-w-[280px] truncate font-medium text-encre">{f.nom}</span><span className="text-colonne text-encre-2">{[f.source, f.zone].filter(Boolean).join(" · ")}</span></Td>
                <Td>{nomBase(f.baseId)}</Td><Td><span className="chiffres">{date(f.creeLe)}</span></Td>
                <Td num>{fr(f.contacts)}</Td><Td num>{fr(f.mails)}</Td><Td num>{fr(f.touches)}</Td>
                <Td num>{f.touches ? `${fr(f.reponses)} · ${pct(f.reponses, f.touches)}` : "—"}</Td><Td num>{fr(f.leads)}</Td><Td num>{fr(f.gagnes)}</Td>
                <Td><Pastille role={e.role} point>{e.texte}</Pastille></Td>
              </Tr>
            ) })}
          </tbody>
        </Tableau>
      ) : null}
      {imports ? <Importer session={session} onFermer={() => setImports(false)} onImporte={() => { setImports(false); charger() }} /> : null}
      {courant ? <Detail f={courant} onFermer={() => setOuvert(null)} onChange={charger} /> : null}
    </div>
  )
}
