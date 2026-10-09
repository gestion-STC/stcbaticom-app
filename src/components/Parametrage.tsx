import { useState } from "react"
import { Onglets } from "../ui"
import SecteursReglage from "./demarchage/SecteursReglage"
import ObjectifsReglage from "./demarchage/ObjectifsReglage"
import EmailsManager from "./EmailsManager"
import NumerosManager from "./NumerosManager"
import ReglagesRecrutement from "./recrutement/ReglagesRecrutement"

type Onglet = "secteurs" | "objectifs" | "emails" | "numeros" | "recrutement"

// Les réglages sont communs aux deux espaces (Mahdi, 08/10/2026). Côté démarchage,
// depuis la refonte du 09/10 : les secteurs, l'objectif et le script, les modèles
// d'e-mail, les numéros d'appel. Les états, les règles d'envoi et les créneaux
// n'ont plus d'onglet : les étapes sont posées par les résultats d'appel, plus
// jamais à la main. Côté recrutement : la machine (cadence, plafonds, plages,
// relances, alertes, exclusions). Les comptes ont leur propre page (admin).
const ONGLETS: { id: Onglet; label: string }[] = [
  { id: "secteurs", label: "Secteurs" },
  { id: "objectifs", label: "Objectifs et script" },
  { id: "emails", label: "Modèles d'e-mail" },
  { id: "numeros", label: "Numéros d'appel" },
  { id: "recrutement", label: "Recrutement" },
]

export default function Parametrage() {
  const [onglet, setOnglet] = useState<Onglet>("secteurs")

  return (
    <div>
      {/* Les onglets en tête, sur toute la largeur. */}
      <div className="bg-fond px-10 pt-2">
        <Onglets valeur={onglet} onChange={setOnglet} options={ONGLETS} />
      </div>

      {onglet === "secteurs" && <div className="page"><SecteursReglage /></div>}
      {onglet === "objectifs" && <div className="page"><ObjectifsReglage /></div>}
      {/* Ces deux écrans gardent leur ancien habillage et leurs propres marges (un autre lot s'en occupe). */}
      {onglet === "emails" && <div className="pt-5"><EmailsManager /></div>}
      {onglet === "numeros" && <div className="pt-5"><NumerosManager /></div>}
      {onglet === "recrutement" && <div className="page"><ReglagesRecrutement /></div>}
    </div>
  )
}
