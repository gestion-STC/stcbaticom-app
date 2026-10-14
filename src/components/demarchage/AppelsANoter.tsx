// ════════════════════════════════════════════════════════════════════════════
// Les appels à compléter (Mahdi, 13/10) : un bouton discret avec une pastille quand
// des appels lancés n'ont pas de résultat. Il ouvre la liste ; « Noter le résultat »
// ouvre l'agence dans la session, où la barre de résultat complète CET appel.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react"
import { PhoneMissed } from "lucide-react"
import { appelsANoter, type AppelANoter } from "../../demarchage/db"
import { useReglages } from "../../demarchage/reglages"
import { dateHeureCourte } from "../../demarchage/sessionOutils"
import { Bandeau, Bouton, Dialogue } from "../../ui"

const RELIRE_MS = 60_000

export default function AppelsANoter({ onOuvrir, rafraichir = 0 }: { onOuvrir: (agenceId: string) => void; rafraichir?: number }) {
  const [liste, setListe] = useState<AppelANoter[]>([])
  const [ouvert, setOuvert] = useState(false)
  const [erreur, setErreur] = useState("")
  // Le délai avant qu'un appel soit « à compléter » : celui du contrôle du matin (Réglages, 5 min).
  const minutes = useReglages().reglages?.a_completer_minutes ?? null

  const charger = useCallback(() => {
    if (minutes === null) return
    appelsANoter(minutes)
      .then((l) => { setListe(l); setErreur("") })
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
  }, [minutes])

  useEffect(() => {
    const premier = setTimeout(charger, 0)
    const t = setInterval(() => { if (document.visibilityState === "visible") charger() }, RELIRE_MS)
    return () => { clearTimeout(premier); clearInterval(t) }
  }, [charger, rafraichir])

  const n = liste.length
  return (
    <>
      <button
        type="button"
        onClick={() => { charger(); setOuvert(true) }}
        title={n ? `${n} appel${n > 1 ? "s" : ""} sans résultat noté` : "Aucun appel sans résultat"}
        className="relative inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-4 border border-trait bg-fond px-3 text-legende font-medium text-encre-2 transition-colors hover:border-trait-fort hover:bg-fond-4 hover:text-encre focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature focus-visible:ring-offset-2"
      >
        <PhoneMissed size={15} />
        <span>À compléter</span>
        {n ? <span className="chiffres ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-alerte px-1.5 text-colonne font-semibold text-white">{n}</span> : null}
      </button>
      {ouvert ? (
        <Dialogue
          titre="Appels sans résultat noté"
          description="Ces appels sont partis, mais personne n'a cliqué le résultat. Tant qu'il manque, l'agence est bloquée et ses relances ne se posent pas."
          onFermer={() => setOuvert(false)}
          pied={<Bouton variante="discret" onClick={() => setOuvert(false)}>Fermer</Bouton>}
        >
          {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
          {n === 0 ? (
            <p className="text-legende text-encre-2">Rien à compléter : chaque appel a son résultat.</p>
          ) : (
            <ul className="divide-y divide-fond-4">
              {liste.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-legende font-medium text-encre">{a.agenceNom || "Agence"}</div>
                    <div className="chiffres text-colonne text-encre-2">Appel du {dateHeureCourte(a.date)}{a.compteNom ? ` · ${a.compteNom}` : ""}</div>
                  </div>
                  <Bouton taille="sm" variante="plein" onClick={() => { setOuvert(false); onOuvrir(a.agenceId) }}>Noter le résultat</Bouton>
                </li>
              ))}
            </ul>
          )}
        </Dialogue>
      ) : null}
    </>
  )
}
