// L'envoi d'un essai de créatif, à soi-même (Mahdi, 10/11/2026).
import { supabase } from "./supabase"

async function appeler(fonction: string, body: Record<string, unknown>) {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  const { data, error } = await supabase.functions.invoke(fonction, { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const lu = ctx && typeof ctx.json === "function" ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null
    throw new Error(lu?.error ?? error.message)
  }
  if ((data as { error?: string } | null)?.error) throw new Error(String((data as { error: string }).error))
}

export const envoyerEssaiMail = (to: string, subject: string, html: string) => appeler("envoyer-email", { espace: "demarchage", to, subject, html })
export const envoyerEssaiSms = (to: string, message: string) => appeler("envoyer-sms", { to, message })
