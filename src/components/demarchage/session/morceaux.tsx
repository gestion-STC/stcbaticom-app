// ── Petits morceaux d'écran de la session de call ──
import type { ReactNode } from "react"
import { ArrowRight, CalendarClock, Check, Mail, PhoneIncoming, PhoneOutgoing, SquareCheck, StickyNote, type LucideIcon } from "lucide-react"
import type { Message } from "../../../lib/messagesDb"
import { libelleEtape, pastilleEtape, type Activite, type Agence, type TypeActivite } from "../../../demarchage/modele"
import { dateHeureCourte, decrireActivite, texteDernierAppel } from "../../../demarchage/sessionOutils"
import { Pastille } from "../../../ui"

export function Section({ titre, droite, children }: { titre: string; droite?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-colonne font-medium text-encre-2">{titre}</h3>
        {droite}
      </div>
      {children}
    </section>
  )
}

export function LigneFile({ agence: a, courante, appelee, maintenant, bloquee, onClick }: { agence: Agence; courante: boolean; appelee: boolean; maintenant: Date; bloquee: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={bloquee}
      title={bloquee ? "Note d'abord le résultat de l'appel en cours" : undefined}
      aria-current={courante ? "true" : undefined}
      className={"block w-full border-b border-l-2 border-b-fond-4 px-4 py-2 text-left transition-colors hover:bg-fond-2 disabled:cursor-not-allowed disabled:hover:bg-transparent " + (courante ? "border-l-signature bg-fond-3" : "border-l-transparent")}
    >
      <div className="flex items-center gap-2">
        <span className={"min-w-0 flex-1 truncate text-legende " + (courante ? "font-semibold" : "font-medium") + " text-encre"}>{a.nom}</span>
        {appelee ? <Check size={14} className="shrink-0 text-ok" aria-label="Appelée aujourd'hui" /> : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-colonne text-encre-2">
        <Pastille role={pastilleEtape(a.etape)}>{libelleEtape(a.etape)}</Pastille>
        {a.nbContacts > 0 ? <Pastille role="info" point>sourcée</Pastille> : null}
        {a.secteurLibelle ? <span>{a.secteurLibelle}</span> : null}
        {a.enseigne ? <span>· {a.enseigne}</span> : null}
      </div>
      {/* L'adresse dans la file : deux agences du même réseau dans le même secteur se distinguent d'un coup d'œil. */}
      <div className="mt-0.5 truncate text-colonne text-encre-2" title={a.adresse || undefined}>{a.adresse || "adresse inconnue"}</div>
      <div className="mt-0.5 text-colonne text-encre-2">
        {texteDernierAppel(a, maintenant)}
        {a.prochaineEcheance ? ` · ${a.prochaineTache || "tâche"} le ${dateHeureCourte(a.prochaineEcheance)}` : ""}
      </div>
    </button>
  )
}

const ICONES_FIL: Record<TypeActivite, LucideIcon> = { appel: PhoneOutgoing, email: Mail, rdv: CalendarClock, tache: SquareCheck, note: StickyNote, etape: ArrowRight }
export function LigneFil({ a }: { a: Activite }) {
  const d = decrireActivite(a)
  const Icone = a.type === "appel" && a.sens === "entrant" ? PhoneIncoming : (ICONES_FIL[a.type] ?? StickyNote)
  return (
    <li className="flex gap-3 py-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fond-3 text-encre-2">
        <Icone size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-legende font-medium text-encre">{d.titre}</span>
          <span className="chiffres shrink-0 text-colonne text-encre-2">{dateHeureCourte(a.date)}</span>
        </div>
        {d.detail ? <div className="text-colonne text-encre-2">{d.detail}</div> : null}
        {d.etat ? <Pastille role={d.etat === "fait" ? "fait" : "attente"} className="mt-1">{d.etat === "fait" ? "faite" : "ouverte"}</Pastille> : null}
        {a.note ? <p className="mt-1 whitespace-pre-line text-legende text-encre">{a.note}</p> : null}
      </div>
    </li>
  )
}

export function LigneMessage({ m }: { m: Message }) {
  return (
    <div className="flex items-center gap-2 py-1.5 text-legende">
      <Mail size={14} className="shrink-0 text-encre-2" />
      <span className="min-w-0 flex-1 truncate text-encre">
        {m.sens === "entrant" ? "Reçu" : "Envoyé"} · {m.objet || "(sans objet)"}
      </span>
      <span className="chiffres shrink-0 text-colonne text-encre-2">{dateHeureCourte(m.date)}</span>
    </div>
  )
}
