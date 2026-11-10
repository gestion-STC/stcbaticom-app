// La liste des motifs de perte en session de call : ceux de la campagne du contact, sinon la liste habituelle.
import { useEffect, useState } from "react"
import { motifsDeCampagne } from "../../../lib/motifsCampagne"

export default function OptionsMotifs({ contactRef, defaut }: { contactRef: string; defaut: { valeur: string; libelle: string }[] }) {
  const [motifs, setMotifs] = useState<string[] | null>(null)
  useEffect(() => { let vivant = true; motifsDeCampagne(contactRef).then((m) => { if (vivant) setMotifs(m) }).catch(() => undefined); return () => { vivant = false } }, [contactRef])
  return <>{(motifs ? motifs.map((m) => ({ valeur: m, libelle: m })) : defaut).map((m) => <option key={m.valeur} value={m.valeur}>{m.libelle}</option>)}</>
}
