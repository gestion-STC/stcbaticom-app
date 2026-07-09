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
  Hexagon,
} from "lucide-react"
import { commercial } from "../data"

export type PageId =
  | "dashboard"
  | "prospects"
  | "gestionnaires"
  | "apporteurs"
  | "agences"
  | "pipeline"
  | "sessions"
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
  { id: "calendrier", label: "Calendrier", icon: Calendar },
  { id: "parametrage", label: "Paramétrage", icon: SlidersHorizontal },
]

export default function Sidebar({
  active,
  onNavigate,
}: {
  active: PageId
  onNavigate: (id: PageId) => void
}) {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-slate-900 text-slate-300">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Hexagon size={20} strokeWidth={2.2} />
        </div>
        <span className="text-[15px] font-semibold tracking-wide text-white">
          STC <span className="text-blue-400">BÂTIMENTS</span>
        </span>
      </div>

      {/* Navigation */}
      <nav className="mt-2 flex-1 space-y-1 px-3">
        {items.map(({ id, label, icon: Icon }) => {
          const isActive = id === active
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors " +
                (isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white")
              }
            >
              <Icon size={18} strokeWidth={2} />
              {label}
            </button>
          )
        })}
      </nav>

      {/* Profil */}
      <div className="mt-2 flex items-center gap-3 border-t border-slate-800 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold text-white">
          {commercial.initiales}
        </div>
        <div className="leading-tight">
          <p className="text-sm font-medium text-white">{commercial.prenom}</p>
          <p className="text-xs text-slate-400">{commercial.role}</p>
        </div>
      </div>
    </aside>
  )
}
