// Deux onglets sur la session (Mahdi, 13/10) : chacun s'annonce ; si un autre répond, les deux
// cessent de composer jusqu'à ce que l'un se ferme (il prévient en partant).
import { useEffect, useState } from "react"
import { CANAL_SESSION } from "./outils"

// Un autre onglet a déjà la session ouverte (BroadcastChannel) : celui-ci ne compose pas.
export function useOngletUnique(): boolean {
  const [autreOnglet, setAutreOnglet] = useState(false)
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    const canal = new BroadcastChannel(CANAL_SESSION)
    canal.onmessage = (e: MessageEvent) => {
      if (e.data === "presence") {
        canal.postMessage("deja_ouverte")
        setAutreOnglet(true)
      } else if (e.data === "deja_ouverte") setAutreOnglet(true)
      else if (e.data === "depart") setAutreOnglet(false)
    }
    canal.postMessage("presence")
    return () => {
      canal.postMessage("depart")
      canal.close()
    }
  }, [])
  return autreOnglet
}
