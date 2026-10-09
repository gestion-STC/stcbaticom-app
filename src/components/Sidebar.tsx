import { useEffect, useState } from "react"
import {
  LayoutDashboard,
  Users,
  Building2,
  PhoneCall,
  Calendar,
  SlidersHorizontal,
  Archive,
  Inbox,
  Gauge,
  HardHat,
  ListOrdered,
  BarChart3,
  FolderCheck,
  KeyRound,
  LogOut,
} from "lucide-react"
import type { Session } from "@supabase/supabase-js"
import { commercial } from "../data"
import { compterNonLus, type Espace } from "../lib/messagesDb"
import { seDeconnecter } from "../lib/auth"
import { estAdmin, initialesDe, nomAffiche, roleDeSession, LIBELLE_ROLE } from "../lib/comptes"
import LogoBaticom from "./LogoBaticom"

// DEUX ESPACES (Mahdi, 08/10/2026) : le démarchage commercial (prospects,
// agences, appels) et le recrutement des sous-traitants. Chacun a son menu,
// sa boîte de réception, son adresse d'envoi. Les réglages sont communs, en bas.
export type PageId =
  | "aujourdhui"
  | "sessions"
  | "agences"
  | "agenda"
  | "messages"
  | "apporteurs"
  | "st_machine"
  | "st_base"
  | "st_sequences"
  | "st_suivi"
  | "st_boite"
  | "st_dossiers"
  | "parametrage"
  | "comptes"

type NavItem = { id: PageId; label: string; icon: typeof Users }

// REFONTE du 09/10/2026 (Mahdi) : la fiche, c'est l'agence. Six pages : le jour,
// les appels, les agences, l'agenda, la boîte, et l'archive des apporteurs.
const menuDemarchage: NavItem[] = [
  { id: "aujourdhui", label: "Aujourd'hui", icon: LayoutDashboard },
  { id: "sessions", label: "Sessions de call", icon: PhoneCall },
  { id: "agences", label: "Agences", icon: Building2 },
  { id: "agenda", label: "Agenda", icon: Calendar },
  { id: "messages", label: "Boîte de réception", icon: Inbox },
  { id: "apporteurs", label: "Apporteurs d'affaires", icon: Archive },
]

const menuRecrutement: NavItem[] = [
  { id: "st_machine", label: "Machine", icon: Gauge },
  { id: "st_base", label: "Base d'artisans", icon: HardHat },
  { id: "st_sequences", label: "Séquences", icon: ListOrdered },
  { id: "st_suivi", label: "Suivi", icon: BarChart3 },
  { id: "st_boite", label: "Boîte de réception", icon: Inbox },
  { id: "st_dossiers", label: "Dossiers déposés", icon: FolderCheck },
]

// Barre latérale sombre : dégradé noir → violet + trame de petits points,
// même recette que la section « Vision » du site vitrine (qui l'a en rouge).
export default function Sidebar({
  active,
  espace,
  onNavigate,
  session,
}: {
  active: PageId
  espace: Espace // l'espace affiché (tenu par l'application : il survit à un passage par Réglages)
  onNavigate: (id: PageId) => void
  session?: Session | null
}) {
  const items = espace === "recrutement" ? menuRecrutement : menuDemarchage

  // Qui est connecté : nom et rôle du compte, sinon le profil par défaut (mode démo).
  const role = roleDeSession(session)
  const nom = session ? nomAffiche(session) : commercial.prenom
  const libelleRole = role ? LIBELLE_ROLE[role] : commercial.role
  const initiales = session ? initialesDe(nom) : commercial.initiales

  // Pastilles « non lus » des DEUX boîtes, rafraîchies toutes les 60 s
  // (et quand on change de page, pour qu'elles retombent après lecture).
  const [nonLus, setNonLus] = useState<Record<Espace, number>>({ demarchage: 0, recrutement: 0 })
  useEffect(() => {
    let annule = false
    const maj = () =>
      Promise.all([compterNonLus("demarchage"), compterNonLus("recrutement")]).then(([d, r]) => !annule && setNonLus({ demarchage: d, recrutement: r }))
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
      <div className="relative px-5 pb-3 pt-6">
        <LogoBaticom clair className="text-[22px]" />
      </div>

      {/* Le sélecteur d'espace */}
      <div className="relative mx-3 mb-3 grid grid-cols-2 gap-0.5 rounded-lg bg-white/10 p-0.5 text-xs font-semibold">
        {(
          [
            ["demarchage", "Démarchage", "aujourdhui"],
            ["recrutement", "Recrutement ST", "st_machine"],
          ] as [Espace, string, PageId][]
        ).map(([id, label, premierePage]) => (
          <button
            key={id}
            onClick={() => onNavigate(premierePage)}
            className={
              "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition-colors " +
              (espace === id ? "bg-white text-[#1d1038]" : "text-white/65 hover:bg-white/10 hover:text-white")
            }
          >
            {label}
            {nonLus[id] > 0 && espace !== id ? <span className="h-1.5 w-1.5 rounded-full bg-violet-400" /> : null}
          </button>
        ))}
      </div>

      {/* Navigation de l'espace */}
      <nav className="relative mt-1 flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map(({ id, label, icon: Icon }) => {
          const isActive = id === active
          const badge = id === "messages" ? nonLus.demarchage : id === "st_boite" ? nonLus.recrutement : 0
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
              {badge > 0 && (
                <span className="rounded-full bg-violet-500 px-2 py-0.5 text-xs font-semibold text-white">
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Réglages, communs aux deux espaces ; Comptes réservé aux administrateurs (07/10/2026) */}
      <div className="relative space-y-0.5 px-3 pt-2">
        {([["parametrage", "Réglages", SlidersHorizontal], ...(estAdmin(session) ? [["comptes", "Comptes", KeyRound]] : [])] as [PageId, string, typeof Users][]).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
              (active === id ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/10 hover:text-white")
            }
          >
            <Icon size={17} strokeWidth={2} className={active === id ? "text-white" : "text-white/40"} />
            <span className="flex-1 text-left">{label}</span>
          </button>
        ))}
      </div>

      {/* Profil */}
      <div className="relative mt-2 flex items-center gap-3 border-t border-white/10 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-semibold text-white">
          {initiales}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium text-white">{nom}</p>
          <p className="text-xs text-white/50">{libelleRole}</p>
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
