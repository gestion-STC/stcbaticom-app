// ════════════════════════════════════════════════════════════════════════════
// LES MAILS PRÉPARÉS PAR L'IA APRÈS UN APPEL (24/10/2026, Mahdi : « à la fin de
// l'appel, avoir tout de suite la possibilité de générer le mail personnalisé »).
//
// Après « Valider le résultat », la session passe à l'agence suivante : le mail de
// l'appel d'avant arrive donc dans « Mails à envoyer » (en-tête de la session), et
// sur la fiche de l'agence. Il n'est JAMAIS envoyé tout seul : « Relire et envoyer »
// ouvre l'envoi habituel, pré-rempli, modifiable, signé comme d'habitude.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronUp, Mail, Sparkles } from "lucide-react"
import {
  appelsIaDeLAgence, destinatairePourAppel, ecarterMail, marquerMailEnvoye, mesMailsIa, relancerAnalyse, type AppelIa,
} from "../../demarchage/appelsIa"
import { dureeLisible } from "../../demarchage/analyseOutils"
import { dateHeureCourte } from "../../demarchage/sessionOutils"
import type { Destinataire } from "../../lib/destinataire"
import { Bandeau, Bouton, Carte, Panneau, Pastille, TitreCarte, type RolePastille } from "../../ui"
import EnvoyerEmailModal from "../EnvoyerEmailModal"

const EN_COURS = new Set(["en_attente", "en_cours"])

function etatDe(a: AppelIa): { role: RolePastille; libelle: string } {
  if (a.mailEnvoyeLe) return { role: "fait", libelle: "Mail envoyé" }
  if (a.mailEcarteLe) return { role: "inerte", libelle: "Écarté" }
  switch (a.statut) {
    case "en_attente": return { role: "attente", libelle: "En attente de l'enregistrement" }
    case "en_cours": return { role: "attente", libelle: "Analyse en cours…" }
    case "pret": return a.mailPertinent ? { role: "actif", libelle: "Mail prêt" } : { role: "inerte", libelle: "Pas de mail utile" }
    case "trop_court": return { role: "inerte", libelle: "Appel trop court" }
    case "sans_enregistrement": return { role: "probleme", libelle: "Pas d'enregistrement" }
    default: return { role: "probleme", libelle: "Erreur" }
  }
}

/** Une carte : l'état, le résumé de l'appel, le mail proposé et ses boutons. */
export function CarteMailIa({ appel, avecAgence, onChange }: { appel: AppelIa; avecAgence: boolean; onChange: () => void }) {
  const [resumeOuvert, setResumeOuvert] = useState(false)
  const [envoiPour, setEnvoiPour] = useState<Destinataire | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState("")
  const e = etatDe(appel)
  const fini = Boolean(appel.mailEnvoyeLe || appel.mailEcarteLe)

  async function agir(f: () => Promise<void>) {
    setOccupe(true); setErreur("")
    try { await f(); onChange() } catch (x) { setErreur(x instanceof Error ? x.message : String(x)) } finally { setOccupe(false) }
  }
  async function ouvrirEnvoi() {
    setErreur("")
    try {
      const d = await destinatairePourAppel(appel)
      if (!d) { setErreur("Agence introuvable."); return }
      setEnvoiPour(d)
    } catch (x) { setErreur(x instanceof Error ? x.message : String(x)) }
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {avecAgence ? <span className="min-w-0 flex-1 truncate font-medium text-encre">{appel.agenceNom || "Agence"}</span> : <span className="flex-1 text-legende text-encre-2">Appel du {dateHeureCourte(appel.creeLe)}</span>}
        <Pastille role={e.role} point={EN_COURS.has(appel.statut)}>{e.libelle}</Pastille>
      </div>
      {avecAgence ? <p className="text-colonne text-encre-3">Appel du {dateHeureCourte(appel.creeLe)}{appel.dureeS ? ` · ${dureeLisible(appel.dureeS)}` : ""}{appel.compteNom ? ` · ${appel.compteNom}` : ""}</p> : null}

      {appel.statut === "pret" && appel.mailPertinent && !fini ? (
        <div className="rounded-4 border border-trait bg-fond-2 p-3">
          <p className="text-legende font-semibold text-encre">{appel.mailObjet}</p>
          <p className="mt-1 line-clamp-4 whitespace-pre-line text-legende text-encre-2">{appel.mailCorps}</p>
        </div>
      ) : null}
      {appel.statut === "sans_enregistrement" ? <p className="text-colonne text-encre-2">{appel.erreur || "Ringover n'a pas d'enregistrement pour cet appel."}</p> : null}
      {appel.statut === "erreur" ? <p className="text-colonne text-alerte">{appel.erreur}</p> : null}
      {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}

      <div className="flex flex-wrap items-center gap-2">
        {appel.statut === "pret" && appel.mailPertinent && !fini ? (
          <Bouton taille="sm" variante="plein" icone={<Mail />} onClick={() => void ouvrirEnvoi()}>Relire et envoyer</Bouton>
        ) : null}
        {appel.statut === "pret" && !fini ? (
          <Bouton taille="sm" variante="discret" chargement={occupe} onClick={() => void agir(() => ecarterMail(appel.id))}>Écarter</Bouton>
        ) : null}
        {(appel.statut === "erreur" || appel.statut === "sans_enregistrement") && !fini ? (
          <Bouton taille="sm" variante="contour" chargement={occupe} onClick={() => void agir(() => relancerAnalyse(appel.id, appel.activiteId))}>Réessayer</Bouton>
        ) : null}
        {appel.resume ? (
          <Bouton taille="sm" variante="discret" icone={resumeOuvert ? <ChevronUp /> : <ChevronDown />} onClick={() => setResumeOuvert((v) => !v)}>Résumé de l'appel</Bouton>
        ) : null}
      </div>
      {resumeOuvert ? <p className="whitespace-pre-line rounded-4 bg-fond-2 p-3 text-colonne text-encre-2">{appel.resume}</p> : null}

      {envoiPour ? (
        <EnvoyerEmailModal
          destinataire={envoiPour}
          brouillon={{ objet: appel.mailObjet, corps: appel.mailCorps }}
          onEnvoye={() => { void marquerMailEnvoye(appel.id).catch(() => {}) }}
          onClose={() => { setEnvoiPour(null); onChange() }}
        />
      ) : null}
    </li>
  )
}

/** Relit tant qu'une analyse est en route (toutes les 5 s), sinon toutes les 30 s. */
function useRelecture<T extends AppelIa>(charger: () => Promise<T[]>, actif: boolean, rafraichir: unknown) {
  const [liste, setListe] = useState<T[]>([])
  const [erreur, setErreur] = useState("")
  const enRoute = liste.some((a) => EN_COURS.has(a.statut))
  const vivant = useRef(true)
  const relire = useCallback(() => {
    charger().then((l) => { if (vivant.current) { setListe(l); setErreur("") } }).catch((e) => { if (vivant.current) setErreur(e instanceof Error ? e.message : String(e)) })
  }, [charger])
  useEffect(() => {
    vivant.current = true
    if (!actif) return () => { vivant.current = false }
    const premier = setTimeout(relire, 0)
    const t = setInterval(() => { if (document.visibilityState === "visible") relire() }, enRoute ? 5000 : 30_000)
    return () => { vivant.current = false; clearTimeout(premier); clearInterval(t) }
  }, [relire, actif, enRoute, rafraichir])
  return { liste, erreur, relire }
}

/** Le bouton de la session : « Mails à envoyer », avec le nombre de mails prêts. */
export function BoutonMailsIa({ rafraichir = 0 }: { rafraichir?: number }) {
  const [ouvert, setOuvert] = useState(false)
  const { liste, erreur, relire } = useRelecture(mesMailsIa, true, rafraichir)
  const prets = liste.filter((a) => a.statut === "pret" && a.mailPertinent).length
  const enRoute = liste.filter((a) => EN_COURS.has(a.statut)).length
  return (
    <>
      <button
        type="button"
        onClick={() => { relire(); setOuvert(true) }}
        title={prets ? `${prets} mail${prets > 1 ? "s" : ""} prêt${prets > 1 ? "s" : ""} à relire` : enRoute ? "Analyse en cours" : "Les mails préparés par l'IA après tes appels"}
        className="relative inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-4 border border-trait bg-fond px-3 text-legende font-medium text-encre-2 transition-colors hover:border-trait-fort hover:bg-fond-4 hover:text-encre focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-signature focus-visible:ring-offset-2"
      >
        <Sparkles size={15} />
        <span>Mails à envoyer</span>
        {prets ? <span className="chiffres ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-signature px-1.5 text-colonne font-semibold text-white">{prets}</span> : null}
        {!prets && enRoute ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signature" aria-label="analyse en cours" /> : null}
      </button>
      {ouvert ? (
        <Panneau titre="Mails à envoyer" sousTitre="Préparés par l'IA à partir de tes appels des dernières 24 h. Rien ne part sans toi." onFermer={() => setOuvert(false)}>
          {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
          {liste.length === 0 ? (
            <p className="text-legende text-encre-2">Rien pour l'instant. Après un appel où quelqu'un a décroché, le mail arrive ici en général moins d'une minute après le résultat noté.</p>
          ) : (
            <ul className="divide-y divide-fond-4">
              {liste.map((a) => <CarteMailIa key={a.id} appel={a} avecAgence onChange={relire} />)}
            </ul>
          )}
        </Panneau>
      ) : null}
    </>
  )
}

/** Sur la fiche d'une agence : ses appels analysés et leurs mails (rien s'il n'y en a pas). */
export function AppelsIaAgence({ agenceId, carte = false }: { agenceId: string; carte?: boolean }) {
  const charger = useCallback(() => appelsIaDeLAgence(agenceId), [agenceId])
  const { liste, erreur, relire } = useRelecture(charger, true, agenceId)
  if (!liste.length && !erreur) return null
  const contenu = (
    <>
      {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
      <ul className="divide-y divide-fond-4">
        {liste.map((a) => <CarteMailIa key={a.id} appel={a} avecAgence={false} onChange={relire} />)}
      </ul>
    </>
  )
  if (carte) {
    return (
      <Carte>
        <TitreCarte>Appels analysés par l'IA</TitreCarte>
        <div className="px-5 pb-4">{contenu}</div>
      </Carte>
    )
  }
  return (
    <section className="space-y-1">
      <h3 className="flex items-center gap-1.5 text-legende font-semibold text-encre"><Sparkles size={14} /> Appels analysés par l'IA</h3>
      {contenu}
    </section>
  )
}
