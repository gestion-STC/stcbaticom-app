// Réglages de la machine › Qualification : modifier le questionnaire des sous-traitants sans passer par un développeur.
// Une question retirée ne s'affiche plus, mais les réponses déjà données restent en base.
import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react"
import { Bandeau, Bouton, Case, Champ, Etiquette, Selecteur, Zone } from "../../ui"
import { useSession } from "../../lib/auth"
import { nomAffiche } from "../../lib/comptes"
import { enregistrerQuestionnaire, useQuestionnaire } from "../../lib/qualificationStDb"
import { SECTIONS_PROTEGEES, QUESTIONS_PROTEGEES, erreurQuestionnaire, nettoyerQuestionnaire, nouvelIdST, type QuestionST, type SectionST, type TypeQuestionST } from "../../recrutement/qualificationST"

const TYPES: [TypeQuestionST, string][] = [["oui_non", "Oui / Non"], ["texte", "Texte court"], ["long", "Texte long"], ["nombre", "Nombre"], ["date", "Date"], ["tel", "Téléphone"], ["choix", "Choix unique"], ["cases", "Plusieurs choix"], ["echelle", "Note de 1 à 5"]]
const deplacer = <T,>(l: T[], i: number, d: number): T[] => { const j = i + d; if (j < 0 || j >= l.length) return l; const x = [...l]; [x[i], x[j]] = [x[j], x[i]]; return x }

export default function QuestionnaireST() {
  const session = useSession()
  const enregistre = useQuestionnaire()
  const [sections, setSections] = useState<SectionST[]>(enregistre)
  const [i, setI] = useState(0)
  const [modifie, setModifie] = useState(false)
  const [occupe, setOccupe] = useState(false)
  const [info, setInfo] = useState("")
  const [erreur, setErreur] = useState("")
  // Le questionnaire enregistré arrive après l'ouverture : on le prend tant que rien n'a été touché.
  useEffect(() => { if (!modifie) { const t = setTimeout(() => setSections(enregistre), 0); return () => clearTimeout(t) } }, [enregistre, modifie])

  const indice = Math.min(i, sections.length - 1)
  const s = sections[indice]
  const changer = (f: (l: SectionST[]) => SectionST[]) => { setSections(f); setModifie(true); setInfo("") }
  const majS = (p: Partial<SectionST>) => changer((l) => l.map((x, n) => (n === indice ? { ...x, ...p } : x)))
  const majQuestions = (questions: QuestionST[]) => majS({ questions })
  const majQ = (id: string, p: Partial<QuestionST>) => majQuestions(s.questions.map((q) => (q.id === id ? { ...q, ...p } : q)))
  const ajouterQuestion = () => majQuestions([...s.questions, { id: nouvelIdST(), libelle: "", type: s.id === "eliminatoires" ? "oui_non" : "texte", requis: s.id === "eliminatoires" }])
  const ajouterSection = () => { changer((l) => [...l.slice(0, -1), { id: nouvelIdST(), titre: "Nouvelle partie", questions: [] }, ...l.slice(-1)]); setI(Math.max(0, sections.length - 1)) }
  const retirerSection = () => { changer((l) => l.filter((_, n) => n !== indice)); setI(0) }
  const enregistrer = () => {
    const propre = nettoyerQuestionnaire(sections), probleme = erreurQuestionnaire(propre)
    if (probleme) { setErreur(probleme); return }
    setOccupe(true); setErreur("")
    enregistrerQuestionnaire(propre, nomAffiche(session)).then(() => { setSections(propre); setModifie(false); setInfo("Questionnaire enregistré. Il s'applique à toutes les prochaines saisies.") }).catch((e) => setErreur(e instanceof Error ? e.message : String(e))).finally(() => setOccupe(false))
  }

  return (
    <div className="max-w-[860px] space-y-5">
      <p className="text-legende text-encre-2">Le questionnaire rempli au téléphone avec les sous-traitants. Une question retirée ne s'affiche plus, les réponses déjà données sont conservées.</p>
      {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
      {info ? <Bandeau role="info">{info}</Bandeau> : null}

      <div className="flex flex-wrap items-center gap-1">
        {sections.map((x, n) => <button key={x.id} type="button" aria-current={n === indice ? "step" : undefined} onClick={() => setI(n)} className={`h-8 rounded-4 px-2.5 text-legende ${n === indice ? "bg-fond-4 font-medium text-encre" : "text-encre-2 hover:bg-fond-2"}`}>{x.titre || "Sans titre"}</button>)}
        <Bouton taille="sm" variante="discret" icone={<Plus />} onClick={ajouterSection}>Ajouter une partie</Bouton>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1"><Etiquette texte="Titre de la partie"><Champ value={s.titre} onChange={(e) => majS({ titre: e.target.value })} /></Etiquette></div>
        {!SECTIONS_PROTEGEES.includes(s.id) ? <Bouton variante="discret" icone={<Trash2 />} onClick={retirerSection}>Retirer cette partie</Bouton> : null}
      </div>
      {s.id === "eliminatoires" ? <p className="text-colonne text-encre-2">Ici, un seul « Non » empêche d'accepter le sous-traitant : les questions restent en Oui / Non.</p> : null}

      <div className="space-y-3">
        {s.questions.map((q, n) => (
          <div key={q.id} className="space-y-2 rounded-4 border-[0.5px] border-trait p-3">
            <div className="flex items-center gap-2">
              <Champ value={q.libelle} placeholder="La question" aria-label="La question" onChange={(e) => majQ(q.id, { libelle: e.target.value })} />
              <Bouton taille="icone" variante="discret" aria-label="Monter" icone={<ArrowUp />} disabled={n === 0} onClick={() => majQuestions(deplacer(s.questions, n, -1))} />
              <Bouton taille="icone" variante="discret" aria-label="Descendre" icone={<ArrowDown />} disabled={n === s.questions.length - 1} onClick={() => majQuestions(deplacer(s.questions, n, 1))} />
              {!QUESTIONS_PROTEGEES.includes(q.id) ? <Bouton taille="icone" variante="discret" aria-label="Retirer la question" icone={<Trash2 />} onClick={() => majQuestions(s.questions.filter((x) => x.id !== q.id))} /> : null}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {s.id !== "eliminatoires" ? <span className="w-44"><Selecteur value={q.type} aria-label="Type de réponse" onChange={(e) => majQ(q.id, { type: e.target.value as TypeQuestionST })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Selecteur></span> : null}
              <Case texte="Obligatoire" checked={Boolean(q.requis)} onChange={(e) => majQ(q.id, { requis: e.target.checked })} />
              {q.type === "choix" || q.type === "cases" ? <Case texte="Réponse « Autre »" checked={Boolean(q.autre)} onChange={(e) => majQ(q.id, { autre: e.target.checked })} /> : null}
              {q.si ? <span className="text-colonne text-encre-2">Affichée seulement selon une réponse précédente</span> : null}
            </div>
            {q.type === "choix" || q.type === "cases" ? <Zone rows={3} aria-label="Les réponses possibles, une par ligne" placeholder="Une réponse par ligne" value={(q.options ?? []).join("\n")} onChange={(e) => majQ(q.id, { options: e.target.value.split("\n") })} /> : null}
          </div>
        ))}
        <Bouton taille="sm" icone={<Plus />} onClick={ajouterQuestion}>Ajouter une question</Bouton>
      </div>

      <div className="flex justify-end border-t-[0.5px] border-trait pt-3"><Bouton variante="plein" icone={<Save />} chargement={occupe} disabled={!modifie} onClick={enregistrer}>Enregistrer le questionnaire</Bouton></div>
    </div>
  )
}
