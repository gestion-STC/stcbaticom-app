// ── 3. Le fil ──
import type { AgenceComplete } from "../../../demarchage/db"
import { Carte, Vide } from "../../../ui"
import { LigneFil, LigneMessage } from "./morceaux"
import { useEchanges } from "../useEchanges"

export default function ColonneFil({ fiche }: { fiche: AgenceComplete | null }) {
  // Les appels transcrits de l'agence : leur résumé sous chaque appel du fil (26/10/2026).
  const { parActivite } = useEchanges(fiche?.agence.id, fiche?.activites.length)
  return (
    <Carte className="flex flex-col lg:max-h-[calc(100vh-200px)]">
      <div className="px-4 pb-2 pt-4">
        <h2 className="text-sous-titre font-semibold text-encre">Le fil</h2>
        {fiche ? (
          <p className="text-legende text-encre-2">
            {fiche.activites.length} activité{fiche.activites.length > 1 ? "s" : ""} · les plus récentes en haut
          </p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {!fiche ? (
          <Vide titre="Aucune agence en cours" />
        ) : (
          <>
            {fiche.messages.length ? (
              <div className="mb-3 border-b border-fond-4 pb-2">
                <div className="mb-1 text-colonne font-medium text-encre-2">Boîte de réception</div>
                {fiche.messages.slice(0, 3).map((m) => (
                  <LigneMessage key={m.id} m={m} />
                ))}
              </div>
            ) : null}
            {fiche.activites.length === 0 ? (
              <Vide titre="Rien encore" texte="Le premier appel ouvrira le fil." />
            ) : (
              <ol className="divide-y divide-fond-4">
                {fiche.activites.map((a) => (
                  <LigneFil key={a.id} a={a} echange={parActivite.get(a.id)} />
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </Carte>
  )
}
