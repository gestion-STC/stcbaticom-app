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
import LogoBaticom from "./LogoBaticom"

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

// Barre latérale sombre : dégradé noir → violet + trame de petits points,
// même recette que la section « Vision » du site vitrine (qui l'a en rouge).
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
    <aside className="relative flex h-screen w-64 shrink-0 flex-col overflow-hidden bg-gradient-to-b from-[#0b0a12] via-[#1d1038] to-violet-700">
      {/* Trame de petits points, comme sur le site */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.1] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" />

      {/* Logo STCbaticom (version blanche sur fond sombre) */}
      <div className="relative px-5 pb-4 pt-6">
        <LogoBaticom clair className="text-[22px]" />
      </div>

      {/* Navigation */}
      <nav className="relative mt-1 flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map(({ id, label, icon: Icon }) => {
          const isActive = id === active
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
                (isActive
                  ? "bg-white/15 text-white"
                  : "text-white/55 hover:bg-white/10 hover:text-white")
              }
            >
              <Icon
                size={17}
                strokeWidth={2}
                className={isActive ? "text-white" : "text-white/40"}
              />
              <span className="flex-1 text-left">{label}</span>
              {id === "messages" && nonLus > 0 && (
                <span className="rounded-full bg-violet-500 px-2 py-0.5 text-xs font-semibold text-white">
                  {nonLus}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Profil */}
      <div className="relative mt-2 flex items-center gap-3 border-t border-white/10 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
          {commercial.initiales}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-medium text-white">{commercial.prenom}</p>
          <p className="text-xs text-white/50">{commercial.role}</p>
        </div>
        <button
          onClick={seDeconnecter}
          title="Se déconnecter"
          className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
