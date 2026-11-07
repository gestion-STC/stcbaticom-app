// Les commandes de la session (dessin du 06/11/2026, thème A2) : sous les onglets Leads / Prospection,
// les piles en texte à gauche (PilesSession), les réglages à droite (base, secteur, étape, sourçage,
// mails préparés par l'IA, mode automatique, cadence, Démarrer / Arrêter). Aucun état propre.
// En mode Leads, la file est celle des leads : ni pile, ni secteur, ni étape, ni sourçage.
import { Play, Square } from "lucide-react"
import { ETAPES, FILES, SORTIES, type File, type Secteur } from "../../../demarchage/modele"
import { Bouton, Champ, Interrupteur, Selecteur } from "../../../ui"

type Sourcage = "" | "sourcees" | "non_sourcees"

/** Les quatre piles de la prospection, en texte : la pile ouverte en noir, son compte à côté. */
export function PilesSession({ file, setFile, etapeFiltre, chargementFile, nbFile, compteurs, bloque }: {
  file: File
  setFile: (f: File) => void
  etapeFiltre: string
  chargementFile: boolean
  nbFile: number
  compteurs: Record<File, number> | null
  bloque: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-legende">
      {FILES.map((f) => {
        const choisi = f.code === file && !etapeFiltre
        // La pile affichée compte SA liste (Mahdi, 13/10 : la pastille = ce qu'on voit) ; les
        // autres, la base. Un comptage en échec affiche « — », jamais un faux chiffre.
        const n = f.code === file && !etapeFiltre && !chargementFile ? nbFile : compteurs ? compteurs[f.code] : "—"
        return (
          <button key={f.code} type="button" disabled={bloque} title={f.aide} aria-pressed={choisi} onClick={() => setFile(f.code)}
            className={"rounded-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature disabled:opacity-60 " + (choisi ? "font-medium text-encre" : "text-encre-2 hover:text-encre")}>
            {f.libelle} <span className="chiffres">{n}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function EnTeteSession({
  modeLeads,
  etapeFiltre,
  setEtapeFiltre,
  chargementFile,
  nbFile,
  enCours,
  barreVisible,
  optionsDeBase,
  valeurBase,
  choisirBase,
  secteurDuJour,
  setSecteurDuJour,
  secteurs,
  sourcage,
  setSourcage,
  auto,
  setAuto,
  autreOnglet,
  cadence,
  setCadence,
  arreter,
  demarrer,
  reglagesLus,
  bloqueOnglet,
}: {
  modeLeads: boolean
  etapeFiltre: string
  setEtapeFiltre: (e: string) => void
  chargementFile: boolean
  nbFile: number
  enCours: boolean
  barreVisible: boolean
  optionsDeBase: { value: string; label: string }[]
  valeurBase: string
  choisirBase: (v: string) => void
  secteurDuJour: string
  setSecteurDuJour: (s: string) => void
  secteurs: Secteur[]
  sourcage: Sourcage
  setSourcage: (s: Sourcage) => void
  auto: boolean
  setAuto: (v: boolean) => void
  autreOnglet: boolean
  cadence: number | null
  setCadence: (n: number) => void
  arreter: () => void
  demarrer: () => void
  reglagesLus: boolean
  bloqueOnglet: string | undefined
}) {
  return (
    <>
      {/* « À compléter » retiré le 24/10/2026 : le résultat est désormais obligatoire (verrou du compte). */}
      {optionsDeBase.length > 1 ? (
        <Selecteur value={valeurBase} onChange={(e) => choisirBase(e.target.value)} disabled={enCours || barreVisible} className="w-40" aria-label="Base d'appel" title="La base que tu appelles : la tienne, celle d'un autre compte, les agences non attribuées, ou tout">
          {optionsDeBase.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Selecteur>
      ) : null}
      {modeLeads ? null : (<>
      <Selecteur value={secteurDuJour} onChange={(e) => setSecteurDuJour(e.target.value)} disabled={enCours || barreVisible} className="w-40" aria-label="Secteur du jour">
        <option value="">Tous les secteurs</option>
        {secteurs.map((s) => (
          <option key={s.code} value={s.code}>{s.libelle}</option>
        ))}
      </Selecteur>
      <Selecteur value={etapeFiltre} onChange={(e) => setEtapeFiltre(e.target.value)} disabled={enCours || barreVisible} className="w-40" aria-label="Étape" title="N'appeler que les agences de cette étape (dans la file choisie)">
        <option value="">Toutes les étapes</option>
        {ETAPES.map((e) => (
          <option key={e.code} value={e.code}>{e.libelle}</option>
        ))}
        {SORTIES.map((s) => (
          <option key={s.code} value={s.code}>{s.libelle}</option>
        ))}
      </Selecteur>
      <Selecteur value={sourcage} onChange={(e) => setSourcage(e.target.value as Sourcage)} disabled={enCours || barreVisible} className="w-44" aria-label="Sourçage" title="Sourcée = on connaît au moins un gestionnaire (nom, ligne directe ou e-mail)">
        <option value="">Sourcées et non sourcées</option>
        <option value="sourcees">Sourcées · gestionnaire connu</option>
        <option value="non_sourcees">Non sourcées · standard seul</option>
      </Selecteur>
      </>)}
      <label className="flex items-center gap-2 text-legende text-encre">
        <Interrupteur allume={auto} onChange={setAuto} libelle="Mode automatique" disabled={autreOnglet || cadence === null} /> Mode automatique
      </label>
      <label className="flex items-center gap-1.5 text-legende text-encre-2">
        cadence
        <Champ type="number" min={2} max={120} value={cadence ?? ""} onChange={(e) => setCadence(Number(e.target.value) || 0)} className="chiffres w-16" aria-label="Cadence en secondes (2 au minimum)" />
        s
      </label>
      {enCours ? (
        <Bouton variante="plein" icone={<Square />} onClick={arreter}>Arrêter</Bouton>
      ) : (
        <Bouton variante="plein" icone={<Play />} onClick={demarrer} disabled={!nbFile || chargementFile || autreOnglet || !reglagesLus} title={bloqueOnglet ?? (!reglagesLus ? "Lecture des réglages…" : undefined)}>Démarrer</Bouton>
      )}
    </>
  )
}
