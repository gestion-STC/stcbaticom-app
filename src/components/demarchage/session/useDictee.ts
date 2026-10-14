// ── La dictée : on parle, ça s'ajoute à la note de l'appel ──
// La ref de la dictée reste à l'écran : avancer, reculer, aller à une agence l'arrêtent (`dicteeRef.current?.stop()`).
import { useState, type Dispatch, type RefObject, type SetStateAction } from "react"
import { FABRIQUE_DICTEE, type Dictee } from "./outils"

export function useDictee({
  dicteeRef,
  agenceCouranteId,
  agenceIdRef,
  setNote,
  setErreur,
}: {
  dicteeRef: RefObject<Dictee | null>
  agenceCouranteId: string | null
  agenceIdRef: RefObject<string | null>
  setNote: Dispatch<SetStateAction<string>>
  setErreur: (message: string) => void
}) {
  const [ecoute, setEcoute] = useState(false)

  function dicter() {
    if (!FABRIQUE_DICTEE) {
      setErreur("La dictée vocale n'est pas disponible sur ce navigateur : utilise Google Chrome ou Edge.")
      return
    }
    if (dicteeRef.current) {
      dicteeRef.current.stop()
      return
    }
    const cible = agenceCouranteId
    if (!cible) return
    const reco = new FABRIQUE_DICTEE()
    reco.lang = "fr-FR"
    reco.continuous = true
    reco.interimResults = false
    reco.onresult = (e) => {
      let txt = ""
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) txt += e.results[i][0].transcript
      txt = txt.trim()
      if (!txt || agenceIdRef.current !== cible) return // on a changé d'agence : la phrase en retard est ignorée
      setNote((n) => (n && !/\s$/.test(n) ? n + " " : n) + txt)
    }
    reco.onend = () => {
      setEcoute(false)
      dicteeRef.current = null
    }
    reco.onerror = () => {
      setEcoute(false)
      dicteeRef.current = null
    }
    dicteeRef.current = reco
    reco.start()
    setEcoute(true)
  }

  return { ecoute, dicter }
}
