// ── L'ESPACE PROSPECTION : le menu et les écrans (07/11/2026) ──
// Le même menu pour tous les comptes, rempli de ce que le compte a le droit de voir.
import { useState } from "react"
import { LogOut } from "lucide-react"
import LogoBaticom from "../LogoBaticom"
import Campagnes from "./Campagnes"
import Editeur from "./Editeur"
import Session from "./Session"
import Suivi from "./Suivi"
import { Bases, Boite, Dashboard, Equipes, Leads, type Ecran } from "./Ecrans"
import { useVue } from "./outils"

function Lien({ actif, titre, badge, onClick }: { actif: boolean; titre: string; badge?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={"flex h-[30px] w-full items-center rounded-4 px-2 text-left text-legende " + (actif ? "bg-fond-4 font-medium text-encre" : "text-[#3c3c40] hover:bg-fond-3")}>
      <span className="flex-1 truncate">{titre}</span>{badge ? <span className="chiffres rounded-full bg-encre px-1.5 text-[10px] font-medium leading-4 text-white">{badge}</span> : null}
    </button>
  )
}

export default function Espace({ ecranDepart = "dashboard" }: { ecranDepart?: Ecran }) {
  const v = useVue()
  const [ecran, setEcran] = useState<Ecran>(ecranDepart)
  const [campagne, setCampagne] = useState<string | null>(null)
  const ouvrir = (id: string) => { setCampagne(id); setEcran("suivi") }
  const leads = v.leads.filter((l) => l.statut === "a_traiter").length
  const nonLus = v.messages.filter((m) => m.sens === "entrant" && !m.lu).length
  const lien = (id: Ecran, titre: string, badge?: number) => <Lien key={id + titre} titre={titre} badge={badge} actif={ecran === id || (id === "campagnes" && (ecran === "suivi" || ecran === "editeur"))} onClick={() => setEcran(id)} />
  return (
    <div className="flex h-full">
      <nav className="flex h-full w-60 shrink-0 flex-col border-r-[0.5px] border-trait bg-fond px-2.5 pb-3.5 pt-4">
        <div className="px-2 pb-4"><LogoBaticom className="text-[19px]" /></div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {lien("dashboard", "Dashboard")}
          <p className="px-2 pb-1 pt-3 text-colonne text-encre-2">Prospecter</p>
          {lien("campagnes", "Campagnes")}
          {lien("leads", "Leads", leads)}
          {lien("session", "Session de call")}
          {lien("boite", "Boîte de réception", nonLus)}
          <p className="px-2 pb-1 pt-3 text-colonne text-encre-2">Mes bases</p>
          {v.bases.length ? lien("bases", v.bases.length > 1 ? "Toutes les bases" : v.bases[0].nom) : <p className="px-2 text-colonne text-encre-3">Aucune base</p>}
          {v.compte.role === "gerant" ? <><p className="px-2 pb-1 pt-3 text-colonne text-encre-2">Piloter</p>{lien("equipes", "Équipes et accès")}</> : null}
        </div>
        <div className="mt-2 flex items-center gap-2 border-t-[0.5px] border-trait pt-2.5">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-fond-4 text-colonne font-semibold">{v.compte.nom.split(" ").map((x) => x[0]).join("").slice(0, 2)}</div>
          <div className="min-w-0 flex-1 leading-tight"><p className="truncate text-legende font-medium">{v.compte.nom}</p><p className="truncate text-colonne text-encre-2">{v.compte.role === "gerant" ? "Gérant · toutes les équipes" : v.etat.equipes.filter((q) => q.comptes.includes(v.compte.id)).map((q) => q.nom).join(", ") || "Aucune équipe"}</p></div>
          <LogOut size={15} className="text-encre-2" />
        </div>
      </nav>
      <main className="@container min-w-0 flex-1 overflow-y-auto bg-fond px-10 py-8">
        {ecran === "dashboard" ? <Dashboard aller={setEcran} ouvrir={ouvrir} />
          : ecran === "campagnes" ? <Campagnes ouvrir={ouvrir} creer={() => { setCampagne(null); setEcran("editeur") }} />
          : ecran === "suivi" && campagne ? <Suivi id={campagne} modifier={() => setEcran("editeur")} aller={setEcran} />
          : ecran === "editeur" ? <Editeur key={campagne ?? "neuve"} id={campagne} fini={ouvrir} annuler={() => setEcran("campagnes")} />
          : ecran === "leads" ? <Leads aller={setEcran} />
          : ecran === "session" ? <Session />
          : ecran === "bases" ? <Bases />
          : ecran === "boite" ? <Boite />
          : ecran === "equipes" && v.compte.role === "gerant" ? <Equipes />
          : <Dashboard aller={setEcran} ouvrir={ouvrir} />}
      </main>
    </div>
  )
}
