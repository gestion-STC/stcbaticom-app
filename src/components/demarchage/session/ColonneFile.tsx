// ── 1. La file, en marge (dessin du 06/11/2026, thème A2) ──
// L'appel direct (recherche), Précédente / Suivante, la case des déjà appelées, la liste.
// Plus de carte : une marge au trait, les lignes au fond gris pour celle en cours.
// En mode Leads, chaque ligne porte son signal et depuis quand il attend.
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import { formaterTelephone } from "../../../lib/telephone"
import { FILES, type Agence, type File } from "../../../demarchage/modele"
import type { Lead } from "../../../demarchage/db"
import { Bouton, Case, Champ, Chargement, Vide } from "../../../ui"
import { LigneFile } from "./morceaux"

export default function ColonneFile({
  index,
  fileAgences,
  file,
  leads,
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
  /** Les leads de la file (mode Leads), par agence ; null en prospection. */
  leads: Map<string, Lead> | null
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-encre-3" />
        <Champ value={recherche} onChange={(e) => setRecherche(e.target.value)} disabled={barreVisible} placeholder="Appeler une agence…" className="pl-8" aria-label="Appeler une agence directement" />
        {resultats ? (
          <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-4 border-[0.5px] border-trait bg-fond shadow-flottante">
            {resultats.length === 0 ? (
              <div className="px-3 py-2 text-legende text-encre-2">Aucune agence trouvée.</div>
            ) : (
              resultats.map((a) => (
                <button key={a.id} type="button" onClick={() => onAppelerDirect(a.id)} className="block w-full border-b-[0.5px] border-trait px-3 py-2 text-left last:border-0 hover:bg-fond-2">
                  <div className="truncate text-legende text-encre">{a.nom}</div>
                  <div className="truncate text-colonne text-encre-2">{[a.secteurLibelle, formaterTelephone(a.telephone), a.contactPrincipal].filter(Boolean).join(" · ") || "sans numéro"}</div>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-colonne text-encre-2">{leads ? "À traiter, le plus ancien d'abord" : "Dans la file"}</span>
        <span className="chiffres text-colonne text-encre-2">{Math.min(index + 1, fileAgences.length)} / {fileAgences.length}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <Bouton taille="sm" variante="discret" icone={<ChevronLeft />} onClick={reculer} disabled={barreVisible || (index === 0 && !directeId)}>Précédente</Bouton>
        <Bouton taille="sm" variante="discret" icone={<ChevronRight />} onClick={avancer} disabled={barreVisible || fileTerminee || !fileAgences.length}>Suivante</Bouton>
      </div>
      {leads ? null : (
        <div className="mt-1 px-0.5">
          <Case texte={`inclure les agences appelées ces ${reposJours ?? "…"} derniers jours (jamais celles d'aujourd'hui)`} checked={inclureDejaAppelees} onChange={(e) => setInclureDejaAppelees(e.target.checked)} disabled={enCours || barreVisible} />
        </div>
      )}

      <div className="-mx-2 mt-2 min-h-0 flex-1 overflow-y-auto border-t-[0.5px] border-trait pt-1.5">
        {chargementFile ? (
          <Chargement texte="Lecture de la file…" />
        ) : fileAgences.length === 0 ? (
          leads ? <Vide titre="Aucun lead à traiter" texte="Un lead apparaît ici dès qu'une agence se manifeste." /> : <Vide titre="Rien à appeler dans cette file" texte={FILES.find((f) => f.code === file)?.aide} />
        ) : (
          fileAgences.map((a, i) => (
            <LigneFile key={a.id} agence={a} lead={leads?.get(a.id)} courante={!directeId && i === index} appelee={appelees.has(a.id)} maintenant={dateMaintenant} bloquee={barreVisible && !(i === index && !directeId)} onClick={() => allerA(i)} />
          ))
        )}
      </div>
    </div>
  )
}
