// ── LES PARTIES D'UNE CAMPAGNE (09/11/2026) : séquence, créatifs, qualification, garde-fous, et le chemin du contact ──
import { useEffect, useState, type ReactNode } from "react"
import { listerComptes, type Compte } from "../../../lib/comptes"
import { apercuMail, baliseImage } from "../../../prospection/apercuMail"
import AjoutImage from "./AjoutImage"
import InsererAvis from "./InsererAvis"
import { ArrowDown, ArrowUp, Clock, FileText, GitBranch, LayoutTemplate, Mail, MessageSquare, Newspaper, Phone, Play, Plus, Square, Star, Trash2, UserRoundPlus, X, type LucideIcon } from "lucide-react"
import { Bandeau, Bouton, Champ, Selecteur, Zone } from "../../../ui"
import { Bloc, Etiquette } from "../../demarchage/aujourdhui/courtier"
import { LIBELLE_CONDITION, LIBELLE_ETAPE, type Condition } from "../../../prospection/modele"
import { ATTRIBUTIONS, EVENEMENTS, OPERATEURS, QUI, TYPES_ETAPE, TYPES_FORMULAIRE, TYPES_QUESTION, VALIDATIONS, creatifVide, nid, questionVide, type Action, type ConfigCampagne, type Creatif, type EtapeParcours, type Qualite, type TypeAction, type TypeCreatif } from "../../../prospection/configCampagne"

export type MajConfig = (f: (c: ConfigCampagne) => ConfigCampagne) => void
const ICONE: Record<TypeAction, LucideIcon> = { mail: Mail, sms: MessageSquare, linkedin: UserRoundPlus, newsletter: Newspaper, appel: Phone, attendre: Clock, si: GitBranch, fin: Square }
const AIDE: Record<Exclude<TypeAction, "fin">, string> = { mail: "Envoie un créatif mail", sms: "Envoie un créatif SMS", linkedin: "Une tâche pour le commercial", newsletter: "Un envoi unique à toute l'audience", appel: "Le contact arrive en session de call", attendre: "Un délai en jours", si: "Si oui on continue, sinon on saute" }
const ICONE_CREATIF: Record<TypeCreatif, LucideIcon> = { mail: Mail, sms: MessageSquare, linkedin: UserRoundPlus, page: LayoutTemplate, formulaire: FileText, avis: Star }
const LIB_CREATIF: Record<TypeCreatif, string> = { mail: "Mail", sms: "SMS", linkedin: "LinkedIn", page: "Page", formulaire: "Formulaire", avis: "Page d'avis" }
const creatifPour = (t: TypeAction): TypeCreatif | null => (t === "mail" || t === "newsletter" ? "mail" : t === "sms" ? "sms" : t === "linkedin" ? "linkedin" : null)
function deplacer<T>(l: T[], i: number, d: number): T[] { const j = i + d; if (j < 0 || j >= l.length) return l; const x = [...l]; [x[i], x[j]] = [x[j], x[i]]; return x }

export const Libelle = ({ titre, children, className = "" }: { titre: string; children: ReactNode; className?: string }) => <label className={`block min-w-0 space-y-1 ${className}`}><Etiquette>{titre}</Etiquette>{children}</label>
const IconeBtn = ({ icone, label, onClick, off }: { icone: ReactNode; label: string; onClick: () => void; off?: boolean }) => <Bouton taille="icone" variante="discret" icone={icone} aria-label={label} disabled={off} onClick={onClick} />

// ── Actions et séquence ──
export function Sequence({ cfg, maj, allerCreatifs }: { cfg: ConfigCampagne; maj: MajConfig; allerCreatifs: () => void }) {
  const [palette, setPalette] = useState(false)
  const majA = (id: string, p: Partial<Action>) => maj((x) => ({ ...x, actions: x.actions.map((a) => (a.id === id ? { ...a, ...p } : a)) }))
  const ajouter = (type: TypeAction) => {
    maj((x) => {
      const pour = creatifPour(type)
      const a: Action = { id: nid(), type, jours: type === "attendre" ? 3 : undefined, condition: type === "si" ? "a_clique" : undefined, sinonVers: type === "si" ? null : undefined, consigne: type === "appel" ? "" : undefined, creatifId: pour ? x.creatifs.find((k) => k.type === pour)?.id : undefined }
      const l = [...x.actions]; const i = l.findIndex((y) => y.type === "fin"); l.splice(i >= 0 ? i : l.length, 0, a)
      return { ...x, actions: l }
    })
    setPalette(false)
  }
  return (
    <Bloc titre="Les actions, dans l'ordre" droite="ajoute, déplace, supprime">
      {!cfg.actions.length ? <p className="mt-3 text-legende text-encre-2">Aucune action automatique : cette campagne n'envoie rien toute seule.</p> : null}
      <ol className="mt-3 space-y-1">
        {cfg.actions.map((a, i) => { const I = ICONE[a.type]; const pour = creatifPour(a.type); return (
          <li key={a.id}>
            <div className={`flex flex-wrap items-center gap-3 rounded-4 border-[0.5px] border-trait px-3 py-2.5 ${a.type === "attendre" ? "border-dashed" : "bg-fond-2"}`}>
              <span className="chiffres w-4 text-colonne text-encre-3">{i + 1}</span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fond shadow-[0_0_0_0.5px_rgb(17_17_19/0.12)]"><I size={14} /></span>
              <b className="w-[90px] shrink-0 text-legende font-medium">{LIBELLE_ETAPE[a.type]}</b>
              <div className="min-w-[200px] flex-1">
                {pour ? <Selecteur value={a.creatifId ?? ""} aria-label="Créatif" onChange={(e) => (e.target.value === "_" ? allerCreatifs() : majA(a.id, { creatifId: e.target.value }))}><option value="">Choisir un créatif…</option>{cfg.creatifs.filter((k) => k.type === pour).map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}<option value="_">+ Créer un créatif</option></Selecteur>
                  : a.type === "attendre" ? <span className="flex items-center gap-2 text-legende"><Champ type="number" min={1} className="!w-20" aria-label="Jours" value={a.jours ?? 1} onChange={(e) => majA(a.id, { jours: Number(e.target.value) || 1 })} /> jours</span>
                  : a.type === "si" ? <span className="flex flex-wrap items-center gap-2 text-legende">Si le contact <span className="w-48"><Selecteur value={a.condition} aria-label="Condition" onChange={(e) => majA(a.id, { condition: e.target.value as Condition })}>{Object.entries(LIBELLE_CONDITION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Selecteur></span> on continue, sinon <span className="w-44"><Selecteur value={a.sinonVers ?? ""} aria-label="Sinon" onChange={(e) => majA(a.id, { sinonVers: e.target.value || null })}><option value="">étape suivante</option>{cfg.actions.slice(i + 1).map((x, j) => <option key={x.id} value={x.id}>étape {i + j + 2} · {LIBELLE_ETAPE[x.type]}</option>)}</Selecteur></span></span>
                  : a.type === "fin" ? <span className="text-colonne text-encre-2">Fin de la séquence</span>
                  : <div className="grid grid-cols-[minmax(0,1fr)_170px] gap-2"><Champ value={a.consigne ?? ""} placeholder="La consigne pour le commercial" onChange={(e) => majA(a.id, { consigne: e.target.value })} /><Selecteur value={a.cible ?? "contact"} aria-label="Qui appeler" onChange={(e) => majA(a.id, { cible: e.target.value as "standard" | "contact" })}><option value="contact">Appeler le contact</option><option value="standard">Appeler le standard</option></Selecteur></div>}
              </div>
              {a.type !== "fin" ? <span className="flex shrink-0 gap-1"><IconeBtn icone={<ArrowUp />} label="Monter" onClick={() => maj((x) => ({ ...x, actions: deplacer(x.actions, i, -1) }))} /><IconeBtn icone={<ArrowDown />} label="Descendre" onClick={() => maj((x) => ({ ...x, actions: deplacer(x.actions, i, 1) }))} /><IconeBtn icone={<Trash2 />} label="Supprimer" onClick={() => maj((x) => ({ ...x, actions: x.actions.filter((y) => y.id !== a.id) }))} /></span> : null}
            </div>
            {i < cfg.actions.length - 1 ? <ArrowDown size={12} className="mx-auto my-0.5 text-encre-3" /> : null}
          </li>) })}
      </ol>
      <div className="relative mt-3">
        <Bouton icone={<Plus />} onClick={() => setPalette((x) => !x)}>Ajouter une action</Bouton>
        {palette ? <div className="absolute left-0 top-[calc(100%+6px)] z-20 grid w-[520px] grid-cols-2 gap-1 rounded-4 border-[0.5px] border-trait bg-fond p-2 shadow-flottante">{(Object.keys(AIDE) as Exclude<TypeAction, "fin">[]).map((t) => { const I = ICONE[t]; return <button key={t} type="button" onClick={() => ajouter(t)} className="flex items-start gap-2 rounded-3 px-2 py-2 text-left hover:bg-fond-3"><I size={14} className="mt-0.5 shrink-0" /><span><span className="block text-legende font-medium">{LIBELLE_ETAPE[t]}</span><span className="block text-colonne text-encre-2">{AIDE[t]}</span></span></button> })}</div> : null}
      </div>
    </Bloc>
  )
}

// ── Créatifs ──
function Lecture() { return <div className="flex h-[150px] items-center justify-center rounded-4 bg-[#26262b]"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90"><Play size={20} className="translate-x-px" /></span></div> }
function Apercu({ k, cfg }: { k: Creatif; cfg: ConfigCampagne }) {
  const v = k.variantes[0]
  const vers = cfg.creatifs.find((x) => x.id === k.versId)
  if (k.type === "sms" || k.type === "linkedin") return <div className="max-w-[300px] rounded-[14px] bg-fond-3 px-3 py-2 text-legende">{v?.corps || "Le texte"}</div>
  if (k.type === "formulaire") return <div className="space-y-3">{k.remplirPar === "commercial" ? <p className="text-colonne text-encre-2">S'affichera sur la fiche, dans la session de call.</p> : null}{k.questions.map((q) => <div key={q.id} className="space-y-1"><p className="text-legende font-medium">{q.libelle || "Question"}{q.requis ? " *" : ""}</p>{q.type === "Oui / Non" ? <div className="flex gap-2"><span className="rounded-full border-[0.5px] border-trait px-3 py-1 text-colonne">Oui</span><span className="rounded-full border-[0.5px] border-trait px-3 py-1 text-colonne">Non</span></div> : <div className={`rounded-4 bg-fond-3 ${q.type === "Texte long" ? "h-14" : "h-8"}`} />}</div>)}<div className="inline-block rounded-full bg-action px-4 py-1.5 text-legende text-white">Envoyer</div></div>
  if (k.type === "avis") return <div className="space-y-3"><h3 className="text-sous-titre font-semibold">{v?.objet || "Titre de la page"}</h3><p className="whitespace-pre-line text-legende">{v?.corps}</p><div className="flex gap-1.5">{[1, 2, 3, 4, 5].map((n) => <span key={n} className="flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] border-trait text-legende">{n}</span>)}</div><p className="text-colonne text-encre-2">Note, commentaire, nom à afficher et autorisation de réutiliser. Après l'envoi, le lien Google est proposé à tout le monde.</p></div>
  if (k.type === "mail") {
    const a = apercuMail(v?.objet ?? "", v?.corps ?? "", vers ? (k.video ? "Voir la vidéo" : vers.type === "formulaire" ? "Remplir le formulaire" : "En savoir plus") : "", !cfg.creatifs.some((x) => x.type === "avis"))
    return <div className="space-y-2"><p className="border-b-[0.5px] border-trait pb-2 text-legende font-medium">{a.objet || "Objet du mail"}</p><iframe title="Aperçu du mail" sandbox="" srcDoc={a.document} className="h-[420px] w-full rounded-4 border-[0.5px] border-trait" /><p className="text-colonne text-encre-2">Tel qu'il arrive, avec des valeurs d'exemple.</p></div>
  }
  const html = (v?.corps ?? "").trimStart().startsWith("<")
  return <div className="space-y-3"><h3 className="text-sous-titre font-semibold">{v?.objet || "Titre de la page"}</h3>{k.video ? <Lecture /> : null}{html ? <iframe title="Aperçu du mail" sandbox="" srcDoc={v?.corps} className="h-[420px] w-full rounded-4 border-[0.5px] border-trait" /> : <p className="whitespace-pre-line text-legende text-encre">{v?.corps || "Le texte."}</p>}{vers ? <div className="inline-block rounded-full bg-action px-4 py-1.5 text-legende text-white">{vers.type === "formulaire" ? "Remplir le formulaire" : "Voir la présentation"}</div> : null}</div>
}
export function Creatifs({ cfg, maj, avis }: { cfg: ConfigCampagne; maj: MajConfig; avis: boolean }) {
  const [id, setId] = useState(cfg.creatifs[0]?.id ?? "")
  const k = cfg.creatifs.find((x) => x.id === id) ?? cfg.creatifs[0]
  const majK = (p: Partial<Creatif>) => k && maj((x) => ({ ...x, creatifs: x.creatifs.map((y) => (y.id === k.id ? { ...y, ...p } : y)) }))
  const majV = (i: number, p: { nom?: string; objet?: string; corps?: string }) => k && majK({ variantes: k.variantes.map((v, j) => (j === i ? { ...v, ...p } : v)) })
  const ajouter = (type: TypeCreatif) => { const n = creatifVide(type, `${LIB_CREATIF[type]} ${cfg.creatifs.filter((x) => x.type === type).length + 1}`); maj((x) => ({ ...x, creatifs: [...x.creatifs, n] })); setId(n.id) }
  const liables = cfg.creatifs.filter((x) => k && x.id !== k.id && (x.type === "page" || x.type === "formulaire"))
  const texteLong = k?.type === "mail" || k?.type === "page" || k?.type === "avis"
  return (
    <div className="space-y-4">
      <Bandeau role="info">{avis ? <>Dans le mail, {"{{lien_avis}}"} devient le lien personnel de chaque contact vers la page d'avis.</> : <>Un mail peut mener à sa page ou à son formulaire avec « Le bouton mène vers », ou dans le texte avec {"{{lien_formulaire}}"} et {"{{lien_page}}"}. Chaque contact reçoit son lien personnel.</>}</Bandeau>
      <div className="grid gap-8 @min-[760px]:grid-cols-[170px_minmax(0,1fr)_minmax(0,0.75fr)]">
        <div className="space-y-1">
          {cfg.creatifs.map((x) => { const I = ICONE_CREATIF[x.type]; return <button key={x.id} type="button" onClick={() => setId(x.id)} className={`flex w-full items-center gap-2 rounded-4 px-2 py-1.5 text-left text-legende ${k?.id === x.id ? "bg-fond-4 font-medium" : "hover:bg-fond-3"}`}><I size={14} className="shrink-0 text-encre-2" /><span className="min-w-0 flex-1 truncate">{x.nom}</span></button> })}
          <div className="flex flex-wrap gap-1 pt-3">{((avis ? ["mail", "sms"] : ["mail", "sms", "page", "formulaire"]) as TypeCreatif[]).map((t) => <Bouton key={t} taille="sm" icone={<Plus />} onClick={() => ajouter(t)}>{LIB_CREATIF[t]}</Bouton>)}</div>
        </div>
        {k ? (
          <div className="min-w-0 space-y-4">
            <Libelle titre={`Nom du créatif · ${LIB_CREATIF[k.type]}`}><Champ value={k.nom} onChange={(e) => majK({ nom: e.target.value })} /></Libelle>
            {k.type === "avis" ? <Libelle titre="Lien Google (proposé à tout le monde après l'avis)"><Champ value={k.lienGoogle ?? ""} placeholder="https://g.page/r/…/review" onChange={(e) => majK({ lienGoogle: e.target.value })} /></Libelle> : null}
            {k.type !== "formulaire" ? k.variantes.map((v, i) => (
              <div key={v.id} className="space-y-2 rounded-4 border-[0.5px] border-trait p-3">
                {k.variantes.length > 1 ? <div className="flex items-center gap-2"><Champ className="!w-40" aria-label="Nom de la variante" value={v.nom} onChange={(e) => majV(i, { nom: e.target.value })} /><IconeBtn icone={<X />} label="Retirer la variante" onClick={() => majK({ variantes: k.variantes.filter((y) => y.id !== v.id) })} /></div> : null}
                {texteLong ? <Libelle titre={k.type === "mail" ? "Objet" : "Titre"}><Champ value={v.objet} onChange={(e) => majV(i, { objet: e.target.value })} /></Libelle> : null}
                <Libelle titre="Texte"><Zone rows={k.type === "sms" ? 3 : 6} value={v.corps} placeholder={avis ? "Variables : {{contact}}, {{entreprise}}, {{lien_avis}}" : "Variables : {{contact}}, {{entreprise}}, {{lien_principal}}, {{lien_formulaire}}, {{lien_page}}"} onChange={(e) => majV(i, { corps: e.target.value })} /></Libelle>
                {(k.type === "mail" || k.type === "page") && !avis ? <InsererAvis onAvis={(citation) => majV(i, { corps: `${v.corps}${v.corps ? "\n\n" : ""}${citation}` })} /> : null}
                {k.type === "mail" ? <AjoutImage onImage={(url) => majV(i, { corps: `${v.corps}${v.corps ? "\n\n" : ""}${baliseImage(url)}` })} /> : null}
                {k.type === "sms" ? <p className="text-colonne text-encre-2">{v.corps.length} caractères · {Math.max(1, Math.ceil(v.corps.length / 160))} SMS</p> : null}
              </div>
            )) : null}
            {k.type === "mail" || k.type === "sms" ? <Bouton taille="sm" icone={<Plus />} onClick={() => majK({ variantes: [...k.variantes, { id: nid(), nom: String.fromCharCode(65 + k.variantes.length), objet: "", corps: "" }] })}>Variante (test A/B)</Bouton> : null}
            {texteLong && k.type !== "avis" ? <><label className="flex items-center gap-2 text-legende"><input type="checkbox" className="accent-[var(--color-action)]" checked={k.video} onChange={(e) => majK({ video: e.target.checked })} />Ajouter une vidéo</label>{k.video ? <Libelle titre="Adresse de la vidéo (YouTube, Vimeo ou fichier)"><Champ value={k.videoUrl ?? ""} placeholder="https://…" onChange={(e) => majK({ videoUrl: e.target.value })} /></Libelle> : null}<Libelle titre="Le bouton mène vers"><Selecteur value={k.versId} onChange={(e) => majK({ versId: e.target.value })}><option value="">Pas de bouton</option>{liables.map((x) => <option key={x.id} value={x.id}>{LIB_CREATIF[x.type]} · {x.nom}</option>)}</Selecteur></Libelle></> : null}
            {k.type === "formulaire" ? <div className="space-y-3">
              <Libelle titre="Qui le remplit"><Selecteur value={k.remplirPar} onChange={(e) => majK({ remplirPar: e.target.value as Creatif["remplirPar"] })}><option value="prospect">Le prospect, depuis un lien</option><option value="commercial">Nous, pendant l'appel</option></Selecteur></Libelle>
              {k.questions.map((q, i) => { const mq = (p: Partial<typeof q>) => majK({ questions: k.questions.map((y) => (y.id === q.id ? { ...y, ...p } : y)) }); return (
                <div key={q.id} className="space-y-2 rounded-4 border-[0.5px] border-trait p-3">
                  <div className="flex items-center gap-2"><Champ value={q.libelle} placeholder="La question" aria-label="La question" onChange={(e) => mq({ libelle: e.target.value })} /><IconeBtn icone={<ArrowUp />} label="Monter" onClick={() => majK({ questions: deplacer(k.questions, i, -1) })} /><IconeBtn icone={<Trash2 />} label="Supprimer" onClick={() => majK({ questions: k.questions.filter((y) => y.id !== q.id) })} /></div>
                  <div className="flex flex-wrap items-center gap-3 text-legende"><span className="w-40"><Selecteur value={q.type} aria-label="Type de réponse" onChange={(e) => mq({ type: e.target.value })}>{TYPES_QUESTION.map((t) => <option key={t}>{t}</option>)}</Selecteur></span><label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[var(--color-action)]" checked={q.requis} onChange={(e) => mq({ requis: e.target.checked })} />Obligatoire</label><label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[var(--color-action)]" checked={q.qualifiante} onChange={(e) => mq({ qualifiante: e.target.checked })} />Question qui qualifie</label>{q.qualifiante ? <span className="w-40"><Champ value={q.attendu} placeholder="Réponse attendue" aria-label="Réponse attendue" onChange={(e) => mq({ attendu: e.target.value })} /></span> : null}</div>
                  {q.type === "Choix unique" ? <Champ value={q.options ?? ""} placeholder="Les réponses, séparées par des virgules" aria-label="Les réponses possibles" onChange={(e) => mq({ options: e.target.value })} /> : null}
                </div>) })}
              <Bouton taille="sm" icone={<Plus />} onClick={() => majK({ questions: [...k.questions, questionVide()] })}>Ajouter une question</Bouton>
            </div> : null}
            <Bouton taille="sm" variante="discret" icone={<Trash2 />} onClick={() => { maj((x) => ({ ...x, creatifs: x.creatifs.filter((y) => y.id !== k.id) })); setId("") }}>Supprimer ce créatif</Bouton>
          </div>
        ) : <p className="text-legende text-encre-2">Crée un mail, un SMS, une page ou un formulaire.</p>}
        {k ? <div className="min-w-0"><Etiquette>Ce que voit le prospect</Etiquette><div className="mt-2 rounded-6 border-[0.5px] border-trait p-4"><Apercu k={k} cfg={cfg} /></div></div> : null}
      </div>
    </div>
  )
}

// ── Qualification ──
export function Qualification({ cfg, maj, baseId }: { cfg: ConfigCampagne; maj: MajConfig; baseId: string }) {
  const q = cfg.qualification
  const [comptes, setComptes] = useState<Compte[]>([])
  useEffect(() => { listerComptes().then(setComptes).catch(() => setComptes([])) }, [])
  const choix = q.attributionIds ?? []
  const choisir = (id: string) => majQ({ attributionIds: q.attribution === "Une personne précise" ? [id] : choix.includes(id) ? choix.filter((x) => x !== id) : [...choix, id] })
  const majQ = (p: Partial<typeof q>) => maj((x) => ({ ...x, qualification: { ...x.qualification, ...p } }))
  const majE = (id: string, p: Partial<EtapeParcours>) => majQ({ etapes: q.etapes.map((e) => (e.id === id ? { ...e, ...p } : e)) })
  const majN = (id: string, p: Partial<Qualite>) => majQ({ qualites: q.qualites.map((y) => (y.id === id ? { ...y, ...p } : y)) })
  const [motif, setMotif] = useState("")
  const iLead = q.etapes.findIndex((e) => e.id === q.leadA), iGagne = q.etapes.findIndex((e) => e.id === q.gagneA)
  const formulaires = cfg.creatifs.filter((k) => k.type === "formulaire")
  const etapeLead = q.etapes.find((e) => e.id === q.leadA)
  const questions = formulaires.flatMap((k) => k.questions.filter((x) => x.libelle))
  // « Il a rempli un formulaire » : l'étape est créée au début du parcours, et le formulaire s'il n'y en a aucun.
  const leadSurFormulaire = () => maj((x) => {
    const forms = x.creatifs.filter((k) => k.type === "formulaire")
    const nouveau = forms.length ? null : creatifVide("formulaire", "Formulaire 1")
    const e: EtapeParcours = { id: nid(), nom: "Formulaire rempli", type: TYPES_FORMULAIRE[0], qui: "Le prospect", validation: "Toute seule", delai: 7, formulaireId: nouveau?.id ?? forms[0].id }
    return { ...x, creatifs: nouveau ? [...x.creatifs, nouveau] : x.creatifs, qualification: { ...x.qualification, etapes: [e, ...x.qualification.etapes], leadA: e.id, gagneA: x.qualification.gagneA || e.id } }
  })
  return (
    <div className="space-y-8">
      <Bandeau role="info">Le parcours décide de ce qui tombe dans Leads reçus, et de l'étape de chaque lead. Une agence touchée par cette campagne suit les règles d'intérêt ci-dessous pendant 30 jours après le dernier envoi.</Bandeau>
      <Bloc titre="C'est un lead quand…" droite="un seul choix, modifiable à tout moment">
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Libelle titre="L'événement" className="w-[320px]"><Selecteur value={q.leadA} onChange={(e) => (e.target.value === "_form" ? leadSurFormulaire() : majQ({ leadA: e.target.value }))}>{q.etapes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}{!q.etapes.some((e) => TYPES_FORMULAIRE.includes(e.type)) ? <option value="_form">+ Il a rempli un formulaire</option> : null}</Selecteur></Libelle>
          {etapeLead && TYPES_FORMULAIRE.includes(etapeLead.type) ? <Libelle titre="Quel formulaire" className="w-[280px]"><Selecteur value={etapeLead.formulaireId ?? ""} onChange={(e) => majE(etapeLead.id, { formulaireId: e.target.value })}><option value="">Choisir…</option>{formulaires.map((k) => <option key={k.id} value={k.id}>{k.nom}{k.remplirPar === "commercial" ? " (au téléphone)" : ""}</option>)}</Selecteur></Libelle> : null}
        </div>
        {!q.interet.length ? <p className="mt-2 text-colonne text-encre-2">Aucune règle d'intérêt : seuls ceux qui remplissent cette condition arrivent chez toi. Rien ne part en session de call avant.</p> : null}
      </Bloc>

      <Bloc titre="Intérêt : ce qui envoie en session de call" droite="facultatif, ce n'est pas encore un lead">
        <div className="mt-3 space-y-2">
          {q.interet.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 text-legende">
              <span className="w-[290px]"><Selecteur value={r.evenement} aria-label="Événement" onChange={(e) => majQ({ interet: q.interet.map((y) => (y.id === r.id ? { ...y, evenement: e.target.value } : y)) })}>{EVENEMENTS.map((v) => <option key={v}>{v}</option>)}</Selecteur></span>
              <Champ type="number" min={1} className="!w-16" aria-label="Nombre de fois" value={r.fois} onChange={(e) => majQ({ interet: q.interet.map((y) => (y.id === r.id ? { ...y, fois: Number(e.target.value) || 1 } : y)) })} /> fois en
              <Champ type="number" min={1} className="!w-16" aria-label="Nombre de jours" value={r.jours} onChange={(e) => majQ({ interet: q.interet.map((y) => (y.id === r.id ? { ...y, jours: Number(e.target.value) || 1 } : y)) })} /> jours
              <IconeBtn icone={<X />} label="Retirer" onClick={() => majQ({ interet: q.interet.filter((y) => y.id !== r.id) })} />
            </div>
          ))}
          <div className="flex flex-wrap gap-2"><Bouton taille="sm" icone={<Plus />} onClick={() => majQ({ interet: [...q.interet, { id: nid(), evenement: EVENEMENTS[1], fois: 1, jours: 7 }] })}>Ajouter une règle</Bouton>{q.interet.length ? <Bouton taille="sm" variante="discret" onClick={() => majQ({ interet: [] })}>Tout retirer</Bouton> : null}</div>
        </div>
      </Bloc>

      <Bloc titre="Le parcours" droite="choisis où il devient un lead, et où il est gagné">
        <div className="mt-2 space-y-1.5">
          {q.etapes.map((e, i) => { const horsZone = (iLead >= 0 && i < iLead) || (iGagne >= 0 && i > iGagne); return (
            <div key={e.id} className={`rounded-4 border-[0.5px] px-3 py-2.5 ${q.leadA === e.id ? "border-signature/60 bg-signature/5" : q.gagneA === e.id ? "border-ok/50" : "border-trait"} ${horsZone ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="chiffres w-4 text-colonne text-encre-3">{i + 1}</span>
                <span className="min-w-[180px] flex-1"><Champ value={e.nom} aria-label="Nom de l'étape" onChange={(v) => majE(e.id, { nom: v.target.value })} /></span>
                <button type="button" onClick={() => majQ({ leadA: e.id })} className={`h-7 rounded-full px-3 text-colonne ${q.leadA === e.id ? "bg-signature font-medium text-white" : "border-[0.5px] border-trait text-encre-2 hover:bg-fond-2"}`}>Devient lead ici</button>
                <button type="button" onClick={() => majQ({ gagneA: e.id })} className={`h-7 rounded-full px-3 text-colonne ${q.gagneA === e.id ? "bg-ok font-medium text-white" : "border-[0.5px] border-trait text-encre-2 hover:bg-fond-2"}`}>Gagné ici</button>
                <IconeBtn icone={<ArrowUp />} label="Monter" onClick={() => majQ({ etapes: deplacer(q.etapes, i, -1) })} /><IconeBtn icone={<ArrowDown />} label="Descendre" onClick={() => majQ({ etapes: deplacer(q.etapes, i, 1) })} /><IconeBtn icone={<Trash2 />} label="Supprimer" onClick={() => majQ({ etapes: q.etapes.filter((y) => y.id !== e.id) })} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 pl-6 @min-[700px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_90px]">
                <Libelle titre="Type"><Selecteur value={e.type} onChange={(v) => majE(e.id, { type: v.target.value })}>{TYPES_ETAPE.map((t) => <option key={t}>{t}</option>)}</Selecteur></Libelle>
                <Libelle titre="Qui la fait"><Selecteur value={e.qui} onChange={(v) => majE(e.id, { qui: v.target.value })}>{QUI.map((t) => <option key={t}>{t}</option>)}</Selecteur></Libelle>
                <Libelle titre="Se valide"><Selecteur value={e.validation} onChange={(v) => majE(e.id, { validation: v.target.value })}>{VALIDATIONS.map((t) => <option key={t}>{t}</option>)}</Selecteur></Libelle>
                <Libelle titre="Délai (j)"><Champ type="number" min={0} value={e.delai} onChange={(v) => majE(e.id, { delai: Number(v.target.value) || 0 })} /></Libelle>
                {TYPES_FORMULAIRE.includes(e.type) ? <Libelle titre="Quel formulaire" className="col-span-2"><Selecteur value={e.formulaireId ?? ""} onChange={(v) => majE(e.id, { formulaireId: v.target.value })}><option value="">Choisir…</option>{formulaires.map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}</Selecteur></Libelle> : null}
              </div>
            </div>) })}
          <Bouton taille="sm" icone={<Plus />} onClick={() => majQ({ etapes: [...q.etapes, { id: nid(), nom: "Nouvelle étape", type: "Validation à la main", qui: "Le commercial", validation: "À la main", delai: 2 }] })}>Ajouter une étape</Bouton>
          {iGagne >= 0 && iLead > iGagne ? <p className="text-colonne text-alerte">Le « gagné » doit venir après le lead.</p> : null}
        </div>
      </Bloc>

      <div className="grid gap-8 @min-[700px]:grid-cols-2">
        <Bloc titre="Qualité du lead" droite="la première règle vraie, de haut en bas"><div className="mt-3 space-y-2">
          {q.qualites.map((n, i) => <div key={n.id} className="space-y-2 rounded-4 border-[0.5px] border-trait p-3">
            <div className="flex items-center gap-2 text-legende"><span className="text-encre-2">Niveau</span><Champ className="!w-14 text-center" aria-label="Niveau" value={n.niveau} onChange={(e) => majN(n.id, { niveau: e.target.value })} /><span className="text-encre-2">si</span><span className="min-w-0 flex-1"><Selecteur value={n.source} aria-label="Condition" onChange={(e) => majN(n.id, { source: e.target.value as Qualite["source"] })}><option value="question">Une réponse au formulaire</option><option value="etape">Il a atteint une étape</option><option value="toujours">Tous les autres</option></Selecteur></span><IconeBtn icone={<ArrowUp />} label="Monter" off={i === 0} onClick={() => majQ({ qualites: deplacer(q.qualites, i, -1) })} /><IconeBtn icone={<X />} label="Retirer" onClick={() => majQ({ qualites: q.qualites.filter((y) => y.id !== n.id) })} /></div>
            {n.source === "question" ? (questions.length ? <div className="grid grid-cols-[minmax(0,1fr)_100px_90px] gap-2"><Selecteur value={n.questionId} aria-label="Question" onChange={(e) => majN(n.id, { questionId: e.target.value })}><option value="">Quelle question ?</option>{questions.map((x) => <option key={x.id} value={x.id}>{x.libelle}</option>)}</Selecteur><Selecteur value={n.operateur} aria-label="Comparaison" onChange={(e) => majN(n.id, { operateur: e.target.value })}>{OPERATEURS.map((o) => <option key={o}>{o}</option>)}</Selecteur><Champ value={n.valeur} placeholder="Valeur" aria-label="Valeur" onChange={(e) => majN(n.id, { valeur: e.target.value })} /></div> : <p className="text-colonne text-attention">Crée d'abord un formulaire avec des questions (onglet Créatifs).</p>) : null}
            {n.source === "etape" ? <Selecteur value={n.etapeId} aria-label="Étape" onChange={(e) => majN(n.id, { etapeId: e.target.value })}><option value="">Quelle étape ?</option>{q.etapes.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}</Selecteur> : null}
          </div>)}
          <Bouton taille="sm" icone={<Plus />} onClick={() => majQ({ qualites: [...q.qualites, { id: nid(), niveau: String.fromCharCode(65 + q.qualites.length), source: questions.length ? "question" : "toujours", questionId: "", operateur: "au moins", valeur: "", etapeId: "" }] })}>Ajouter un niveau</Bouton>
        </div></Bloc>
        <Bloc titre="À qui il arrive"><div className="mt-3 grid grid-cols-[minmax(0,1fr)_110px] gap-3">
          {baseId !== "artisans" ? <Libelle titre="Attribution"><Selecteur value={q.attribution} onChange={(e) => majQ({ attribution: e.target.value, attributionIds: [] })}>{ATTRIBUTIONS.map((a) => <option key={a}>{a}</option>)}</Selecteur></Libelle> : <p className="self-center text-colonne text-encre-2">Les sous-traitants sont traités par l'équipe recrutement.</p>}
          <Libelle titre="À traiter sous (h)"><Champ type="number" min={0} value={q.delaiH} onChange={(e) => majQ({ delaiH: Number(e.target.value) || 0 })} /></Libelle>
        </div>
        {baseId !== "artisans" && (q.attribution === "Une personne précise" || q.attribution === "Chacun son tour") ? <div className="mt-3 flex flex-wrap gap-1.5">{comptes.map((x) => <button key={x.id} type="button" aria-pressed={choix.includes(x.id)} onClick={() => choisir(x.id)} className={`h-7 rounded-full px-3 text-colonne ${choix.includes(x.id) ? "bg-action text-white" : "border-[0.5px] border-trait text-encre hover:bg-fond-2"}`}>{x.nom || x.email}</button>)}</div> : null}
        </Bloc>
      </div>
      <Bloc titre="Perdu"><div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">{q.motifs.map((m) => <span key={m} className="inline-flex h-7 items-center gap-1 rounded-full bg-fond-3 pl-3 pr-1 text-colonne">{m}<button type="button" aria-label={`Retirer ${m}`} className="rounded-full p-1 hover:bg-fond-4" onClick={() => majQ({ motifs: q.motifs.filter((y) => y !== m) })}><X size={11} /></button></span>)}<span className="w-44"><Champ value={motif} placeholder="Ajouter un motif + Entrée" aria-label="Ajouter un motif" onChange={(e) => setMotif(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && motif.trim()) { majQ({ motifs: [...q.motifs, motif.trim()] }); setMotif("") } }} /></span></div>
        <label className="flex items-center gap-2 text-legende">Le recontacter après <Champ type="number" min={0} className="!w-16" value={q.relanceMois} onChange={(e) => majQ({ relanceMois: Number(e.target.value) || 0 })} /> mois (0 : jamais)</label>
      </div></Bloc>
    </div>
  )
}

// ── Le chemin du contact, en direct ──
function Boite({ titre, sous, ton = "" }: { titre: string; sous?: string; ton?: string }) { return <div className={`rounded-4 border-[0.5px] border-trait px-3 py-2 ${ton}`}><p className="text-legende font-medium">{titre}</p>{sous ? <p className="text-colonne text-encre-2">{sous}</p> : null}</div> }
function Fleche() { return <ArrowDown size={12} className="mx-auto my-1 text-encre-3" /> }
export function Chemin({ cfg }: { cfg: ConfigCampagne }) {
  const q = cfg.qualification
  const iL = q.etapes.findIndex((e) => e.id === q.leadA), iG = q.etapes.findIndex((e) => e.id === q.gagneA)
  const envois = cfg.actions.filter((a) => !["attendre", "fin", "si"].includes(a.type)).length
  return (
    <aside className="min-w-0">
      <Etiquette>Le chemin du contact</Etiquette>
      <div className="mt-2">
        <Boite titre="Campagne" sous={`${envois} action${envois > 1 ? "s" : ""} · ${cfg.creatifs.length} créatif${cfg.creatifs.length > 1 ? "s" : ""}`} /><Fleche />
        {q.interet.length ? <><Boite titre="Intérêt" sous={`Va en session de call · ${q.interet.length} règle${q.interet.length > 1 ? "s" : ""}`} /><Fleche /></> : null}
        {q.etapes.slice(0, Math.max(iL, 0)).filter((e) => e.type !== "Intérêt détecté").map((e) => <div key={e.id}><Boite titre={e.nom} sous="Avant le lead" /><Fleche /></div>)}
        <Boite titre={`LEAD · ${q.etapes[iL]?.nom ?? "à choisir"}`} sous="Tombe dans Leads reçus" ton="border-signature/60 bg-signature/5" /><Fleche />
        {q.etapes.slice(iL + 1, iG).map((e) => <div key={e.id}><Boite titre={e.nom} sous={`Qualifié · ${e.qui.toLowerCase()}`} /><Fleche /></div>)}
        <Boite titre={`GAGNÉ · ${q.etapes[iG]?.nom ?? "à choisir"}`} ton="border-ok/50" />
        <p className="mt-2 text-colonne text-encre-2">Perdu à tout moment : {q.motifs.length} motif{q.motifs.length > 1 ? "s" : ""}{q.relanceMois ? `, relance après ${q.relanceMois} mois` : ""}.</p>
      </div>
    </aside>
  )
}
