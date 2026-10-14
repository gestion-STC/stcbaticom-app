// ════════════════════════════════════════════════════════════════════════════
// RAPPELS DE RDV — un bandeau discret en bas à droite quand l'heure approche.
//
// Monté une fois dans App, sans props. Il lit les RDV du jour non faits dans
// `activites` (via chargerAgenda) toutes les 60 s, et montre chaque RDV de
// N min avant à M min après son heure (Réglages : 5 et 20), avec la notification du navigateur si
// elle est autorisée (une seule par RDV). Il ne peut pas naviguer : il montre
// l'agence, le contact, le type, et un bouton « Fait ».
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Clock, MapPin, Phone, Video, X } from "lucide-react"
import { supabaseConfigure } from "../lib/supabase"
import { chargerAgenda, terminerTache, type TacheAgenda } from "../demarchage/db"
import { useReglages } from "../demarchage/reglages"
import { dansLaFenetreDeRappel, debutDuJour, finDuJour, heureCourte, libelleRelatif } from "../demarchage/aujourdhuiOutils"
import { Bandeau, Bouton, Carte, Pastille } from "../ui"

const RELIRE_MS = 60_000
// Tenir dans l'écran (Mahdi, 14/10 : « ils débordent ») : trois rappels visibles, le reste replié.
const VISIBLES = 3
const HORLOGE_MS = 30_000

function libelleType(type: string): string {
  if (type === "visio") return "visio"
  if (type === "sur_place") return "sur place"
  return "téléphone"
}
function IconeType({ type }: { type: string }) {
  if (type === "visio") return <Video size={12} />
  if (type === "sur_place") return <MapPin size={12} />
  return <Phone size={12} />
}

export default function RappelsRdv() {
  const [rdvs, setRdvs] = useState<TacheAgenda[]>([])
  const [maintenant, setMaintenant] = useState(() => new Date())
  const [ignores, setIgnores] = useState<Set<string>>(() => new Set())
  // « Fait » refusé par la base (13/10) : on le dit, au lieu de faire réapparaître le RDV sans un mot.
  const [erreur, setErreur] = useState("")
  const [tousVisibles, setTousVisibles] = useState(false)
  // Les RDV déjà signalés par une notification (pour ne pas la répéter), et la
  // dernière liste lue (l'horloge la relit entre deux lectures de la base).
  const notifiesRef = useRef<Set<string>>(new Set())
  const rdvsRef = useRef<TacheAgenda[]>([])
  const enVie = useRef(true)
  const { reglages } = useReglages()
  const avant = reglages?.rdv_rappel_avant_minutes ?? null
  const apres = reglages?.rdv_rappel_apres_minutes ?? null
  const dansLaFenetre = useCallback((echeance: string | null, ms: number) => avant !== null && apres !== null && dansLaFenetreDeRappel(echeance, ms, avant, apres), [avant, apres])

  const notifier = useCallback((liste: TacheAgenda[], now: Date) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return
    for (const r of liste) {
      if (!r.echeance || !dansLaFenetre(r.echeance, now.getTime()) || notifiesRef.current.has(r.id)) continue
      notifiesRef.current.add(r.id)
      try {
        const n = new Notification(`Rappel RDV — ${heureCourte(r.echeance)}`, {
          body: [r.agenceNom, r.contactNom, r.agenceTelephone].filter(Boolean).join(" · "),
          tag: r.id,
        })
        n.onclick = () => { window.focus(); n.close() }
      } catch {
        // Un navigateur qui refuse : le bandeau à l'écran suffit.
      }
    }
  }, [dansLaFenetre])

  const relire = useCallback(async () => {
    if (!supabaseConfigure) return
    const now = new Date()
    try {
      const lignes = (await chargerAgenda(debutDuJour(now), finDuJour(now), { seulementOuvertes: true })).filter((t) => t.type === "rdv")
      if (!enVie.current) return
      rdvsRef.current = lignes
      setRdvs(lignes)
      setMaintenant(now)
      notifier(lignes, now)
    } catch {
      // Silencieux : un rappel ne doit jamais casser l'application.
    }
  }, [notifier])

  useEffect(() => {
    enVie.current = true
    // L'autorisation des notifications se demande une seule fois.
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => {})
    const premier = setTimeout(relire, 0)
    const lecture = setInterval(relire, RELIRE_MS)
    const horloge = setInterval(() => { const now = new Date(); setMaintenant(now); notifier(rdvsRef.current, now) }, HORLOGE_MS)
    return () => { enVie.current = false; clearTimeout(premier); clearInterval(lecture); clearInterval(horloge) }
  }, [relire, notifier])

  const actifs = rdvs.filter((r) => !ignores.has(r.id) && dansLaFenetre(r.echeance, maintenant.getTime()))
  if (actifs.length === 0 && !erreur) return null

  const ignorer = (id: string) => setIgnores((x) => new Set(x).add(id))
  const fait = (r: TacheAgenda) => {
    setRdvs((liste) => liste.filter((x) => x.id !== r.id))
    rdvsRef.current = rdvsRef.current.filter((x) => x.id !== r.id)
    setErreur("")
    terminerTache(r.id).catch((e) => {
      console.error("[RappelsRdv] tache_terminer", e)
      setErreur(`RDV « ${r.agenceNom || "agence"} » non marqué fait : ${e instanceof Error ? e.message : String(e)}`)
      relire()
    })
  }

  return (
    // La pile ne dépasse jamais la fenêtre (largeur et hauteur bornées, défilement interne) et reste
    // au-dessus de la bulle Ringover du coin bas-droit, qui recouvrait le bouton « Fait ».
    <div className="fixed bottom-20 right-4 z-[80] flex max-h-[calc(100dvh-6rem)] w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 overflow-y-auto overscroll-contain">
      {erreur ? <Bandeau role="alerte" className="shadow-flottante" action={<Bouton taille="sm" variante="discret" onClick={() => setErreur("")}>Fermer</Bouton>}>{erreur}</Bandeau> : null}
      {actifs.length > VISIBLES ? (
        <button
          type="button"
          onClick={() => setTousVisibles((v) => !v)}
          className="shrink-0 rounded-4 border border-trait bg-fond px-3 py-2 text-left text-legende font-medium text-encre shadow-flottante hover:bg-fond-4"
        >
          {tousVisibles ? "Replier les rappels" : `+ ${actifs.length - VISIBLES} autre${actifs.length - VISIBLES > 1 ? "s" : ""} rappel${actifs.length - VISIBLES > 1 ? "s" : ""} de RDV`}
        </button>
      ) : null}
      {(tousVisibles ? actifs : actifs.slice(0, VISIBLES)).map((r) => (
        <Carte key={r.id} className="shrink-0 p-3 shadow-flottante">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-4 bg-signature-doux text-signature"><Clock size={16} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-legende font-semibold text-encre">
                RDV de {r.echeance ? heureCourte(r.echeance) : "—"}
                {r.echeance ? <span className="font-normal text-encre-2"> · {libelleRelatif(r.echeance, maintenant)}</span> : null}
              </p>
              <p className="truncate text-legende text-encre">{r.agenceNom || "Agence inconnue"}</p>
              {r.contactNom || r.agenceTelephone ? <p className="chiffres truncate text-legende text-encre-2">{[r.contactNom, r.agenceTelephone].filter(Boolean).join(" · ")}</p> : null}
              {r.titre && r.titre !== "RDV" ? <p className="truncate text-colonne text-encre-2">{r.titre}</p> : null}
              <Pastille role="info" className="mt-1.5"><IconeType type={r.rdvType} /> {libelleType(r.rdvType)}</Pastille>
            </div>
            <button type="button" onClick={() => ignorer(r.id)} aria-label="Ignorer ce rappel" title="Ignorer" className="rounded-3 p-1 text-encre-2 hover:bg-fond-4 hover:text-encre">
              <X size={16} />
            </button>
          </div>
          <div className="mt-2 flex justify-end">
            <Bouton taille="sm" icone={<Check />} onClick={() => fait(r)}>Fait</Bouton>
          </div>
        </Carte>
      ))}
    </div>
  )
}
