import { lazy, Suspense, useState } from "react"
import { Loader2 } from "lucide-react"
import Sidebar, { type PageId } from "./components/Sidebar"
// Le Dashboard embarque la librairie de graphiques (lourde) → chargé en différé :
// le logiciel s'ouvre tout de suite, les graphiques arrivent une fraction de seconde après.
const Dashboard = lazy(() => import("./components/dashboard/Dashboard"))
import Prospects from "./components/Prospects"
import GestionnairesView from "./components/GestionnairesView"
import ApporteursView from "./components/ApporteursView"
import AgencesView from "./components/AgencesView"
import Pipeline from "./components/Pipeline"
import SessionsCall from "./components/SessionsCall"
import Messages from "./components/Messages"
import Calendrier from "./components/Calendrier"
import Parametrage from "./components/Parametrage"
import RappelsRdv from "./components/RappelsRdv"
import TelephoneRingover from "./components/TelephoneRingover"

const titres: Record<PageId, string> = {
  dashboard: "Dashboard",
  prospects: "Prospects",
  gestionnaires: "Gestionnaires",
  apporteurs: "Apporteurs d'affaires",
  agences: "Agences",
  pipeline: "Pipeline",
  sessions: "Sessions de call",
  messages: "Boîte de réception",
  calendrier: "Calendrier",
  parametrage: "Paramétrage",
}

function App() {
  const [page, setPage] = useState<PageId>("dashboard")

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar active={page} onNavigate={setPage} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
          <h1 className="text-xl font-bold text-slate-900">{titres[page]}</h1>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto py-6">
          {page === "dashboard" && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
                  <Loader2 size={18} className="animate-spin" /> Chargement…
                </div>
              }
            >
              <Dashboard />
            </Suspense>
          )}
          {page === "prospects" && <Prospects />}
          {page === "gestionnaires" && <GestionnairesView />}
          {page === "apporteurs" && <ApporteursView />}
          {page === "agences" && <AgencesView />}
          {page === "pipeline" && <Pipeline />}
          {page === "sessions" && <SessionsCall />}
          {page === "messages" && <Messages />}
          {page === "calendrier" && <Calendrier />}
          {page === "parametrage" && <Parametrage />}
        </main>
      </div>

      <RappelsRdv />
      <TelephoneRingover />
    </div>
  )
}

export default App
