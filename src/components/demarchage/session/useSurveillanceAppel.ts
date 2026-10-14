// ── Surveiller l'appel : toutes les 4 s, « cet appel est-il en ligne ? » ──
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react"
import type { Resultat } from "../../../demarchage/modele"
import { detailAppelRingover, statutAppelsRingover } from "../../../lib/ringover"
import { ESSAIS_DETAIL, INTERVALLE_SURVEILLANCE_MS, PAUSE_DETAIL_MS, SURVEILLANCE_INITIALE, observerAppel, suggestionDepuisDetail, type Verdict } from "../../../demarchage/sessionOutils"
import type { AppelEnCours } from "./outils"

export function useSurveillanceAppel({
  debutAppel,
  appelManuel,
  appelRef,
  toursMaxRef,
  setMaintenant,
  setAppel,
  setSuggestion,
  setIndice,
  setErreur,
}: {
  debutAppel: number | null
  appelManuel: boolean
  appelRef: RefObject<AppelEnCours | null>
  toursMaxRef: RefObject<number>
  setMaintenant: Dispatch<SetStateAction<number>>
  setAppel: Dispatch<SetStateAction<AppelEnCours | null>>
  setSuggestion: Dispatch<SetStateAction<Resultat | null>>
  setIndice: Dispatch<SetStateAction<string>>
  setErreur: Dispatch<SetStateAction<string>>
}) {
  useEffect(() => {
    if (!debutAppel || appelManuel) return
    const debut: number = debutAppel // capturé : les fonctions hissées ci-dessous ne voient pas la garde
    let annule = false
    let etat = SURVEILLANCE_INITIALE
    let enVol = false
    let detailLance = false
    const horloge = setInterval(() => setMaintenant(Date.now()), 1000)

    // Le relevé final de Ringover (jusqu'à ~90 s) : numéro invalide ? répondeur ? → une suggestion.
    async function resoudreDetail(callId: string) {
      for (let i = 0; i < ESSAIS_DETAIL && !annule; i++) {
        const det = await detailAppelRingover(callId)
        if (annule) return
        if (det.ok && det.trouve && det.last_state) {
          const s = suggestionDepuisDetail(det.last_state, det.is_failed)
          if (s.resultat) setSuggestion(s.resultat)
          if (s.texte) setIndice(s.texte)
          return
        }
        await new Promise((r) => setTimeout(r, PAUSE_DETAIL_MS))
      }
    }
    function finir(verdict: Verdict) {
      clearInterval(sondage)
      const fin = Date.now()
      setAppel((a) => {
        if (!a || a.debut !== debut) return a
        if (verdict === "indisponible") return { ...a, etape: "sans_suivi" }
        return { ...a, etape: "termine", fin }
      })
      if (verdict === "pas_de_reponse") setSuggestion("pas_de_reponse")
      if (verdict === "indisponible") setErreur("Statut Ringover indisponible : note le résultat à la main quand tu auras raccroché.")
      const callId = appelRef.current?.callId ?? ""
      if (callId && !detailLance) {
        detailLance = true
        void resoudreDetail(callId)
      }
    }
    async function sonder() {
      if (annule || enVol) return
      // Sans identifiant d'appel, le relais répond « y a-t-il un appel en ligne » (toute l'équipe) :
      // on laisse 8 s à l'identifiant pour arriver avant de s'y fier.
      const callId = appelRef.current?.callId ?? ""
      if (!callId && Date.now() - debut < 8000) return
      enVol = true
      let st: { ok: boolean; actif: boolean }
      try {
        st = await statutAppelsRingover(callId || undefined)
      } finally {
        enVol = false
      }
      if (annule) return
      const { suite, verdict } = observerAppel(etat, { ok: st.ok, actif: st.ok && st.actif }, toursMaxRef.current)
      etat = suite
      if (suite.vuActif) {
        const t = Date.now()
        setAppel((a) => (a && a.debut === debut && a.etape === "attente" ? { ...a, etape: "en_cours", enLigneDepuis: t } : a))
      }
      if (verdict !== "continuer") finir(verdict)
    }
    const sondage = setInterval(() => void sonder(), INTERVALLE_SURVEILLANCE_MS)
    const premier = setTimeout(() => void sonder(), 1500)
    return () => {
      annule = true
      clearInterval(sondage)
      clearTimeout(premier)
      clearInterval(horloge)
    }
    // Les setters et les refs sont stables : l'effet ne repart qu'à un nouvel appel (début, manuel).
  }, [debutAppel, appelManuel, appelRef, toursMaxRef, setMaintenant, setAppel, setSuggestion, setIndice, setErreur])
}
