// ── La dictée : on parle, ça s'ajoute à la note de l'appel ──
// La ref de la dictée reste à l'écran : avancer, reculer, aller à une agence l'arrêtent (`dicteeRef.current?.stop()`).
//
// 17/11/2026 : la dictée échouait EN SILENCE (micro refusé, service de Chrome injoignable, rien entendu, navigateur qui
// coupe l'écoute au bout de quelques secondes) : le bouton revenait à « Dicter » et rien ne s'écrivait. Maintenant :
// un message clair à côté de la note, le texte qui s'affiche pendant qu'on parle, et l'écoute relancée tant qu'on ne
// l'arrête pas.
import { useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react"
import { FABRIQUE_DICTEE, type Dictee } from "./outils"

const MESSAGES: Record<string, string> = {
  "not-allowed": "Le micro est refusé. Clique sur le cadenas à gauche de l'adresse, autorise le micro, puis réessaie.",
  "service-not-allowed": "La dictée est bloquée par le navigateur. Avec Chrome : autorise le micro pour ce site (cadenas à gauche de l'adresse).",
  "audio-capture": "Aucun micro trouvé. Branche ou choisis un micro (Réglages du Mac › Son › Entrée), puis réessaie.",
  network: "Le service de dictée ne répond pas (Chrome envoie la voix à Google). Vérifie la connexion ; avec Brave ou un VPN, la dictée ne marche pas.",
  "language-not-supported": "Le français n'est pas proposé par la dictée de ce navigateur. Utilise Google Chrome.",
}
const RELANCES_MAX = 20

export function messageDictee(code: string | undefined): string {
  return MESSAGES[code ?? ""] ?? `La dictée s'est arrêtée (${code || "raison inconnue"}). Réessaie ; si ça recommence, utilise Google Chrome.`
}

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
  const [provisoire, setProvisoire] = useState("")
  const [message, setMessage] = useState("")
  const veut = useRef(false)
  const relances = useRef(0)

  function arreter() {
    veut.current = false
    dicteeRef.current?.stop()
  }

  function lancer(cible: string) {
    if (!FABRIQUE_DICTEE) return
    const reco = new FABRIQUE_DICTEE()
    reco.lang = "fr-FR"
    reco.continuous = true
    reco.interimResults = true
    reco.onresult = (e) => {
      if (agenceIdRef.current !== cible) return // on a changé d'agence : la phrase en retard est ignorée
      let final = "", enCours = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else enCours += e.results[i][0].transcript
      }
      setProvisoire(enCours.trim())
      final = final.trim()
      if (final) { relances.current = 0; setNote((n) => (n && !/\s$/.test(n) ? n + " " : n) + final) }
    }
    reco.onerror = (e) => {
      // « Rien entendu » ou coupure volontaire : pas une panne, l'écoute est relancée (onend).
      if (e?.error === "no-speech" || e?.error === "aborted") return
      veut.current = false
      setMessage(messageDictee(e?.error))
    }
    reco.onend = () => {
      setProvisoire("")
      // Le navigateur coupe l'écoute après un silence : on la relance tant que la personne ne l'a pas arrêtée.
      if (veut.current && agenceIdRef.current === cible && relances.current < RELANCES_MAX) {
        relances.current++
        try { reco.start(); return } catch { /* relance impossible : on arrête proprement */ }
      }
      veut.current = false
      setEcoute(false)
      dicteeRef.current = null
    }
    dicteeRef.current = reco
    try {
      reco.start()
      setEcoute(true)
    } catch (err) {
      veut.current = false
      dicteeRef.current = null
      setMessage(messageDictee(err instanceof Error ? err.name : undefined))
    }
  }

  function dicter() {
    setMessage("")
    if (!FABRIQUE_DICTEE) {
      setErreur("La dictée vocale n'est pas disponible sur ce navigateur : utilise Google Chrome ou Edge.")
      setMessage("La dictée n'est pas disponible sur ce navigateur : utilise Google Chrome. Sur iPhone, utilise le micro du clavier.")
      return
    }
    if (dicteeRef.current) { arreter(); return }
    if (!agenceCouranteId) { setMessage("Choisis d'abord une agence : la note est rattachée à la fiche en cours."); return }
    veut.current = true
    relances.current = 0
    lancer(agenceCouranteId)
  }

  return { ecoute, dicter, provisoire, message }
}
