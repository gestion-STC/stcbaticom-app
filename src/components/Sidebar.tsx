import { useEffect, useState } from "react"
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Building2,
  Columns3,
  PhoneCall,
  Calendar,
  SlidersHorizontal,
  Handshake,
  Inbox,
  LogOut,
} from "lucide-react"
import { commercial } from "../data"
import { compterNonLus } from "../lib/messagesDb"
import { seDeconnecter } from "../lib/auth"

export type PageId =
  | "dashboard"
  | "prospects"
  | "gestionnaires"
  | "apporteurs"
  | "agences"
  | "pipeline"
  | "sessions"
  | "messages"
  | "calendrier"
  | "parametrage"

type NavItem = { id: PageId; label: string; icon: typeof Users }

const items: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "prospects", label: "Prospects", icon: Users },
  { id: "gestionnaires", label: "Gestionnaires", icon: UserCheck },
  { id: "apporteurs", label: "Apporteurs d'affaires", icon: Handshake },
  { id: "agences", label: "Agences", icon: Building2 },
  { id: "pipeline", label: "Pipeline", icon: Columns3 },
  { id: "sessions", label: "Sessions de call", icon: PhoneCall },
  { id: "messages", label: "Boîte de réception", icon: Inbox },
  { id: "calendrier", label: "Calendrier", icon: Calendar },
  { id: "parametrage", label: "Paramétrage", icon: SlidersHorizontal },
]

// Barre latérale BLANCHE (design STC, style Notion/Qonto) : texte gris sobre,
// élément actif = fond gris très clair + texte foncé, accent violet discret.
export default function Sidebar({
  active,
  onNavigate,
}: {
  active: PageId
  onNavigate: (id: PageId) => void
}) {
  // Pastille « non lus » de la boîte de réception, rafraîchie toutes les 60 s
  // (et quand on quitte la boîte, pour qu'elle retombe après lecture).
  const [nonLus, setNonLus] = useState(0)
  useEffect(() => {
    let annule = false
    const maj = () => compterNonLus().then((n) => !annule && setNonLus(n))
    maj()
    const t = setInterval(maj, 60_000)
    return () => {
      annule = true
      clearInterval(t)
    }
  }, [active])

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      {/* Wordmark STCBATICOM — écrit avec la police du logo STC Bâtiment, en noir */}
      <div className="px-5 pb-4 pt-5">
        <span className="font-brand text-[21px] font-bold tracking-tight text-slate-950">
          STCBATICOM
        </span>
      </div>

      {/* Navigation */}
      <nav className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map(({ id, label, icon: Icon }) => {
          const isActive = id === active
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
                (isActive
                  ? "bg-gradient-to-r from-violet-600 to-violet-800 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900")
              }
            >
              <Icon
                size={17}
                strokeWidth={2}
                className={isActive ? "text-white" : "text-slate-400"}
              />
              <span className="flex-1 text-left">{label}</span>
              {id === "messages" && nonLus > 0 && (
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-xs font-semibold " +
                    (isActive ? "bg-white/25 text-white" : "bg-violet-600 text-white")
                  }
                >
                  {nonLus}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Profil */}
      <div className="mt-2 flex items-center gap-3 border-t border-slate-200 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
          {commercial.initiales}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-medium text-slate-900">{commercial.prenom}</p>
          <p className="text-xs text-slate-400">{commercial.role}</p>
        </div>
        <button
          onClick={seDeconnecter}
          title="Se déconnecter"
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
