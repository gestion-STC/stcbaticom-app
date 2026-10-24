import { useEffect, useState } from "react"
import {
  Sparkles,
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
import { compterNonLus, EVENEMENT_LUS, type Espace } from "../lib/messagesDb"
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
  | "analyse"
  | "messages"
  | "apporteurs"
  | "st_machine"
  | "st_session"
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
  { id: "analyse", label: "Analyse IA", icon: Sparkles },
  { id: "messages", label: "Boîte de réception", icon: Inbox },
  { id: "apporteurs", label: "Apporteurs d'affaires", icon: Archive },
]

const menuRecrutement: NavItem[] = [
  { id: "st_machine", label: "Machine", icon: Gauge },
  { id: "st_session", label: "Session de call", icon: PhoneCall },
  { id: "st_base", label: "Base d'artisans", icon: HardHat },
  { id: "st_sequences", label: "Séquences", icon: ListOrdered },
  { id: "st_suivi", label: "Suivi", icon: BarChart3 },
  { id: "st_boite", label: "Boîte de réception", icon: Inbox },
  { id: "st_dossiers", label: "Dossiers déposés", icon: FolderCheck },
]

// Une ligne du menu, au dessin « bancaire » (24/10/2026, celui du bureau STC) : 30 px,
// texte gris, la page ouverte sur fond gris clair, plus de trait violet.
function LigneMenu({ actif, label, Icon, badge, onClick }: { actif: boolean; label: string; Icon: typeof Users; badge?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={actif ? "page" : undefined}
      className={
        "relative flex h-[30px] w-full items-center gap-2.5 rounded-4 px-2 text-legende transition-colors " +
        (actif ? "bg-fond-4 font-medium text-encre" : "text-[#3c3c40] hover:bg-fond-3 hover:text-encre")
      }
    >
      <Icon size={15} className={actif ? "text-encre" : "text-encre-2"} />
      <span className="flex-1 truncate text-left">{label}</span>
      {badge ? <span className="chiffres rounded-full bg-encre px-1.5 text-[10px] font-medium leading-4 text-white">{badge}</span> : null}
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
    // Un mail ouvert (ou remis non lu) : la pastille se recompte tout de
    // suite, sans attendre la minute (12/10/2026). Et au retour sur l'onglet,
    // pour voir sans délai un mail arrivé pendant qu'on était ailleurs.
    window.addEventListener(EVENEMENT_LUS, maj)
    window.addEventListener("focus", maj)
    return () => {
      annule = true
      clearInterval(t)
      window.removeEventListener(EVENEMENT_LUS, maj)
      window.removeEventListener("focus", maj)
    }
  }, [active])

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r-[0.5px] border-trait bg-fond">
      <div className="px-5 pb-4 pt-5">
        <LogoBaticom className="text-[22px]" />
      </div>

      {/* Le sélecteur d'espace : une gélule fine, à la Apple (Mahdi, 09/10 : « plus fin, plus discret »). */}
      <div className="mx-4 mb-4 inline-grid w-fit grid-cols-2 rounded-full bg-fond-3 p-[2px] text-colonne font-medium" role="tablist" aria-label="Espace">
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
              "flex h-6 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 transition-colors " +
              (espace === id ? "bg-fond text-encre shadow-[0_1px_2px_rgb(17_17_19/0.08)]" : "text-encre-2 hover:text-encre")
            }
          >
            {label}
            {nonLus[id] > 0 && espace !== id ? <span className="h-1.5 w-1.5 rounded-full bg-encre" aria-label="non lus" /> : null}
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
      <div className="space-y-0.5 border-t-[0.5px] border-trait px-3 pt-3">
        <LigneMenu actif={active === "parametrage"} label="Réglages" Icon={SlidersHorizontal} onClick={() => onNavigate("parametrage")} />
        {estAdmin(session) ? <LigneMenu actif={active === "comptes"} label="Comptes" Icon={KeyRound} onClick={() => onNavigate("comptes")} /> : null}
      </div>

      <div className="mt-2 flex items-center gap-2.5 border-t-[0.5px] border-trait px-4 py-3">
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-fond-4 text-colonne font-semibold text-encre">{initiales}</div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-legende font-medium text-encre">{nom}</p>
          <p className="text-colonne text-encre-2">{libelleRole}</p>
        </div>
        <button type="button" onClick={seDeconnecter} title="Se déconnecter" aria-label="Se déconnecter" className="rounded-full p-2 text-encre-2 transition-colors hover:bg-fond-3 hover:text-encre">
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  )
}
