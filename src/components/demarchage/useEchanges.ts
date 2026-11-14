// Les appels transcrits et analysés d'une agence (26/10/2026) : lus par EchangesAppels.tsx,
// le fil de la session et celui de la fiche agence.
import { useEffect, useState } from "react"
import { appelsIaDeLAgence, type AppelIa } from "../../demarchage/appelsIa"

/** Les appels analysés d'une agence (relus quand `version` change : un appel vient d'être noté). */
export function useEchanges(agenceId: string | null | undefined, version: unknown = 0) {
  const [appels, setAppels] = useState<AppelIa[]>([])
  const [erreur, setErreur] = useState("")
  useEffect(() => {
    let vivant = true
    if (!agenceId) {
      const t = setTimeout(() => { if (vivant) setAppels([]) }, 0)
      return () => { vivant = false; clearTimeout(t) }
    }
    appelsIaDeLAgence(agenceId)
      .then((l) => { if (vivant) { setAppels(l); setErreur("") } })
      .catch((e) => { if (vivant) setErreur(e instanceof Error ? e.message : String(e)) })
    return () => { vivant = false }
  }, [agenceId, version])
  // Tout appel qui a quelque chose à montrer : un enregistrement, une transcription ou un résumé, que l'IA l'ait
  // analysé ou non (Mahdi, 14/11/2026 : « sur la fiche du prospect, à chaque fois »). Avant, seuls les appels
  // analysés s'affichaient : sans crédit IA, l'appel et son enregistrement disparaissaient de la fiche.
  const prets = appels.filter((a) => a.resume || a.transcription || a.enregistrementUrl)
  const parActivite = new Map(prets.map((a) => [a.activiteId, a]))
  return { appels, prets, parActivite, erreur }
}
