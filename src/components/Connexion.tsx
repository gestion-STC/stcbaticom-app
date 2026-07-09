import { useState, type FormEvent } from "react"
import { Hexagon, Loader2, Lock } from "lucide-react"
import { seConnecter } from "../lib/auth"

// Écran de connexion : la base est protégée, il faut un compte pour entrer.
// (La bascule vers l'application se fait toute seule via useSession dans App.)
export default function Connexion() {
  const [email, setEmail] = useState("")
  const [motDePasse, setMotDePasse] = useState("")
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState("")

  async function valider(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !motDePasse) return
    setEnCours(true)
    setErreur("")
    try {
      await seConnecter(email, motDePasse)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err))
      setEnCours(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Hexagon size={22} strokeWidth={2.2} />
          </div>
          <span className="text-lg font-semibold tracking-wide text-slate-900">
            STC <span className="text-blue-600">BÂTIMENTS</span>
          </span>
        </div>

        <form
          onSubmit={valider}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h1 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Lock size={16} className="text-slate-400" /> Connexion
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Espace réservé — connecte-toi avec ton compte.
          </p>

          <label className="mt-5 block text-sm font-medium text-slate-700">
            Adresse e-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Mot de passe
            <input
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
            />
          </label>

          {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}

          <button
            type="submit"
            disabled={enCours || !email.trim() || !motDePasse}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enCours && <Loader2 size={15} className="animate-spin" />}
            Se connecter
          </button>
        </form>
      </div>
    </div>
  )
}
