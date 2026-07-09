import { supabase } from "./supabase"

// Petit magasin de réglages clé/valeur (signature, objectif mensuel, etc.)

export async function lireParametre(cle: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from("parametres")
    .select("valeur")
    .eq("cle", cle)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.valeur ?? null
}

export async function ecrireParametre(cle: string, valeur: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase
    .from("parametres")
    .upsert({ cle, valeur }, { onConflict: "cle" })
  if (error) throw new Error(error.message)
}
