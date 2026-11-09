// ── CRÉER / MODIFIER UNE CAMPAGNE (Mahdi, 09/11/2026 : « tout reste programmable, en libre décision ») ──
// Six parties : Audience (la carte comme Meta), Actions et séquence, Créatifs, Qualification, Garde-fous, Mesure.
// À droite, le chemin du contact se redessine à chaque changement. Rien ne part tant qu'elle n'est pas lancée.
import { Suspense, lazy, useMemo, useState } from "react"
import { Check } from "lucide-react"
import { Bandeau, Bouton, Champ, Chargement, Onglets, Selecteur } from "../../ui"
import { Bloc, Etiquette } from "../demarchage/aujourdhui/courtier"
import { useDepot } from "../../prospection/depot"
import { estEligible, type Campagne } from "../../prospection/modele"
import { GARDE_DEFAUT, ORIGINE_TRACABILITE, compiler, configDe, messageVide, type ConfigCampagne } from "../../prospection/configCampagne"
import { MODELES } from "./moteur/modelesCampagne"
import { Chemin, Creatifs, Libelle, Qualification, Sequence, type MajConfig } from "./moteur/Parties"
import { Titre } from "./morceaux"
import { fr, useVue } from "./outils"

const Carte = lazy(() => import("./moteur/Carte"))
type Partie = "audience" | "sequence" | "creatifs" | "qualification" | "garde" | "mesure"
const JOURS = ["L", "M", "M", "J", "V", "S", "D"]
// La carte remplace ces filtres : ils ne s'affichent pas en boutons.
const CHAMPS_GEO = ["secteur", "cp", "zone"]

export default function Editeur({ id, fini }: { id: string | null; fini: (id: string) => void }) {
  const v = useVue()
  const depot = useDepot()
  const existante = id ? v.etat.campagnes.find((c) => c.id === id) : null
  const [c, setC] = useState<Campagne>(() => existante ?? {
    id: crypto.randomUUID(), nom: "", baseId: v.bases[0]?.id ?? "", objectif: "Créer des leads", statut: "brouillon",
    audience: { filtres: {}, doitAvoir: ["email", "telephone"] }, rythme: { parJour: 20, jours: [1, 2, 3, 4, 5], heureMin: 9, heureMax: 18, ecartMinH: 48 },
    etapes: [], signaux: [], creeParId: v.compte.id, creeLe: v.etat.maintenant, lanceeLe: null, coutSms: 0.06, modeTest: true, testEmail: "gestion@stcbatiment.fr", testMobile: "",
  })
  const [cfg, setCfg] = useState<ConfigCampagne>(() => configDe(c))
  const [partie, setPartie] = useState<Partie>("audience")
  const [ex, setEx] = useState("")
  const maj: MajConfig = (f) => setCfg(f)
  const tracabilite = c.origine === ORIGINE_TRACABILITE
  const base = v.base(c.baseId)
  const contactsBase = useMemo(() => v.contacts.filter((x) => x.baseId === c.baseId), [v.contacts, c.baseId])
  const compilee = useMemo(() => compiler(c, cfg), [c, cfg])
  const eligibles = useMemo(() => contactsBase.filter((x) => estEligible(x, compilee)).length, [contactsBase, compilee])
  const vide = messageVide(cfg)
  const valeurs = (cle: string) => [...new Set(contactsBase.flatMap((x) => (x.champs[cle] ?? "").split(" / ")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")).slice(0, 40)
  const basculerFiltre = (cle: string, val: string) => setC((x) => { const l = x.audience.filtres[cle] ?? []; return { ...x, audience: { ...x.audience, filtres: { ...x.audience.filtres, [cle]: l.includes(val) ? l.filter((y) => y !== val) : [...l, val] } } } })
  const compter = c.baseId === "agences" ? (zone: string) => contactsBase.filter((x) => (x.champs.cp ?? "").startsWith(zone)).length : null
  const enregistrer = (statut: Campagne["statut"]) => { const s = { ...compilee, nom: c.nom.trim() || "Campagne sans nom", statut, lanceeLe: statut === "active" ? c.lanceeLe ?? v.etat.maintenant : c.lanceeLe }; depot.enregistrerCampagne(s); fini(s.id) }
  const iL = cfg.qualification.etapes.findIndex((e) => e.id === cfg.qualification.leadA), iG = cfg.qualification.etapes.findIndex((e) => e.id === cfg.qualification.gagneA)
  const entonnoir = ["Contacts dans la campagne", "Touchés", "Ouvert", "Cliqué", ...(cfg.qualification.interet.length ? ["Intérêt (session de call)"] : []), ...cfg.qualification.etapes.slice(0, iG + 1).filter((e) => !(cfg.qualification.interet.length && e.type === "Intérêt détecté" && e.id !== cfg.qualification.leadA)).map((e) => e.nom)]

  return (
    <div className="space-y-5">
      <Titre titre={existante ? existante.nom : "Créer une campagne"} sous={tracabilite ? "Ce qui tourne aujourd'hui : les mails envoyés après les appels, avec leurs liens suivis. Cette campagne n'envoie rien toute seule." : existante?.statut === "active" ? "Campagne active : les changements valent pour les prochaines touches." : "Rien ne part tant qu'elle n'est pas lancée."}
        droite={<><Bouton onClick={() => enregistrer(c.statut)}>Enregistrer</Bouton>{c.statut !== "active" && !tracabilite ? <Bouton variante="plein" icone={<Check />} disabled={!eligibles || vide} title={vide ? "Un message est vide" : !eligibles ? "Personne dans l'audience" : undefined} onClick={() => enregistrer("active")}>Lancer</Bouton> : null}</>} />
      {!existante ? <div><Etiquette>Partir de… (tout reste modifiable)</Etiquette><div className="mt-2 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>{MODELES.filter((m) => v.bases.some((b) => b.id === m.baseId)).map((m) => <button key={m.id} type="button" onClick={() => { setC((x) => ({ ...x, baseId: m.baseId, nom: x.nom || m.titre, audience: { ...x.audience, filtres: {} } })); setCfg(m.creer()) }} className="rounded-4 border-[0.5px] border-trait p-3 text-left hover:bg-fond-2"><b className="block text-legende font-medium">{m.titre}</b><span className="text-colonne text-encre-2">{m.aide}</span></button>)}</div></div> : null}
      <div className="grid gap-10 @min-[1100px]:grid-cols-[minmax(0,1fr)_250px]">
        <div className="min-w-0">
          <Onglets<Partie> valeur={partie} onChange={setPartie} options={[{ id: "audience", label: "1 · Audience" }, { id: "sequence", label: "2 · Actions et séquence" }, { id: "creatifs", label: "3 · Créatifs" }, { id: "qualification", label: "4 · Qualification" }, { id: "garde", label: "5 · Garde-fous" }, { id: "mesure", label: "6 · Mesure" }]} />
          <div className="mt-6">
            {partie === "audience" ? (
              <div className="space-y-8">
                <Bloc titre="La campagne"><div className="mt-3 grid grid-cols-2 gap-4">
                  <Libelle titre="Nom"><Champ value={c.nom} placeholder="Ex. Gestionnaires 92 · novembre" onChange={(e) => setC({ ...c, nom: e.target.value })} /></Libelle>
                  <Libelle titre="Base"><Selecteur value={c.baseId} disabled={Boolean(existante?.lanceeLe) || tracabilite} onChange={(e) => setC({ ...c, baseId: e.target.value, audience: { ...c.audience, filtres: {} } })}>{v.bases.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}</Selecteur></Libelle>
                </div></Bloc>
                <Bloc titre="Où" droite={<span className="chiffres text-colonne text-encre"><b className="font-medium">{fr(eligibles)}</b> {base?.unite} éligibles</span>}>
                  <div className="mt-3"><Suspense fallback={<Chargement texte="Lecture de la carte…" />}><Carte zones={cfg.zones} compter={compter} onChange={(z) => maj((x) => ({ ...x, zones: z }))} avertissement={c.baseId === "artisans" ? "La base ne connaît que Paris, petite et grande couronne : le ciblage se fait sur ces trois zones." : undefined} /></Suspense></div>
                </Bloc>
                <Bloc titre="Qui on touche"><div className="mt-3 space-y-4">
                  {base?.champs.filter((ch) => !CHAMPS_GEO.includes(ch.cle)).map((ch) => <div key={ch.cle}><Etiquette>{ch.libelle}</Etiquette><div className="mt-1.5 flex flex-wrap gap-1.5">{valeurs(ch.cle).map((val) => { const on = (c.audience.filtres[ch.cle] ?? []).includes(val); return <button key={val} type="button" onClick={() => basculerFiltre(ch.cle, val)} className={`h-7 rounded-full px-3 text-colonne ${on ? "bg-action text-white" : "border-[0.5px] border-trait bg-fond text-encre hover:bg-fond-2"}`}>{val}</button> })}</div></div>)}
                  <div className="flex flex-wrap gap-4 text-legende">{(["email", "telephone", "mobile"] as const).map((x) => <label key={x} className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--color-action)]" checked={c.audience.doitAvoir.includes(x)} onChange={() => setC({ ...c, audience: { ...c.audience, doitAvoir: c.audience.doitAvoir.includes(x) ? c.audience.doitAvoir.filter((y) => y !== x) : [...c.audience.doitAvoir, x] } })} />Doit avoir un {x === "email" ? "mail" : x === "telephone" ? "téléphone" : "mobile (pour les SMS)"}</label>)}</div>
                  <div className="grid max-w-[640px] grid-cols-4 gap-4">
                    <Libelle titre="Entrées par jour"><Champ type="number" min={1} value={c.rythme.parJour} onChange={(e) => setC({ ...c, rythme: { ...c.rythme, parJour: Number(e.target.value) || 1 } })} /></Libelle>
                    <Libelle titre="De (heure)"><Champ type="number" min={0} max={23} value={c.rythme.heureMin} onChange={(e) => setC({ ...c, rythme: { ...c.rythme, heureMin: Number(e.target.value) } })} /></Libelle>
                    <Libelle titre="À (heure)"><Champ type="number" min={1} max={24} value={c.rythme.heureMax} onChange={(e) => setC({ ...c, rythme: { ...c.rythme, heureMax: Number(e.target.value) } })} /></Libelle>
                    <Libelle titre="Écart entre touches (h)"><Champ type="number" min={0} value={c.rythme.ecartMinH} onChange={(e) => setC({ ...c, rythme: { ...c.rythme, ecartMinH: Number(e.target.value) } })} /></Libelle>
                  </div>
                  <div className="flex gap-1">{JOURS.map((j, i) => { const on = c.rythme.jours.includes(i + 1); return <button key={i} type="button" aria-pressed={on} onClick={() => setC({ ...c, rythme: { ...c.rythme, jours: on ? c.rythme.jours.filter((x) => x !== i + 1) : [...c.rythme.jours, i + 1].sort() } })} className={`h-8 w-8 rounded-full text-colonne ${on ? "bg-action text-white" : "bg-fond-3 text-encre-2"}`}>{j}</button> })}</div>
                </div></Bloc>
              </div>
            ) : partie === "sequence" ? <Sequence cfg={cfg} maj={maj} allerCreatifs={() => setPartie("creatifs")} />
              : partie === "creatifs" ? <Creatifs cfg={cfg} maj={maj} />
              : partie === "qualification" ? <Qualification cfg={cfg} maj={maj} />
              : partie === "garde" ? (
                <div className="max-w-[720px] space-y-8">
                  <Bandeau role="info">Le mode test et le coût des SMS s'appliquent déjà. Les autres réglages sont enregistrés : le moteur garde pour l'instant ses plafonds actuels (200 mails et 40 SMS par jour et par campagne).</Bandeau>
                  <Bloc titre="Ne pas fatiguer les contacts"><div className="mt-3 grid grid-cols-3 gap-4">
                    <Libelle titre="Écart entre deux campagnes (j)"><Champ type="number" min={0} value={cfg.garde.ecartCampagnes} onChange={(e) => maj((x) => ({ ...x, garde: { ...x.garde, ecartCampagnes: Number(e.target.value) || 0 } }))} /></Libelle>
                    <Libelle titre="Mails par jour, maximum"><Champ type="number" min={0} value={cfg.garde.plafondMail} onChange={(e) => maj((x) => ({ ...x, garde: { ...x.garde, plafondMail: Number(e.target.value) || 0 } }))} /></Libelle>
                    <Libelle titre="SMS par jour, maximum"><Champ type="number" min={0} value={cfg.garde.plafondSms} onChange={(e) => maj((x) => ({ ...x, garde: { ...x.garde, plafondSms: Number(e.target.value) || 0 } }))} /></Libelle>
                  </div></Bloc>
                  <Bloc titre="Toujours exclus"><div className="mt-3 flex flex-wrap items-center gap-1.5">{(cfg.garde.exclusions ?? GARDE_DEFAUT.exclusions).map((m) => <span key={m} className="inline-flex h-7 items-center gap-1 rounded-full bg-fond-3 px-3 text-colonne">{m}<button type="button" aria-label={`Retirer ${m}`} className="ml-1 text-encre-2 hover:text-encre" onClick={() => maj((x) => ({ ...x, garde: { ...x.garde, exclusions: x.garde.exclusions.filter((y) => y !== m) } }))}>×</button></span>)}<span className="w-52"><Champ value={ex} placeholder="Ajouter + Entrée" aria-label="Ajouter une exclusion" onChange={(e) => setEx(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && ex.trim()) { maj((x) => ({ ...x, garde: { ...x.garde, exclusions: [...x.garde.exclusions, ex.trim()] } })); setEx("") } }} /></span></div></Bloc>
                  {!tracabilite ? <Bloc titre="Mode test" droite={c.modeTest ? <span className="text-colonne text-attention">actif</span> : <span className="text-colonne text-encre-2">envois réels</span>}>
                    <label className="mt-3 flex items-center gap-2 text-legende"><input type="checkbox" className="accent-[var(--color-action)]" checked={Boolean(c.modeTest)} onChange={(e) => setC({ ...c, modeTest: e.target.checked })} />Tout envoyer à moi, pas aux contacts</label>
                    {c.modeTest ? <div className="mt-2 grid max-w-[520px] grid-cols-2 gap-2"><Champ value={c.testEmail ?? ""} aria-label="Adresse de test" onChange={(e) => setC({ ...c, testEmail: e.target.value })} placeholder="Adresse de test" /><Champ value={c.testMobile ?? ""} aria-label="Mobile de test" onChange={(e) => setC({ ...c, testMobile: e.target.value })} placeholder="Mobile de test (pour les SMS)" /></div> : null}
                  </Bloc> : null}
                  <Bloc titre="Coûts"><label className="mt-3 flex items-center gap-2 text-legende">Un SMS coûte <Champ type="number" step="0.01" min={0} className="!w-20" value={c.coutSms} onChange={(e) => setC({ ...c, coutSms: Number(e.target.value) })} /> €</label></Bloc>
                </div>
              ) : (
                <div className="max-w-[720px] space-y-8">
                  <Bloc titre="L'entonnoir de cette campagne" droite="il suit ton parcours"><ol className="mt-3 divide-y-[0.5px] divide-trait">{entonnoir.map((l, i) => <li key={i} className="flex items-center gap-2 py-2 text-legende">{l}{l === cfg.qualification.etapes[iL]?.nom ? <span className="rounded-full bg-signature px-2 text-[10px] font-medium leading-4 text-white">LEAD</span> : null}{l === cfg.qualification.etapes[iG]?.nom ? <span className="rounded-full bg-ok px-2 text-[10px] font-medium leading-4 text-white">GAGNÉ</span> : null}</li>)}</ol><p className="mt-3 text-colonne text-encre-2">Les chiffres d'envoi, d'ouverture et de clic sont dans le suivi de la campagne. Les chiffres par étape et les coûts arrivent avec le parcours.</p></Bloc>
                </div>
              )}
          </div>
        </div>
        <div className="min-w-0"><div className="sticky top-4"><Chemin cfg={cfg} /></div></div>
      </div>
    </div>
  )
}
