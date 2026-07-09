import { useState } from "react"
import { ListChecks, Mail, GitBranch, Clock, Phone } from "lucide-react"
import EtatsManager from "./EtatsManager"
import EmailsManager from "./EmailsManager"
import ReglesManager from "./ReglesManager"
import CreneauxManager from "./CreneauxManager"
import NumerosManager from "./NumerosManager"

type Onglet = "etats" | "emails" | "regles" | "creneaux" | "numeros"

const onglets: { id: Onglet; label: string; icon: typeof Mail }[] = [
  { id: "etats", label: "États", icon: ListChecks },
  { id: "emails", label: "Emails", icon: Mail },
  { id: "regles", label: "Règles d'envoi", icon: GitBranch },
  { id: "creneaux", label: "Créneaux d'appel", icon: Clock },
  { id: "numeros", label: "Numéros d'appel", icon: Phone },
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
      </div>
    </div>
  )
}
