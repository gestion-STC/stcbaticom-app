// Une question de formulaire à remplir : la même pour le prospect (page publique) et pour le commercial (au téléphone).
import type { Question } from "../../../prospection/configCampagne"
import { Champ, Selecteur, Zone } from "../../../ui"

const optionsDe = (q: Pick<Question, "options">) => (q.options ?? "").split(",").map((x) => x.trim()).filter(Boolean)

export default function ChampQuestion({ q, valeur, onChange }: { q: Pick<Question, "id" | "libelle" | "type" | "requis" | "options">; valeur: string; onChange: (v: string) => void }) {
  return (
    <div className="block min-w-0 space-y-1">
      <p className="text-legende font-medium text-encre">{q.libelle}{q.requis ? " *" : ""}</p>
      {q.type === "Texte long" ? <Zone rows={3} aria-label={q.libelle} value={valeur} onChange={(e) => onChange(e.target.value)} />
        : q.type === "Oui / Non" ? <div className="flex gap-2">{["Oui", "Non"].map((x) => <button key={x} type="button" aria-pressed={valeur === x} onClick={() => onChange(x)} className={`h-8 rounded-full px-4 text-legende ${valeur === x ? "bg-action text-white" : "border-[0.5px] border-trait text-encre hover:bg-fond-2"}`}>{x}</button>)}</div>
        : q.type === "Choix unique" ? <Selecteur aria-label={q.libelle} value={valeur} onChange={(e) => onChange(e.target.value)}><option value="">Choisir…</option>{optionsDe(q).map((x) => <option key={x}>{x}</option>)}</Selecteur>
        : <Champ aria-label={q.libelle} type={q.type === "Nombre" ? "number" : q.type === "Date" ? "date" : "text"} value={valeur} onChange={(e) => onChange(e.target.value)} />}
    </div>
  )
}
