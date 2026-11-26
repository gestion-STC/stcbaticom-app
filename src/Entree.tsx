// Le point d'entrée : un lien de campagne (?fc=…) ouvre la page du prospect, sans connexion ni logiciel.
import { Suspense, lazy } from "react"
import App from "./App"

const FormulairePublic = lazy(() => import("./components/public/FormulairePublic"))
const FormationPublique = lazy(() => import("./components/public/FormationPublique"))

export default function Entree() {
  if (new URLSearchParams(window.location.search).has("formation")) return <Suspense fallback={null}><FormationPublique /></Suspense>
  // « ?a=… » : le lien court d'un SMS d'avis (lot 2, 27/11/2026).
  if (new URLSearchParams(window.location.search).has("fc") || new URLSearchParams(window.location.search).has("a")) return <Suspense fallback={null}><FormulairePublic /></Suspense>
  return <App />
}
