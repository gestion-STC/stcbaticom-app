// ════════════════════════════════════════════════════════════════════════════
// LE SUIVI — le tunnel, l'objectif de la semaine, et qui relancer à la main
//
// Une page de la trousse STC. Le tunnel compte ceux qui ont été DÉMARRÉS sur
// la période (puis joints, ont cliqué, ont déposé), chaque étape rapportée à
// la précédente. En dessous, deux listes d'artisans « chauds » : ceux qui ont
// cliqué candidater sans déposer, ceux qui ont consulté le barème. Un bouton
// « Appeler » sur chaque ligne ; la ligne ouvre la fiche.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from "react"
import { Phone } from "lucide-react"
import type { ObjectifMetier, SousTraitant } from "../../recrutement"
import { supabaseConfigure } from "../../lib/supabase"
import { chargerSousTraitants } from "../../lib/sousTraitantsDb"
import { chargerObjectifs } from "../../lib/objectifsStDb"
import { CORPS_METIERS, exerceCorps } from "../../lib/recrutementCalc"
import { pourcent, tunnel } from "../../lib/statsMachine"
import { lancerAppelRingover } from "../../lib/ringover"
import { Bandeau, BarreFiltres, Bouton, Carte, Chargement, EnTetePage, Pastille, Selecteur, TitreCarte, Vide } from "../../ui"
import FicheArtisan from "./FicheArtisan"

const JOUR_MS = 86_400_000
const PERIODES: { jours: number; libelle: string }[] = [
  { jours: 7, libelle: "7 derniers jours" },
  { jours: 30, libelle: "30 derniers jours" },
  { jours: 60, libelle: "60 derniers jours" },
  { jours: 90, libelle: "90 derniers jours" },
  { jours: 0, libelle: "Tout l'historique" },
]
const dateCourte = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Une barre proportionnelle, fond doux, remplissage signature (10 px, rayon 3). */
function Barre({ pct }: { pct: number }) {
  return (
    <div className="h-[10px] w-full overflow-hidden rounded-3 bg-fond-3" role="presentation">
      <i className="block h-full rounded-3 bg-signature transition-[width]" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

export default function SuiviST() {
  const [fiches, setFiches] = useState<SousTraitant[]>([])
  const [objectifs, setObjectifs] = useState<ObjectifMetier[]>([])
  // L'heure de la dernière lecture : tous les calculs de période s'y rapportent
  // (et le rendu reste pur : pas de Date.now() pendant qu'on dessine).
  const [maintenant, setMaintenant] = useState(0)
  const [chargement, setChargement] = useState(!!supabaseConfigure)
  const [erreur, setErreur] = useState(supabaseConfigure ? "" : "Base non configurée.")
  const [avis, setAvis] = useState("")
  const [jours, setJours] = useState(30)
  const [corps, setCorps] = useState("")
  const [ficheOuverte, setFicheOuverte] = useState<string | null>(null)

  // Une lecture = les fiches + les objectifs, et l'heure de la lecture.
  const charger = useCallback(
    () =>
      Promise.all([chargerSousTraitants(), chargerObjectifs()])
        .then(([f, o]) => { setFiches(f); setObjectifs(o); setMaintenant(Date.now()); setErreur("") })
        .catch((e) => setErreur(message(e))),
    [],
  )
  useEffect(() => {
    if (!supabaseConfigure) return
    Promise.all([chargerSousTraitants(), chargerObjectifs()])
      .then(([f, o]) => { setFiches(f); setObjectifs(o); setMaintenant(Date.now()); setErreur("") })
      .catch((e) => setErreur(message(e)))
      .finally(() => setChargement(false))
  }, [])

  const periode = PERIODES.find((p) => p.jours === jours) ?? PERIODES[1]
  const depuis = jours > 0 ? maintenant - jours * JOUR_MS : 0
  const dans = (iso?: string | null) => !!iso && new Date(iso).getTime() >= depuis
  const duCorps = (f: SousTraitant) => !corps || exerceCorps(f, corps)

  // ── Le tunnel ──
  const t = useMemo(() => tunnel(fiches, jours, corps, maintenant), [fiches, jours, corps, maintenant])
  const etapes = [
    { libelle: "Démarrés", n: t.demarres, precedent: t.demarres },
    { libelle: "Joints", n: t.joints, precedent: t.demarres },
    { libelle: "Ont cliqué", n: t.cliques, precedent: t.joints },
    { libelle: "Ont déposé", n: t.deposes, precedent: t.cliques },
  ]

  // ── L'objectif de la semaine : les objectifs actifs (du corps choisi, sinon tous) contre les dépôts de 7 jours ──
  const objectifSemaine = objectifs.filter((o) => o.actif && (!corps || o.metier === corps)).reduce((s, o) => s + o.objectifHebdo, 0)
  const depuis7j = maintenant - 7 * JOUR_MS
  const depots7j = fiches.filter((f) => duCorps(f) && !!f.deposeLe && new Date(f.deposeLe).getTime() >= depuis7j).length
  const objectifAtteint = objectifSemaine > 0 && depots7j >= objectifSemaine

  // ── Qui relancer à la main ──
  const parDateDesc = (cle: (f: SousTraitant) => string | null | undefined) => (a: SousTraitant, b: SousTraitant) => ((cle(b) ?? "") > (cle(a) ?? "") ? 1 : -1)
  const interesses = useMemo(
    () => fiches.filter((f) => duCorps(f) && dans(f.candidatureClicLe) && !f.deposeLe && f.statut !== "depose" && f.statut !== "desinscrit").sort(parDateDesc((f) => f.candidatureClicLe)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- duCorps et dans dérivent de corps et depuis
    [fiches, corps, depuis],
  )
  const baremeVus = useMemo(
    () => fiches.filter((f) => duCorps(f) && dans(f.baremeVuLe)).sort(parDateDesc((f) => f.baremeVuLe)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idem
    [fiches, corps, depuis],
  )

  const appeler = async (f: SousTraitant) => {
    if (!f.telephone) { setAvis("Cette fiche n'a pas de numéro de téléphone."); return }
    setAvis("")
    const r = await lancerAppelRingover(f.telephone)
    if (!r.ok) setAvis(r.message || "Appel impossible pour le moment.")
  }

  return (
    <div className="page">
      <EnTetePage titre="Suivi" sousTitre={`${periode.libelle}${corps ? ` · ${CORPS_METIERS.find((c) => c.value === corps)?.label ?? corps}` : ""}`} />

      {erreur ? <Bandeau role="alerte" className="mb-4" action={<Bouton taille="sm" onClick={() => { setChargement(true); charger().finally(() => setChargement(false)) }}>Réessayer</Bouton>}>{erreur}</Bandeau> : null}
      {avis ? <Bandeau role="attention" className="mb-4" action={<Bouton taille="sm" variante="discret" onClick={() => setAvis("")}>Fermer</Bouton>}>{avis}</Bandeau> : null}

      {chargement ? <Chargement texte="Chargement du suivi…" /> : null}

      {!chargement && !erreur ? (
        <>
          <BarreFiltres className="mb-4">
            <Selecteur className="w-[190px]" value={String(jours)} onChange={(e) => setJours(Number(e.target.value))} aria-label="Période">
              {PERIODES.map((p) => <option key={p.jours} value={p.jours}>{p.libelle}</option>)}
            </Selecteur>
            <Selecteur className="w-[190px]" value={corps} onChange={(e) => setCorps(e.target.value)} aria-label="Corps de métier">
              <option value="">Tous les corps</option>
              {CORPS_METIERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Selecteur>
          </BarreFiltres>

          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <Carte>
              <TitreCarte droite={<span className="text-legende text-encre-2">chaque % se lit par rapport à l'étape d'avant</span>}>Tunnel</TitreCarte>
              <div className="px-5 pb-5">
                {t.demarres === 0 ? (
                  <Vide titre="Personne n'a été démarré sur cette période" texte="Élargissez la période, ou lancez la machine depuis le pilotage." />
                ) : (
                  <ol className="space-y-4">
                    {etapes.map((e, i) => (
                      <li key={e.libelle}>
                        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-legende">
                          <span className="font-medium text-encre">{e.libelle}</span>
                          <span className="chiffres text-encre-2">
                            <span className="font-semibold text-encre">{e.n}</span>
                            {i > 0 ? <span className="ml-2">{pourcent(e.n, e.precedent)} %</span> : null}
                          </span>
                        </div>
                        <Barre pct={pourcent(e.n, t.demarres)} />
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </Carte>

            <Carte>
              <TitreCarte droite={objectifSemaine > 0 ? <Pastille role={objectifAtteint ? "fait" : "attente"} point>{objectifAtteint ? "atteint" : "en cours"}</Pastille> : null}>Objectif de la semaine</TitreCarte>
              <div className="px-5 pb-5">
                {objectifSemaine === 0 ? (
                  <Vide titre="Aucun objectif actif" texte={corps ? "Aucun objectif pour ce corps de métier : réglez-le dans le pilotage." : "Réglez un objectif par corps de métier dans le pilotage."} />
                ) : (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="chiffres text-section font-semibold text-encre">{depots7j}</span>
                      <span className="chiffres text-legende text-encre-2">/ {objectifSemaine} dépôt{objectifSemaine > 1 ? "s" : ""} voulu{objectifSemaine > 1 ? "s" : ""}</span>
                    </div>
                    <p className="mb-3 mt-1 text-legende text-encre-2">Dossiers déposés sur les 7 derniers jours, contre la somme des objectifs actifs.</p>
                    <Barre pct={pourcent(depots7j, objectifSemaine)} />
                  </>
                )}
              </div>
            </Carte>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ListeARelancer titre="Ont cliqué candidater sans déposer" fiches={interesses} date={(f) => f.candidatureClicLe} vide="Personne en attente de dépôt sur cette période." onAppeler={appeler} onOuvrir={setFicheOuverte} />
            <ListeARelancer titre="Ont consulté le barème" fiches={baremeVus} date={(f) => f.baremeVuLe} vide="Personne n'a ouvert le barème sur cette période." onAppeler={appeler} onOuvrir={setFicheOuverte} />
          </div>
        </>
      ) : null}

      {ficheOuverte ? <FicheArtisan id={ficheOuverte} onFermer={() => setFicheOuverte(null)} onChange={charger} /> : null}
    </div>
  )
}

/** Une carte-liste d'artisans à relancer à la main : entreprise, corps, date, et un bouton d'appel. */
function ListeARelancer({ titre, fiches, date, vide, onAppeler, onOuvrir }: {
  titre: string
  fiches: SousTraitant[]
  date: (f: SousTraitant) => string | null | undefined
  vide: string
  onAppeler: (f: SousTraitant) => void
  onOuvrir: (id: string) => void
}) {
  return (
    <Carte>
      <TitreCarte droite={<span className="chiffres text-legende text-encre-2">{fiches.length}</span>}>{titre}</TitreCarte>
      {fiches.length === 0 ? (
        <Vide titre="Rien à relancer" texte={vide} />
      ) : (
        <ul className="max-h-[420px] overflow-y-auto border-t border-trait">
          {fiches.map((f) => {
            const d = date(f)
            return (
              <li key={f.id} className="border-b border-fond-4 last:border-b-0">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => f.id && onOuvrir(f.id)}
                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && f.id) { e.preventDefault(); onOuvrir(f.id) } }}
                  className="flex cursor-pointer items-center gap-3 px-5 py-2.5 text-legende transition-colors hover:bg-fond-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-encre">{f.entreprise || f.contact || f.email || "—"}</span>
                    <span className="block truncate text-encre-2">{f.metier || "—"}</span>
                  </span>
                  <span className="chiffres shrink-0 text-encre-2" title={d ? new Date(d).toLocaleString("fr-FR") : undefined}>{d ? dateCourte(d) : "—"}</span>
                  <Bouton variante="discret" taille="sm" icone={<Phone />} disabled={!f.telephone} title={f.telephone ? `Appeler ${f.telephone}` : "Pas de numéro"} onClick={(e) => { e.stopPropagation(); onAppeler(f) }}>Appeler</Bouton>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Carte>
  )
}
