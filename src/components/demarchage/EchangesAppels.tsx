// ════════════════════════════════════════════════════════════════════════════
// CE QUI S'EST DIT DANS LES APPELS (26/10/2026, Mahdi : « quand j'ai un prospect où il y a
// déjà eu un appel, je veux savoir ce qui s'est dit dans l'appel précédent »).
//
// Trois morceaux, tous lus dans `appels_ia` (les appels transcrits et analysés) :
//   · DernierEchange — en haut de la fiche (session de call et fiche agence) : la dernière
//     conversation, qui l'a eue, ce qui a été convenu, les objections ;
//   · ResumeSousAppel — sous chaque appel du fil : son résumé, en deux lignes ;
//   · PanneauEchange — « Lire l'échange » : le résumé complet et la conversation mot pour mot.
// Un appel sans enregistrement n'a rien à montrer : ces morceaux se taisent.
// 14/11/2026 : l'enregistrement s'écoute sur la fiche, et un appel pas (encore) analysé par l'IA s'affiche quand même,
// avec son état et « Relancer l'analyse ».
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useState } from "react"
import { MessageSquareText, RefreshCw } from "lucide-react"
import { relancerAnalyse, type AppelIa, type Interet } from "../../demarchage/appelsIa"
import { useEchanges } from "./useEchanges"
import { dureeLisible } from "../../demarchage/analyseOutils"
import { dateHeureCourte } from "../../demarchage/sessionOutils"
import { Bandeau, Bouton, Panneau, Pastille, type RolePastille } from "../../ui"

const INTERET: Record<Interet, { role: RolePastille; libelle: string }> = {
  fort: { role: "fait", libelle: "Intérêt fort" },
  moyen: { role: "info", libelle: "Intérêt moyen" },
  faible: { role: "attente", libelle: "Intérêt faible" },
  nul: { role: "inerte", libelle: "Pas d'intérêt" },
}

/** L'enregistrement de l'appel, à écouter. */
function Ecoute({ appel }: { appel: AppelIa }) {
  if (!appel.enregistrementUrl) return null
  return <audio controls preload="none" src={appel.enregistrementUrl} className="mt-2 h-9 w-full max-w-[420px]" aria-label="Écouter l'enregistrement de l'appel" />
}

/** L'analyse IA pas (encore) faite : pourquoi, et la relancer. */
function EtatAnalyse({ appel }: { appel: AppelIa }) {
  const [etat, setEtat] = useState("")
  if (appel.statut === "pret") return null
  const credit = /credit balance|crédit/i.test(appel.erreur)
  const texte = appel.statut === "erreur"
    ? credit ? "Analyse IA non faite : le crédit de l'IA est épuisé." : "Analyse IA non faite : une erreur est survenue."
    : appel.statut === "en_attente" || appel.statut === "en_cours" ? "Analyse IA en cours…" : ""
  if (!texte) return null
  const relancer = async () => { setEtat("…"); try { await relancerAnalyse(appel.id, appel.activiteId); setEtat("Relancée : le résumé arrive dans quelques minutes.") } catch (e) { setEtat(e instanceof Error ? e.message : String(e)) } }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-colonne text-attention">
      {texte}
      {appel.statut === "erreur" ? <button type="button" className="inline-flex items-center gap-1 font-medium text-encre underline-offset-4 hover:underline" onClick={() => void relancer()}><RefreshCw size={12} /> Relancer l'analyse</button> : null}
      {etat ? <span className="text-encre-2">{etat}</span> : null}
    </p>
  )
}

/** « Tu as appelé le 21/10, Horlann · 3 min » */
function enTete(a: AppelIa): string {
  return `Appel du ${dateHeureCourte(a.creeLe)}${a.compteNom ? ` · ${a.compteNom}` : ""}${a.dureeS ? ` · ${dureeLisible(a.dureeS)}` : ""}`
}

/** En haut de la fiche : la dernière conversation (rien si aucun appel n'a été transcrit). */
export function DernierEchange({ agenceId, version, className = "" }: { agenceId: string; version?: unknown; className?: string }) {
  const { prets, erreur } = useEchanges(agenceId, version)
  const [ouvert, setOuvert] = useState<AppelIa | null>(null)
  if (erreur) return <Bandeau role="alerte" className={className}>Appels précédents illisibles : {erreur}</Bandeau>
  const a = prets[0]
  if (!a) return null
  const interet = a.interet ? INTERET[a.interet] : null
  const objections = a.analyse?.objections ?? []
  return (
    <section className={`rounded-6 border-[0.5px] border-trait bg-fond-2 px-4 py-3 ${className}`} aria-label="La dernière fois">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-legende font-semibold text-encre"><MessageSquareText size={14} /> La dernière fois</span>
        <span className="chiffres text-colonne text-encre-2">{enTete(a)}</span>
        {interet ? <Pastille role={interet.role}>{interet.libelle}</Pastille> : null}
        {prets.length > 1 ? <span className="text-colonne text-encre-2">{prets.length} appels enregistrés</span> : null}
      </div>
      {a.analyse?.prochaineEtape ? (
        <p className="mt-2 text-legende text-encre"><span className="text-encre-2">Convenu : </span>{a.analyse.prochaineEtape}</p>
      ) : null}
      {a.resume ? <p className="mt-1.5 line-clamp-6 whitespace-pre-line text-legende text-encre-2">{a.resume}</p> : null}
      <EtatAnalyse appel={a} />
      <Ecoute appel={a} />
      {objections.length ? (
        <p className="mt-1.5 text-colonne text-encre-2">
          Objections : {objections.map((o) => `${o.libelle}${o.levee ? " (levée)" : ""}`).join(" · ")}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Bouton taille="sm" onClick={() => setOuvert(a)}>Lire l'échange</Bouton>
        {prets.slice(1, 4).map((p) => (
          <Bouton key={p.id} taille="sm" variante="discret" onClick={() => setOuvert(p)}>{dateHeureCourte(p.creeLe)}</Bouton>
        ))}
      </div>
      {ouvert ? <PanneauEchange appel={ouvert} onFermer={() => setOuvert(null)} /> : null}
    </section>
  )
}

/** Sous un appel du fil : son résumé, replié sur deux lignes, et l'accès à la conversation. */
export function ResumeSousAppel({ appel }: { appel: AppelIa }) {
  const [ouvert, setOuvert] = useState(false)
  const fermer = useCallback(() => setOuvert(false), [])
  return (
    <div className="mt-1">
      {appel.resume ? <p className="line-clamp-2 whitespace-pre-line text-colonne text-encre-2">{appel.resume}</p> : null}
      <EtatAnalyse appel={appel} />
      <Ecoute appel={appel} />
      <button type="button" className="mt-0.5 inline-flex items-center gap-1 text-colonne font-medium text-encre underline-offset-4 hover:underline" onClick={() => setOuvert(true)}>
        <MessageSquareText size={12} /> Lire l'échange
      </button>
      {ouvert ? <PanneauEchange appel={appel} onFermer={fermer} /> : null}
    </div>
  )
}

/** Le résumé complet, ce qui a été convenu, les objections et la conversation mot pour mot. */
export function PanneauEchange({ appel, onFermer }: { appel: AppelIa; onFermer: () => void }) {
  const interet = appel.interet ? INTERET[appel.interet] : null
  const an = appel.analyse
  return (
    <Panneau titre={appel.agenceNom || "L'échange"} sousTitre={enTete(appel)} onFermer={onFermer} largeur="w-[560px]">
      <div className="space-y-5">
        {appel.enregistrementUrl || appel.statut !== "pret" ? (
          <section>
            <h3 className="mb-1 text-colonne font-medium text-encre-2">L'enregistrement</h3>
            <Ecoute appel={appel} />
            <EtatAnalyse appel={appel} />
          </section>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {interet ? <Pastille role={interet.role}>{interet.libelle}</Pastille> : null}
          {an ? <Pastille role={an.decideurJoint ? "fait" : "inerte"}>{an.decideurJoint ? "Décideur au téléphone" : "Pas le décideur"}</Pastille> : null}
        </div>
        {an?.prochaineEtape ? (
          <section>
            <h3 className="mb-1 text-colonne font-medium text-encre-2">Ce qui a été convenu</h3>
            <p className="text-legende text-encre">{an.prochaineEtape}</p>
          </section>
        ) : null}
        {appel.resume ? (
          <section>
            <h3 className="mb-1 text-colonne font-medium text-encre-2">Résumé</h3>
            <p className="whitespace-pre-line text-legende text-encre">{appel.resume}</p>
          </section>
        ) : null}
        {an?.objections.length ? (
          <section>
            <h3 className="mb-1 text-colonne font-medium text-encre-2">Objections</h3>
            <ul className="space-y-2">
              {an.objections.map((o, i) => (
                <li key={i} className="text-legende">
                  <span className="font-medium text-encre">{o.libelle}</span>
                  <span className="text-encre-2">{o.levee ? " · levée" : " · pas levée"}</span>
                  <p className="text-encre-2">« {o.extrait} »</p>
                  {o.reponse ? <p className="text-encre-2">Réponse : {o.reponse}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section>
          <h3 className="mb-1 text-colonne font-medium text-encre-2">La conversation, mot pour mot</h3>
          {appel.transcription ? (
            <div className="space-y-1.5 rounded-6 bg-fond-2 p-3">
              {appel.transcription.split("\n").map((l, i) => {
                const m = l.match(/^(Voix \d+)\s*:\s*(.*)$/)
                return m ? (
                  <p key={i} className="text-legende"><span className="font-medium text-encre">{m[1]} : </span><span className="text-encre">{m[2]}</span></p>
                ) : <p key={i} className="text-legende text-encre">{l}</p>
              })}
            </div>
          ) : <p className="text-legende text-encre-2">Pas de transcription pour cet appel.</p>}
        </section>
      </div>
    </Panneau>
  )
}
