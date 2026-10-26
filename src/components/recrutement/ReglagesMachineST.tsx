// ════════════════════════════════════════════════════════════════════════════
// RECRUTEMENT › RÉGLAGES DE LA MACHINE (Mahdi, 26/10/2026 : « les onglets de recrutement
// n'ont rien à voir avec Réglages, ils vont dans Recrutement »). Avant, ils vivaient dans
// la page Réglages commune ; ils sont maintenant dans l'espace Recrutement, trois onglets :
// la machine (cadence, plages, relances, alertes, adresses), les contrats DocuSign et la
// liste d'exclusion. Rien n'a changé dans ce qu'ils règlent.
// ════════════════════════════════════════════════════════════════════════════
import { useState } from "react"
import { EnTetePage, Onglets } from "../../ui"
import ReglagesRecrutement from "./ReglagesRecrutement"
import ContratsModeles from "./ContratsModeles"
import ExclusionsST from "./ExclusionsST"

type Onglet = "machine" | "contrats" | "exclusions"
const ONGLETS: { id: Onglet; label: string }[] = [
  { id: "machine", label: "Machine" },
  { id: "contrats", label: "Contrats à faire signer" },
  { id: "exclusions", label: "Liste d'exclusion" },
]

export default function ReglagesMachineST() {
  const [onglet, setOnglet] = useState<Onglet>("machine")
  return (
    <div className="page">
      <EnTetePage titre="Réglages de la machine" sousTitre="Cadence, plages d'envoi, relances, alertes, contrats DocuSign et artisans à ne jamais contacter." />
      <Onglets valeur={onglet} onChange={setOnglet} options={ONGLETS} className="mb-6" />
      {onglet === "machine" && <ReglagesRecrutement />}
      {onglet === "contrats" && <ContratsModeles />}
      {onglet === "exclusions" && <ExclusionsST />}
    </div>
  )
}
