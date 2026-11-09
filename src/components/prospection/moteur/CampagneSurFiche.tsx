// La campagne sur la fiche d'une agence en session de call : ce qu'elle demande, et son formulaire au téléphone s'il y en a un.
import { useCallback, useEffect, useState } from "react"
import { Bloc } from "../../demarchage/aujourdhui/courtier"
import { formulaireAppelDe } from "../../../lib/leadsRecusDb"
import FormulaireAppel from "./FormulaireAppel"
import { TachesDuContact } from "./TachesCampagne"

export default function CampagneSurFiche({ agenceId, parNom }: { agenceId: string; parNom: string }) {
  const [appel, setAppel] = useState<Awaited<ReturnType<typeof formulaireAppelDe>>>(null)
  const relire = useCallback(() => { formulaireAppelDe(agenceId, "agences").then(setAppel).catch(() => setAppel(null)) }, [agenceId])
  useEffect(() => { const t = setTimeout(relire, 0); return () => clearTimeout(t) }, [relire])
  return (
    <>
      <TachesDuContact contactRef={agenceId} />
      {appel ? <Bloc titre={appel.formulaire.nom}><div className="mt-3"><FormulaireAppel key={agenceId} campagneId={appel.campagneId} contactRef={agenceId} formulaire={appel.formulaire} reponses={appel.reponses} parNom={parNom} onEnregistre={relire} /></div></Bloc> : null}
    </>
  )
}
