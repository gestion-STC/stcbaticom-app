// Lancer ou reprendre une campagne : la même vérification et la même confirmation partout (25/11/2026).
// DialogueLancement : la fenêtre (récapitulatif, ce qui bloque, le bouton) ; l'éditeur y ajoute ses réglages.
// ConfirmerLancement : pour la liste des campagnes et le suivi, qui n'ont pas l'audience sous la main : il la recalcule
// comme l'éditeur (filtres, domaines bloqués, exclusions du moteur) avant de proposer de lancer.
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Check, X } from "lucide-react"
import { Bouton, Dialogue } from "../../../ui"
import { useDepot } from "../../../prospection/depot"
import { estEligible, type Campagne } from "../../../prospection/modele"
import { configDe } from "../../../prospection/configCampagne"
import { domaineBloque } from "../../../prospection/pareFeu"
import { estBaseAvis } from "../../../prospection/avis"
import { raisonsExclusion, type FaitsExclusion } from "../../../prospection/audience"
import { avecDejaClients } from "../../../prospection/exclusions"
import { controleLancement, type ControleLancement } from "../../../prospection/lancement"
import { lireParametre } from "../../../lib/parametresDb"
import { chargerEtatInstantly } from "../../../lib/etatInstantly"
import { chargerFaitsExclusion } from "../../../lib/exclusionsCampagne"
import { nombreComptesLinkedIn } from "../../../lib/linkedinDb"
import { useVue } from "../outils"

const libelleHeure = (h: number) => (h >= 24 ? "minuit" : `${Math.floor(h)} h${h % 1 ? " 30" : ""}`)

export function DialogueLancement({ c, controle, eligibles, unite, reprise, onLancer, onFermer, children, chargement }: {
  c: Campagne; controle: ControleLancement; eligibles: number; unite: string; reprise?: boolean
  onLancer: () => void; onFermer: () => void; children?: ReactNode; chargement?: boolean
}) {
  const verbe = reprise ? "Reprendre" : "Lancer"
  return (
    <Dialogue titre={`${verbe} pour de vrai ?`} description={`${eligibles.toLocaleString("fr-FR")} ${unite} sont concernés. Les envois partent de ${libelleHeure(c.rythme.heureMin)} à ${libelleHeure(c.rythme.heureMax)}, ${c.rythme.parJour.toLocaleString("fr-FR")} nouveaux contacts par jour au plus.`} onFermer={onFermer}
      pied={<><Bouton onClick={onFermer}>Annuler</Bouton><Bouton variante="plein" icone={<Check />} disabled={chargement || Boolean(controle.bloquant)} title={controle.bloquant ?? undefined} onClick={onLancer}>{verbe} la campagne</Bouton></>}>
      <div className="space-y-3">
        {chargement ? <p className="text-legende text-encre-2">Vérification en cours…</p> : <ul className="space-y-1">{controle.lignes.map(([t, ok]) => <li key={t} className="flex items-center gap-2 text-legende">{ok ? <Check size={14} className="shrink-0 text-ok" /> : <X size={14} className="shrink-0 text-alerte" />}{t}</li>)}</ul>}
        {controle.bloquant && !chargement ? <p className="text-colonne text-alerte">Impossible de {verbe.toLowerCase()} : {controle.bloquant.toLowerCase()}. Ouvre « Modifier » pour corriger.</p> : null}
        {children}
      </div>
    </Dialogue>
  )
}

type Lu = { domaines: string[]; ecartCommun: number | null; faits: FaitsExclusion | null; comptesLi: number; refus: string | null; erreur: string }

/** La confirmation depuis la liste ou le suivi : vérifie comme l'éditeur, puis passe la campagne « active ». */
export function ConfirmerLancement({ c, onFermer }: { c: Campagne; onFermer: () => void }) {
  const v = useVue()
  const depot = useDepot()
  const [lu, setLu] = useState<Lu | null>(null)
  useEffect(() => {
    let vivant = true
    const sur = <T,>(p: Promise<T>, defaut: T, erreurs: string[], quoi: string) => p.catch((e) => { erreurs.push(`${quoi} : ${e instanceof Error ? e.message : String(e)}`); return defaut })
    const erreurs: string[] = []
    void Promise.all([
      sur(lireParametre("domaines_bloques").then((x) => { const l = JSON.parse(x || "[]") as unknown; return Array.isArray(l) ? (l as string[]) : [] }), [] as string[], erreurs, "domaines bloqués illisibles"),
      sur(lireParametre("cmp_ecart_campagnes").then((x) => (x && Number.isFinite(Number(x)) ? Number(x) : null)), null, erreurs, "écart entre campagnes illisible"),
      sur(chargerFaitsExclusion(c.baseId), null, erreurs, "exclusions illisibles"),
      sur(nombreComptesLinkedIn(), 0, erreurs, "comptes LinkedIn illisibles"),
      sur(chargerEtatInstantly().then((x) => x.erreur), null, erreurs, "état d'Instantly illisible"),
    ]).then(([domaines, ecartCommun, faits, comptesLi, refus]) => { if (vivant) setLu({ domaines, ecartCommun, faits, comptesLi, refus, erreur: erreurs.join(" · ") }) })
    return () => { vivant = false }
  }, [c.baseId])
  const cfg = useMemo(() => configDe(c), [c])
  const avis = estBaseAvis(c.baseId)
  const base = v.base(c.baseId)
  const eligibles = useMemo(() => {
    if (!lu) return 0
    const parFiltres = avecDejaClients(v.contacts.filter((x) => x.baseId === c.baseId && !domaineBloque(x.email, lu.domaines)), cfg.garde.exclusions).filter((x) => estEligible(x, c))
    if (avis) return parFiltres.length
    const raison = raisonsExclusion({ campagneId: c.id, garde: cfg.garde, ecartCommun: lu.ecartCommun, envois: v.etat.envois, evenements: v.etat.evenements, inscriptions: v.etat.inscriptions, maintenant: v.etat.maintenant, baseId: c.baseId, relanceMois: cfg.qualification.relanceMois, faits: lu.faits })
    return parFiltres.filter((x) => !raison(x)).length
  }, [lu, v, c, cfg, avis])
  const enCours = v.etat.inscriptions.filter((i) => i.campagneId === c.id && i.statut === "en_cours").length
  const controle = controleLancement({ cfg, eligibles, enCours, unite: base?.unite ?? "contacts", avis, comptesLinkedIn: lu?.comptesLi ?? 0, refusInstantly: lu?.refus ?? null })
  return (
    <DialogueLancement c={c} controle={controle} eligibles={eligibles} unite={base?.unite ?? "contacts"} reprise={c.statut === "pause"} chargement={!lu} onFermer={onFermer}
      onLancer={() => { depot.changerStatut(c.id, "active"); onFermer() }}>
      {lu?.erreur ? <p className="text-colonne text-attention">Lecture incomplète ({lu.erreur}) : le nombre de contacts peut être faux.</p> : null}
      <p className="text-legende text-encre-2">Pour vérifier un mail avant, utilise « M'envoyer un essai » dans l'onglet Créatifs : aucun contact n'est touché.</p>
    </DialogueLancement>
  )
}
