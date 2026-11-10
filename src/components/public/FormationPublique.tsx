// La formation vue par le sous-traitant, depuis son lien personnel (10/11/2026) : pensée pour le téléphone, sans compte.
import { useEffect, useState } from "react"
import { Bandeau, Bouton, Chargement } from "../../ui"
import { supabase } from "../../lib/supabase"

type Accueil = { nom: string; etat: string; score: number | null; scenarioFait: boolean; scenarioScore: number | null; lienScenario: string; essais: number; essaisMax: number; questions: number; seuil: number; enCours: boolean; blocage: string }
type Question = { id: string; theme: string; texte: string; reponses: string[]; deja: { reponse: string; juste: boolean; bonne: string; explication: string } | null }
type Fin = { score: number; reussi: boolean; seuil: number; blocage: string }

async function appeler<T>(corps: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Service indisponible.")
  const { data, error } = await supabase.functions.invoke("formation-st", { body: corps })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const lu = ctx && typeof ctx.json === "function" ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null
    throw new Error(lu?.error ?? "Une erreur est survenue, merci de réessayer.")
  }
  return data as T
}

export default function FormationPublique() {
  const [jeton] = useState(() => new URLSearchParams(window.location.search).get("formation") ?? "")
  const [accueil, setAccueil] = useState<Accueil | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [i, setI] = useState(0)
  const [retour, setRetour] = useState<{ reponse: string; juste: boolean; bonne: string; explication: string } | null>(null)
  const [fin, setFin] = useState<Fin | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState("")
  useEffect(() => {
    // Au retour de la mission d'entraînement, son résultat arrive dans le lien : on l'enregistre, puis on l'efface de l'adresse.
    const envoi = async () => {
      const brut = window.location.hash.match(/^#s=(.+)$/)?.[1]
      if (brut) {
        const r = JSON.parse(decodeURIComponent(escape(atob(brut)))) as Record<string, unknown>
        await appeler({ action: "scenario", jeton, ...r })
        window.history.replaceState(null, "", window.location.pathname + window.location.search)
      }
      setAccueil(await appeler<Accueil>({ action: "charger", jeton }))
    }
    envoi().catch((e) => setErreur(e instanceof Error ? e.message : String(e)))
  }, [jeton])
  const agir = async (f: () => Promise<void>) => { setOccupe(true); setErreur(""); try { await f() } catch (e) { setErreur(e instanceof Error ? e.message : String(e)) } finally { setOccupe(false) } }
  const commencer = () => agir(async () => { const r = await appeler<{ questions: Question[] }>({ action: "commencer", jeton }); const k = r.questions.findIndex((q) => !q.deja); setQuestions(r.questions); setI(k < 0 ? r.questions.length - 1 : k); setRetour(k < 0 ? r.questions.at(-1)?.deja ?? null : null) })
  const repondre = (q: Question, reponse: string) => agir(async () => { const r = await appeler<{ juste: boolean; bonne: string; explication: string }>({ action: "repondre", jeton, questionId: q.id, reponse }); setRetour({ ...r, reponse }) })
  const suivant = () => { if (questions && i + 1 < questions.length) { setI(i + 1); setRetour(null) } else void agir(async () => setFin(await appeler<Fin>({ action: "terminer", jeton }))) }
  const q = questions?.[i]
  return (
    <div className="flex min-h-dvh justify-center bg-fond px-4 py-8 text-encre">
      <div className="w-full max-w-[480px] space-y-5">
        <p className="text-colonne text-encre-2">STC Bâtiment · Formation</p>
        {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
        {!accueil && !erreur ? <Chargement /> : null}
        {accueil && !questions && !fin ? accueil.etat === "reussi" ? <div className="space-y-2"><h1 className="text-[22px] font-semibold">Formation réussie</h1><p className="text-legende text-encre-2">Bravo{accueil.score != null ? `, ${accueil.score} %` : ""}. STC Bâtiment revient vers toi.</p></div> : <div className="space-y-4"><h1 className="text-[22px] font-semibold leading-tight">Bonjour{accueil.nom ? ` ${accueil.nom}` : ""}, voici ta formation</h1><p className="text-legende text-encre-2">{accueil.scenarioFait ? <>Mission d'entraînement terminée{accueil.scenarioScore != null ? ` : ${accueil.scenarioScore} %` : ""}. Il reste {accueil.questions} questions, il faut {accueil.seuil} % pour réussir.</> : <>D'abord une mission d'entraînement sur l'application, avec une mission fictive. Ensuite {accueil.questions} questions, il faut {accueil.seuil} % pour réussir.</>}</p><p className="text-colonne text-encre-2">Essai {Math.min(accueil.essais + 1, accueil.essaisMax)} sur {accueil.essaisMax}</p>{!accueil.scenarioFait ? <a className="block rounded-4 bg-action px-4 py-3 text-center text-legende font-medium text-white" href={accueil.lienScenario}>Commencer ma mission d'entraînement</a> : accueil.blocage ? <Bandeau role="info">{accueil.blocage}</Bandeau> : <Bouton variante="plein" className="w-full" chargement={occupe} onClick={() => void commencer()}>{accueil.enCours ? "Reprendre" : "Commencer"}</Bouton>}</div> : null}
        {q && !fin ? <div className="space-y-4"><div className="h-1.5 overflow-hidden rounded-full bg-fond-4"><div className="h-full rounded-full bg-action" style={{ width: `${((i + 1) / questions!.length) * 100}%` }} /></div><p className="text-colonne text-encre-2">Question {i + 1} sur {questions!.length} · {q.theme}</p><h2 className="text-[19px] font-semibold leading-snug">{q.texte}</h2><div className="space-y-2">{q.reponses.map((r) => <button key={r} type="button" disabled={occupe || Boolean(retour)} onClick={() => void repondre(q, r)} className={`w-full rounded-4 border-[0.5px] px-3 py-3 text-left text-legende ${retour && r === retour.bonne ? "border-ok bg-ok/10" : retour?.reponse === r ? "border-alerte bg-alerte/10" : "border-trait"}`}>{r}</button>)}</div>{retour ? <><p className="text-legende"><b className="font-medium">{retour.juste ? "Bonne réponse." : "Pas tout à fait."}</b> {retour.explication}</p><Bouton variante="plein" className="w-full" chargement={occupe} onClick={suivant}>{i + 1 < questions!.length ? "Suivant" : "Voir mon résultat"}</Bouton></> : null}</div> : null}
        {fin ? <div className="space-y-3 pt-6 text-center"><p className="chiffres text-[44px] font-semibold">{fin.score} %</p><h2 className="text-sous-titre font-semibold">{fin.reussi ? "Formation réussie" : "Formation à refaire"}</h2><p className="text-legende text-encre-2">{fin.reussi ? "STC Bâtiment revient vers toi." : fin.blocage || "Au prochain essai, tu auras d'autres questions."}</p></div> : null}
      </div>
    </div>
  )
}
