// ── 1. La file ──
// L'appel direct (recherche), Précédente / Suivante, la case des déjà appelées, la liste.
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { formaterTelephone } from "../../../lib/telephone"
import { FILES, type Agence, type File } from "../../../demarchage/modele"
import { Bouton, Carte, Case, Champ, Chargement, Vide } from "../../../ui"
import { LigneFile } from "./morceaux"

export default function ColonneFile({
  index,
  fileAgences,
  file,
  recherche,
  setRecherche,
  resultats,
  onAppelerDirect,
  barreVisible,
  enCours,
  directeId,
  fileTerminee,
  reculer,
  avancer,
  reposJours,
  inclureDejaAppelees,
  setInclureDejaAppelees,
  chargementFile,
  appelees,
  dateMaintenant,
  allerA,
}: {
  index: number
  fileAgences: Agence[]
  file: File
  recherche: string
  setRecherche: (q: string) => void
  resultats: Agence[] | null
  onAppelerDirect: (id: string) => void
  barreVisible: boolean
  enCours: boolean
  directeId: string | null
  fileTerminee: boolean
  reculer: () => void
  avancer: () => void
  reposJours: number | undefined
  inclureDejaAppelees: boolean
  setInclureDejaAppelees: (v: boolean) => void
  chargementFile: boolean
  appelees: Set<string>
  dateMaintenant: Date
  allerA: (i: number) => void
}) {
  return (
    <Carte className="flex flex-col lg:max-h-[calc(100vh-200px)]">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-sous-titre font-semibold text-encre">La file</h2>
        <span className="chiffres text-legende text-encre-2">{Math.min(index + 1, fileAgences.length)} / {fileAgences.length}</span>
      </div>
      <div className="px-4 pb-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-encre-3" />
          <Champ value={recherche} onChange={(e) => setRecherche(e.target.value)} disabled={barreVisible} placeholder="Appeler une agence directement…" className="pl-8" aria-label="Appeler une agence directement" />
        </div>
        {resultats ? (
          <div className="mt-1 overflow-hidden rounded-4 border border-trait bg-fond shadow-flottante">
            {resultats.length === 0 ? (
              <div className="px-3 py-2 text-legende text-encre-2">Aucune agence trouvée.</div>
            ) : (
              resultats.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onAppelerDirect(a.id)}
                  className="block w-full border-b border-fond-4 px-3 py-2 text-left hover:bg-fond-2 last:border-0"
                >
                  <div className="truncate text-legende font-medium text-encre">{a.nom}</div>
                  <div className="truncate text-colonne text-encre-2">
                    {[a.secteurLibelle, formaterTelephone(a.telephone), a.contactPrincipal].filter(Boolean).join(" · ") || "sans numéro"}
                  </div>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b border-trait px-4 pb-3">
        <Bouton taille="sm" icone={<ChevronLeft />} onClick={reculer} disabled={barreVisible || (index === 0 && !directeId)}>Précédente</Bouton>
        <Bouton taille="sm" icone={<ChevronRight />} onClick={avancer} disabled={barreVisible || fileTerminee || !fileAgences.length}>Suivante</Bouton>
      </div>
      <div className="border-b border-fond-4 px-4 py-2">
        <Case texte={`inclure les agences appelées ces ${reposJours ?? "…"} derniers jours (jamais celles d'aujourd'hui)`} checked={inclureDejaAppelees} onChange={(e) => setInclureDejaAppelees(e.target.checked)} disabled={enCours || barreVisible} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {chargementFile ? (
          <Chargement texte="Lecture de la file…" />
        ) : fileAgences.length === 0 ? (
          <Vide titre="Rien à appeler dans cette file" texte={FILES.find((f) => f.code === file)?.aide} />
        ) : (
          fileAgences.map((a, i) => <LigneFile key={a.id} agence={a} courante={!directeId && i === index} appelee={appelees.has(a.id)} maintenant={dateMaintenant} bloquee={barreVisible && !(i === index && !directeId)} onClick={() => allerA(i)} />)
        )}
      </div>
    </Carte>
  )
}
