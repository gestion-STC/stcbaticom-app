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

// DEUX ESPACES (Mahdi, 08/10/2026) : le démarchage commercial (agences,
// appels) et le recrutement des sous-traitants. Chacun a son menu, sa boîte
// de réception, son adresse d'envoi. Les réglages sont communs, en bas.
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

// Une ligne du menu : le violet n'est qu'un trait, à gauche de la page ouverte.
function LigneMenu({ actif, label, Icon, badge, onClick }: { actif: boolean; label: string; Icon: typeof Users; badge?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={actif ? "page" : undefined}
      className={
        "relative flex w-full items-center gap-3 rounded-4 px-3 py-2 text-corps font-medium transition-colors " +
        (actif ? "bg-fond-3 text-encre" : "text-encre-2 hover:bg-fond-3 hover:text-encre")
      }
    >
      {actif ? <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-signature" /> : null}
      <Icon size={16} strokeWidth={2} className={actif ? "text-signature" : "text-encre-3"} />
      <span className="flex-1 truncate text-left">{label}</span>
      {badge ? <span className="chiffres rounded-3 bg-signature-doux px-1.5 py-0.5 text-colonne font-semibold text-signature">{badge}</span> : null}
    </button>
  )
}

// Barre latérale claire et minimaliste (Mahdi, 09/10/2026 : « le violet tape
// trop ; une touche de violet, mais discrète ») : fond blanc, un trait,
// le violet seulement sur la page ouverte, les non-lus et l'initiale du compte.
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
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-trait bg-fond">
      <div className="px-5 pb-4 pt-6">
        <LogoBaticom className="text-[22px]" />
      </div>

      {/* Le sélecteur d'espace : un interrupteur à deux positions, discret. */}
      <div className="mx-4 mb-4 grid grid-cols-2 gap-0.5 rounded-4 bg-fond-3 p-0.5 text-legende font-medium" role="tablist" aria-label="Espace">
        {(
          [
            ["demarchage", "Démarchage", "aujourdhui"],
            ["recrutement", "Recrutement ST", "st_machine"],
          ] as [Espace, string, PageId][]
        ).map(([id, label, premierePage]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={espace === id}
            onClick={() => onNavigate(premierePage)}
            className={
              "flex items-center justify-center gap-1.5 rounded-3 px-2 py-1.5 transition-colors " +
              (espace === id ? "bg-fond text-encre shadow-posee" : "text-encre-2 hover:text-encre")
            }
          >
            {label}
            {nonLus[id] > 0 && espace !== id ? <span className="h-1.5 w-1.5 rounded-full bg-signature" aria-label="non lus" /> : null}
          </button>
        ))}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Pages">
        {items.map(({ id, label, icon }) => (
          <LigneMenu
            key={id}
            actif={id === active}
            label={label}
            Icon={icon}
            badge={id === "messages" ? nonLus.demarchage : id === "st_boite" ? nonLus.recrutement : 0}
            onClick={() => onNavigate(id)}
          />
        ))}
      </nav>

      {/* Réglages, communs aux deux espaces ; Comptes réservé aux administrateurs. */}
      <div className="space-y-0.5 border-t border-trait px-3 pt-3">
        <LigneMenu actif={active === "parametrage"} label="Réglages" Icon={SlidersHorizontal} onClick={() => onNavigate("parametrage")} />
        {estAdmin(session) ? <LigneMenu actif={active === "comptes"} label="Comptes" Icon={KeyRound} onClick={() => onNavigate("comptes")} /> : null}
      </div>

      <div className="mt-2 flex items-center gap-3 border-t border-trait px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-signature-doux text-legende font-semibold text-signature">{initiales}</div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-corps font-medium text-encre">{nom}</p>
          <p className="text-colonne text-encre-2">{libelleRole}</p>
        </div>
        <button type="button" onClick={seDeconnecter} title="Se déconnecter" aria-label="Se déconnecter" className="rounded-4 p-2 text-encre-3 transition-colors hover:bg-fond-3 hover:text-encre">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
