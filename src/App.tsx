import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import Sidebar, { type PageId } from "./components/Sidebar"
import { pageAutorisee, premierePage } from "./lib/carteMenu"
import { usePerimetre } from "./lib/usePerimetre"
import { useChoixBase } from "./lib/useChoixBase"
import ChoixBase from "./components/ChoixBase"
// L'espace DÉMARCHAGE, refondu le 09/10/2026 : la fiche, c'est l'agence.
import Aujourdhui from "./components/demarchage/Aujourdhui"
import SessionCall from "./components/demarchage/SessionCall"
import Agences from "./components/demarchage/Agences"
import Agenda from "./components/demarchage/Agenda"
import AnalyseAppels from "./components/demarchage/AnalyseAppels"
import Apporteurs from "./components/demarchage/Apporteurs"
import FicheAgence from "./components/demarchage/FicheAgence"
import Messages from "./components/Messages"
import Parametrage from "./components/Parametrage"
import RappelsRdv from "./components/RappelsRdv"
import TelephoneRingover from "./components/TelephoneRingover"
import Connexion from "./components/Connexion"
import { useSession } from "./lib/auth"
import { suivreVersion, veillerVersion, versionPerimee } from "./lib/versionEnLigne"
// L'espace Recrutement ST : chaque page porte son propre en-tête (trousse STC).
import MachineST from "./components/recrutement/MachineST"
import SessionCallST from "./components/recrutement/SessionCallST"
import BaseST from "./components/recrutement/BaseST"
import SequencesST from "./components/recrutement/SequencesST"
import ReglagesMachineST from "./components/recrutement/ReglagesMachineST"
// Les campagnes (07/11/2026) : le même outil pour les deux bases.
import PageCampagnes from "./components/prospection/PageCampagnes"
import LeadsRecus from "./components/LeadsRecus"

function App() {
  const [page, setPage] = useState<PageId>("aujourdhui")
  // Un onglet resté ouvert sur une ancienne version (et donc d'anciennes règles d'appel) le sait.
  const [perimee, setPerimee] = useState(versionPerimee)
  useEffect(() => {
    veillerVersion()
    return suivreVersion(setPerimee)
  }, [])
  // L'agence qu'on veut appeler tout de suite (depuis Agences, Aujourd'hui, l'agenda…).
  const [agencePourSession, setAgencePourSession] = useState<string | null>(null)
  // La fiche agence ouverte par-dessus n'importe quelle page (depuis le téléphone, l'agenda…).
  const [ficheOuverte, setFicheOuverte] = useState<string | null>(null)
  const [ficheSurEtape, setFicheSurEtape] = useState(false)
  // Agences, ouverte sur une étape précise (depuis « Où en est la base »).
  const [etapePourAgences, setEtapePourAgences] = useState<string | null>(null)
  // Une écriture sur une fiche (étape, contact, note, mail…) : la session recharge sa file et ses compteurs (13/10).
  const [versionAgences, setVersionAgences] = useState(0)
  const naviguer = (p: PageId) => setPage(p)
  const ouvrirSession = (agenceId: string) => {
    // Deux fois la même agence de suite : on repasse par « rien » pour que la
    // session voie bien un changement et la rouvre.
    setAgencePourSession(null)
    setTimeout(() => setAgencePourSession(agenceId), 0)
    setFicheOuverte(null)
    naviguer("sessions")
  }
  const ouvrirAgencesEtape = (etape: string) => {
    setEtapePourAgences(null)
    setTimeout(() => setEtapePourAgences(etape), 0)
    naviguer("agences")
  }
  const ouvrirAgence = (agenceId: string, options?: { etape?: boolean }) => {
    setFicheSurEtape(Boolean(options?.etape))
    setFicheOuverte(agenceId)
  }
  const session = useSession()
  // UN SEUL LOGICIEL (07/11/2026) : le menu et les pages montrent les bases du compte (perimetre.ts) ;
  // un compte qui a les deux bases choisit dans la page (Campagnes, Session de call, Boîte de réception).
  const perimetre = usePerimetre(session)
  const espaces = perimetre ?? []
  const [baseSession, setBaseSession] = useChoixBase("sessions", espaces, false)
  const [baseBoite, setBaseBoite] = useChoixBase("messages", espaces, true)

  // Session en cours de vérification → petit écran d'attente (évite un flash).
  if (session === undefined)
    return (
      <div className="flex h-screen items-center justify-center bg-fond-2 text-encre-3">
        <Loader2 size={22} className="animate-spin" />
      </div>
    )

  // Pas connecté → écran de connexion.
  if (!session) return <Connexion />

  // Un téléprospecteur : sa fonction se lit avant d'afficher quoi que ce soit.
  if (!perimetre)
    return (
      <div className="flex h-screen items-center justify-center bg-fond-2 text-encre-3">
        <Loader2 size={22} className="animate-spin" />
      </div>
    )
  const vue = pageAutorisee(page, espaces) ? page : premierePage(espaces)
  const deuxBases = espaces.length > 1

  return (
    <div className="flex h-screen overflow-hidden bg-fond">
      <Sidebar
        active={vue}
        espaces={espaces}
        onNavigate={(p) => {
          // Depuis le menu, « Sessions de call » repart sur la file, pas sur une agence précise.
          if (p === "sessions") setAgencePourSession(null)
          if (p === "agences") setEtapePourAgences(null)
          naviguer(p)
        }}
        session={session}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {perimee ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-trait bg-alerte px-6 py-2 text-legende text-white">
            <span>Une nouvelle version du logiciel est en ligne. Recharge la page pour l'utiliser : les appels sont bloqués d'ici là.</span>
            <button type="button" className="rounded-3 bg-white/15 px-3 py-1 font-semibold hover:bg-white/25" onClick={() => window.location.reload()}>Recharger</button>
          </div>
        ) : null}
        <main className="min-h-0 flex-1 overflow-y-auto bg-fond">
          {vue === "aujourdhui" && <Aujourdhui onOuvrirSession={ouvrirSession} onOuvrirAgence={ouvrirAgence} onNaviguer={naviguer} onOuvrirEtape={ouvrirAgencesEtape} />}
          {vue === "agences" && <Agences onOuvrirSession={ouvrirSession} etapeInitiale={etapePourAgences} />}
          {vue === "agenda" && <Agenda onOuvrirAgence={ouvrirAgence} onOuvrirSession={ouvrirSession} />}
          {vue === "analyse" && <AnalyseAppels />}
          {vue === "apporteurs" && <Apporteurs />}
          {vue === "messages" && (
            <>
              {deuxBases ? <div className="px-10 pt-5"><ChoixBase valeur={baseBoite} onChange={setBaseBoite} espaces={espaces} avecTout /></div> : null}
              <Messages key={baseBoite} espace={baseBoite === "tout" ? null : baseBoite} />
            </>
          )}
          {/* Les comptes sont rangés dans Réglages › Équipe depuis le 24/10/2026 ; les réglages
              du recrutement sont dans l'espace Recrutement depuis le 26/10. */}
          {vue === "parametrage" && <Parametrage session={session} />}

          {vue === "campagnes" && <PageCampagnes base={deuxBases ? null : espaces[0] === "recrutement" ? "artisans" : "agences"} onSession={() => naviguer("sessions")} />}
          {vue === "st_machine" && <MachineST onNaviguer={(p) => naviguer(p === "reglages" ? "st_reglages" : p === "st_boite" ? "messages" : p === "st_dossiers" ? "leads" : p)} />}
          {vue === "st_reglages" && <ReglagesMachineST />}
          {vue === "st_base" && <BaseST />}
          {vue === "st_sequences" && <SequencesST />}
          {vue === "leads" && (
            <LeadsRecus
              session={session}
              espaces={espaces}
              onAppelerAgence={(id) => { setBaseSession("demarchage"); ouvrirSession(id) }}
              onOuvrirAgence={(id) => ouvrirAgence(id)}
            />
          )}

          {/* La session de call : une page, le choix de base dedans (07/11/2026). */}
          {vue === "sessions" && deuxBases ? <div className="px-8 pt-5"><ChoixBase valeur={baseSession} onChange={setBaseSession} espaces={espaces} avecTout={false} /></div> : null}
          {vue === "sessions" && baseSession === "recrutement" && <SessionCallST />}

          {/* Sessions de call : TOUJOURS montée pour qu'une session en cours ne se
              coupe pas quand on navigue ailleurs (ex. aller chercher une info pendant
              un appel, puis revenir). Simplement masquée hors de son onglet. */}
          {espaces.includes("demarchage") && (
          <div className={vue === "sessions" && baseSession === "demarchage" ? undefined : "hidden"}>
            <SessionCall actif={vue === "sessions" && baseSession === "demarchage"} agenceInitiale={agencePourSession} onOuvrirAgence={ouvrirAgence} versionAgences={versionAgences} />
          </div>
          )}
        </main>
      </div>

      {ficheOuverte && <FicheAgence id={ficheOuverte} ouvrirEtape={ficheSurEtape} onFermer={() => setFicheOuverte(null)} onChange={() => setVersionAgences((v) => v + 1)} onOuvrirSession={ouvrirSession} />}
      {espaces.includes("demarchage") ? <RappelsRdv /> : null}
      <TelephoneRingover onOuvrirAgence={espaces.includes("demarchage") ? ouvrirAgence : undefined} espaces={espaces} />
    </div>
  )
}

export default App
