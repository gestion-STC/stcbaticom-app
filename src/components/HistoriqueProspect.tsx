import { useEffect, useState } from "react"
import { Phone, PhoneIncoming, PhoneOutgoing, Mail, MailOpen, CalendarClock, Loader2 } from "lucide-react"
import { chargerHistorique, type Evenement } from "../lib/historiqueDb"

const styles = {
  appel: { icon: Phone, teinte: "bg-violet-50 text-violet-600" },
  email: { icon: Mail, teinte: "bg-blue-50 text-blue-600" },
  rdv: { icon: CalendarClock, teinte: "bg-emerald-50 text-emerald-600" },
}

// Icône + couleur selon le type ET le sens (entrant = vert, sortant = violet).
function apparence(e: Evenement) {
  if (e.type === "appel") {
    return e.sens === "entrant"
      ? { icon: PhoneIncoming, teinte: "bg-emerald-50 text-emerald-600" }
      : { icon: PhoneOutgoing, teinte: "bg-violet-50 text-violet-600" }
  }
  if (e.type === "email" && e.sens === "entrant")
    return { icon: MailOpen, teinte: "bg-emerald-50 text-emerald-600" }
  return styles[e.type]
}

function dateLisible(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

export default function HistoriqueProspect({
  prospectId,
  compact = false,
}: {
  prospectId: string
  compact?: boolean
}) {
  const [ev, setEv] = useState<Evenement[]>([])
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    chargerHistorique(prospectId)
      .then(setEv)
      .finally(() => setChargement(false))
  }, [prospectId])

  if (chargement)
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-slate-400">
        <Loader2 size={14} className="animate-spin" /> Chargement de l'historique…
      </div>
    )

  if (ev.length === 0)
    return <p className="py-3 text-sm text-slate-400">Aucune action enregistrée pour l'instant.</p>

  const liste = compact ? ev.slice(0, 4) : ev

  return (
    <ul className="space-y-2">
      {liste.map((e, i) => {
        const s = apparence(e)
        const Icon = s.icon
        return (
          <li key={i} className="flex items-start gap-2.5">
            <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${s.teinte}`}>
              <Icon size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{e.libelle}</p>
              {e.detail && <p className="truncate text-xs text-slate-500">{e.detail}</p>}
            </div>
            <span className="shrink-0 text-[11px] text-slate-400">{dateLisible(e.date)}</span>
          </li>
        )
      })}
      {compact && ev.length > liste.length && (
        <li className="text-xs text-slate-400">+{ev.length - liste.length} autre(s) action(s)</li>
      )}
    </ul>
  )
}
