// Le script d'appel : lu une fois au montage de la session, modifiable sur place.
// L'état vit ici et non dans la carte : la carte est démontée entre deux agences (pendant la
// lecture de la fiche) et doit retrouver son script, ouvert ou replié, à l'agence suivante.
import { useEffect, useState } from "react"
import { ecrireParametre, lireParametre } from "../../../lib/parametresDb"
import { messageDe } from "./outils"

export function useScriptAppel(onErreur: (message: string) => void) {
  const [script, setScript] = useState("")
  const [scriptOuvert, setScriptOuvert] = useState(false)
  const [scriptEdit, setScriptEdit] = useState(false)
  const [scriptBrouillon, setScriptBrouillon] = useState("")

  useEffect(() => {
    let enVie = true
    const t = setTimeout(async () => {
      const s = await lireParametre("script_appel").catch(() => null)
      if (!enVie) return
      setScript(s ?? "")
    }, 0)
    return () => {
      enVie = false
      clearTimeout(t)
    }
  }, [])

  function basculerScriptEdit() {
    if (scriptEdit) {
      ecrireParametre("script_appel", scriptBrouillon)
        .then(() => setScript(scriptBrouillon))
        .catch((e) => onErreur(`Enregistrement du script : ${messageDe(e)}`))
      setScriptEdit(false)
    } else {
      setScriptBrouillon(script)
      setScriptEdit(true)
      setScriptOuvert(true)
    }
  }

  return { script, scriptOuvert, setScriptOuvert, scriptEdit, setScriptEdit, scriptBrouillon, setScriptBrouillon, basculerScriptEdit }
}

export type ScriptAppelEtat = ReturnType<typeof useScriptAppel>
