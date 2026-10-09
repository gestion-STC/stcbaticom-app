import { useState } from "react"
import { Loader2 } from "lucide-react"
import Sidebar, { type PageId } from "./components/Sidebar"
import { espaceDe, horsEspace } from "./lib/espaces"
import type { Espace } from "./lib/messagesDb"
// L'espace DÉMARCHAGE, refondu le 09/10/2026 : la fiche, c'est l'agence.
import Aujourdhui from "./components/demarchage/Aujourdhui"
import SessionCall from "./components/demarchage/SessionCall"
import Agences from "./components/demarchage/Agences"
import Agenda from "./components/demarchage/Agenda"
import Apporteurs from "./components/demarchage/Apporteurs"
import FicheAgence from "./components/demarchage/FicheAgence"
import Messages from "./components/Messages"
import Parametrage from "./components/Parametrage"
import RappelsRdv from "./components/RappelsRdv"
import TelephoneRingover from "./components/TelephoneRingover"
import Connexion from "./components/Connexion"
import Comptes from "./components/Comptes"
import { useSession } from "./lib/auth"
// L'espace Recrutement ST : chaque page porte son propre en-tête (trousse STC).
import MachineST from "./components/recrutement/MachineST"
import BaseST from "./components/recrutement/BaseST"
import SequencesST from "./components/recrutement/SequencesST"
import SuiviST from "./components/recrutement/SuiviST"
import DossiersST from "./components/recrutement/DossiersST"

function App() {
  const [page, setPage] = useState<PageId>("aujourdhui")
  // L'espace affiché dans la barre : celui de la page, et il survit à un
  // passage par Réglages ou Comptes (qui sont hors espace).
  const [espace, setEspace] = useState<Espace>("demarchage")
  // L'agence qu'on veut appeler tout de suite (depuis Agences, Aujourd'hui, l'agenda…).
  const [agencePourSession, setAgencePourSession] = useState<string | null>(null)
  // La fiche agence ouverte par-dessus n'importe quelle page (depuis le téléphone, l'agenda…).
  const [ficheOuverte, setFicheOuverte] = useState<string | null>(null)
  const [ficheSurEtape, setFicheSurEtape] = useState(false)
  const naviguer = (p: PageId) => {
    setPage(p)
    if (!horsEspace(p)) setEspace(espaceDe(p))
  }
  const ouvrirSession = (agenceId: string) => {
    // Deux fois la même agence de suite : on repasse par « rien » pour que la
    // session voie bien un changement et la rouvre.
    setAgencePourSession(null)
    setTimeout(() => setAgencePourSession(agenceId), 0)
    setFicheOuverte(null)
    naviguer("sessions")
  }
  const ouvrirAgence = (agenceId: string, options?: { etape?: boolean }) => {
    setFicheSurEtape(Boolean(options?.etape))
    setFicheOuverte(agenceId)
  }
  const session = useSession()

  // Session en cours de vérification → petit écran d'attente (évite un flash).
  if (session === undefined)
    return (
      <div className="flex h-screen items-center justify-center bg-fond-2 text-encre-3">
        <Loader2 size={22} className="animate-spin" />
      </div>
    )

  // Pas connecté → écran de connexion.
  if (!session) return <Connexion />

  return (
    <div className="flex h-screen overflow-hidden bg-fond-2">
      <Sidebar
        active={page}
        espace={espace}
        onNavigate={(p) => {
          // Depuis le menu, « Sessions de call » repart sur la file, pas sur une agence précise.
          if (p === "sessions") setAgencePourSession(null)
          naviguer(p)
        }}
        session={session}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {page === "comptes" && (
          <header className="flex items-center justify-between border-b border-trait bg-fond px-10 py-4">
            <h1 className="text-section font-semibold text-encre">Comptes</h1>
          </header>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto bg-fond-2">
          {page === "aujourdhui" && <Aujourdhui onOuvrirSession={ouvrirSession} onOuvrirAgence={ouvrirAgence} onNaviguer={naviguer} />}
          {page === "agences" && <Agences onOuvrirSession={ouvrirSession} />}
          {page === "agenda" && <Agenda onOuvrirAgence={ouvrirAgence} onOuvrirSession={ouvrirSession} />}
          {page === "apporteurs" && <Apporteurs />}
          {page === "messages" && <Messages espace="demarchage" />}
          {page === "parametrage" && <Parametrage />}
          {page === "comptes" && <Comptes session={session} />}

          {page === "st_machine" && <MachineST onNaviguer={(p) => naviguer(p === "reglages" ? "parametrage" : p)} />}
          {page === "st_base" && <BaseST />}
          {page === "st_sequences" && <SequencesST />}
          {page === "st_suivi" && <SuiviST />}
          {page === "st_boite" && <Messages espace="recrutement" />}
          {page === "st_dossiers" && <DossiersST />}

          {/* Sessions de call : TOUJOURS montée pour qu'une session en cours ne se
              coupe pas quand on navigue ailleurs (ex. aller chercher une info pendant
              un appel, puis revenir). Simplement masquée hors de son onglet. */}
          <div className={page === "sessions" ? undefined : "hidden"}>
            <SessionCall actif={page === "sessions"} agenceInitiale={agencePourSession} onOuvrirAgence={ouvrirAgence} />
          </div>
        </main>
      </div>

      {ficheOuverte && <FicheAgence id={ficheOuverte} ouvrirEtape={ficheSurEtape} onFermer={() => setFicheOuverte(null)} onOuvrirSession={ouvrirSession} />}
      <RappelsRdv />
      <TelephoneRingover onOuvrirAgence={ouvrirAgence} />
    </div>
  )
}

export default App
