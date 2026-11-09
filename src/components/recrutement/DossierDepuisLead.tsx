// Un dossier déposé, ouvert depuis « Leads reçus » : le panneau du dossier (état, pièces, réponses, rattachement,
// contrats) et, par-dessus, la fiche de l'artisan. Le dossier passe « vu » à l'ouverture.
import { useCallback, useEffect, useState } from "react"
import type { DossierST, SousTraitant } from "../../recrutement"
import { chargerDossiers, marquerDossier } from "../../lib/machineDb"
import { chargerSousTraitants } from "../../lib/sousTraitantsDb"
import { Bandeau, Chargement, Panneau } from "../../ui"
import FicheArtisan from "./FicheArtisan"
import PanneauDossier from "./PanneauDossier"

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export default function DossierDepuisLead({ id, onFermer, onChange }: { id: string; onFermer: () => void; onChange: () => void }) {
  const [dossiers, setDossiers] = useState<DossierST[] | null>(null)
  const [fiches, setFiches] = useState<SousTraitant[]>([])
  const [ficheOuverte, setFicheOuverte] = useState<string | null>(null)
  const [erreur, setErreur] = useState("")

  const charger = useCallback(
    () => Promise.all([chargerDossiers(), chargerSousTraitants()]).then(([ds, fs]) => { setDossiers(ds); setFiches(fs) }).catch((e) => setErreur(msg(e))),
    [],
  )
  useEffect(() => {
    let vivant = true
    Promise.all([chargerDossiers(), chargerSousTraitants()])
      .then(async ([ds, fs]) => {
        // Vu dès l'ouverture : l'état de la liste passe de « nouveau » à « vu ».
        const d = ds.find((x) => x.id === id)
        if (d && !d.vuLe) { await marquerDossier(id, { vu: true }); d.vuLe = new Date().toISOString(); onChange() }
        if (vivant) { setDossiers(ds); setFiches(fs) }
      })
      .catch((e) => { if (vivant) setErreur(msg(e)) })
    return () => { vivant = false }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const ouvert = dossiers?.find((d) => d.id === id) ?? null
  const majLocal = (i: string, champs: Partial<DossierST>) => { setDossiers((l) => (l ?? []).map((d) => (d.id === i ? { ...d, ...champs } : d))); onChange() }

  if (!ouvert) {
    return (
      <Panneau titre="Dossier" onFermer={onFermer} largeur="w-[720px]">
        {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : dossiers ? <Bandeau role="attention">Ce dossier est introuvable.</Bandeau> : <Chargement texte="Lecture du dossier…" />}
      </Panneau>
    )
  }
  return (
    <>
      {/* Le panneau du dossier s'efface derrière la fiche artisan, et revient quand elle se ferme. */}
      {!ficheOuverte ? (
        <PanneauDossier
          dossier={ouvert}
          fiche={ouvert.sousTraitantId ? fiches.find((f) => f.id === ouvert.sousTraitantId) : undefined}
          fiches={fiches}
          onFermer={onFermer}
          onMaj={majLocal}
          onRecharger={async () => { await charger(); onChange() }}
          onOuvrirFiche={setFicheOuverte}
        />
      ) : <FicheArtisan id={ficheOuverte} onFermer={() => setFicheOuverte(null)} onChange={() => { void charger(); onChange() }} />}
    </>
  )
}
