// Deux onglets sur la session (Mahdi, 13/10) : on ne compose pas pendant qu'un autre onglet a une session en cours.
// 27/11/2026 : un onglet ne s'annonce que pendant SA session (ou son appel), plus dès qu'il est ouvert. Une boîte
// mail ou une fiche ouverte dans un 2e onglet ne bloque plus les appels. Chaque onglet a un identifiant : on compte
// les onglets actifs (fermer l'un de trois ne débloque plus les deux autres à tort).
import { useEffect, useRef, useState } from "react"
import { CANAL_SESSION } from "./outils"

export type MessageOnglet = { type: "actif" | "inactif" | "qui"; id: string; reponse?: boolean }

/** Les onglets actifs connus, après un message reçu, et la réponse à faire (pure : testée à part). */
export function recevoirMessage(actifs: ReadonlySet<string>, m: unknown, moi: { id: string; actif: boolean }): { actifs: Set<string>; repondre: boolean } {
  const suivants = new Set(actifs)
  const msg = m as Partial<MessageOnglet> | null
  if (!msg || typeof msg.id !== "string" || msg.id === moi.id) return { actifs: suivants, repondre: false }
  if (msg.type === "actif") {
    suivants.add(msg.id)
    // Un nouvel onglet actif ne sait pas que je le suis : je le lui dis (une fois, jamais en réponse à une réponse).
    return { actifs: suivants, repondre: moi.actif && !msg.reponse }
  }
  // Un onglet qui vient de s'ouvrir demande qui a une session en cours.
  if (msg.type === "qui") return { actifs: suivants, repondre: moi.actif }
  if (msg.type === "inactif") suivants.delete(msg.id)
  return { actifs: suivants, repondre: false }
}

const nouvelId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

/** Vrai quand un AUTRE onglet a une session en cours (ou un appel). `actif` : celle de cet onglet. */
export function useOngletUnique(actif: boolean): boolean {
  const [autres, setAutres] = useState<ReadonlySet<string>>(() => new Set())
  const id = useRef("")
  const canal = useRef<BroadcastChannel | null>(null)
  const actifRef = useRef(actif)
  const autresRef = useRef<ReadonlySet<string>>(new Set())

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    if (!id.current) id.current = nouvelId()
    const c = new BroadcastChannel(CANAL_SESSION)
    canal.current = c
    c.onmessage = (e: MessageEvent) => {
      const r = recevoirMessage(autresRef.current, e.data, { id: id.current, actif: actifRef.current })
      autresRef.current = r.actifs
      setAutres(r.actifs)
      if (r.repondre) c.postMessage({ type: "actif", id: id.current, reponse: true } satisfies MessageOnglet)
    }
    c.postMessage({ type: "qui", id: id.current } satisfies MessageOnglet)
    // Onglet fermé ou rechargé : il se retire.
    const partir = () => c.postMessage({ type: "inactif", id: id.current } satisfies MessageOnglet)
    window.addEventListener("pagehide", partir)
    return () => {
      window.removeEventListener("pagehide", partir)
      partir()
      c.close()
      canal.current = null
    }
  }, [])

  useEffect(() => {
    actifRef.current = actif
    canal.current?.postMessage({ type: actif ? "actif" : "inactif", id: id.current } satisfies MessageOnglet)
  }, [actif])

  return autres.size > 0
}
