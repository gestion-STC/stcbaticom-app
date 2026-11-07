// Le périmètre du compte connecté (voir perimetre.ts). Un administrateur l'a tout de suite ;
// un téléprospecteur attend la lecture de sa fonction (null pendant ce temps : rien ne s'affiche
// qu'il n'aurait pas le droit de voir).
import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { roleDeSession } from "./comptes"
import { chargerFonctions, type FonctionsParCompte } from "./fonctionsComptes"
import type { Espace } from "./messagesDb"
import { espacesVisibles, LES_DEUX } from "./perimetre"

export function usePerimetre(session: Session | null | undefined): Espace[] | null {
  const role = roleDeSession(session)
  const [fonctions, setFonctions] = useState<FonctionsParCompte | null>(null)
  useEffect(() => {
    if (role !== "telepro") return
    let annule = false
    chargerFonctions()
      .then((f) => !annule && setFonctions(f))
      .catch(() => !annule && setFonctions({}))
    return () => {
      annule = true
    }
  }, [role])
  if (role !== "telepro") return LES_DEUX
  if (!fonctions) return null
  return espacesVisibles(role, fonctions[session?.user?.id ?? ""])
}
