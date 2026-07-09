import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase, supabaseConfigure } from "./supabase"

// Traduit les erreurs techniques de connexion en message clair pour l'utilisateur.
export function messageErreurConnexion(technique: string): string {
  const t = (technique || "").toLowerCase()
  if (t.includes("invalid login credentials")) return "E-mail ou mot de passe incorrect."
  if (t.includes("rate limit") || t.includes("too many"))
    return "Trop de tentatives — patiente une minute puis réessaie."
  if (t.includes("failed to fetch") || t.includes("network"))
    return "Connexion impossible — vérifie ta connexion internet."
  return technique || "Connexion impossible."
}

export async function seConnecter(email: string, motDePasse: string): Promise<void> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: motDePasse,
  })
  if (error) throw new Error(messageErreurConnexion(error.message))
}

export async function seDeconnecter(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}

// Suit la session en temps réel : null = pas connecté, undefined = en cours de chargement.
// Sans Supabase configuré (mode démo local), on renvoie une pseudo-session pour ne pas bloquer.
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(
    supabaseConfigure ? undefined : ({} as Session),
  )
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: abo } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s))
    return () => abo.subscription.unsubscribe()
  }, [])
  return session
}
