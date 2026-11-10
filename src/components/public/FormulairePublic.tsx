// LA PAGE QUE VOIT LE PROSPECT (09/11/2026) : un formulaire ou une page de campagne, ouverte depuis un lien personnel.
// Sans connexion : tout passe par la fonction serveur formulaire-campagne, qui vérifie la signature du lien.
import { useEffect, useState, type FormEvent } from "react"
import { Bandeau, Bouton, Case, Champ, Chargement, Etiquette, Zone } from "../../ui"
import { supabase } from "../../lib/supabase"
import ChampQuestion from "../prospection/moteur/ChampQuestion"

type Contenu = { type: "formulaire" | "page" | "avis"; lienGoogle?: string; titre: string; texte: string; videoUrl: string; versId: string; questions: { id: string; libelle: string; type: string; requis: boolean; options: string }[]; dejaRepondu: boolean }

async function appeler<T>(corps: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("Service indisponible.")
  const { data, error } = await supabase.functions.invoke("formulaire-campagne", { body: corps })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const lu = ctx && typeof ctx.json === "function" ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null
    throw new Error(lu?.error ?? "Une erreur est survenue, merci de réessayer.")
  }
  return data as T
}

/** Une vidéo YouTube ou Vimeo s'intègre ; sinon, c'est un fichier vidéo. */
function Video({ url }: { url: string }) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/)?.[1]
  const vimeo = url.match(/vimeo\.com\/(\d+)/)?.[1]
  const src = yt ? `https://www.youtube-nocookie.com/embed/${yt}` : vimeo ? `https://player.vimeo.com/video/${vimeo}` : ""
  if (src) return <iframe title="Vidéo" src={src} className="aspect-video w-full rounded-6 border-0" allow="fullscreen; picture-in-picture" allowFullScreen />
  return <video src={url} controls className="aspect-video w-full rounded-6 bg-black" />
}

export default function FormulairePublic() {
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search))
  const [contenu, setContenu] = useState<Contenu | null>(null)
  const [erreur, setErreur] = useState("")
  const [reponses, setReponses] = useState<Record<string, string>>({})
  const [occupe, setOccupe] = useState(false)
  const [fini, setFini] = useState(false)
  const [note, setNote] = useState(0)
  const [commentaire, setCommentaire] = useState("")
  const [nom, setNom] = useState("")
  const [autorise, setAutorise] = useState(false)
  const [desinscrit, setDesinscrit] = useState(false)
  const lien = { c: params.get("fc"), f: params.get("f"), k: params.get("k"), s: params.get("s"), t: params.get("t") ?? "" }
  const cle = params.toString()

  useEffect(() => {
    let vivant = true
    const q = new URLSearchParams(cle)
    if (q.has("stop")) {
      appeler({ action: "desinscrire", c: q.get("fc"), f: q.get("f"), k: q.get("k"), s: q.get("s"), t: q.get("t") ?? "" })
        .then(() => { if (vivant) setDesinscrit(true) })
        .catch((e) => { if (vivant) setErreur(e instanceof Error ? e.message : String(e)) })
      return () => { vivant = false }
    }
    appeler<Contenu>({ action: "lire", c: q.get("fc"), f: q.get("f"), k: q.get("k"), s: q.get("s"), t: q.get("t") ?? "" })
      .then((d) => { if (vivant) setContenu(d) })
      .catch((e) => { if (vivant) setErreur(e instanceof Error ? e.message : String(e)) })
    return () => { vivant = false }
  }, [cle])

  const envoyer = (e: FormEvent) => {
    e.preventDefault()
    setOccupe(true); setErreur("")
    appeler({ action: "envoyer", ...lien, reponses })
      .then(() => setFini(true))
      .catch((x) => setErreur(x instanceof Error ? x.message : String(x)))
      .finally(() => setOccupe(false))
  }
  const envoyerAvis = (e: FormEvent) => {
    e.preventDefault()
    if (!note) { setErreur("Merci de choisir une note."); return }
    setOccupe(true); setErreur("")
    appeler({ action: "avis", ...lien, note, commentaire, nom, autorise })
      .then(() => setFini(true))
      .catch((x) => setErreur(x instanceof Error ? x.message : String(x)))
      .finally(() => setOccupe(false))
  }
  const suivant = () => { const q = new URLSearchParams(params); q.set("f", contenu!.versId); window.history.pushState({}, "", `?${q.toString()}`); setContenu(null); setParams(q) }

  return (
    <div className="min-h-screen bg-fond-2 px-4 py-8">
      <main className="mx-auto max-w-[620px] rounded-6 bg-fond p-6 shadow-flottante sm:p-8">
        <img src="https://www.stcbatiment.fr/logo-stc.png" alt="STC Bâtiment" width={120} className="mb-6 h-auto" />
        {desinscrit ? (
          <div><h1 className="text-h1 font-semibold text-encre">C'est noté</h1><p className="mt-2 text-corps text-encre-2">Vous ne recevrez plus nos messages.</p></div>
        ) : erreur && !contenu ? <Bandeau role="alerte">{erreur}</Bandeau> : !contenu ? <Chargement texte="Chargement…" /> : fini ? (
          <div><h1 className="text-h1 font-semibold text-encre">Merci !</h1><p className="mt-2 text-corps text-encre-2">{contenu.type === "avis" ? "Nous avons bien reçu votre avis." : "Nous avons bien reçu vos réponses. Notre équipe revient vers vous rapidement."}</p>{contenu.type === "avis" && contenu.lienGoogle ? <p className="mt-4"><a className="text-legende font-medium text-encre underline" href={contenu.lienGoogle} target="_blank" rel="noreferrer">Laisser aussi un avis sur Google</a></p> : null}</div>
        ) : contenu.type === "avis" ? (
          <div className="space-y-5">
            <h1 className="text-h1 font-semibold tracking-[-0.015em] text-encre">{contenu.titre}</h1>
            {contenu.texte ? <p className="whitespace-pre-line text-corps text-encre">{contenu.texte}</p> : null}
            {contenu.dejaRepondu ? <Bandeau role="info">Vous avez déjà donné votre avis. Merci !</Bandeau> : (
              <form onSubmit={envoyerAvis} className="space-y-4">
                <div className="space-y-1.5"><p className="text-legende font-medium text-encre">Votre note *</p><div className="flex gap-1.5">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-pressed={note === n} aria-label={`Note de ${n} sur 5`} onClick={() => setNote(n)} className={`h-10 w-10 rounded-full text-legende ${note === n ? "bg-action text-white" : "border-[0.5px] border-trait text-encre hover:bg-fond-2"}`}>{n}</button>)}</div></div>
                <Etiquette texte="Votre commentaire"><Zone rows={4} value={commentaire} onChange={(ev) => setCommentaire(ev.target.value)} /></Etiquette>
                <Etiquette texte="Le nom à afficher"><Champ value={nom} placeholder="Ex. Claire M." onChange={(ev) => setNom(ev.target.value)} /></Etiquette>
                <Case texte="J'autorise STC Bâtiment à réutiliser mon avis et le nom indiqué dans sa communication." checked={autorise} onChange={(ev) => setAutorise(ev.target.checked)} />
                {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
                <Bouton variante="plein" type="submit" chargement={occupe}>Envoyer mon avis</Bouton>
              </form>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <h1 className="text-h1 font-semibold tracking-[-0.015em] text-encre">{contenu.titre}</h1>
            {contenu.videoUrl ? <Video url={contenu.videoUrl} /> : null}
            {contenu.texte ? <p className="whitespace-pre-line text-corps text-encre">{contenu.texte}</p> : null}
            {contenu.type === "page" ? (contenu.versId ? <Bouton variante="plein" onClick={suivant}>Continuer</Bouton> : null) : contenu.dejaRepondu ? <Bandeau role="info">Vous avez déjà répondu à ce formulaire. Merci !</Bandeau> : (
              <form onSubmit={envoyer} className="space-y-4">
                {contenu.questions.map((q) => <ChampQuestion key={q.id} q={q} valeur={reponses[q.id] ?? ""} onChange={(v) => setReponses((r) => ({ ...r, [q.id]: v }))} />)}
                {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
                <Bouton variante="plein" type="submit" chargement={occupe}>Envoyer</Bouton>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
