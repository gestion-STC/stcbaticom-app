// ── CRÉER / MODIFIER UNE CAMPAGNE (Mahdi, 09/11/2026 : « tout reste programmable, en libre décision ») ──
// Six parties : Audience (la carte comme Meta), Actions et séquence, Créatifs, Qualification, Garde-fous, Mesure.
// À droite, le chemin du contact se redessine à chaque changement. Rien ne part tant qu'elle n'est pas lancée.
import { Suspense, lazy, useEffect, useMemo, useState } from "react"
import { Check } from "lucide-react"
import { Bouton, Champ, Chargement, Dialogue, Onglets } from "../../ui"
import { Bloc, Etiquette } from "../demarchage/aujourdhui/courtier"
import { useDepot } from "../../prospection/depot"
import { estEligible, type Campagne } from "../../prospection/modele"
import { sansDejaSollicites } from "../../prospection/pareFeu"
import { estBaseAvis } from "../../prospection/avis"
import MesureAvis from "./moteur/MesureAvis"
import ChoixObjectif from "./moteur/ChoixObjectif"
import TailleAudience from "./moteur/TailleAudience"
import { ChoixFichiers } from "./moteur/ChoixFichiers"
import { boitesDe, conseilsEnvoi, valeursDe } from "../../prospection/instantlyOutils"
import { chargerBoites, type BoiteEnvoi } from "../../lib/etatInstantly"
import { listerComptes, type Compte } from "../../lib/comptes"
import { GARDE_DEFAUT, ORIGINE_TRACABILITE, compiler, configDe, messageVide, type ConfigCampagne } from "../../prospection/configCampagne"
import { MODELES } from "./moteur/modelesCampagne"
import { Chemin, Creatifs, Libelle, Qualification, Sequence, type MajConfig } from "./moteur/Parties"
import { Titre } from "./morceaux"
import { fr, useVue } from "./outils"

import MesureCampagne from "./moteur/MesureCampagne"

const Carte = lazy(() => import("./moteur/Carte"))
type Partie = "audience" | "sequence" | "creatifs" | "qualification" | "garde" | "mesure"
const JOURS = ["L", "M", "M", "J", "V", "S", "D"]
// La carte remplace ces filtres : ils ne s'affichent pas en boutons.
const CHAMPS_GEO = ["secteur", "cp", "zone"]

export default function Editeur({ id, fini, annuler }: { id: string | null; fini: (id: string) => void; annuler: () => void }) {
  const v = useVue()
  const depot = useDepot()
  const existante = id ? v.etat.campagnes.find((c) => c.id === id) : null
  const [c, setC] = useState<Campagne>(() => existante ?? {
    id: crypto.randomUUID(), nom: "", baseId: v.bases[0]?.id ?? "", objectif: "Créer des leads", statut: "brouillon",
    audience: { filtres: {}, doitAvoir: ["email", "telephone"] }, rythme: { parJour: 20, jours: [1, 2, 3, 4, 5], heureMin: 9, heureMax: 18, ecartMinH: 48 },
    etapes: [], signaux: [], creeParId: v.compte.id, creeLe: v.etat.maintenant, lanceeLe: null, coutSms: 0.06, modeTest: false, testEmail: "", testMobile: "",
  })
  const [cfg, setCfg] = useState<ConfigCampagne>(() => configDe(c))
  const [partie, setPartie] = useState<Partie>("audience")
  const [modeleId, setModeleId] = useState<string | null>(null)
  const [cfgDepart, setCfgDepart] = useState(() => JSON.stringify(cfg))
  const [baseVoulue, setBaseVoulue] = useState<string | null>(null)
  const [boites, setBoites] = useState<BoiteEnvoi[]>([])
  const [comptes, setComptes] = useState<Compte[]>([])
  useEffect(() => { chargerBoites().then(setBoites).catch(() => undefined); listerComptes().then(setComptes).catch(() => undefined) }, [])
  const [objectifChoisi, setObjectifChoisi] = useState(Boolean(existante))
  const choisirObjectif = (m: (typeof MODELES)[number] | null) => {
    if (m) { const n = m.creer(); setC((x) => ({ ...x, baseId: m.baseId, nom: x.nom || m.titre, audience: { ...x.audience, filtres: {}, doitAvoir: estBaseAvis(m.baseId) ? ["email"] : x.audience.doitAvoir } })); setCfg(n); setCfgDepart(JSON.stringify(n)); setModeleId(m.id) }
    setObjectifChoisi(true)
  }
  // Changer de cible remet le réglage prévu pour cette cible : on ne garde pas les textes d'une autre cible.
  const appliquerBase = (id: string) => {
    const suffixe = modeleId?.split("-")[1]
    const m = modeleId ? MODELES.find((x) => x.baseId === id && x.id.endsWith(`-${suffixe}`)) ?? MODELES.find((x) => x.baseId === id) : undefined
    const ancien = MODELES.find((x) => x.id === modeleId)?.titre
    const n = m ? m.creer() : configDe({ ...c, baseId: id, config: undefined, etapes: [], signaux: [] })
    setC((x) => ({ ...x, baseId: id, nom: m && (!x.nom || x.nom === ancien) ? m.titre : x.nom, audience: { ...x.audience, filtres: {} } })); setCfg(n); setCfgDepart(JSON.stringify(n)); setModeleId(m?.id ?? null); setBaseVoulue(null)
  }
  const changerBase = (id: string) => { if (id !== c.baseId) { if (JSON.stringify(cfg) === cfgDepart) appliquerBase(id); else setBaseVoulue(id) } }
  const [ex, setEx] = useState("")
  const [confirmer, setConfirmer] = useState(false)
  const maj: MajConfig = (f) => setCfg(f)
  const tracabilite = c.origine === ORIGINE_TRACABILITE
  const base = v.base(c.baseId)
  const contactsBase = useMemo(() => v.contacts.filter((x) => x.baseId === c.baseId), [v.contacts, c.baseId])
  const compilee = useMemo(() => compiler(c, cfg), [c, cfg])
  const eligibles = useMemo(() => contactsBase.filter((x) => estEligible(x, compilee)).length, [contactsBase, compilee])
  const vide = messageVide(cfg)
  const avis = estBaseAvis(c.baseId)
  // Le pare-feu, à l'écran : ceux qui sont déjà dans une campagne en cours attendront qu'elle soit finie.
  const enAttente = useMemo(() => {
    const ici = contactsBase.filter((x) => estEligible(x, compilee))
    const parId = new Map(v.contacts.map((x) => [x.id, x]))
    const dedans = new Set(v.etat.inscriptions.filter((i) => i.campagneId === c.id).map((i) => i.contactId))
    const actifs = v.etat.inscriptions.filter((i) => i.statut === "en_cours").flatMap((i) => parId.get(i.contactId) ?? [])
    return ici.length - sansDejaSollicites(ici, dedans, actifs).length
  }, [contactsBase, compilee, v.contacts, v.etat.inscriptions, c.id])
  const valeurs = (cle: string) => [...new Set(contactsBase.flatMap((x) => (x.champs[cle] ?? "").split(" / ")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")).slice(0, 40)
  const basculerFiltre = (cle: string, val: string) => setC((x) => { const l = x.audience.filtres[cle] ?? []; return { ...x, audience: { ...x.audience, filtres: { ...x.audience.filtres, [cle]: l.includes(val) ? l.filter((y) => y !== val) : [...l, val] } } } })
  const compter = c.baseId !== "artisans" ? (zone: string) => contactsBase.filter((x) => (x.champs.cp ?? "").startsWith(zone)).length : null
  // Les conseils : le volume de toutes les campagnes qui partagent ces boîtes, et leur chauffe.
  const conseils = useMemo(() => {
    if (estBaseAvis(c.baseId)) return []
    const emails = boites.map((b) => b.email), miennes = boitesDe(c.baseId, emails)
    const autres = v.etat.campagnes.filter((x) => x.id !== c.id && x.statut === "active" && !estBaseAvis(x.baseId) && boitesDe(x.baseId, emails).some((e) => miennes.includes(e)))
    return conseilsEnvoi(boites.filter((b) => miennes.includes(b.email)), c.rythme.parJour + autres.reduce((n, x) => n + x.rythme.parJour, 0), v.etat.maintenant)
  }, [boites, c.baseId, c.id, c.rythme.parJour, v.etat.campagnes, v.etat.maintenant])
  const blocConseils = conseils.length ? <div className="space-y-1">{conseils.map((t) => <p key={t} className="text-colonne text-attention">{t}</p>)}</div> : null
  const pageAvis = cfg.creatifs.find((k) => k.type === "avis")
  const nomValeur = (cle: string, val: string) => { if (cle !== "commercial") return val; const q = comptes.find((x) => x.id === val); return q ? q.nom || q.email : "Commercial" }
  const champFiltre = (ch: { cle: string; libelle: string }) => <div key={ch.cle}><Etiquette>{ch.libelle}</Etiquette><div className="mt-1.5 flex flex-wrap gap-1.5">{valeurs(ch.cle).map((val) => { const on = (c.audience.filtres[ch.cle] ?? []).includes(val); return <button key={val} type="button" onClick={() => basculerFiltre(ch.cle, val)} className={`h-7 rounded-full px-3 text-colonne ${on ? "bg-action text-white" : "border-[0.5px] border-trait bg-fond text-encre hover:bg-fond-2"}`}>{nomValeur(ch.cle, val)}</button> })}</div></div>
  const enregistrer = (statut: Campagne["statut"]) => { const s = { ...compilee, nom: c.nom.trim() || "Campagne sans nom", statut, lanceeLe: statut === "active" ? c.lanceeLe ?? v.etat.maintenant : c.lanceeLe }; depot.enregistrerCampagne(s); fini(s.id) }

  return (
    <div className="space-y-5">
      {confirmer ? <Dialogue titre="Lancer pour de vrai ?" description={c.modeTest ? "Cette campagne est en mode essai : les envois partiront vers l'adresse d'essai." : `${fr(eligibles)} ${base?.unite ?? "contacts"} sont concernés. Les envois partent de ${c.rythme.heureMin} h à ${c.rythme.heureMax} h, ${fr(c.rythme.parJour)} nouveaux contacts par jour au plus.`} onFermer={() => setConfirmer(false)} pied={<><Bouton onClick={() => setConfirmer(false)}>Annuler</Bouton><Bouton variante="plein" icone={<Check />} onClick={() => enregistrer("active")}>Lancer la campagne</Bouton></>}><div className="space-y-3">{blocConseils}{pageAvis ? <Libelle titre="Lien Google, proposé à tout le monde après l'avis"><Champ value={pageAvis.lienGoogle ?? ""} placeholder="https://g.page/r/…/review" onChange={(e) => maj((x) => ({ ...x, creatifs: x.creatifs.map((k) => (k.id === pageAvis.id ? { ...k, lienGoogle: e.target.value } : k)) }))} /></Libelle> : null}<p className="text-legende text-encre-2">Pour vérifier un mail avant, utilise « M'envoyer un essai » dans l'onglet Créatifs : aucun contact n'est touché.</p></div></Dialogue> : null}
      {baseVoulue ? <Dialogue titre="Changer de cible ?" description="Tes textes et ton parcours seront remplacés par ceux prévus pour cette cible." onFermer={() => setBaseVoulue(null)} pied={<><Bouton onClick={() => setBaseVoulue(null)}>Annuler</Bouton><Bouton variante="plein" onClick={() => appliquerBase(baseVoulue)}>Changer de cible</Bouton></>}><p className="text-legende text-encre-2">Ton audience et tes filtres sont aussi remis à zéro.</p></Dialogue> : null}
      {!objectifChoisi ? <ChoixObjectif modeles={MODELES.filter((m) => v.bases.some((b) => b.id === m.baseId))} onChoisir={choisirObjectif} onAnnuler={annuler} /> : null}
      <Titre titre={existante ? existante.nom : "Créer une campagne"} sous={tracabilite ? "Ce qui tourne aujourd'hui : les mails envoyés après les appels, avec leurs liens suivis. Cette campagne n'envoie rien toute seule." : existante?.statut === "active" ? "Campagne active : les changements valent pour les prochaines touches." : "Rien ne part tant qu'elle n'est pas lancée."}
        droite={<><Bouton onClick={() => enregistrer(c.statut)}>Enregistrer</Bouton>{c.statut !== "active" && !tracabilite ? <Bouton variante="plein" icone={<Check />} disabled={!eligibles || vide} title={vide ? "Un message est vide" : !eligibles ? "Personne dans l'audience" : undefined} onClick={() => setConfirmer(true)}>Lancer</Bouton> : null}</>} />
      <div className="grid gap-10 @min-[1100px]:grid-cols-[minmax(0,1fr)_250px]">
        <div className="min-w-0">
          <Onglets<Partie> valeur={partie} onChange={setPartie} options={avis ? [{ id: "audience", label: "1 · Audience" }, { id: "sequence", label: "2 · Actions et séquence" }, { id: "creatifs", label: "3 · Créatifs" }, { id: "garde", label: "4 · Garde-fous" }, { id: "mesure", label: "5 · Mesure" }] : [{ id: "audience", label: "1 · Audience" }, { id: "sequence", label: "2 · Actions et séquence" }, { id: "creatifs", label: "3 · Créatifs" }, { id: "qualification", label: "4 · Qualification" }, { id: "garde", label: "5 · Garde-fous" }, { id: "mesure", label: "6 · Mesure" }]} />
          <div className="mt-6">
            {partie === "audience" ? (
              <div className="space-y-8">
                <Bloc titre="La campagne"><div className="mt-3 max-w-[520px]">
                  <Libelle titre="Nom"><Champ value={c.nom} placeholder="Ex. Gestionnaires 92 · novembre" onChange={(e) => setC({ ...c, nom: e.target.value })} /></Libelle>
                </div></Bloc>
                <Bloc titre="1 · À qui s'adresse cette campagne ?"><div className="mt-3">
                  <div className="flex flex-wrap gap-1.5">{v.bases.filter((b) => estBaseAvis(b.id) === avis).map((b) => { const on = b.id === c.baseId, fige = Boolean(existante?.lanceeLe) || tracabilite; return <button key={b.id} type="button" aria-pressed={on} disabled={fige && !on} onClick={() => changerBase(b.id)} className={`h-8 rounded-full px-3.5 text-legende disabled:opacity-40 ${on ? "bg-action text-white" : "border-[0.5px] border-trait text-encre hover:bg-fond-2"}`}>{b.nom}</button> })}</div>
                </div></Bloc>
                {!avis ? <Bloc titre="2 · Dans quels fichiers ?"><div className="mt-3"><ChoixFichiers baseId={c.baseId} valeurs={c.audience.filtres.fichier ?? []} onChange={(l) => setC((x) => ({ ...x, audience: { ...x.audience, filtres: { ...x.audience.filtres, fichier: l } } }))} /></div></Bloc> : null}
                {avis ? <p className="chiffres text-colonne text-encre"><b className="font-medium">{fr(eligibles)}</b> {base?.unite} éligibles</p> : <Bloc titre="3 · Où" droite={<span className="chiffres text-colonne text-encre"><b className="font-medium">{fr(eligibles)}</b> {base?.unite} éligibles</span>}>
                  <div className="mt-3"><Suspense fallback={<Chargement texte="Lecture de la carte…" />}><Carte zones={cfg.zones} compter={compter} onChange={(z) => maj((x) => ({ ...x, zones: z }))} avertissement={c.baseId === "artisans" ? "La base ne connaît que Paris, petite et grande couronne : le ciblage se fait sur ces trois zones." : undefined} /></Suspense></div>
                  {base?.champs.some((ch) => ch.cle === "secteur") ? <div className="mt-4">{base.champs.filter((ch) => ch.cle === "secteur").map(champFiltre)}</div> : null}
                </Bloc>}
                <Bloc titre={avis ? "Qui on touche" : "4 · Qui on touche"}><div className="mt-3 space-y-4">
                  {base?.champs.filter((ch) => !CHAMPS_GEO.includes(ch.cle)).map(champFiltre)}
                  <Libelle titre="Sans contact depuis (jours)" className="max-w-[220px]"><Champ type="number" min={0} placeholder="Tous" value={c.audience.pasContacteDepuis || ""} onChange={(e) => setC({ ...c, audience: { ...c.audience, pasContacteDepuis: Number(e.target.value) || undefined } })} /></Libelle>
                  <div className="flex flex-wrap gap-4 text-legende">{(["email", "telephone", "mobile"] as const).map((x) => <label key={x} className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--color-action)]" checked={c.audience.doitAvoir.includes(x)} onChange={() => setC({ ...c, audience: { ...c.audience, doitAvoir: c.audience.doitAvoir.includes(x) ? c.audience.doitAvoir.filter((y) => y !== x) : [...c.audience.doitAvoir, x] } })} />Doit avoir un {x === "email" ? "mail" : x === "telephone" ? "téléphone" : "mobile (pour les SMS)"}</label>)}</div>
                </div></Bloc>
              </div>
            ) : partie === "sequence" ? <Sequence cfg={cfg} maj={maj} allerCreatifs={() => setPartie("creatifs")} avis={avis} />
              : partie === "creatifs" ? <Creatifs cfg={cfg} maj={maj} avis={avis} exemple={contactsBase[0] ? valeursDe(contactsBase[0]) : undefined} baseId={c.baseId} />
              : partie === "qualification" ? <Qualification cfg={cfg} maj={maj} baseId={c.baseId} />
              : partie === "garde" ? (
                <div className="max-w-[720px] space-y-8">
                  <Bloc titre="Rythme d'envoi"><div className="mt-3 space-y-3">
                    <div className="grid grid-cols-4 gap-4">
                      <Libelle titre="Envois par jour, relances comprises"><Champ type="number" min={1} value={c.rythme.parJour} onChange={(e) => setC({ ...c, rythme: { ...c.rythme, parJour: Number(e.target.value) || 1 } })} /></Libelle>
                      <Libelle titre="De (heure)"><Champ type="number" min={0} max={23} value={c.rythme.heureMin} onChange={(e) => setC({ ...c, rythme: { ...c.rythme, heureMin: Number(e.target.value) } })} /></Libelle>
                      <Libelle titre="À (heure)"><Champ type="number" min={1} max={24} value={c.rythme.heureMax} onChange={(e) => setC({ ...c, rythme: { ...c.rythme, heureMax: Number(e.target.value) } })} /></Libelle>
                      <Libelle titre="Écart entre deux envois (h)"><Champ type="number" min={0} value={c.rythme.ecartMinH} onChange={(e) => setC({ ...c, rythme: { ...c.rythme, ecartMinH: Number(e.target.value) } })} /></Libelle>
                    </div>
                    <div className="flex gap-1">{JOURS.map((j, i) => { const on = c.rythme.jours.includes(i + 1); return <button key={i} type="button" aria-pressed={on} onClick={() => setC({ ...c, rythme: { ...c.rythme, jours: on ? c.rythme.jours.filter((x) => x !== i + 1) : [...c.rythme.jours, i + 1].sort() } })} className={`h-8 w-8 rounded-full text-colonne ${on ? "bg-action text-white" : "bg-fond-3 text-encre-2"}`}>{j}</button> })}</div>
                    {blocConseils}
                  </div></Bloc>
                  <Bloc titre="Ne pas fatiguer les contacts"><div className="mt-3 grid grid-cols-3 gap-4">
                    <Libelle titre="Écart entre deux campagnes (j)"><Champ type="number" min={0} value={cfg.garde.ecartCampagnes} onChange={(e) => maj((x) => ({ ...x, garde: { ...x.garde, ecartCampagnes: Number(e.target.value) || 0 } }))} /></Libelle>
                    {cfg.actions.some((a) => a.type === "sms") ? <Libelle titre="SMS par jour, maximum"><Champ type="number" min={0} value={cfg.garde.plafondSms} onChange={(e) => maj((x) => ({ ...x, garde: { ...x.garde, plafondSms: Number(e.target.value) || 0 } }))} /></Libelle> : null}
                  </div></Bloc>
                  <Bloc titre="Suivi des ouvertures"><div className="mt-3 space-y-2"><label className="flex items-center gap-2 text-legende"><input type="checkbox" className="accent-[var(--color-action)]" checked={cfg.garde.suiviOuvertures !== false} onChange={(e) => maj((x) => ({ ...x, garde: { ...x.garde, suiviOuvertures: e.target.checked } }))} />Savoir qui ouvre mes mails</label><p className="text-colonne text-encre-2">Conseil : la CNIL demande un consentement pour ce suivi, et il peut réduire l'arrivée en boîte de réception. Sans lui, « A ouvert » ne se déclenche pas.</p></div></Bloc>
                  <Bloc titre="Toujours exclus"><div className="mt-3 flex flex-wrap items-center gap-1.5">{(cfg.garde.exclusions ?? GARDE_DEFAUT.exclusions).map((m) => <span key={m} className="inline-flex h-7 items-center gap-1 rounded-full bg-fond-3 px-3 text-colonne">{m}{m === "Désinscrit" ? null : <button type="button" aria-label={`Retirer ${m}`} className="ml-1 text-encre-2 hover:text-encre" onClick={() => maj((x) => ({ ...x, garde: { ...x.garde, exclusions: x.garde.exclusions.filter((y) => y !== m) } }))}>×</button>}</span>)}<span className="w-52"><Champ value={ex} placeholder="Ex. Endormie, puis Entrée" aria-label="Ajouter une exclusion" onChange={(e) => setEx(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && ex.trim()) { maj((x) => ({ ...x, garde: { ...x.garde, exclusions: [...x.garde.exclusions, ex.trim()] } })); setEx("") } }} /></span></div></Bloc>
                  {!tracabilite && c.modeTest ? <Bloc titre="Mode essai" droite={c.modeTest ? <span className="text-colonne text-attention">actif</span> : <span className="text-colonne text-encre-2">envois réels</span>}>
                    <label className="mt-3 flex items-center gap-2 text-legende"><input type="checkbox" className="accent-[var(--color-action)]" checked={Boolean(c.modeTest)} onChange={(e) => setC({ ...c, modeTest: e.target.checked })} />Mode essai : les mails arrivent chez moi, pas chez les contacts</label>
                    {c.modeTest ? <div className="mt-2 grid max-w-[520px] grid-cols-2 gap-2"><Champ value={c.testEmail ?? ""} aria-label="Adresse de test" onChange={(e) => setC({ ...c, testEmail: e.target.value })} placeholder="Adresse de test" /><Champ value={c.testMobile ?? ""} aria-label="Mobile de test" onChange={(e) => setC({ ...c, testMobile: e.target.value })} placeholder="Mobile de test (pour les SMS)" /></div> : null}
                  </Bloc> : null}
                  <Bloc titre="Coûts"><label className="mt-3 flex items-center gap-2 text-legende">Un SMS coûte <Champ type="number" step="0.01" min={0} className="!w-20" value={c.coutSms} onChange={(e) => setC({ ...c, coutSms: Number(e.target.value) })} /> €</label></Bloc>
                </div>
              ) : (
                <div className="max-w-[720px] space-y-8">
                  {avis ? <MesureAvis campagneId={c.id} inscriptions={v.etat.inscriptions} envois={v.etat.envois} /> : <MesureCampagne campagne={c} cfg={cfg} inscriptions={v.etat.inscriptions} envois={v.etat.envois} evenements={v.etat.evenements} />}
                </div>
              )}
          </div>
        </div>
        <div className="min-w-0"><div className="sticky top-4 space-y-6"><TailleAudience total={eligibles} mails={contactsBase.filter((x) => x.email && estEligible(x, compilee)).length} mobiles={contactsBase.filter((x) => x.mobile && estEligible(x, compilee)).length} enAttente={enAttente} parJour={c.rythme.parJour} unite={base?.unite ?? "contacts"} cible={[base?.nom ?? "", avis ? "" : (c.audience.filtres.fichier?.length ? `${c.audience.filtres.fichier.length} fichier${c.audience.filtres.fichier.length > 1 ? "s" : ""}` : "toute la base"), cfg.zones.length ? `${cfg.zones.length} zone${cfg.zones.length > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ")} />{avis ? <p className="text-colonne text-encre-2">Une campagne d'avis ne crée ni lead ni appel. Les réponses arrivent dans Campagnes › Avis.</p> : <Chemin cfg={cfg} />}</div></div>
      </div>
    </div>
  )
}
