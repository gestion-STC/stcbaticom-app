// ── LA PAGE CAMPAGNES DU LOGICIEL (07/11/2026, lot 1) : les écrans de la prospection, branchés sur la base ──
// Une page par rubrique : Développement → base Agences, Recrutement → base Artisans. Liste, suivi, éditeur.
// Les données se relisent toutes les 2 minutes (le moteur passe toutes les 10).
import { useEffect, useMemo, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Bandeau, Bouton, Chargement } from "../../ui"
import { ContexteDepot } from "../../prospection/depot"
import { creerDepotSupabase } from "../../prospection/depotSupabase"
import { useSession } from "../../lib/auth"
import { nomAffiche, roleDeSession } from "../../lib/comptes"
import Campagnes from "./Campagnes"
import Editeur from "./Editeur"
import Suivi from "./Suivi"
import { ContexteBaseUnique, ContexteCompte } from "./outils"

export default function PageCampagnes({ base, onSession }: { base: "agences" | "artisans"; onSession: () => void }) {
  const session = useSession()
  const compte = useMemo(() => ({ id: session?.user?.id ?? "moi", nom: nomAffiche(session), role: roleDeSession(session) === "admin" ? "gerant" as const : "commercial" as const }), [session])
  const [erreur, setErreur] = useState("")
  const depot = useMemo(() => creerDepotSupabase({ ...compte, role: "gerant" }, setErreur), [compte])
  const [pret, setPret] = useState(false)
  const [vue, setVue] = useState<{ ecran: "liste" | "suivi" | "editeur"; id: string | null }>({ ecran: "liste", id: null })
  const relire = () => depot.charger().then(() => { setPret(true); setErreur("") }).catch((e) => setErreur(`Lecture des campagnes : ${e instanceof Error ? e.message : String(e)}`))
  useEffect(() => { void relire(); const t = setInterval(() => void relire(), 120_000); return () => clearInterval(t) }, [depot]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ContexteDepot.Provider value={depot}>
      <ContexteCompte.Provider value={compte.id}>
        <ContexteBaseUnique.Provider value={base}>
          <div className="@container page">
            <div className="mb-3 flex justify-end"><Bouton taille="sm" variante="discret" icone={<RefreshCw />} onClick={() => void relire()}>Actualiser</Bouton></div>
            {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
            {!pret && !erreur ? <Chargement texte="Lecture des campagnes…" /> : null}
            {pret ? (
              vue.ecran === "liste" ? <Campagnes ouvrir={(id) => setVue({ ecran: "suivi", id })} creer={() => setVue({ ecran: "editeur", id: null })} />
              : vue.ecran === "suivi" && vue.id ? <div className="space-y-4"><Bouton taille="sm" variante="discret" onClick={() => setVue({ ecran: "liste", id: null })}>← Toutes les campagnes</Bouton><Suivi id={vue.id} modifier={() => setVue({ ecran: "editeur", id: vue.id })} aller={() => onSession()} /></div>
              : <div className="space-y-4"><Bouton taille="sm" variante="discret" onClick={() => setVue(vue.id ? { ecran: "suivi", id: vue.id } : { ecran: "liste", id: null })}>← Retour</Bouton><Editeur key={vue.id ?? "neuve"} id={vue.id} fini={(id) => setVue({ ecran: "suivi", id })} /></div>
            ) : null}
          </div>
        </ContexteBaseUnique.Provider>
      </ContexteCompte.Provider>
    </ContexteDepot.Provider>
  )
}
