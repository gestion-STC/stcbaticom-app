// Les commandes de la session (dessin du 06/11/2026, thème A2 ; épuré le 07/11, Mahdi : « trop de choses
// sur l'écran, rends les sélecteurs minimalistes, avec trois petits points ») : sous les onglets Leads /
// Prospection, les piles en texte à gauche (PilesSession) ; à droite, les filtres rangés derrière « ⋯ »
// (base, secteur, étape, sourçage ; seuls ceux qui filtrent s'affichent en clair), puis le mode
// automatique, sa cadence et Démarrer / Arrêter, groupés.
// En mode Leads, la file est celle des leads : ni pile, ni secteur, ni étape, ni sourçage.
import { useEffect, useRef, useState } from "react"
import { Ellipsis, Play, Square } from "lucide-react"
import { ETAPES, FILES, SORTIES, type File, type Secteur } from "../../../demarchage/modele"
import { CADENCE_MIN_S } from "../../../demarchage/sessionOutils"
import { Bouton, Champ, Etiquette, Interrupteur, Selecteur } from "../../../ui"

type Sourcage = "" | "sourcees" | "non_sourcees"

/** Les quatre piles de la prospection, en texte : la pile ouverte en noir, son compte à côté. */
export function PilesSession({ file, setFile, etapeFiltre, chargementFile, nbFile, compteurs, bloque, sans = [] }: {
  /** Les piles qui ont leur propre onglet (« À rappeler », 11/11/2026). */
  sans?: File[]
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
      {FILES.filter((f) => !sans.includes(f.code)).map((f) => {
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
  const [ouvert, setOuvert] = useState(false)
  const boite = useRef<HTMLDivElement>(null)
  // Le menu se ferme d'un clic ailleurs ou avec Échap.
  useEffect(() => {
    if (!ouvert) return
    const clic = (e: MouseEvent) => { if (!boite.current?.contains(e.target as Node)) setOuvert(false) }
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false) }
    document.addEventListener("mousedown", clic)
    document.addEventListener("keydown", touche)
    return () => { document.removeEventListener("mousedown", clic); document.removeEventListener("keydown", touche) }
  }, [ouvert])

  const fige = enCours || barreVisible
  const avecBase = optionsDeBase.length > 1
  // Ce qui filtre vraiment, en clair à côté des trois points (rien = toute la file).
  const actifs = [
    avecBase && optionsDeBase[0] && valeurBase !== optionsDeBase[0].value ? optionsDeBase.find((o) => o.value === valeurBase)?.label : "",
    !modeLeads && secteurDuJour ? secteurs.find((x) => x.code === secteurDuJour)?.libelle : "",
    !modeLeads && etapeFiltre ? [...ETAPES, ...SORTIES].find((x) => x.code === etapeFiltre)?.libelle : "",
    !modeLeads && sourcage ? (sourcage === "sourcees" ? "Sourcées" : "Non sourcées") : "",
  ].filter(Boolean)
  const filtres = avecBase || !modeLeads

  return (
    <div className="ml-auto flex items-center gap-4">
      {/* « À compléter » retiré le 24/10/2026 : le résultat est désormais obligatoire (verrou du compte). */}
      {filtres ? (
        <div ref={boite} className="relative flex items-center gap-1.5">
          {actifs.length ? <span className="max-w-[260px] truncate text-colonne text-encre-2" title={actifs.join(" · ")}>{actifs.join(" · ")}</span> : null}
          <Bouton taille="icone" variante="discret" icone={<Ellipsis />} aria-label="Filtres de la file" aria-expanded={ouvert} title="Base, secteur, étape, sourçage" onClick={() => setOuvert((o) => !o)} />
          {ouvert ? (
            <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[280px] space-y-3 rounded-4 border-[0.5px] border-trait bg-fond p-4 shadow-flottante">
              {fige ? <p className="text-colonne text-encre-2">Arrête la session pour changer de file.</p> : null}
              {avecBase ? (
                <Etiquette texte="Base">
                  <Selecteur value={valeurBase} onChange={(e) => choisirBase(e.target.value)} disabled={fige} aria-label="Base d'appel" title="La base que tu appelles : la tienne, celle d'un autre compte, les agences non attribuées, ou tout">
                    {optionsDeBase.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Selecteur>
                </Etiquette>
              ) : null}
              {modeLeads ? null : (<>
                <Etiquette texte="Secteur">
                  <Selecteur value={secteurDuJour} onChange={(e) => setSecteurDuJour(e.target.value)} disabled={fige} aria-label="Secteur du jour">
                    <option value="">Tous les secteurs</option>
                    {secteurs.map((x) => <option key={x.code} value={x.code}>{x.libelle}</option>)}
                  </Selecteur>
                </Etiquette>
                <Etiquette texte="Étape">
                  <Selecteur value={etapeFiltre} onChange={(e) => setEtapeFiltre(e.target.value)} disabled={fige} aria-label="Étape" title="N'appeler que les agences de cette étape (dans la file choisie)">
                    <option value="">Toutes les étapes</option>
                    {ETAPES.map((x) => <option key={x.code} value={x.code}>{x.libelle}</option>)}
                    {SORTIES.map((x) => <option key={x.code} value={x.code}>{x.libelle}</option>)}
                  </Selecteur>
                </Etiquette>
                <Etiquette texte="Sourçage">
                  <Selecteur value={sourcage} onChange={(e) => setSourcage(e.target.value as Sourcage)} disabled={fige} aria-label="Sourçage" title="Sourcée = on connaît au moins un gestionnaire (nom, ligne directe ou e-mail)">
                    <option value="">Sourcées et non sourcées</option>
                    <option value="sourcees">Sourcées · gestionnaire connu</option>
                    <option value="non_sourcees">Non sourcées · standard seul</option>
                  </Selecteur>
                </Etiquette>
              </>)}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Le mode automatique, sa cadence et le départ : un seul groupe, toujours rangé à droite. */}
      <div className="flex items-center gap-3 border-l-[0.5px] border-trait pl-4">
        <label className="flex items-center gap-2 text-legende text-encre">
          <Interrupteur allume={auto} onChange={setAuto} libelle="Mode automatique" disabled={autreOnglet || cadence === null} /> Auto
        </label>
        <label className="flex items-center gap-1 text-legende text-encre-2" title={`Le temps entre deux appels, après le résultat validé : ${CADENCE_MIN_S} s au minimum, le temps que le mail de suivi parte et que tu lises la fiche suivante.`}>
          <Champ type="number" min={CADENCE_MIN_S} max={120} value={cadence ?? ""} onChange={(e) => setCadence(Number(e.target.value) || 0)} onBlur={() => { if (cadence !== null && cadence < CADENCE_MIN_S) setCadence(CADENCE_MIN_S) }} className="chiffres w-14 text-right" aria-label={`Cadence en secondes (${CADENCE_MIN_S} au minimum)`} />
          s
        </label>
        {enCours ? (
          <Bouton variante="plein" icone={<Square />} onClick={arreter}>Arrêter</Bouton>
        ) : (
          <Bouton variante="plein" icone={<Play />} onClick={demarrer} disabled={!nbFile || chargementFile || autreOnglet || !reglagesLus} title={bloqueOnglet ?? (!reglagesLus ? "Lecture des réglages…" : undefined)}>Démarrer</Bouton>
        )}
      </div>
    </div>
  )
}
