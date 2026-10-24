// ════════════════════════════════════════════════════════════════════════════
// ANALYSE IA DES APPELS (24/10/2026, Mahdi : « savoir exactement quel argumentaire
// marche, ce qui tape, et avoir des données sur nos appels »).
//
// Les appels où quelqu'un a décroché sont transcrits et analysés par l'IA
// (fonction analyser-appel). Ici : les arguments avancés et leur taux d'appels
// aboutis (Intéressé ou RDV), les objections entendues et la réponse qui a marché,
// les chiffres par commercial et par heure, et chaque appel avec son résumé.
// Les calculs sont dans demarchage/analyseOutils.ts (testés).
// ════════════════════════════════════════════════════════════════════════════
import { Fragment, useEffect, useMemo, useState } from "react"
import { RefreshCw, ShieldCheck, Sparkles } from "lucide-react"
import { appelsIaPeriode, verifierMiseEnService, type AppelIa, type ControleMiseEnService } from "../../demarchage/appelsIa"
import {
  MIN_APPELS, abouti, bilanGlobal, dureeLisible, ecartLisible, pourcent, statsArguments, statsObjections, statsParCommercial, statsParHeure,
} from "../../demarchage/analyseOutils"
import { PERIODES, bornesPeriode, type Periode } from "../../demarchage/aujourdhuiOutils"
import { ISSUES } from "../../demarchage/modele"
import { dateHeureCourte } from "../../demarchage/sessionOutils"
import { Bandeau, BarreFiltres, Bouton, Carte, Chargement, EnTetePage, Onglets, Pastille, Selecteur, Tableau, Td, Th, TitreCarte, Tr, Vide } from "../../ui"

type Vue = "arguments" | "objections" | "equipe" | "appels"
const LIBELLE_ISSUE = new Map<string, string>(ISSUES.map((i) => [i.code, i.libelle]))
const LIBELLE_INTERET: Record<string, string> = { nul: "Nul", faible: "Faible", moyen: "Moyen", fort: "Fort" }

/** Le résultat du contrôle : une ligne par pièce, et le verdict d'ensemble. */
function CarteControle({ controles, onFermer }: { controles: ControleMiseEnService[]; onFermer: () => void }) {
  const manquants = controles.filter((c) => !c.ok).length
  return (
    <Carte className="mb-4">
      <TitreCarte droite={<Bouton taille="sm" variante="discret" onClick={onFermer}>Fermer</Bouton>}>Mise en service</TitreCarte>
      <Bandeau role={manquants ? "attention" : "ok"} className="mb-3">
        {manquants ? `${manquants} pièce${manquants > 1 ? "s" : ""} à régler avant que les appels soient analysés.` : "Tout est en place : les prochains appels décrochés seront analysés et leur mail préparé."}
      </Bandeau>
      <ul className="flex flex-col gap-2">
        {controles.map((c) => (
          <li key={c.nom} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Pastille role={c.ok ? "fait" : "probleme"}>{c.ok ? "OK" : "À régler"}</Pastille>
            <span className="font-medium">{c.nom}</span>
            <span className="min-w-0 text-sm text-encre-2">{c.detail}</span>
          </li>
        ))}
      </ul>
    </Carte>
  )
}

export default function AnalyseAppels() {
  const [periode, setPeriode] = useState<Periode>("mois")
  const [commercial, setCommercial] = useState("")
  const [vue, setVue] = useState<Vue>("arguments")
  const [appels, setAppels] = useState<AppelIa[] | null>(null)
  const [erreur, setErreur] = useState("")
  const [version, setVersion] = useState(0)
  const [controle, setControle] = useState<ControleMiseEnService[] | "en_cours" | null>(null)
  const lancerControle = async () => {
    setControle("en_cours")
    try { setControle(await verifierMiseEnService()) } catch (e) { setControle([{ nom: "Fonction analyser-appel", ok: false, detail: e instanceof Error ? e.message : String(e) }]) }
  }

  useEffect(() => {
    let vivant = true
    const { de, a } = bornesPeriode(periode, new Date())
    appelsIaPeriode(de, a)
      .then((l) => { if (vivant) { setAppels(l); setErreur("") } })
      .catch((e) => { if (vivant) setErreur(e instanceof Error ? e.message : String(e)) })
    return () => { vivant = false }
  }, [periode, version])

  const commerciaux = useMemo(() => [...new Set((appels ?? []).map((a) => a.compteNom).filter(Boolean))].sort((x, y) => x.localeCompare(y, "fr")), [appels])
  const filtres = useMemo(() => (appels ?? []).filter((a) => !commercial || a.compteNom === commercial), [appels, commercial])
  const bilan = useMemo(() => bilanGlobal(filtres), [filtres])
  const args = useMemo(() => statsArguments(filtres), [filtres])
  const objs = useMemo(() => statsObjections(filtres), [filtres])
  const equipe = useMemo(() => statsParCommercial(filtres), [filtres])
  const heures = useMemo(() => statsParHeure(filtres), [filtres])
  const sansEnregistrement = filtres.filter((a) => a.statut === "sans_enregistrement").length
  const enRoute = filtres.filter((a) => a.statut === "en_attente" || a.statut === "en_cours").length

  return (
    <div className="page">
      <EnTetePage
        titre="Analyse IA"
        sousTitre="Ce qui tape dans nos appels : arguments, objections, résultats."
        droite={
          <div className="flex flex-wrap gap-2">
            <Bouton icone={<ShieldCheck />} onClick={() => void lancerControle()} disabled={controle === "en_cours"}>Vérifier la mise en service</Bouton>
            <Bouton icone={<RefreshCw />} onClick={() => setVersion((v) => v + 1)}>Actualiser</Bouton>
          </div>
        }
      />

      {controle === "en_cours" ? <Chargement texte="Contrôle de chaque pièce…" /> : null}
      {Array.isArray(controle) ? <CarteControle controles={controle} onFermer={() => setControle(null)} /> : null}

      <BarreFiltres className="mb-4">
        <Selecteur value={periode} onChange={(e) => setPeriode(e.target.value as Periode)} aria-label="Période">
          {PERIODES.map((p) => <option key={p.code} value={p.code}>{p.libelle}</option>)}
        </Selecteur>
        <Selecteur value={commercial} onChange={(e) => setCommercial(e.target.value)} aria-label="Commercial">
          <option value="">Tous les commerciaux</option>
          {commerciaux.map((c) => <option key={c} value={c}>{c}</option>)}
        </Selecteur>
      </BarreFiltres>

      {erreur ? <Bandeau role="alerte" className="mb-4">{erreur}</Bandeau> : null}
      {sansEnregistrement ? (
        <Bandeau role="attention" className="mb-4">
          {sansEnregistrement} appel{sansEnregistrement > 1 ? "s" : ""} sans enregistrement chez Ringover sur la période : l'enregistrement des appels est-il activé sur tous les comptes ?
        </Bandeau>
      ) : null}

      {appels === null && !erreur ? <Chargement texte="Lecture des appels analysés…" /> : null}
      {appels !== null && bilan.appels === 0 ? (
        <Vide
          titre="Aucun appel analysé sur la période"
          texte={enRoute ? `${enRoute} appel${enRoute > 1 ? "s" : ""} en cours d'analyse.` : "Chaque appel où quelqu'un décroche (gestionnaire joint ou standard) est analysé après le résultat noté. Il faut que l'enregistrement des appels soit activé chez Ringover."}
        />
      ) : null}

      {appels !== null && bilan.appels > 0 ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Chiffre libelle="Appels analysés" valeur={String(bilan.appels)} detail={enRoute ? `+ ${enRoute} en cours` : undefined} />
            <Chiffre libelle="Aboutis (Intéressé ou RDV)" valeur={pourcent(bilan.taux)} detail={`${bilan.aboutis} appel${bilan.aboutis > 1 ? "s" : ""}`} />
            <Chiffre libelle="Durée moyenne" valeur={dureeLisible(bilan.dureeMoyenneS)} />
            <Chiffre libelle="Intérêt fort selon l'IA" valeur={String(bilan.interetFort)} />
          </div>

          <Onglets<Vue>
            className="mb-4"
            valeur={vue}
            onChange={setVue}
            options={[
              { id: "arguments", label: "Ce qui tape", badge: args.length },
              { id: "objections", label: "Objections", badge: objs.length },
              { id: "equipe", label: "Par commercial et par heure" },
              { id: "appels", label: "Les appels", badge: bilan.appels },
            ]}
          />

          {vue === "arguments" ? (
            <Carte>
              <TitreCarte>Les arguments, du plus efficace au moins efficace</TitreCarte>
              <p className="px-5 pb-3 text-colonne text-encre-2">
                Pour chaque argument : sur combien d'appels il a été avancé, et combien de ces appels ont abouti. L'écart se lit par rapport au taux moyen de la période ({pourcent(bilan.taux)}). Sous {MIN_APPELS} appels, le chiffre est encore fragile.
              </p>
              <div className="overflow-x-auto">
                <Tableau>
                  <thead><Tr><Th>Argument</Th><Th num>Appels</Th><Th num>Aboutis</Th><Th num>Taux</Th><Th num>Écart</Th><Th num>Bien reçu</Th><Th>Exemple</Th></Tr></thead>
                  <tbody>
                    {args.map((l) => (
                      <Tr key={l.libelle}>
                        <Td className="font-medium">{l.libelle}{!l.fiable ? <span className="ml-2"><Pastille role="inerte">trop peu</Pastille></span> : null}</Td>
                        <Td num>{l.appels}</Td>
                        <Td num>{l.aboutis}</Td>
                        <Td num>{pourcent(l.taux)}</Td>
                        <Td num className={l.ecart != null && l.fiable ? (l.ecart > 0 ? "text-ok" : l.ecart < 0 ? "text-alerte" : "") : "text-encre-3"}>{ecartLisible(l.ecart)}</Td>
                        <Td num>{l.positives}</Td>
                        <Td className="max-w-[360px] truncate text-encre-2" title={l.exemple}>{l.exemple}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tableau>
              </div>
            </Carte>
          ) : null}

          {vue === "objections" ? (
            <Carte>
              <TitreCarte>Les objections entendues</TitreCarte>
              <p className="px-5 pb-3 text-colonne text-encre-2">La réponse retenue est celle d'une objection levée dans un appel qui a abouti, quand il y en a une.</p>
              <div className="overflow-x-auto">
                <Tableau>
                  <thead><Tr><Th>Objection</Th><Th num>Appels</Th><Th num>Levées</Th><Th num>Aboutis malgré tout</Th><Th>La réponse qui a marché</Th></Tr></thead>
                  <tbody>
                    {objs.map((l) => (
                      <Tr key={l.libelle}>
                        <Td className="font-medium">{l.libelle}{!l.fiable ? <span className="ml-2"><Pastille role="inerte">trop peu</Pastille></span> : null}</Td>
                        <Td num>{l.appels}</Td>
                        <Td num>{pourcent(l.tauxLevee)}</Td>
                        <Td num>{pourcent(l.taux)}</Td>
                        <Td className="max-w-[420px] text-encre-2">{l.meilleureReponse || "—"}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tableau>
              </div>
            </Carte>
          ) : null}

          {vue === "equipe" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Carte>
                <TitreCarte>Par commercial</TitreCarte>
                <Tableau>
                  <thead><Tr><Th>Commercial</Th><Th num>Appels</Th><Th num>Aboutis</Th><Th num>Taux</Th><Th num>Durée</Th><Th num>Arguments / appel</Th></Tr></thead>
                  <tbody>
                    {equipe.map((l) => (
                      <Tr key={l.nom}><Td className="font-medium">{l.nom}</Td><Td num>{l.appels}</Td><Td num>{l.aboutis}</Td><Td num>{pourcent(l.taux)}</Td><Td num>{dureeLisible(l.dureeMoyenneS)}</Td><Td num>{l.argumentsParAppel ?? "—"}</Td></Tr>
                    ))}
                  </tbody>
                </Tableau>
              </Carte>
              <Carte>
                <TitreCarte>Par heure de la journée</TitreCarte>
                <Tableau>
                  <thead><Tr><Th>Heure</Th><Th num>Appels</Th><Th num>Aboutis</Th><Th num>Taux</Th></Tr></thead>
                  <tbody>
                    {heures.map((l) => (
                      <Tr key={l.heure}><Td>{l.heure} h – {l.heure + 1} h</Td><Td num>{l.appels}</Td><Td num>{l.aboutis}</Td><Td num>{pourcent(l.taux)}</Td></Tr>
                    ))}
                  </tbody>
                </Tableau>
              </Carte>
            </div>
          ) : null}

          {vue === "appels" ? <ListeAppels appels={filtres.filter((a) => a.statut === "pret")} /> : null}
        </>
      ) : null}
    </div>
  )
}

function Chiffre({ libelle, valeur, detail }: { libelle: string; valeur: string; detail?: string }) {
  return (
    <Carte className="px-5 py-4">
      <p className="text-colonne text-encre-2">{libelle}</p>
      <p className="chiffres mt-1 text-[22px] font-semibold text-encre">{valeur}</p>
      {detail ? <p className="text-colonne text-encre-3">{detail}</p> : null}
    </Carte>
  )
}

function ListeAppels({ appels }: { appels: AppelIa[] }) {
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [transcription, setTranscription] = useState<string | null>(null)
  const tries = [...appels].sort((x, y) => (x.creeLe < y.creeLe ? 1 : -1))
  return (
    <Carte>
      <TitreCarte>Les appels analysés</TitreCarte>
      <div className="overflow-x-auto">
        <Tableau>
          <thead><Tr><Th>Date</Th><Th>Agence</Th><Th>Commercial</Th><Th>Issue notée</Th><Th>Intérêt (IA)</Th><Th num>Durée</Th><Th /></Tr></thead>
          <tbody>
            {tries.map((a) => (
              <Fragment key={a.id}>
                <Tr className="cursor-pointer" onClick={() => setOuvert((o) => (o === a.id ? null : a.id))}>
                  <Td className="whitespace-nowrap">{dateHeureCourte(a.creeLe)}</Td>
                  <Td className="max-w-[260px] truncate font-medium">{a.agenceNom}</Td>
                  <Td>{a.compteNom}</Td>
                  <Td>{a.issue ? <Pastille role={abouti(a) ? "fait" : "inerte"}>{LIBELLE_ISSUE.get(a.issue) ?? a.issue}</Pastille> : a.resultat === "standard" ? "Standard" : "—"}</Td>
                  <Td>{a.interet ? LIBELLE_INTERET[a.interet] : "—"}</Td>
                  <Td num>{dureeLisible(a.dureeS)}</Td>
                  <Td className="text-right text-colonne text-encre-3">{ouvert === a.id ? "Fermer" : "Voir"}</Td>
                </Tr>
                {ouvert === a.id ? (
                  <Tr>
                    <Td colSpan={7} className="bg-fond-2">
                      <div className="grid gap-4 py-2 lg:grid-cols-2">
                        <div className="space-y-2">
                          <p className="flex items-center gap-1.5 text-legende font-semibold"><Sparkles size={14} /> Résumé</p>
                          <p className="whitespace-pre-line text-legende text-encre-2">{a.resume || "—"}</p>
                          {a.analyse?.prochaineEtape ? <p className="text-legende"><span className="font-medium">Convenu : </span>{a.analyse.prochaineEtape}</p> : null}
                          {a.analyse?.pointsForts.length ? <p className="text-legende"><span className="font-medium">Points forts : </span>{a.analyse.pointsForts.join(" · ")}</p> : null}
                          {a.analyse?.aAmeliorer.length ? <p className="text-legende"><span className="font-medium">À améliorer : </span>{a.analyse.aAmeliorer.join(" · ")}</p> : null}
                        </div>
                        <div className="space-y-2">
                          <p className="text-legende font-semibold">Arguments</p>
                          <ul className="space-y-1 text-legende text-encre-2">
                            {(a.analyse?.arguments ?? []).map((x, i) => <li key={i}><span className="font-medium text-encre">{x.libelle}</span> ({x.reaction === "positive" ? "bien reçu" : x.reaction === "negative" ? "mal reçu" : "neutre"}) : {x.extrait}</li>)}
                          </ul>
                          <p className="text-legende font-semibold">Objections</p>
                          <ul className="space-y-1 text-legende text-encre-2">
                            {(a.analyse?.objections ?? []).map((x, i) => <li key={i}><span className="font-medium text-encre">{x.libelle}</span>{x.levee ? " (levée)" : ""} : {x.extrait}{x.reponse ? ` → ${x.reponse}` : ""}</li>)}
                          </ul>
                          {a.transcription ? <Bouton taille="sm" variante="discret" onClick={() => setTranscription(a.transcription)}>Lire la transcription</Bouton> : null}
                        </div>
                      </div>
                    </Td>
                  </Tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </Tableau>
      </div>
      {transcription ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setTranscription(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-fond p-5 shadow-flottante" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="font-semibold">Transcription</p><Bouton taille="sm" variante="discret" onClick={() => setTranscription(null)}>Fermer</Bouton></div>
            <p className="whitespace-pre-line text-legende text-encre-2">{transcription}</p>
          </div>
        </div>
      ) : null}
    </Carte>
  )
}
