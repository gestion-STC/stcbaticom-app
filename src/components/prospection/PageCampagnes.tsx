// ── LA PAGE CAMPAGNES DU LOGICIEL (07/11/2026, lot 1) : les écrans de la prospection, branchés sur la base ──
// Une seule page (07/11/2026) : `base` null = toutes les bases du compte, avec le choix de base dans la page
// (un administrateur) ; sinon la base du compte (un commercial : les agences, un recruteur : les artisans).
// Les données se relisent toutes les 2 minutes (le moteur passe toutes les 10).
import { useEffect, useMemo, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Bandeau, Bouton, Chargement } from "../../ui"
import { ContexteDepot } from "../../prospection/depot"
import { creerDepotSupabase } from "../../prospection/depotSupabase"
import { useSession } from "../../lib/auth"
import { peutQuitter } from "../../lib/gardeQuitter"
import { nomAffiche, roleDeSession } from "../../lib/comptes"
import Campagnes from "./Campagnes"
import Editeur from "./Editeur"
import Suivi from "./Suivi"
import { ContexteBaseUnique, ContexteCompte } from "./outils"
import { ORIGINE_TRACABILITE } from "../../prospection/configCampagne"

export default function PageCampagnes({ base, onSession, onOuvrirAgence }: { base: "agences" | "artisans" | null; onSession: () => void; onOuvrirAgence?: (id: string) => void }) {
  const session = useSession()
  // Le compte ne change que si la personne change (17/11/2026) : avant, chaque rafraîchissement de la connexion (toutes les
  // heures, ou au retour sur l'onglet) recréait le dépôt, vidait l'écran et relisait tout.
  const idCompte = session?.user?.id ?? "moi", nomCompte = nomAffiche(session), roleCompte = roleDeSession(session) === "admin" ? "gerant" as const : "commercial" as const
  const compte = useMemo(() => ({ id: idCompte, nom: nomCompte, role: roleCompte }), [idCompte, nomCompte, roleCompte])
  const [erreur, setErreur] = useState("")
  const depot = useMemo(() => creerDepotSupabase({ ...compte, role: "gerant" }, setErreur), [compte])
  // Prête quand LE dépôt affiché a été lu (un dépôt recréé repart en « Lecture des campagnes… »).
  const [luPour, setLuPour] = useState<unknown>(null)
  const pret = luPour === depot
  const [vue, setVue] = useState<{ ecran: "liste" | "suivi" | "editeur"; id: string | null }>({ ecran: "liste", id: null })
  // La traçabilité n'envoie rien : elle s'ouvre directement sur ses critères, pas sur un suivi d'envois vide.
  const ouvrir = (id: string) => setVue({ ecran: depot.lire().campagnes.find((c) => c.id === id)?.origine === ORIGINE_TRACABILITE ? "editeur" : "suivi", id })
  // Une seule lecture à la fois, et pas de relecture automatique quand l'onglet est caché.
  // 25/11/2026 : la page s'ouvrait vide. La session arrive un instant après l'ouverture ; le dépôt était recréé pendant
  // la première lecture, et la lecture du nouveau dépôt était sautée (« une lecture à la fois »). Désormais : on attend
  // la session avant de lire, et le garde ne vaut que pour le MÊME dépôt.
  const sessionConnue = session !== undefined
  const enLecture = useRef<unknown>(null)
  const relire = (auto = false) => {
    if (!sessionConnue || enLecture.current === depot || (auto && typeof document !== "undefined" && document.hidden)) return Promise.resolve()
    enLecture.current = depot
    return depot.charger().then(() => { setLuPour(depot); setErreur("") }).catch((e) => setErreur(`Lecture des campagnes : ${e instanceof Error ? e.message : String(e)}`)).finally(() => { if (enLecture.current === depot) enLecture.current = null })
  }
  useEffect(() => { void relire(); const t = setInterval(() => void relire(true), 120_000); return () => clearInterval(t) }, [depot, sessionConnue]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ContexteDepot.Provider value={depot}>
      <ContexteCompte.Provider value={compte.id}>
        <ContexteBaseUnique.Provider value={base}>
          <div className="@container page">
            <div className="mb-3 flex justify-end"><Bouton taille="sm" variante="discret" icone={<RefreshCw />} onClick={() => void relire()}>Actualiser</Bouton></div>
            {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
            {!pret && !erreur ? <Chargement texte="Lecture des campagnes…" /> : null}
            {pret ? (
              vue.ecran === "liste" ? <Campagnes ouvrir={ouvrir} creer={() => setVue({ ecran: "editeur", id: null })} />
              : vue.ecran === "suivi" && vue.id ? <div className="space-y-4"><Bouton taille="sm" variante="discret" onClick={() => setVue({ ecran: "liste", id: null })}>← Toutes les campagnes</Bouton><Suivi id={vue.id} modifier={() => setVue({ ecran: "editeur", id: vue.id })} aller={() => onSession()} ouvrirFiche={onOuvrirAgence} /></div>
              : <div className="space-y-4"><Bouton taille="sm" variante="discret" onClick={() => peutQuitter() && (vue.id && depot.lire().campagnes.find((c) => c.id === vue.id)?.origine !== ORIGINE_TRACABILITE ? setVue({ ecran: "suivi", id: vue.id }) : setVue({ ecran: "liste", id: null }))}>← Retour</Bouton><Editeur key={vue.id ?? "neuve"} id={vue.id} fini={ouvrir} annuler={() => peutQuitter() && setVue({ ecran: "liste", id: null })} /></div>
            ) : null}
          </div>
        </ContexteBaseUnique.Provider>
      </ContexteCompte.Provider>
    </ContexteDepot.Provider>
  )
}
