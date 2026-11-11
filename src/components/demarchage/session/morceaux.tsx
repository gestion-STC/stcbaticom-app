// ── Petits morceaux d'écran de la session de call ──
import type { ReactNode } from "react"
import { ArrowRight, CalendarClock, Check, Mail, PhoneIncoming, PhoneOutgoing, SquareCheck, StickyNote, type LucideIcon } from "lucide-react"
import type { Message } from "../../../lib/messagesDb"
import { libelleEtape, pastilleEtape, type Activite, type Agence, type TypeActivite } from "../../../demarchage/modele"
import { dateHeureCourte, decrireActivite, texteDernierAppel } from "../../../demarchage/sessionOutils"
import { Pastille } from "../../../ui"
import type { AppelIa } from "../../../demarchage/appelsIa"
import type { Lead } from "../../../demarchage/db"
import { attenteCourte, couleurAttente, minutesDepuis } from "../../../demarchage/leadsOutils"
import { ResumeSousAppel } from "../EchangesAppels"

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

// Une ligne de la marge (dessin du 06/11/2026, thème A2) : le nom, puis une ligne grise ; pour un
// LEAD, son signal et depuis quand il attend (vert, orange, rouge), avec un point violet.
/** Pourquoi une agence est dans « À appeler aujourd'hui » (Mahdi, 11/11/2026) : un lead, une demande de campagne, un rappel. */
export type MotifAppel = { groupe: "lead" | "campagne" | "rappel"; texte: string }
export function LigneFile({ agence: a, courante, appelee, maintenant, bloquee, onClick, lead, motif }: { motif?: MotifAppel; agence: Agence; courante: boolean; appelee: boolean; maintenant: Date; bloquee: boolean; onClick: () => void; lead?: Lead }) {
  const attente = lead ? minutesDepuis(lead.creeLe, maintenant) : 0
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={bloquee}
      title={bloquee ? "Note d'abord le résultat de l'appel en cours" : a.adresse || undefined}
      aria-current={courante ? "true" : undefined}
      className={"block w-full rounded-4 px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed " + (courante ? "bg-fond-4" : "hover:bg-fond-2 disabled:hover:bg-transparent")}
    >
      <div className="flex items-baseline gap-2">
        {lead ? <span className="h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full bg-signature" /> : motif?.groupe === "campagne" ? <span className="h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full bg-attention" /> : null}
        <span className={"min-w-0 flex-1 truncate text-legende " + (courante ? "font-medium text-encre" : "text-encre")}>{a.nom}</span>
        {lead ? <span className={"chiffres shrink-0 text-colonne " + couleurAttente(attente)}>{attenteCourte(attente)}</span> : motif?.groupe === "rappel" && a.prochaineEcheance ? (new Date(a.prochaineEcheance) < maintenant && new Date(a.prochaineEcheance).toDateString() !== maintenant.toDateString() ? <span className="chiffres shrink-0 text-colonne text-alerte">en retard</span> : <span className="chiffres shrink-0 text-colonne text-encre">{new Date(a.prochaineEcheance).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>) : null}
        {appelee ? <Check size={14} className="shrink-0 text-ok" aria-label="Appelée aujourd'hui" /> : null}
      </div>
      {motif && motif.groupe === "campagne" ? <div className="mt-0.5 truncate text-colonne text-attention">{motif.texte}</div> : null}
      {lead ? <div className="mt-0.5 truncate text-colonne text-encre-2">{lead.signal}{lead.tentatives ? ` · ${lead.tentatives} essai${lead.tentatives > 1 ? "s" : ""}` : ""}</div> : null}
      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-colonne text-encre-2">
        <Pastille role={pastilleEtape(a.etape)}>{libelleEtape(a.etape)}</Pastille>
        {a.nbContacts > 0 ? <Pastille role="info" point>sourcée</Pastille> : null}
        {a.secteurLibelle ? <span>{a.secteurLibelle}</span> : null}
        {a.enseigne ? <span>· {a.enseigne}</span> : null}
      </div>
      {/* L'adresse dans la file : deux agences du même réseau dans le même secteur se distinguent d'un coup d'œil. */}
      <div className="truncate text-colonne text-encre-2">{a.adresse || "adresse inconnue"}</div>
      {lead ? null : (
        <div className="text-colonne text-encre-2">
          {texteDernierAppel(a, maintenant)}
          {a.prochaineEcheance ? ` · ${a.prochaineTache || "tâche"} le ${dateHeureCourte(a.prochaineEcheance)}` : ""}
        </div>
      )}
    </button>
  )
}

const ICONES_FIL: Record<TypeActivite, LucideIcon> = { appel: PhoneOutgoing, email: Mail, rdv: CalendarClock, tache: SquareCheck, note: StickyNote, etape: ArrowRight }
export function LigneFil({ a, echange }: { a: Activite; echange?: AppelIa }) {
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
        {echange ? <ResumeSousAppel appel={echange} /> : null}
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
