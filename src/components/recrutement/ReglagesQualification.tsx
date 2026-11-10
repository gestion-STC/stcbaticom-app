// Réglages › Qualification sous-traitants : le questionnaire au téléphone, la banque de questions et les règles de la formation.
import { useCallback, useEffect, useState } from "react"
import { Plus, Sparkles, Trash2, X } from "lucide-react"
import { Bandeau, Bouton, Champ, Chargement, Etiquette, Interrupteur, Onglets, Panneau, Selecteur, Tableau, Td, Th, Tr, Zone } from "../../ui"
import { Bloc } from "../demarchage/aujourdhui/courtier"
import QuestionnaireST from "./QuestionnaireST"
import { chargerBanque, chargerRegles, enregistrerQuestion, enregistrerRegles, importerBanque, proposerQuestions, supprimerQuestion, type QuestionF } from "../../lib/formationDb"
import { BANQUE_DEPART, THEMES_FORMATION, type QuestionDepart } from "../../recrutement/banqueDepart"
import { REGLES_DEPART, type ReglesFormation } from "../../recrutement/formationST"

type Onglet = "questionnaire" | "questions" | "regles"
type Brouillon = QuestionDepart & { id?: string; actif: boolean }
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const VIDE: Brouillon = { theme: THEMES_FORMATION[0], texte: "", bonne: "", fausses: ["", ""], explication: "", actif: true }

function Banque() {
  const [liste, setListe] = useState<QuestionF[] | null>(null)
  const [filtre, setFiltre] = useState("")
  const [q, setQ] = useState<Brouillon | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState("")
  const [propositions, setPropositions] = useState<QuestionDepart[]>([])
  const charger = useCallback(() => chargerBanque().then(setListe).catch((e) => setErreur(message(e))), [])
  useEffect(() => { const t = setTimeout(() => void charger(), 0); return () => clearTimeout(t) }, [charger])
  const agir = async (f: () => Promise<void>) => { setOccupe(true); setErreur(""); try { await f(); await charger() } catch (e) { setErreur(message(e)) } finally { setOccupe(false) } }
  if (!liste) return erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : <Chargement />
  const visibles = liste.filter((x) => !filtre || x.theme === filtre)
  const pret = q && q.texte.trim() && q.bonne.trim() && q.fausses.filter((x) => x.trim()).length >= 1
  const proposer = async () => { setOccupe(true); setErreur(""); try { setPropositions(await proposerQuestions(filtre || THEMES_FORMATION[0], 5)) } catch (e) { setErreur(message(e)) } finally { setOccupe(false) } }
  return <div className="space-y-4">
    <Bandeau role="info">Une question déjà vue ne revient pas tant qu'il en reste d'inédites. Plus la banque est grande, moins on peut tricher.</Bandeau>
    {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
    {!liste.length ? <Bouton variante="plein" chargement={occupe} onClick={() => void agir(() => importerBanque(BANQUE_DEPART))}>Importer les {BANQUE_DEPART.length} questions de départ</Bouton> : null}
    <div className="flex flex-wrap items-center gap-3"><span className="w-[260px]"><Selecteur value={filtre} aria-label="Thème" onChange={(e) => setFiltre(e.target.value)}><option value="">Tous les thèmes</option>{THEMES_FORMATION.map((t) => <option key={t}>{t}</option>)}</Selecteur></span><span className="text-colonne text-encre-2">{visibles.length} questions</span><span className="ml-auto flex flex-wrap gap-2"><Bouton icone={<Sparkles />} chargement={occupe} onClick={() => void proposer()}>Proposer avec l'IA</Bouton><Bouton variante="plein" icone={<Plus />} onClick={() => setQ({ ...VIDE, theme: filtre || VIDE.theme })}>Ajouter une question</Bouton></span></div>
    {propositions.length ? <Bloc titre="Propositions de l'IA" droite="à relire avant de les ajouter"><ul className="mt-2 divide-y-[0.5px] divide-trait">{propositions.map((p) => <li key={p.texte} className="flex flex-wrap items-center gap-3 py-2 text-legende"><span className="min-w-[240px] flex-1"><b className="block font-medium">{p.texte}</b><span className="block text-colonne text-encre-2">{p.bonne}</span></span><Bouton taille="sm" onClick={() => { setQ({ ...p, actif: true }); setPropositions((l) => l.filter((x) => x !== p)) }}>Relire et ajouter</Bouton><Bouton taille="icone" variante="discret" icone={<X />} aria-label="Écarter" onClick={() => setPropositions((l) => l.filter((x) => x !== p))} /></li>)}</ul></Bloc> : null}
    {visibles.length ? <Tableau><thead><tr><Th>Question</Th><Th>Thème</Th><Th>Bonne réponse</Th><Th>Ratée</Th><Th>Active</Th></tr></thead><tbody>{visibles.map((x) => <Tr key={x.id} onClick={() => setQ(x)} className="cursor-pointer"><Td><span className="font-medium">{x.texte}</span></Td><Td>{x.theme}</Td><Td>{x.bonne}</Td><Td><span className="chiffres">{x.posee ? `${Math.round((x.ratee / x.posee) * 100)} %` : "—"}</span></Td><Td><span onClick={(e) => e.stopPropagation()}><Interrupteur allume={x.actif} onChange={(v) => void agir(() => enregistrerQuestion({ ...x, actif: v }))} libelle="Question active" /></span></Td></Tr>)}</tbody></Tableau> : null}
    {q ? <Panneau titre="La question" onFermer={() => setQ(null)} largeur="w-[520px]" pied={<>{q.id ? <Bouton variante="discret" icone={<Trash2 />} onClick={() => void agir(async () => { await supprimerQuestion(q.id!); setQ(null) })}>Supprimer</Bouton> : null}<Bouton variante="plein" disabled={!pret} chargement={occupe} onClick={() => void agir(async () => { await enregistrerQuestion({ ...q, fausses: q.fausses.filter((x) => x.trim()) } as QuestionF); setQ(null) })}>Enregistrer</Bouton></>}><div className="space-y-4">
      <Etiquette texte="Thème"><Selecteur value={q.theme} onChange={(e) => setQ({ ...q, theme: e.target.value })}>{THEMES_FORMATION.map((t) => <option key={t}>{t}</option>)}</Selecteur></Etiquette>
      <Etiquette texte="Question"><Zone rows={2} value={q.texte} onChange={(e) => setQ({ ...q, texte: e.target.value })} /></Etiquette>
      <Etiquette texte="Bonne réponse"><Champ value={q.bonne} onChange={(e) => setQ({ ...q, bonne: e.target.value })} /></Etiquette>
      <div className="space-y-2">{q.fausses.map((r, i) => <div key={i} className="flex items-center gap-2"><Champ aria-label={`Mauvaise réponse ${i + 1}`} placeholder="Mauvaise réponse" value={r} onChange={(e) => setQ({ ...q, fausses: q.fausses.map((y, j) => (j === i ? e.target.value : y)) })} /><Bouton taille="icone" variante="discret" icone={<X />} aria-label="Retirer" disabled={q.fausses.length < 2} onClick={() => setQ({ ...q, fausses: q.fausses.filter((_, j) => j !== i) })} /></div>)}<Bouton taille="sm" icone={<Plus />} onClick={() => setQ({ ...q, fausses: [...q.fausses, ""] })}>Ajouter une réponse</Bouton></div>
      <Etiquette texte="Explication affichée après la réponse"><Zone rows={2} value={q.explication} onChange={(e) => setQ({ ...q, explication: e.target.value })} /></Etiquette>
    </div></Panneau> : null}
  </div>
}

function Regles() {
  const [r, setR] = useState<ReglesFormation>(REGLES_DEPART)
  const [info, setInfo] = useState("")
  const [erreur, setErreur] = useState("")
  useEffect(() => { chargerRegles().then(setR).catch((e) => setErreur(message(e))) }, [])
  const maj = (p: Partial<ReglesFormation>) => { const n = { ...r, ...p }; setR(n); setInfo(""); enregistrerRegles(n).then(() => setInfo("Enregistré.")).catch((e) => setErreur(message(e))) }
  const ligne = (t: string, a: string, k: keyof ReglesFormation) => <div className="flex items-center gap-4 py-3"><span className="min-w-0 flex-1"><b className="block text-legende font-medium">{t}</b><span className="block text-colonne text-encre-2">{a}</span></span><Interrupteur allume={Boolean(r[k])} onChange={(v) => maj({ [k]: v })} libelle={t} /></div>
  const nombre = (t: string, k: keyof ReglesFormation, s = "") => <Etiquette texte={t}><span className="flex items-center gap-2 text-legende"><Champ type="number" min={0} className="!w-24" value={Number(r[k])} onChange={(e) => maj({ [k]: Number(e.target.value) || 0 })} />{s}</span></Etiquette>
  return <div className="max-w-[720px] space-y-8">
    {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
    <Bloc titre="Pour réussir" droite={info}><div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">{nombre("Questions par essai", "questions")}{nombre("Score à atteindre", "seuil", "%")}{nombre("Essais", "essais")}{nombre("Attente entre essais", "attente", "h")}</div></Bloc>
    <Bloc titre="Contre la triche"><div className="mt-1 divide-y-[0.5px] divide-trait">{ligne("Toujours des questions inédites", "Une question déjà vue ne revient que si toutes les autres sont passées.", "inedites")}{ligne("Réponses dans le désordre", "La bonne réponse change de place à chaque fois.", "desordre")}</div></Bloc>
    <Bloc titre="Dans la qualification"><div className="mt-1 divide-y-[0.5px] divide-trait">{ligne("Obligatoire pour accepter", "« Accepté » reste impossible tant que la formation n'est pas réussie. À activer quand les exercices sur l'application seront prêts.", "bloque")}{ligne("Autoriser une dérogation", "Un administrateur peut accepter quand même, avec un motif.", "derogation")}</div></Bloc>
  </div>
}

export default function ReglagesQualification() {
  const [onglet, setOnglet] = useState<Onglet>("questionnaire")
  return <div>
    <Onglets valeur={onglet} onChange={setOnglet} className="mb-6" options={[{ id: "questionnaire", label: "Questionnaire au téléphone" }, { id: "questions", label: "Banque de questions" }, { id: "regles", label: "Règles de la formation" }]} />
    {onglet === "questionnaire" ? <QuestionnaireST /> : onglet === "questions" ? <Banque /> : <Regles />}
  </div>
}
