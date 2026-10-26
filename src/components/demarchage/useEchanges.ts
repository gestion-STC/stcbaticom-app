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
  const prets = appels.filter((a) => a.statut === "pret" && (a.resume || a.transcription))
  const parActivite = new Map(prets.map((a) => [a.activiteId, a]))
  return { appels, prets, parActivite, erreur }
}
