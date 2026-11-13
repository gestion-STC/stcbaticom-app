// Le compte LinkedIn d'une campagne (Mahdi, 11/11/2026) : le brancher (par Unipile, le titulaire se connecte lui-même),
// le choisir, et ses plafonds, qui valent pour toutes les campagnes et se comptent pour chaque compte (13/11/2026).
import { useEffect, useState } from "react"
import { ExternalLink } from "lucide-react"
import { Bouton, Champ, Selecteur } from "../../../ui"
import { Bloc } from "../../demarchage/aujourdhui/courtier"
import { Libelle, type MajConfig } from "./Parties"
import type { ConfigCampagne } from "../../../prospection/configCampagne"
import { LINKEDIN_DEPART, type CompteLinkedIn, type ReglageLinkedIn } from "../../../prospection/linkedin"
import { ecrireReglageLinkedIn, etatLinkedIn, lienConnexionLinkedIn, lireReglageLinkedIn } from "../../../lib/linkedinDb"

const ETAT: Record<string, string> = { running: "branché", ok: "branché", connecting: "connexion en cours", disconnected: "déconnecté : à reconnecter", errored: "en erreur : à reconnecter", credentials: "à reconnecter", stopped: "arrêté" }
const brancheOk = (s?: string) => /running|^ok$/i.test(s ?? "")

export default function LinkedInReglage({ cfg, maj }: { cfg: ConfigCampagne; maj: MajConfig }) {
  const [etat, setEtat] = useState<{ branche: boolean; comptes: CompteLinkedIn[] } | null>(null)
  const [reglage, setReglage] = useState<ReglageLinkedIn>(LINKEDIN_DEPART)
  const [erreur, setErreur] = useState("")
  const [occupe, setOccupe] = useState(false)
  const relire = () => { etatLinkedIn().then((x) => { setEtat(x); setErreur("") }).catch((e) => setErreur(e instanceof Error ? e.message : String(e))) }
  useEffect(() => { const t = setTimeout(relire, 0); lireReglageLinkedIn().then(setReglage).catch(() => undefined); return () => clearTimeout(t) }, [])
  const majReglage = (p: Partial<ReglageLinkedIn>) => setReglage((r) => { const n = { ...r, ...p }; void ecrireReglageLinkedIn(n); return n })
  const brancher = async () => {
    setOccupe(true); setErreur("")
    try { const url = await lienConnexionLinkedIn(); window.open(url, "_blank", "noopener") } catch (e) { setErreur(e instanceof Error ? e.message : String(e)) } finally { setOccupe(false) }
  }
  const nb = (v: string, d: number, min = 0) => Math.max(min, Number(v) || d)
  return (
    <Bloc titre="LinkedIn" droite="plafonds comptés pour chaque compte branché"><div className="mt-3 space-y-3">
      {etat && !etat.branche ? <p className="text-colonne text-attention">La clé Unipile n'est pas encore posée dans Supabase (secret UNIPILE_API_KEY). Rien ne partira sur LinkedIn.</p> : null}
      {etat?.comptes.length ? <ul className="space-y-1 text-legende">{etat.comptes.map((k) => <li key={k.id} className="flex flex-wrap items-baseline gap-2"><b className="font-medium">{k.nom}</b><span className={brancheOk(k.statut) ? "text-ok" : "text-attention"}>{ETAT[(k.statut ?? "").toLowerCase()] ?? k.statut}</span></li>)}</ul> : etat?.branche ? <p className="text-colonne text-encre-2">Aucun compte LinkedIn branché.</p> : null}
      <div className="flex flex-wrap items-end gap-3">
        {etat?.comptes.length && etat.comptes.length > 1 ? <Libelle titre="Le compte qui envoie" className="!flex w-60 flex-col justify-between"><Selecteur value={cfg.linkedinCompte ?? ""} onChange={(e) => maj((x) => ({ ...x, linkedinCompte: e.target.value || undefined }))}><option value="">Le premier branché</option>{etat.comptes.map((k) => <option key={k.id} value={k.id}>{k.nom}</option>)}</Selecteur></Libelle> : null}
        {etat?.branche ? <Bouton taille="sm" icone={<ExternalLink />} chargement={occupe} onClick={() => void brancher()}>{etat.comptes.length ? "Brancher un autre compte" : "Brancher un compte LinkedIn"}</Bouton> : null}
        {etat?.branche ? <Bouton taille="sm" variante="discret" onClick={relire}>Actualiser</Bouton> : null}
      </div>
      <p className="text-colonne text-encre-2">Le titulaire du compte se connecte lui-même sur la page qui s'ouvre : son mot de passe ne passe jamais par Baticom.</p>
      <div className="flex flex-wrap items-center gap-2 border-t-[0.5px] border-trait pt-3 text-legende">Pour chaque compte, au plus <Champ type="number" min={1} className="!w-20" aria-label="Actions LinkedIn par jour" value={reglage.parJour} onChange={(e) => majReglage({ parJour: nb(e.target.value, LINKEDIN_DEPART.parJour, 1) })} /> actions par jour et <Champ type="number" min={1} className="!w-20" aria-label="Actions LinkedIn par semaine" value={reglage.parSemaine} onChange={(e) => majReglage({ parSemaine: nb(e.target.value, LINKEDIN_DEPART.parSemaine, 1) })} /> par semaine, de <Champ type="number" min={0} max={23} className="!w-16" aria-label="Heure de début LinkedIn" value={reglage.heureMin} onChange={(e) => majReglage({ heureMin: Math.min(23, nb(e.target.value, 9)) })} /> h à <Champ type="number" min={1} max={24} className="!w-16" aria-label="Heure de fin LinkedIn" value={reglage.heureMax} onChange={(e) => majReglage({ heureMax: Math.min(24, nb(e.target.value, 18, 1)) })} /> h</div>
      <p className="text-colonne text-encre-2">Conseil : LinkedIn accepte environ 100 invitations par semaine. Commence bas (20 par jour) et monte doucement : un compte trop pressé se fait restreindre. Les envois s'étalent dans la journée, 2 au plus toutes les 10 minutes.</p>
      {erreur ? <p className="text-colonne text-alerte">{erreur}</p> : null}
    </div></Bloc>
  )
}
