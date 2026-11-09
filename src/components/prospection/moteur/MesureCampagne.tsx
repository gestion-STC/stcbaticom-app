// L'onglet Mesure : l'entonnoir de la campagne, étape par étape, et ce que coûte un lead.
import { useEffect, useMemo, useState } from "react"
import { Bandeau } from "../../../ui"
import { Bloc } from "../../demarchage/aujourdhui/courtier"
import { chargerLeadsRecus } from "../../../lib/leadsRecusDb"
import type { ConfigCampagne } from "../../../prospection/configCampagne"
import type { Campagne, Envoi, Evenement, Inscription } from "../../../prospection/modele"
import { mesureCampagne, type PositionCampagne } from "../../../prospection/mesureCampagne"

const euros = (x: number | null) => (x === null ? "—" : `${x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)
const COULEUR = { LEAD: "bg-signature", "GAGNÉ": "bg-ok" } as const

export default function MesureCampagne({ campagne, cfg, inscriptions, envois, evenements }: { campagne: Campagne; cfg: ConfigCampagne; inscriptions: Inscription[]; envois: Envoi[]; evenements: Evenement[] }) {
  const [positions, setPositions] = useState<PositionCampagne[]>([])
  const [erreur, setErreur] = useState("")
  useEffect(() => { let vivant = true; chargerLeadsRecus(new Date()).then((r) => { if (vivant) setPositions(r.positions) }).catch((e) => { if (vivant) setErreur(e instanceof Error ? e.message : String(e)) }); return () => { vivant = false } }, [])
  const m = useMemo(() => mesureCampagne(cfg, campagne.id, campagne.coutSms, inscriptions, envois, evenements, positions), [cfg, campagne.id, campagne.coutSms, inscriptions, envois, evenements, positions])
  return (
    <div className="space-y-6">
      {erreur ? <Bandeau role="alerte">{erreur}</Bandeau> : null}
      <Bloc titre="L'entonnoir de cette campagne" droite="il suit ton parcours">
        <ol className="mt-3 divide-y-[0.5px] divide-trait">
          {m.lignes.map((l, i) => <li key={i} className="flex items-center gap-2 py-2 text-legende">
            <span>{l.libelle}</span>
            {l.badge ? <span className={`rounded-full px-2 text-[10px] font-medium leading-4 text-white ${COULEUR[l.badge]}`}>{l.badge}</span> : null}
            <span className="chiffres ml-auto font-medium text-encre">{l.n.toLocaleString("fr-FR")}</span>
            <span className="chiffres w-12 text-right text-colonne text-encre-2">{l.part === null ? "" : `${l.part} %`}</span>
          </li>)}
        </ol>
        <p className="mt-3 text-colonne text-encre-2">Le pourcentage compare chaque ligne à la précédente.</p>
      </Bloc>
      <Bloc titre="Ce que ça coûte">
        <div className="mt-3 grid grid-cols-2 gap-4 text-legende @min-[700px]:grid-cols-4">
          <div><p className="text-colonne text-encre-2">SMS envoyés</p><p className="chiffres mt-1 font-medium">{m.sms.toLocaleString("fr-FR")} · {euros(m.coutSms)}</p></div>
          <div><p className="text-colonne text-encre-2">Leads</p><p className="chiffres mt-1 font-medium">{m.leads.toLocaleString("fr-FR")}</p></div>
          <div><p className="text-colonne text-encre-2">Coût par lead</p><p className="chiffres mt-1 font-medium">{euros(m.coutParLead)}</p></div>
          <div><p className="text-colonne text-encre-2">Coût par gagné</p><p className="chiffres mt-1 font-medium">{euros(m.coutParGagne)}</p></div>
        </div>
        <p className="mt-3 text-colonne text-encre-2">Seuls les SMS sont comptés : les mails ne sont pas facturés à l'unité.</p>
      </Bloc>
    </div>
  )
}
