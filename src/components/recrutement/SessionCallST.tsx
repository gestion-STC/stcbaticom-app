// ════════════════════════════════════════════════════════════════════════════
// SESSION DE CALL · RECRUTEMENT (11/10/2026) — on appelle les leads.
//
// Un lead = un artisan qui a cliqué (barème, candidature) sans déposer son
// dossier. La machine l'a écrit, maintenant on l'appelle. Trois files : les
// leads jamais appelés ou à réessayer, les rappels du jour, ceux qui ont
// promis de déposer. Chaque appel laisse une trace : combien de fois, quel
// retour, va-t-il déposer, pas intéressé — et la base trie d'elle-même
// (`st_appel_enregistrer` : rappels, injoignable, arrêt de la séquence).
// Le même format que la session du démarchage (07/11/2026) : les files en onglets, la file en marge,
// l'artisan au trait, le résultat en gros boutons à touches, l'historique à droite.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, Check, ChevronLeft, ChevronRight, ExternalLink, Mail, MousePointerClick, Phone, PhoneOutgoing, RefreshCw, Search, Send } from "lucide-react"
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
import { Bandeau, Bouton, Champ, Chargement, Etiquette, Onglets, Pastille, Selecteur, Vide, Zone } from "../../ui"
import { Section } from "../demarchage/session/morceaux"
import QualificationST from "./QualificationST"
import { TachesDuContact } from "../prospection/moteur/TachesCampagne"
import FicheArtisan from "./FicheArtisan"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const s = (n: number) => (n > 1 ? "s" : "")
type Choix = { resultat: ResultatST | null; issue: IssueST; motif: string; rappelJour: string; rappelHeure: string }
const CHOIX_VIDE: Choix = { resultat: null, issue: "", motif: "", rappelJour: "", rappelHeure: "10:00" }
const demain = (now: Date) => { const d = new Date(now); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }

/** Un gros bouton de résultat ou d'issue, sa touche en petit : le même que la barre des agences. */
function GrosBouton({ touche, libelle, aide, choisi, onClick }: { touche: string; libelle: string; aide: string; choisi: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={choisi} title={aide}
      className={"relative flex min-h-[56px] flex-1 basis-[140px] flex-col items-start justify-center gap-0.5 rounded-4 border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature focus-visible:ring-offset-2 " +
        (choisi ? "border-action bg-fond-3 text-encre ring-1 ring-action" : "border-trait bg-fond text-encre hover:border-trait-fort hover:bg-fond-4")}>
      <span className="flex items-center gap-2"><kbd className="rounded-3 bg-fond-4 px-1.5 text-[10px] font-semibold leading-4 text-encre-2">{touche}</kbd><span className="text-legende font-medium">{libelle}</span></span>
      <span className="text-colonne text-encre-2">{aide}</span>
    </button>
  )
}

/** Le nom court de chaque file dans les onglets. */
const ONGLET_FILE: Record<FileST, string> = { leads: "Leads", rappels: "À rappeler", promis: "Ont promis de déposer" }

export default function SessionCallST({ artisanInitial }: { artisanInitial?: string | null }) {
  const session = useSession()
  const compteNom = nomAffiche(session)
  const [file, setFile] = useState<FileST>("leads")
  const [compteurs, setCompteurs] = useState<Record<FileST, number> | null>(null)
  const [metier, setMetier] = useState("")
  const [metiers, setMetiers] = useState<string[]>([])
  const [liste, setListe] = useState<SousTraitant[]>([])
  const [chargementFile, setChargementFile] = useState(true)
  const [index, setIndex] = useState(0)
  const [volet, setVolet] = useState<"qualification" | "historique">("qualification") // à droite, pendant l'appel
  const [directeId, setDirecteId] = useState<string | null>(artisanInitial ?? null) // un artisan pris hors file (recherche, tâche de campagne)
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

  // Le formulaire de qualification de la campagne de cet artisan, à remplir pendant l'appel.
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
  const positionFile = directeId ? null : Math.min(index + 1, liste.length)
  const ensuite = !directeId ? liste[index + 1] : liste[index]
  const reculer = () => { setDirecteId(null); setIndex((i) => Math.max(0, i - 1)) }

  // ── LE MÊME FORMAT QUE LA SESSION DES AGENCES (Mahdi, 07/11/2026 : « que ça ne perturbe pas l'œil ») :
  // les files en onglets, la file en marge à gauche, l'artisan au centre au trait (sans carte), le résultat
  // en gros boutons à touches, l'historique à droite, « Ensuite : » en pied.
  return (
    <div className="@container w-full px-8 pb-10 pt-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b-[0.5px] border-trait">
        <Onglets<FileST>
          className="!border-b-0"
          valeur={file}
          onChange={(f) => { setFile(f); setDirecteId(null) }}
          options={FILES_ST.map((f) => ({ id: f.code, label: ONGLET_FILE[f.code], badge: compteurs?.[f.code] || undefined }))}
        />
        <span className="pb-2.5 text-colonne text-encre-2">{fileCourante.aide}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <span className="chiffres text-legende text-encre-2">Le plus ancien d'abord{faits.size ? ` · ${faits.size} appel${s(faits.size)} enregistré${s(faits.size)} dans cette session` : ""}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Selecteur className="w-[200px]" value={metier} onChange={(e) => setMetier(e.target.value)} aria-label="Métier">
            <option value="">Tous les métiers</option>
            {metiers.map((m) => <option key={m} value={m}>{m}</option>)}
          </Selecteur>
          <Bouton variante="discret" icone={<RefreshCw />} onClick={() => { chargerFile(); chargerCompteurs().catch(() => undefined) }}>Actualiser</Bouton>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {erreur ? <Bandeau role="alerte" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur("")}>Fermer</Bouton>}>{erreur}</Bandeau> : null}
        {info ? <Bandeau role="ok" action={<Bouton taille="sm" variante="discret" onClick={() => setInfo("")}>Fermer</Bouton>}>{info}</Bandeau> : null}
      </div>

      <div className="mt-5 flex gap-8">
        {/* ── 1. La file, en marge ── */}
        <aside className="hidden w-[240px] shrink-0 @min-[960px]:block">
          <div className="sticky top-4 flex h-[calc(100vh-230px)] min-h-[320px] flex-col">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-encre-3" />
              <Champ value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Appeler un artisan…" className="pl-8" aria-label="Appeler un artisan directement" />
              {resultats ? (
                <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-4 border-[0.5px] border-trait bg-fond shadow-flottante">
                  {resultats.length === 0 ? <div className="px-3 py-2 text-legende text-encre-2">Aucun artisan trouvé.</div> : resultats.map((x) => (
                    <button key={x.id} type="button" onClick={() => { setDirecteId(x.id!); setRecherche(""); setResultats(null) }} className="block w-full border-b-[0.5px] border-trait px-3 py-2 text-left last:border-0 hover:bg-fond-2">
                      <div className="truncate text-legende text-encre">{x.entreprise || x.contact || "Sans nom"}</div>
                      <div className="truncate text-colonne text-encre-2">{[x.metier, formaterTelephone(x.telephone)].filter(Boolean).join(" · ") || "sans numéro"}</div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-colonne text-encre-2">À traiter, le plus ancien d'abord</span>
              <span className="chiffres text-colonne text-encre-2">{positionFile ?? "—"} / {liste.length}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1">
              <Bouton taille="sm" variante="discret" icone={<ChevronLeft />} onClick={reculer} disabled={index === 0 && !directeId}>Précédente</Bouton>
              <Bouton taille="sm" variante="discret" icone={<ChevronRight />} onClick={suivant} disabled={!liste.length || index >= liste.length}>Suivante</Bouton>
            </div>
            <div className="-mx-2 mt-2 min-h-0 flex-1 overflow-y-auto border-t-[0.5px] border-trait pt-1.5">
              {chargementFile ? <Chargement texte="Lecture de la file…" /> : liste.length === 0 ? (
                <Vide titre="Rien à appeler" texte={file === "leads" ? "Aucun lead pour l'instant : les campagnes en apporteront." : file === "rappels" ? "Aucun rappel pour aujourd'hui." : "Personne n'a promis de déposer."} />
              ) : liste.map((x, i) => {
                const courante = !directeId && i === index
                return (
                  <button key={x.id} type="button" onClick={() => { setDirecteId(null); setIndex(i) }} aria-current={courante ? "true" : undefined}
                    className={"block w-full rounded-4 px-2 py-1.5 text-left transition-colors " + (courante ? "bg-fond-4" : "hover:bg-fond-2")}>
                    <div className="flex items-baseline gap-2">
                      {file === "leads" ? <span className="h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full bg-signature" /> : null}
                      <span className={"min-w-0 flex-1 truncate text-legende text-encre " + (courante ? "font-medium" : "")}>{x.entreprise || x.contact || "Sans nom"}</span>
                      {faits.has(x.id!) ? <Check size={14} className="shrink-0 text-ok" aria-label="Appelé dans cette session" /> : null}
                    </div>
                    <div className="mt-0.5 truncate text-colonne text-encre-2">{file === "rappels" && x.rappelLe ? `rappel ${dateHeure(x.rappelLe)}` : signaux(x)[0] ?? "—"}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-colonne text-encre-2">
                      <Pastille role={rolePastilleStatut[x.statut]}>{libelleStatutST[x.statut]}</Pastille>
                      {x.metier ? <span className="truncate">{x.metier}</span> : null}
                    </div>
                    <div className="text-colonne text-encre-2">{x.nbAppels ? `${x.nbAppels} appel${s(x.nbAppels)}${x.dernierAppelLe ? `, dernier le ${dateHeure(x.dernierAppelLe)}` : ""}` : "jamais appelé"}</div>
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {!st ? (
            <div className="py-16">
              <Vide titre={liste.length && index >= liste.length ? "File terminée" : "Aucun artisan en cours"} texte={liste.length && index >= liste.length ? "Tous les artisans de cette file sont passés. Change de file ou actualise." : chargementFile ? "La file se charge…" : "Choisis un artisan dans la file, ou cherche-le pour l'appeler directement."} />
            </div>
          ) : (
            <div className="grid gap-x-8 gap-y-8 @min-[820px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0 space-y-4">
                {/* ── 2. L'artisan en cours, au trait ── */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-h1 font-semibold tracking-[-0.015em] text-encre">{st.entreprise || st.contact || "Sans nom"}</h2>
                      {signaux(st).length ? (
                        <p className="mt-1.5 text-legende text-encre">
                          <span className="mr-2 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-signature" />
                          <b className="font-medium">Lead</b> · {signaux(st).join(" · ")}
                        </p>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {st.metier ? <Pastille>{st.metier}</Pastille> : null}
                        {st.zone ? <Pastille>{st.zone}</Pastille> : null}
                        <Pastille role={rolePastilleStatut[st.statut]} point>{libelleStatutST[st.statut]}</Pastille>
                        {st.suivi ? <Pastille role={st.suivi === "va_deposer" || st.suivi === "a_rappeler" ? "attente" : "probleme"} point>{LIBELLE_SUIVI[st.suivi]}</Pastille> : null}
                        <span className="chiffres text-legende text-encre-2">{st.nbAppels ? `${st.nbAppels} appel${s(st.nbAppels)}${st.nbJoints ? `, joint ${st.nbJoints} fois` : ""}${st.dernierAppelLe ? ` · dernier le ${dateHeure(st.dernierAppelLe)}` : ""}` : "jamais appelé"}</span>
                      </div>
                      <div className="mt-1 text-legende text-encre">{[st.contact, st.email].filter(Boolean).join(" · ") || <span className="text-attention">Ni contact ni e-mail connus</span>}</div>
                    </div>
                    <Bouton variante="discret" icone={<ExternalLink />} onClick={() => setFicheOuverte(st.id!)}>Ouvrir la fiche</Bouton>
                  </div>
                  {directeId ? (
                    <Bandeau role="info" className="mt-3" action={<Bouton taille="sm" variante="discret" onClick={() => setDirecteId(null)}>Revenir à la file</Bouton>}>Appel direct, hors file.</Bandeau>
                  ) : null}
                  {st.rappelLe || st.suiviMotif ? (
                    <p className="mt-3 text-legende text-encre-2">{st.rappelLe ? `Rappel prévu le ${dateHeure(st.rappelLe)}${st.suivi === "va_deposer" ? " (avait promis de déposer)" : ""}` : ""}{st.rappelLe && st.suiviMotif ? " · " : ""}{st.suiviMotif}</p>
                  ) : null}

                  <Section titre="Numéros">
                    {!st.telephone ? <Vide titre="Aucun numéro" texte="Complète le mobile sur la fiche." /> : (
                      <div className="flex flex-wrap items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className={"chiffres text-sous-titre font-semibold " + (st.telephoneInvalide ? "text-alerte line-through" : "text-encre")}>{formaterTelephone(st.telephone)}</div>
                          <div className="text-legende text-encre-2">Mobile{st.contact ? ` · ${st.contact}` : ""}{st.telephoneInvalide ? " · numéro en erreur" : ""}</div>
                        </div>
                        <Bouton variante="plein" icone={<Phone />} onClick={appeler} disabled={st.telephoneInvalide}>Appeler</Bouton>
                      </div>
                    )}
                    {appelDepuis ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-legende text-encre">
                        <Pastille role="actif" point>Appel lancé</Pastille>
                        <span className="chiffres font-medium">{dureeLisibleST(Math.round((maintenant.getTime() - appelDepuis) / 1000)) || "0 s"}</span>
                        <span className="text-encre-2">Ringover fait sonner ton poste, puis l'artisan</span>
                      </div>
                    ) : null}
                  </Section>


                  <TachesDuContact key={st.id} contactRef={st.id!} />

                  <Section titre="Note de l'appel">
                    <Zone value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Ce qui s'est dit pendant l'appel… La note part avec le résultat." />
                  </Section>
                </div>

                {/* ── Le résultat, comme la barre des agences ── */}
                <section className="border-y-[0.5px] border-trait py-4" aria-label="Résultat de l'appel">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sous-titre font-semibold text-encre">Qu'est-ce qui s'est passé ?</h2>
                    <span className="chiffres text-colonne text-encre-2">Touches 1 à 4 · Entrée valide · Échap efface</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {RESULTATS_ST.map((r) => <GrosBouton key={r.code} touche={r.touche} libelle={r.libelle} aide={r.aide} choisi={choix.resultat === r.code} onClick={() => setChoix({ ...CHOIX_VIDE, resultat: r.code })} />)}
                  </div>
                  {choix.resultat === "joint" ? (
                    <div className="mt-3 border-t border-fond-4 pt-3">
                      <div className="mb-2 text-colonne font-medium text-encre-2">Et avec l'artisan ?</div>
                      <div className="flex flex-wrap gap-2">
                        {ISSUES_ST.map((i) => <GrosBouton key={i.code} touche={i.touche} libelle={i.libelle} aide={i.aide} choisi={choix.issue === i.code} onClick={() => setChoix({ ...choix, issue: i.code, rappelJour: i.code === "a_rappeler" && !choix.rappelJour ? demain(new Date()) : choix.rappelJour })} />)}
                      </div>
                      {choix.issue === "a_rappeler" ? (
                        <div className="mt-3 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
                          <Etiquette texte="Rappeler le"><Champ type="date" value={choix.rappelJour} onChange={(e) => setChoix({ ...choix, rappelJour: e.target.value })} /></Etiquette>
                          <Etiquette texte="Heure"><Champ type="time" value={choix.rappelHeure} onChange={(e) => setChoix({ ...choix, rappelHeure: e.target.value })} /></Etiquette>
                        </div>
                      ) : null}
                      {choix.issue === "pas_interesse" || choix.issue === "hors_cible" ? (
                        <div className="mt-3 max-w-xs">
                          <Etiquette texte="Motif">
                            <Selecteur value={choix.motif} onChange={(e) => setChoix({ ...choix, motif: e.target.value })}>
                              <option value="">Sans précision</option>
                              {MOTIFS_ST.map((m) => <option key={m} value={m}>{m}</option>)}
                            </Selecteur>
                          </Etiquette>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="mt-3 text-legende text-encre-2">{choix.resultat ? "Le suivi, le rappel et l'arrêt de la séquence se règlent tout seuls en validant." : "Choisis ce qui s'est passé : le suivi et les rappels suivent tout seuls."}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-fond-4 pt-3">
                    <Bouton variante="discret" icone={<ArrowRight />} disabled={occupe || (!!directeId && liste.length === 0)} onClick={suivant}>Suivant sans noter</Bouton>
                    <Bouton variante="plein" icone={<Check />} chargement={occupe} disabled={!pret} onClick={enregistrer}>Valider</Bouton>
                  </div>
                </section>
              </div>

              {/* ── 3. L'historique, au trait, à droite ── */}
              <div className="min-w-0 space-y-6 @min-[820px]:border-l-[0.5px] @min-[820px]:border-trait @min-[820px]:pl-8">
                <Onglets<"qualification" | "historique"> valeur={volet} onChange={setVolet} options={[{ id: "qualification", label: "Qualification" }, { id: "historique", label: "Historique" }]} />
                {volet === "qualification" ? <QualificationST key={st.id} st={st} parNom={compteNom} /> : <>
                <div className="min-w-0">
                  <p className="mb-1 flex items-baseline justify-between gap-2 text-colonne text-encre-2"><span>Historique</span><span className="chiffres">{courant?.appels.length ?? 0} appel{s(courant?.appels.length ?? 0)} · les plus récents en haut</span></p>
                  {!courant || courant.appels.length === 0 ? <Vide titre="Rien encore" texte="Le premier appel ouvrira l'historique." /> : (
                    <ol className="divide-y-[0.5px] divide-trait">
                      {courant.appels.map((a) => (
                        <li key={a.id} className="flex gap-3 py-2.5">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fond-3 text-encre-2"><PhoneOutgoing size={14} /></span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2"><span className="truncate text-legende font-medium text-encre">{LIBELLE_RESULTAT[a.resultat]}{a.issue ? ` · ${LIBELLE_ISSUE[a.issue]}` : ""}</span><span className="chiffres shrink-0 text-colonne text-encre-2">{dateHeure(a.date)}</span></div>
                            <div className="text-colonne text-encre-2">{[a.compteNom, a.motif, a.dureeS ? dureeLisibleST(a.dureeS) : "", a.rappelLe ? `rappel ${dateHeure(a.rappelLe)}` : ""].filter(Boolean).join(" · ")}</div>
                            {a.note ? <p className="mt-1 whitespace-pre-line text-legende text-encre">{a.note}</p> : null}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-colonne text-encre-2">Ce qu'il a reçu et fait</p>
                  {evenements.length === 0 ? <Vide titre="Rien encore" /> : (
                    <ol className="divide-y-[0.5px] divide-trait">
                      {evenements.slice(0, 12).map((e, i) => (
                        <li key={i} className="flex gap-3 py-2.5">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fond-3 text-encre-2">{e.role === "clic" ? <MousePointerClick size={14} /> : e.role === "message" ? <Mail size={14} /> : <Send size={14} />}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2"><span className={"truncate text-legende font-medium " + (e.role === "erreur" ? "text-alerte" : "text-encre")}>{e.texte}</span><span className="chiffres shrink-0 text-colonne text-encre-2">{dateHeure(e.quand)}</span></div>
                            {e.detail ? <div className="text-colonne text-encre-2">{e.detail}</div> : null}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
                </>}
              </div>
            </div>
          )}

          {/* Le pied : qui vient ensuite */}
          {liste.length ? (
            <div className="mt-8 flex items-center justify-between gap-4 border-t-[0.5px] border-trait pt-3">
              <Bouton taille="sm" variante="discret" icone={<ChevronLeft />} onClick={reculer} disabled={index === 0 && !directeId}>Précédent</Bouton>
              {ensuite ? (
                <button type="button" onClick={suivant} className="flex min-w-0 items-center gap-1.5 text-legende text-encre-2 hover:text-encre">
                  <span className="shrink-0">Ensuite :</span>
                  <span className="truncate text-encre">{ensuite.entreprise || ensuite.contact || "Sans nom"}</span>
                  <ChevronRight size={14} className="shrink-0" />
                </button>
              ) : <span className="text-colonne text-encre-2">Dernier de la file</span>}
            </div>
          ) : null}
        </div>
      </div>

      {ficheOuverte ? <FicheArtisan id={ficheOuverte} onFermer={() => setFicheOuverte(null)} onChange={() => { chargerFile(); chargerCompteurs().catch(() => undefined) }} /> : null}
    </div>
  )
}
