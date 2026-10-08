import { useState } from "react"
import { ListChecks, Mail, GitBranch, Clock, Phone, Gauge } from "lucide-react"
import EtatsManager from "./EtatsManager"
import EmailsManager from "./EmailsManager"
import ReglesManager from "./ReglesManager"
import CreneauxManager from "./CreneauxManager"
import NumerosManager from "./NumerosManager"
import ReglagesRecrutement from "./recrutement/ReglagesRecrutement"

type Onglet = "etats" | "emails" | "regles" | "creneaux" | "numeros" | "recrutement"

// Les réglages sont communs aux deux espaces (Mahdi, 08/10/2026) : ceux du
// démarchage (états, e-mails, règles, créneaux, numéros) et ceux de la machine
// de recrutement (cadence, plafonds, plages, relances, alertes, exclusions).
// L'écran Machine, lui, ne garde que l'interrupteur et les campagnes : tout ce
// qui se règle rarement est ici. Les comptes ont leur propre page (admin).
const onglets: { id: Onglet; label: string; icon: typeof Mail }[] = [
  { id: "etats", label: "États", icon: ListChecks },
  { id: "emails", label: "Emails", icon: Mail },
  { id: "regles", label: "Règles d'envoi", icon: GitBranch },
  { id: "creneaux", label: "Créneaux d'appel", icon: Clock },
  { id: "numeros", label: "Numéros d'appel", icon: Phone },
  { id: "recrutement", label: "Recrutement", icon: Gauge },
]

export default function Parametrage() {
  const [onglet, setOnglet] = useState<Onglet>("etats")

  return (
    <div>
      {/* Sous-onglets */}
      <div className="-mt-6 mb-2 flex gap-1 border-b border-slate-200 px-8">
        {onglets.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setOnglet(id)}
            className={
              "flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors " +
              (onglet === id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800")
            }
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      <div className="pt-2">
        {onglet === "etats" && <EtatsManager />}
        {onglet === "emails" && <EmailsManager />}
        {onglet === "regles" && <ReglesManager />}
        {onglet === "creneaux" && <CreneauxManager />}
        {onglet === "numeros" && <NumerosManager />}
        {onglet === "recrutement" && <div className="mx-auto max-w-[1100px] px-8 py-4"><ReglagesRecrutement /></div>}
      </div>
    </div>
  )
}
