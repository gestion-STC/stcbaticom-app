import { useEffect, useState } from "react"
import { Building2, HardHat, LogOut, SlidersHorizontal, type LucideIcon } from "lucide-react"
import type { Session } from "@supabase/supabase-js"
import { commercial } from "../data"
import { compterNonLus, EVENEMENT_LUS, type Espace } from "../lib/messagesDb"
import { seDeconnecter } from "../lib/auth"
import { initialesDe, nomAffiche, roleDeSession, LIBELLE_ROLE } from "../lib/comptes"
import LogoBaticom from "./LogoBaticom"
import { RUBRIQUES, premierePage, rubriqueDe, type RubriqueMenu } from "../lib/carteMenu"

// DEUX ESPACES (Mahdi, 08/10/2026) : la prospection des agences et le recrutement des
// sous-traitants. Chacun a son menu, sa boîte de réception, son adresse d'envoi.
// Les réglages sont communs, en bas.
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
  | "st_reglages"
  | "parametrage"

// LE MENU, COMME SUR STC BÂTIMENT (Mahdi, 06/11/2026 : « il y a un curseur moche ») : un rail
// d'icônes (60 px) avec les rubriques, et à côté le menu de la rubrique ouverte (196 px).
// Au survol d'une autre icône, son menu passe par-dessus. La carte : src/lib/carteMenu.ts.
const ICONES: Record<Espace, LucideIcon> = { demarchage: Building2, recrutement: HardHat }

function Lien({ actif, titre, badge, onClick }: { actif: boolean; titre: string; badge?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={actif ? "page" : undefined}
      className={
        "flex h-[30px] w-full items-center rounded-4 px-2 text-left text-legende transition-colors " +
        (actif ? "bg-fond-4 font-medium text-encre" : "text-[#3c3c40] hover:bg-fond-3 hover:text-encre")
      }
    >
      <span className="flex-1 truncate">{titre}</span>
      {badge ? <span className="chiffres rounded-full bg-encre px-1.5 text-[10px] font-medium leading-4 text-white">{badge}</span> : null}
    </button>
  )
}

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
  const courante = rubriqueDe(espace)

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

  const badge = (id: PageId) => (id === "messages" ? nonLus.demarchage : id === "st_boite" ? nonLus.recrutement : 0)

  // Le menu d'une rubrique : son titre, puis ses groupes (intertitre gris) et leurs pages.
  const menu = (r: RubriqueMenu) => (
    <>
      <p className="mb-3 mt-1 px-2 text-legende font-semibold text-encre">{r.titre}</p>
      {r.groupes.map((g, i) => (
        <div key={g.titre || i}>
          {g.titre ? <p className="px-2 pb-1 pt-3 text-colonne text-encre-2">{g.titre}</p> : null}
          {g.entrees.map((e) => (
            <Lien key={e.id} actif={e.id === active} titre={e.titre} badge={badge(e.id)} onClick={() => onNavigate(e.id)} />
          ))}
        </div>
      ))}
    </>
  )

  const boutonRail = (titre: string, Icone: LucideIcon, allume: boolean, onClick: () => void, point?: boolean) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={titre}
      title={titre}
      aria-current={allume ? "page" : undefined}
      className={"relative flex h-[38px] w-[38px] items-center justify-center rounded-[9px] transition-colors " + (allume ? "bg-fond shadow-[0_1px_2px_rgb(17_17_19/0.08)]" : "hover:bg-[#e9e9ec]")}
    >
      <Icone size={18} strokeWidth={1.6} className={allume ? "text-encre" : "text-encre-2"} />
      {point ? <span className="absolute right-[7px] top-[7px] h-[7px] w-[7px] rounded-full bg-encre shadow-[0_0_0_2px_#f4f4f6]" aria-label="non lus" /> : null}
    </button>
  )

  return (
    <nav className="relative flex h-screen w-64 shrink-0" aria-label="Menu">
      {/* Le rail des rubriques */}
      <div className="relative z-30 flex w-[60px] shrink-0 flex-col items-center gap-1 border-r-[0.5px] border-trait bg-[#f4f4f6] py-3.5">
        {RUBRIQUES.map((r) => {
          const Icone = ICONES[r.espace]
          const ouverte = r.espace === espace && active !== "parametrage"
          return (
            <div key={r.espace} className="group">
              {boutonRail(r.titre, Icone, ouverte, () => onNavigate(premierePage(r)), !ouverte && nonLus[r.espace] > 0)}
              {/* Au survol d'une AUTRE rubrique, son menu passe par-dessus le panneau. */}
              {r.espace !== espace ? (
                <div className="absolute bottom-0 left-[60px] top-0 z-40 hidden w-[196px] overflow-y-auto border-r-[0.5px] border-trait bg-fond px-2.5 pb-3.5 pt-4 shadow-[8px_0_24px_rgb(17_17_19/0.06)] group-focus-within:block group-hover:block">
                  {menu(r)}
                </div>
              ) : null}
            </div>
          )
        })}
        <span className="flex-1" />
        {boutonRail("Réglages", SlidersHorizontal, active === "parametrage", () => onNavigate("parametrage"))}
      </div>

      {/* Le panneau : le menu de la rubrique ouverte */}
      <div className="flex min-w-0 flex-1 flex-col border-r-[0.5px] border-trait bg-fond px-2.5 pb-3.5 pt-4">
        <div className="px-2 pb-4">
          <LogoBaticom className="text-[19px]" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{menu(courante)}</div>

        <div className="mt-2 flex items-center gap-2 border-t-[0.5px] border-trait pt-2.5">
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-fond-4 text-colonne font-semibold text-encre">{initiales}</div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-legende font-medium text-encre">{nom}</p>
            <p className="text-colonne text-encre-2">{libelleRole}</p>
          </div>
          <button type="button" onClick={seDeconnecter} title="Se déconnecter" aria-label="Se déconnecter" className="rounded-full p-2 text-encre-2 transition-colors hover:bg-fond-3 hover:text-encre">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </nav>
  )
}
