// La qualification d'un sous-traitant : pendant l'appel (session de call) et sur sa fiche. Hors de la campagne
// et hors de la création du lead (Mahdi, 09/11/2026). Le questionnaire se modifie dans Réglages de la machine.
import { useState } from "react"
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react"
import { Bandeau, Bouton, Champ, Chargement, Pastille, Zone } from "../../ui"
import { DECISIONS_ST, avancement, avancementSection, blocageDecision, echecs, moyenneAvis, prerempli, visible, type DecisionST, type QuestionST, type ReponsesST } from "../../recrutement/qualificationST"
import { deciderQualification, majReponses, useQualification, useQuestionnaire } from "../../lib/qualificationStDb"

const pilule = (on: boolean) => `min-h-8 rounded-full px-3.5 py-1 text-legende transition-colors ${on ? "bg-action text-white" : "border-[0.5px] border-trait text-encre hover:bg-fond-2"}`
const MESSAGE_ETAT = { "": "Enregistré au fil de l'appel", enregistrement: "Enregistrement…", enregistre: "Enregistré", erreur: "Non enregistré" } as const

function Question({ q, r, maj }: { q: QuestionST; r: ReponsesST; maj: (cle: string, v: string | string[]) => void }) {
  const v = r[q.id]
  const texte = typeof v === "string" ? v : ""
  const liste = Array.isArray(v) ? v : []
  const options = q.type === "oui_non" ? ["Oui", "Non"] : [...(q.options ?? []), ...(q.autre ? ["Autre"] : [])]
  const coche = (o: string) => (q.type === "cases" ? liste.includes(o) : texte === o)
  const clic = (o: string) => (q.type === "cases" ? maj(q.id, liste.includes(o) ? liste.filter((x) => x !== o) : [...liste, o]) : maj(q.id, texte === o ? "" : o))
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-legende font-medium text-encre">{q.libelle}{q.requis ? <span className="text-encre-2"> *</span> : null}</p>
      {q.type === "long" ? <Zone rows={2} aria-label={q.libelle} value={texte} onChange={(e) => maj(q.id, e.target.value)} />
        : q.type === "echelle" ? <div className="flex items-center gap-1.5"><span className="mr-1 text-colonne text-encre-2">Faible</span>{["1", "2", "3", "4", "5"].map((n) => <button key={n} type="button" aria-pressed={texte === n} aria-label={`${q.libelle} : ${n}`} onClick={() => maj(q.id, n)} className={`h-8 w-8 rounded-full text-legende ${texte === n ? "bg-action text-white" : "border-[0.5px] border-trait text-encre hover:bg-fond-2"}`}>{n}</button>)}<span className="ml-1 text-colonne text-encre-2">Excellent</span></div>
        : options.length ? <div className="flex flex-wrap gap-1.5">{options.map((o) => <button key={o} type="button" aria-pressed={coche(o)} onClick={() => clic(o)} className={pilule(coche(o))}>{o}</button>)}</div>
        : <Champ aria-label={q.libelle} type={q.type === "nombre" ? "number" : q.type === "date" ? "date" : q.type === "tel" ? "tel" : "text"} value={texte} onChange={(e) => maj(q.id, e.target.value)} />}
      {coche("Autre") ? <Champ aria-label={`${q.libelle} : autre`} placeholder="Préciser" value={String(r[`${q.id}__autre`] ?? "")} onChange={(e) => maj(`${q.id}__autre`, e.target.value)} /> : null}
    </div>
  )
}

export default function QualificationST({ st, parNom }: { st: { id?: string; entreprise?: string | null; contact?: string | null; telephone?: string | null; metier?: string | null }; parNom: string }) {
  const id = st.id ?? ""
  const dossier = useQualification(id)
  const sections = useQuestionnaire()
  const [i, setI] = useState(0)
  const [essai, setEssai] = useState("")
  if (!dossier.charge) return <Chargement texte="Lecture de la qualification…" />
  const r: ReponsesST = { ...prerempli(st, parNom), ...dossier.reponses }
  const indice = Math.min(i, sections.length - 1)
  const section = sections[indice]
  const total = avancement(r, sections), rate = echecs(r, sections), moyenne = moyenneAvis(r, sections)
  const maj = (cle: string, v: string | string[]) => majReponses(id, { ...r, [cle]: v })
  const decider = (d: DecisionST) => {
    const blocage = dossier.decision === d ? "" : blocageDecision(d, r, sections)
    setEssai(blocage)
    if (!blocage) void deciderQualification(id, dossier.decision === d ? null : d, r, parNom)
  }
  const allerAuRefus = () => { if (!String(r.motif ?? "").trim()) majReponses(id, { ...r, motif: `Critère éliminatoire : ${rate.join(", ")}` }); setEssai(""); setI(Math.max(0, sections.findIndex((s) => s.id === "avis"))) }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="chiffres text-colonne text-encre-2">{total.fait} / {total.total} obligatoires{moyenne !== null ? ` · avis ${moyenne.toLocaleString("fr-FR")}/5` : ""}</span>
        {dossier.decision ? <Pastille role={dossier.decision === "Accepté" ? "actif" : dossier.decision === "Refusé" ? "probleme" : "attente"} point>{dossier.decision}</Pastille> : <Pastille point>En cours</Pastille>}
      </div>

      <div className="flex flex-wrap gap-1">
        {sections.map((s, n) => {
          const a = avancementSection(s, r), fini = a.total > 0 && a.fait === a.total, rouge = s.id === "eliminatoires" && rate.length > 0
          return <button key={s.id} type="button" aria-current={n === indice ? "step" : undefined} onClick={() => setI(n)} className={`inline-flex h-7 items-center gap-1 rounded-4 px-2 text-colonne ${n === indice ? "bg-fond-4 font-medium text-encre" : "text-encre-2 hover:bg-fond-2"}`}>{rouge ? <X size={12} className="text-alerte" /> : fini ? <Check size={12} className="text-ok" /> : null}{s.titre}</button>
        })}
      </div>

      {rate.length ? <Bandeau role="alerte" action={<Bouton taille="sm" onClick={allerAuRefus}>Aller au refus</Bouton>}>Critère éliminatoire non rempli : {rate.join(", ")}.</Bandeau> : null}
      {dossier.etat === "erreur" ? <Bandeau role="alerte">{dossier.erreur || "La qualification n'a pas pu être enregistrée."}</Bandeau> : null}

      <div className="space-y-4">
        <div>
          <h3 className="text-sous-titre font-semibold text-encre">{section.titre}</h3>
          {section.aide ? <p className="mt-0.5 text-colonne text-encre-2">{section.aide}</p> : null}
        </div>
        {section.questions.filter((x) => visible(x, r)).map((x) => <Question key={x.id} q={x} r={r} maj={maj} />)}
      </div>

      {section.id === "avis" ? (
        <div className="space-y-2 border-t-[0.5px] border-trait pt-4">
          <p className="text-legende font-medium text-encre">Décision *</p>
          <div className="flex flex-wrap gap-1.5">{DECISIONS_ST.map((d) => <button key={d} type="button" aria-pressed={dossier.decision === d} onClick={() => decider(d)} className={pilule(dossier.decision === d)}>{d}</button>)}</div>
          {essai ? <p className="text-colonne text-alerte">{essai}</p> : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t-[0.5px] border-trait pt-3">
        <Bouton taille="sm" variante="discret" icone={<ArrowLeft />} disabled={indice === 0} onClick={() => setI(indice - 1)}>Précédent</Bouton>
        <span className="text-colonne text-encre-2">{MESSAGE_ETAT[dossier.etat]}</span>
        <Bouton taille="sm" variante="discret" icone={<ArrowRight />} disabled={indice === sections.length - 1} onClick={() => setI(indice + 1)}>Suivant</Bouton>
      </div>
    </div>
  )
}
