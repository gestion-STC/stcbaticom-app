// PRÉVENIR LE BUREAU (13/11/2026) : un mail à l'adresse d'alerte du recrutement (Réglages › Recrutement), une seule
// fois par événement (table st_alertes, clé unique). Jamais bloquant : une alerte qui échoue ne casse rien.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export async function alerterBureau(sb: SupabaseClient, cle: string, objet: string, texte: string): Promise<void> {
  try {
    const { data: pil } = await sb.from("st_pilotage").select("alerte_email").limit(1).maybeSingle()
    const to = String((pil as { alerte_email?: string | null } | null)?.alerte_email ?? "").trim()
    if (!to) return
    const { error: deja } = await sb.from("st_alertes").insert({ cle, detail: objet.slice(0, 200) })
    if (deja) return // déjà prévenu pour cet événement
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b">${echapper(texte).replace(/\n/g, "<br>")}</div>`
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/envoyer-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ espace: "recrutement", to, subject: objet, html }),
    })
    // Le mail n'est pas parti : on retire la marque, pour que le prochain événement puisse prévenir.
    if (!r.ok) await sb.from("st_alertes").delete().eq("cle", cle)
  } catch (e) {
    console.error("[ALERTE-BUREAU]", e)
  }
}
