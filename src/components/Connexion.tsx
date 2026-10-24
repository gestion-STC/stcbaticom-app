import { useState, type FormEvent } from "react"
import { Loader2, Lock } from "lucide-react"
import { seConnecter } from "../lib/auth"
import LogoBaticom from "./LogoBaticom"

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
    <div className="flex min-h-screen items-center justify-center bg-fond-2 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <LogoBaticom className="text-4xl" />
        </div>

        <form
          onSubmit={valider}
          className="rounded-[14px] border-[0.5px] border-trait bg-fond p-6"
        >
          <h1 className="flex items-center gap-2 text-sous-titre font-semibold text-encre">
            <Lock size={15} className="text-encre-2" /> Connexion
          </h1>
          <p className="mt-1 text-legende text-encre-2">
            Espace réservé — connecte-toi avec ton compte.
          </p>

          <label className="mt-5 block text-colonne text-encre-2">
            Adresse e-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoFocus
              className="mt-1 h-8 w-full rounded-4 border border-transparent bg-fond-3 px-3 text-legende text-encre focus:border-trait-fort focus:bg-fond focus:outline-none"
            />
          </label>

          <label className="mt-4 block text-colonne text-encre-2">
            Mot de passe
            <input
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete="current-password"
              className="mt-1 h-8 w-full rounded-4 border border-transparent bg-fond-3 px-3 text-legende text-encre focus:border-trait-fort focus:bg-fond focus:outline-none"
            />
          </label>

          {erreur && <p className="mt-3 text-legende text-alerte">{erreur}</p>}

          <button
            type="submit"
            disabled={enCours || !email.trim() || !motDePasse}
            className="mt-5 flex h-[34px] w-full items-center justify-center gap-2 rounded-full bg-action px-4 text-legende font-medium text-white hover:bg-action-survol disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enCours && <Loader2 size={15} className="animate-spin" />}
            Se connecter
          </button>
        </form>
      </div>
    </div>
  )
}
