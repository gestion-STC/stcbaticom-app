// Lecture visuelle commune d'un historique d'actions : icône, teinte, date.
// Partagée par la fiche prospect et le parcours des signatures (Dashboard),
// pour que les deux écrans se lisent exactement pareil.

import { Phone, PhoneIncoming, PhoneOutgoing, Mail, MailOpen, CalendarClock } from "lucide-react"
import type { Evenement } from "./historiqueDb"

const styles = {
  appel: { icon: Phone, teinte: "bg-violet-50 text-violet-600" },
  email: { icon: Mail, teinte: "bg-blue-50 text-blue-600" },
  rdv: { icon: CalendarClock, teinte: "bg-emerald-50 text-emerald-600" },
}

// Icône + couleur selon le type ET le sens (entrant = vert, sortant = violet).
export function apparence(e: Evenement) {
  if (e.type === "appel") {
    return e.sens === "entrant"
      ? { icon: PhoneIncoming, teinte: "bg-emerald-50 text-emerald-600" }
      : { icon: PhoneOutgoing, teinte: "bg-violet-50 text-violet-600" }
  }
  if (e.type === "email" && e.sens === "entrant")
    return { icon: MailOpen, teinte: "bg-emerald-50 text-emerald-600" }
  return styles[e.type]
}

// « 04 août 2026 · 16:39 »
export function dateLisible(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return (
    d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  )
}
