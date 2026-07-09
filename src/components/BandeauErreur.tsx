import { AlertTriangle } from "lucide-react"

// Bandeau affiché quand la base de données n'a pas pu être chargée.
// Évite d'afficher de fausses données de démo en faisant croire que tout va bien.
export default function BandeauErreur({ message }: { message: string }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-500" />
      <div>
        <p className="font-medium">Connexion à la base impossible</p>
        <p className="mt-0.5 text-red-700">
          Les données n'ont pas pu être chargées. Vérifiez votre connexion internet et rechargez la page.
          {message ? ` (${message})` : ""}
        </p>
      </div>
    </div>
  )
}
