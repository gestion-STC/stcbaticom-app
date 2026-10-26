// ════════════════════════════════════════════════════════════════════════════
// SESSION DE CALL · RECRUTEMENT (11/10/2026) — on appelle les leads.
//
// Un lead = un artisan qui a cliqué (barème, candidature) sans déposer son
// dossier. La machine l'a écrit, maintenant on l'appelle. Trois files : les
// leads jamais appelés ou à réessayer, les rappels du jour, ceux qui ont
// promis de déposer. Chaque appel laisse une trace : combien de fois, quel
// retour, va-t-il déposer, pas intéressé — et la base trie d'elle-même
// (`st_appel_enregistrer` : rappels, injoignable, arrêt de la séquence).
// Trois colonnes, comme la session du démarchage : la file, la fiche et la
// barre de résultat, l'historique.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, Check, ExternalLink, Phone, PhoneOutgoing, RefreshCw, Search } from "lucide-react"
import type { ClicST, EnvoiST, EtapeST, SousTraitant } from "../../recrutement"
import { libelleStatutST, rolePastilleStatut } from "../../recrutement"
import { chronologie, dateHeure } from "../../lib/chronologieArtisan"
import { chargerSousTraitant, chargerSousTraitants, metiersDistincts } from "../../lib/sousTraitantsDb"
import { chargerClicsDe, chargerEnvoisDe } from "../../lib/machineDb"
import { chargerEtapes, chargerSequences } from "../../lib/sequencesStDb"
import { chargerAppelsDe, chargerFileST, compterFilesST, enregistrerAppelST, type AppelST } from "../../lib/appelsStDb"
import {
  FILES_ST, ISSUES_ST, LIBELLE_ISSUE, LIBELLE_RESULTAT, LIBELLE_SUIVI, MOTIFS_ST, RESULTATS_ST, dureeLisibleST, effetAppel, signaux,
  type FileST, type IssueST, type ResultatST,
} from "../../lib/appelsStOutils"
import { useSession } from "../../lib/auth"
import { nomAffiche } from "../../lib/comptes"
import { lancerAppelRingover } from "../../lib/ringover"
import { formaterTelephone } from "../../lib/telephone"
import { Bandeau, Bouton, Carte, Champ, Chargement, Compteurs, EnTetePage, Etiquette, Pastille, Selecteur, Vide, Zone } from "../../ui"
import FicheArtisan from "./FicheArtisan"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const s = (n: number) => (n > 1 ? "s" : "")
type Choix = { resultat: ResultatST | null; issue: IssueST; motif: string; rappelJour: string; rappelHeure: string }
const CHOIX_VIDE: Choix = { resultat: null, issue: "", motif: "", rappelJour: "", rappelHeure: "10:00" }
const demain = (now: Date) => { const d = new Date(now); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }

/** Un gros bouton de résultat ou d'issue, avec sa touche en petit. */
function GrosBouton({ touche, libelle, aide, choisi, onClick }: { touche: string; libelle: string; aide: string; choisi: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={choisi} title={aide}
      className={"flex min-h-[52px] flex-1 basis-[150px] flex-col items-start justify-center gap-0.5 rounded-4 border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature " +
        (choisi ? "border-action bg-fond-3 text-encre ring-1 ring-action" : "border-trait bg-fond text-encre hover:border-trait-fort hover:bg-fond-4")}>
      <span className="text-legende font-semibold">{libelle}</span>
      <span className="text-colonne text-encre-2">touche {touche}</span>
    </button>
  )
}

export default function SessionCallST() {
  const session = useSession()
  const compteNom = nomAffiche(session)
  const [file, setFile] = useState<FileST>("leads")
  const [compteurs, setCompteurs] = useState<Record<FileST, number> | null>(null)
  const [metier, setMetier] = useState("")
  const [metiers, setMetiers] = useState<string[]>([])
  const [liste, setListe] = useState<SousTraitant[]>([])
  const [chargementFile, setChargementFile] = useState(true)
  const [index, setIndex] = useState(0)
  const [directeId, setDirecteId] = useState<string | null>(null) // un artisan pris hors file (recherche)
  const [faits, setFaits] = useState<Set<string>>(() => new Set()) // appelés pendant cette session
  const [courant, setCourant] = useState<{ st: SousTraitant; appels: AppelST[]; envois: EnvoiST[]; clics: ClicST[]; etapes: EtapeST[] } | null>(null)
  const [note, setNote] = useState("")
  const [choix, setChoix] = useState<Choix>(CHOIX_VIDE)
  const [appelDepuis, setAppelDepuis] = useState<number | null>(null)
  const [callId, setCallId] = useState("")
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState("")
  const [info, setInfo] = useState("")
  const [recherche, setRecherche] = useState("")
  const [resultats, setResultats] = useState<SousTraitant[] | null>(null)
  const [ficheOuverte, setFicheOuverte] = useState<string | null>(null)
  const [maintenant, setMaintenant] = useState(() => new Date())
  const enVie = useRef(true)
  const tousRef = useRef<SousTraitant[] | null>(null)

  const chargerCompteurs = useCallback(async () => {
    const now = new Date()
    setMaintenant(now)
    const [c, m] = await Promise.all([compterFilesST(now, metier), metiers.length ? Promise.resolve(metiers) : metiersDistincts().catch(() => [] as string[])])
    if (!enVie.current) return
    setCompteurs(c)
    if (!metiers.length && m.length) setMetiers(m)
  }, [metier, metiers])

  const chargerFile = useCallback(async () => {
    setChargementFile(true)
    try {
      const l = await chargerFileST(file, new Date(), metier)
      if (!enVie.current) return
      setListe(l)
      setIndex(0)
      setErreur("")
    } catch (e) {
      if (enVie.current) setErreur(message(e))
    } finally {
      if (enVie.current) setChargementFile(false)
    }
  }, [file, metier])

  useEffect(() => {
    enVie.current = true
    const t = setTimeout(() => { chargerFile(); chargerCompteurs().catch((e) => setErreur(message(e))) }, 0)
    return () => { enVie.current = false; clearTimeout(t) }
  }, [chargerFile, chargerCompteurs])

  // L'artisan courant : celui de la file à `index`, ou celui pris par la recherche.
  const courantId = directeId ?? liste[index]?.id ?? null
  useEffect(() => {
    if (!courantId) { const t = setTimeout(() => setCourant(null), 0); return () => clearTimeout(t) }
    let vivant = true
    const t = setTimeout(async () => {
      try {
        const st = await chargerSousTraitant(courantId)
        const [appels, envois, clics] = await Promise.all([chargerAppelsDe(courantId), chargerEnvoisDe(courantId).catch(() => []), chargerClicsDe(courantId).catch(() => [])])
        let etapes: EtapeST[] = []
        const seqId = st.sequenceId ?? (await chargerSequences().catch(() => [])).find((x) => x.actif)?.id ?? null
        if (seqId) etapes = await chargerEtapes(seqId).catch(() => [])
        if (vivant) { setCourant({ st, appels, envois, clics, etapes }); setNote(""); setChoix(CHOIX_VIDE); setAppelDepuis(null); setCallId("") }
      } catch (e) {
        if (vivant) setErreur(message(e))
      }
    }, 0)
    return () => { vivant = false; clearTimeout(t) }
  }, [courantId])

  // La recherche d'un artisan hors file (nom, téléphone, e-mail) : sur la base chargée une fois.
  useEffect(() => {
    const r = recherche.trim().toLowerCase()
    if (r.length < 2) { const t = setTimeout(() => setResultats(null), 0); return () => clearTimeout(t) }
    const t = setTimeout(async () => {
      try {
        if (!tousRef.current) tousRef.current = await chargerSousTraitants()
        const chiffres = r.replace(/\D/g, "")
        setResultats(tousRef.current.filter((x) => x.entreprise.toLowerCase().includes(r) || x.contact.toLowerCase().includes(r) || x.email.toLowerCase().includes(r) || (chiffres.length >= 4 && x.telephone.replace(/\D/g, "").includes(chiffres))).slice(0, 12))
      } catch (e) { setErreur(message(e)) }
    }, 250)
    return () => clearTimeout(t)
  }, [recherche])

  // Le chrono de l'appel en cours.
  useEffect(() => {
    if (!appelDepuis) return
    const t = setInterval(() => setMaintenant(new Date()), 1000)
    return () => clearInterval(t)
  }, [appelDepuis])

  const evenements = useMemo(() => (courant ? chronologie(courant.st, courant.envois, courant.clics, [], courant.etapes) : []), [courant])

  const suivant = () => {
    setDirecteId(null)
    setIndex((i) => Math.min(i + 1, liste.length))
  }
  const appeler = async () => {
    if (!courant?.st.telephone) { setErreur("Cette fiche n'a pas de numéro."); return }
    setErreur("")
    const r = await lancerAppelRingover(courant.st.telephone)
    if (!r.ok) { setErreur(r.message || "Appel impossible pour le moment."); return }
    setAppelDepuis(Date.now())
    setCallId(r.callId ?? "")
  }
  const enregistrer = async () => {
    if (!courant || !choix.resultat) return
    if (choix.resultat === "joint" && choix.issue === "a_rappeler" && !choix.rappelJour) { setErreur("Choisis le jour du rappel."); return }
    setOccupe(true); setErreur(""); setInfo("")
    try {
      const rappelLe = choix.issue === "a_rappeler" && choix.rappelJour ? new Date(`${choix.rappelJour}T${choix.rappelHeure || "10:00"}:00`).toISOString() : null
      const bilan = await enregistrerAppelST({
        sousTraitantId: courant.st.id!, resultat: choix.resultat, issue: choix.resultat === "joint" ? choix.issue : "", motif: choix.motif, note: note.trim(),
        rappelLe, dureeS: appelDepuis ? Math.round((Date.now() - appelDepuis) / 1000) : null, callId, compteNom,
      })
      setFaits((f) => new Set(f).add(courant.st.id!))
      setInfo(effetAppel(choix.resultat, choix.resultat === "joint" ? choix.issue : "", bilan.suivi, bilan.rappelLe))
      // La ligne sort de la file (la base l'a reclassée) ; on passe au suivant.
      setListe((l) => l.filter((x) => x.id !== courant.st.id))
      setDirecteId(null)
      chargerCompteurs().catch(() => undefined)
    } catch (e) {
      setErreur(message(e))
    } finally {
      setOccupe(false)
    }
  }

  // Les touches 1-4 : résultat, puis issue quand « joint ».
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null
      if (cible && (cible.tagName === "INPUT" || cible.tagName === "TEXTAREA" || cible.tagName === "SELECT" || cible.isContentEditable)) return
      if (!courant || ficheOuverte) return
      if (e.key >= "1" && e.key <= "4") {
        const i = Number(e.key) - 1
        setChoix((c) => (c.resultat === "joint" ? { ...c, issue: ISSUES_ST[i].code, rappelJour: ISSUES_ST[i].code === "a_rappeler" && !c.rappelJour ? demain(new Date()) : c.rappelJour } : { ...c, resultat: RESULTATS_ST[i].code, issue: "" }))
      } else if (e.key === "Enter" && choix.resultat && (choix.resultat !== "joint" || choix.issue)) {
        enregistrer()
      } else if (e.key === "Escape") {
        setChoix(CHOIX_VIDE)
      }
    }
    window.addEventListener("keydown", surTouche)
    return () => window.removeEventListener("keydown", surTouche)
  })

  const st = courant?.st ?? null
  const pret = !!choix.resultat && (choix.resultat !== "joint" || !!choix.issue)
  const fileCourante = FILES_ST.find((f) => f.code === file)!

  return (
    <div className="page">
      <EnTetePage
        titre="Session de call · Recrutement"
        sousTitre={`${fileCourante.aide}${faits.size ? ` · ${faits.size} appel${s(faits.size)} enregistré${s(faits.size)} dans cette session` : ""}`}
        droite={<>
          <Selecteur className="w-[200px]" value={metier} onChange={(e) => setMetier(e.target.value)} aria-label="Métier">
            <option value="">Tous les métiers</option>
            {metiers.map((m) => <option key={m} value={m}>{m}</option>)}
          </Selecteur>
          <Bouton icone={<RefreshCw />} onClick={() => { chargerFile(); chargerCompteurs().catch(() => undefined) }}>Actualiser</Bouton>
        </>}
      />

      <div className="mb-4">
        <Compteurs<FileST>
          valeurs={FILES_ST.map((f) => ({ id: f.code, libelle: f.libelle, valeur: compteurs?.[f.code] ?? "…", detail: f.aide, role: f.code === "rappels" && (compteurs?.rappels ?? 0) > 0 ? ("alerte" as const) : undefined }))}
          actif={file}
          onSelect={(f) => { setFile(f); setDirecteId(null) }}
        />
      </div>

      {erreur ? <Bandeau role="alerte" className="mb-4" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur("")}>Fermer</Bouton>}>{erreur}</Bandeau> : null}
      {info ? <Bandeau role="ok" className="mb-4" action={<Bouton taille="sm" variante="discret" onClick={() => setInfo("")}>Fermer</Bouton>}>{info}</Bandeau> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_1fr_340px]">
        {/* ── La file ── */}
        <Carte className="self-start">
          <div className="border-b border-trait px-4 py-3">
            <Champ type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher un artisan…" aria-label="Chercher un artisan" />
          </div>
          {resultats ? (
            <ul className="max-h-[60vh] overflow-y-auto">
              {resultats.length === 0 ? <li className="px-4 py-3 text-legende text-encre-2">Aucun artisan ne correspond.</li> : null}
              {resultats.map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => { setDirecteId(x.id!); setRecherche(""); setResultats(null) }} className="flex w-full items-center gap-2 border-b border-fond-4 px-4 py-2 text-left hover:bg-fond-4">
                    <span className="min-w-0 flex-1"><span className="block truncate text-legende font-medium text-encre">{x.entreprise}</span><span className="block truncate text-colonne text-encre-2">{[x.metier, formaterTelephone(x.telephone)].filter(Boolean).join(" · ")}</span></span>
                    <Search size={14} className="shrink-0 text-encre-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : chargementFile ? <Chargement texte="Lecture de la file…" /> : liste.length === 0 ? (
            <Vide titre="File vide" texte={file === "leads" ? "Aucun lead à appeler pour l'instant : la machine en apportera." : file === "rappels" ? "Aucun rappel pour aujourd'hui." : "Personne n'a promis de déposer."} />
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto">
              {liste.map((x, i) => {
                const courante = !directeId && i === index
                return (
                  <li key={x.id}>
                    <button type="button" onClick={() => { setDirecteId(null); setIndex(i) }} className={"flex w-full items-center gap-2 border-b border-fond-4 px-4 py-2 text-left " + (courante ? "bg-fond-3" : "hover:bg-fond-4")}>
                      <span className={"h-2 w-2 shrink-0 rounded-full " + (courante ? "bg-encre" : "bg-transparent")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-legende font-medium text-encre">{x.entreprise || x.contact || "Sans nom"}</span>
                        <span className="block truncate text-colonne text-encre-2">
                          {[x.metier, file === "rappels" && x.rappelLe ? `rappel ${dateHeure(x.rappelLe)}` : signaux(x)[0]].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {x.nbAppels ? <span className="chiffres shrink-0 text-colonne text-encre-2" title={`${x.nbAppels} appel${s(x.nbAppels)}`}>{x.nbAppels}</span> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Carte>

        {/* ── La fiche et la barre de résultat ── */}
        <div className="grid content-start gap-4">
          {!st ? (
            <Carte><Vide titre={liste.length && index >= liste.length ? "File terminée" : "Choisis un artisan"} texte={liste.length && index >= liste.length ? "Tous les artisans de cette file sont passés. Change de file ou actualise." : "Clique un artisan dans la file, ou cherche-le."} /></Carte>
          ) : (
            <>
              <Carte>
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-sous-titre font-semibold text-encre">{st.entreprise || st.contact || "Sans nom"}</h2>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-legende text-encre-2">
                      <Pastille role={rolePastilleStatut[st.statut]} point>{libelleStatutST[st.statut]}</Pastille>
                      {st.suivi ? <Pastille role={st.suivi === "va_deposer" || st.suivi === "a_rappeler" ? "attente" : "probleme"}>{LIBELLE_SUIVI[st.suivi]}</Pastille> : null}
                      {st.metier ? <span>{st.metier}</span> : null}
                      {st.zone ? <span>· {st.zone}</span> : null}
                      {st.source ? <span>· {st.source}</span> : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Bouton variante="discret" icone={<ExternalLink />} onClick={() => setFicheOuverte(st.id!)}>Fiche</Bouton>
                    <Bouton variante="plein" icone={<Phone />} onClick={appeler} disabled={!st.telephone}>Appeler</Bouton>
                  </div>
                </div>
                <div className="grid gap-x-6 gap-y-1 px-5 pb-4 pt-3 text-legende sm:grid-cols-2">
                  <p><span className="text-encre-2">Contact</span> · <span className="text-encre">{st.contact || "—"}</span></p>
                  <p><span className="text-encre-2">Mobile</span> · <span className={"chiffres font-medium " + (st.telephoneInvalide ? "text-alerte line-through" : "text-encre")}>{formaterTelephone(st.telephone) || "—"}</span></p>
                  <p className="truncate"><span className="text-encre-2">E-mail</span> · <span className={st.emailInvalide ? "text-alerte line-through" : "text-encre"}>{st.email || "—"}</span></p>
                  <p><span className="text-encre-2">Appels</span> · <span className="chiffres text-encre">{st.nbAppels ?? 0}</span>{st.nbJoints ? <span className="text-encre-2"> dont {st.nbJoints} joint{s(st.nbJoints)}</span> : null}{st.dernierAppelLe ? <span className="text-encre-2"> · dernier le {dateHeure(st.dernierAppelLe)}</span> : null}</p>
                </div>
                <div className="border-t border-trait px-5 py-3">
                  <p className="text-colonne font-medium text-encre-2">Pourquoi on l'appelle</p>
                  <ul className="mt-1 text-legende text-encre">
                    {signaux(st).map((x) => <li key={x}>· {x}</li>)}
                    {st.rappelLe ? <li>· rappel prévu le {dateHeure(st.rappelLe)}{st.suivi === "va_deposer" ? " (avait promis de déposer)" : ""}</li> : null}
                    {st.suiviMotif ? <li className="text-encre-2">· {st.suiviMotif}</li> : null}
                    {signaux(st).length === 0 && !st.rappelLe ? <li className="text-encre-2">· pris hors file</li> : null}
                  </ul>
                </div>
              </Carte>

              <Carte>
                <div className="px-5 pt-4">
                  <p className="text-legende font-semibold text-encre">{appelDepuis ? <span className="inline-flex items-center gap-1.5"><PhoneOutgoing size={14} className="text-signature" /> Appel lancé · <span className="chiffres">{dureeLisibleST(Math.round((maintenant.getTime() - appelDepuis) / 1000)) || "0 s"}</span></span> : "Qu'est-ce qui s'est passé ?"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {RESULTATS_ST.map((r) => <GrosBouton key={r.code} touche={r.touche} libelle={r.libelle} aide={r.aide} choisi={choix.resultat === r.code} onClick={() => setChoix({ ...CHOIX_VIDE, resultat: r.code })} />)}
                  </div>
                  {choix.resultat === "joint" ? (
                    <>
                      <p className="mt-4 text-legende font-semibold text-encre">Et alors ?</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ISSUES_ST.map((i) => <GrosBouton key={i.code} touche={i.touche} libelle={i.libelle} aide={i.aide} choisi={choix.issue === i.code} onClick={() => setChoix({ ...choix, issue: i.code, rappelJour: i.code === "a_rappeler" && !choix.rappelJour ? demain(new Date()) : choix.rappelJour })} />)}
                      </div>
                      {choix.issue === "a_rappeler" ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <Etiquette texte="Jour du rappel"><Champ type="date" value={choix.rappelJour} onChange={(e) => setChoix({ ...choix, rappelJour: e.target.value })} /></Etiquette>
                          <Etiquette texte="Heure"><Champ type="time" value={choix.rappelHeure} onChange={(e) => setChoix({ ...choix, rappelHeure: e.target.value })} /></Etiquette>
                        </div>
                      ) : null}
                      {choix.issue === "pas_interesse" || choix.issue === "hors_cible" ? (
                        <div className="mt-3">
                          <Etiquette texte="Pourquoi ?">
                            <Selecteur value={choix.motif} onChange={(e) => setChoix({ ...choix, motif: e.target.value })}>
                              <option value="">Sans précision</option>
                              {MOTIFS_ST.map((m) => <option key={m} value={m}>{m}</option>)}
                            </Selecteur>
                          </Etiquette>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <div className="mt-3">
                    <Etiquette texte="Note (facultative)"><Zone value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Ce qu'il a dit, ce qu'il attend…" /></Etiquette>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
                  <span className="text-colonne text-encre-2">Touches 1 à 4 · Entrée pour enregistrer · Échap pour effacer</span>
                  <span className="flex items-center gap-1">
                    <Bouton variante="discret" icone={<ArrowRight />} disabled={occupe || !!directeId && liste.length === 0} onClick={suivant}>Suivant sans enregistrer</Bouton>
                    <Bouton icone={<Check />} chargement={occupe} disabled={!pret} onClick={enregistrer}>Enregistrer et passer au suivant</Bouton>
                  </span>
                </div>
              </Carte>
            </>
          )}
        </div>

        {/* ── L'historique ── */}
        <Carte className="self-start">
          <h3 className="px-5 pb-2 pt-4 text-colonne font-medium text-encre-2">Appels{courant?.appels.length ? ` · ${courant.appels.length}` : ""}</h3>
          {!courant ? <p className="px-5 pb-4 text-legende text-encre-2">—</p> : courant.appels.length === 0 ? <p className="px-5 pb-4 text-legende text-encre-2">Jamais appelé.</p> : (
            <ul className="px-5 pb-4">
              {courant.appels.map((a) => (
                <li key={a.id} className="border-b border-fond-4 py-2 text-legende last:border-b-0">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium text-encre">{LIBELLE_RESULTAT[a.resultat]}{a.issue ? ` · ${LIBELLE_ISSUE[a.issue]}` : ""}</span><span className="chiffres text-colonne text-encre-2">{dateHeure(a.date)}</span></div>
                  <div className="text-colonne text-encre-2">{[a.compteNom, a.motif, a.dureeS ? dureeLisibleST(a.dureeS) : "", a.rappelLe ? `rappel ${dateHeure(a.rappelLe)}` : ""].filter(Boolean).join(" · ")}</div>
                  {a.note ? <div className="text-colonne text-encre">{a.note}</div> : null}
                </li>
              ))}
            </ul>
          )}
          <h3 className="border-t border-trait px-5 pb-2 pt-4 text-colonne font-medium text-encre-2">La machine</h3>
          {!courant ? <p className="px-5 pb-4 text-legende text-encre-2">—</p> : evenements.length === 0 ? <p className="px-5 pb-4 text-legende text-encre-2">Rien encore.</p> : (
            <ol className="ml-6 mr-5 mb-4 space-y-2 border-l-2 border-trait pl-4">
              {evenements.slice(0, 12).map((e, i) => (
                <li key={i} className="text-legende">
                  <div className="text-colonne text-encre-2">{dateHeure(e.quand)}</div>
                  <div className={e.role === "erreur" ? "text-alerte" : "text-encre"}>{e.texte}</div>
                </li>
              ))}
            </ol>
          )}
        </Carte>
      </div>

      {ficheOuverte ? <FicheArtisan id={ficheOuverte} onFermer={() => setFicheOuverte(null)} onChange={() => { chargerFile(); chargerCompteurs().catch(() => undefined) }} /> : null}
    </div>
  )
}
