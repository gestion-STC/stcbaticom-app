// La correction d'orthographe par IA (Mahdi, 12/10/2026) : l'objet et le message du composeur
// passent par la fonction `corriger-texte`, qui s'appuie sur STC Bâtiment. Rien n'est envoyé
// ailleurs que chez nous, et le texte revient tel quel si le service ne répond pas.
import { supabase } from "./supabase"

export type TexteEmail = { objet: string; corps: string }

export async function corrigerTexte(t: TexteEmail): Promise<TexteEmail> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  const { data, error } = await supabase.functions.invoke("corriger-texte", { body: t })
  if (error) {
    let msg = error.message
    try { const ctx = (error as { context?: Response }).context; if (ctx && typeof ctx.json === "function") { const b = await ctx.json(); if (b?.error) msg = b.error } } catch { /* message générique */ }
    throw new Error(msg)
  }
  const d = data as { ok?: boolean; objet?: string; corps?: string; error?: string } | null
  if (!d?.ok) throw new Error(d?.error || "Correction impossible.")
  return { objet: typeof d.objet === "string" ? d.objet : t.objet, corps: typeof d.corps === "string" ? d.corps : t.corps }
}

/** Ce que la correction a changé, en deux mots pour l'écran. */
export function resumeCorrection(avant: TexteEmail, apres: TexteEmail): string {
  const motsAvant = (avant.objet + "\n" + avant.corps).split(/\s+/), motsApres = (apres.objet + "\n" + apres.corps).split(/\s+/)
  if (avant.objet === apres.objet && avant.corps === apres.corps) return "Rien à corriger : le texte était déjà juste."
  let differents = 0
  const n = Math.max(motsAvant.length, motsApres.length)
  for (let i = 0; i < n; i++) if (motsAvant[i] !== motsApres[i]) differents++
  return differents <= 1 ? "Une correction apportée." : `${differents} corrections apportées.`
}
