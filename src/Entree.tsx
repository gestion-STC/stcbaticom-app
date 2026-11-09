// Le point d'entrée : un lien de campagne (?fc=…) ouvre la page du prospect, sans connexion ni logiciel.
import { Suspense, lazy } from "react"
import App from "./App"

const FormulairePublic = lazy(() => import("./components/public/FormulairePublic"))

export default function Entree() {
  if (new URLSearchParams(window.location.search).has("fc")) return <Suspense fallback={null}><FormulairePublic /></Suspense>
  return <App />
}
