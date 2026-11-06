// ── 3. L'historique (dessin du 06/11/2026) : au trait, sans carte, à droite de la fiche ──
import type { AgenceComplete } from "../../../demarchage/db"
import { Vide } from "../../../ui"
import { LigneFil, LigneMessage } from "./morceaux"
import { useEchanges } from "../useEchanges"

export default function ColonneFil({ fiche }: { fiche: AgenceComplete | null }) {
  // Les appels transcrits de l'agence : leur résumé sous chaque appel du fil (26/10/2026).
  const { parActivite } = useEchanges(fiche?.agence.id, fiche?.activites.length)
  return (
    <div className="min-w-0">
      <p className="mb-1 flex items-baseline justify-between gap-2 text-colonne text-encre-2">
        <span>Historique</span>
        {fiche ? <span className="chiffres">{fiche.activites.length} activité{fiche.activites.length > 1 ? "s" : ""} · les plus récentes en haut</span> : null}
      </p>
      {!fiche ? (
        <Vide titre="Aucune agence en cours" />
      ) : (
        <>
          {fiche.messages.length ? (
            <div className="mb-2 border-b-[0.5px] border-trait pb-2">
              <div className="mb-0.5 text-colonne text-encre-2">Boîte de réception</div>
              {fiche.messages.slice(0, 3).map((m) => (
                <LigneMessage key={m.id} m={m} />
              ))}
            </div>
          ) : null}
          {fiche.activites.length === 0 ? (
            <Vide titre="Rien encore" texte="Le premier appel ouvrira l'historique." />
          ) : (
            <ol className="divide-y-[0.5px] divide-trait">
              {fiche.activites.map((a) => (
                <LigneFil key={a.id} a={a} echange={parActivite.get(a.id)} />
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  )
}
