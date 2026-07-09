import { supabase } from "./supabase"

// Déclenche un appel via le relais Ringover (Edge Function « rapid-task »).
// `to`   = numéro du prospect à joindre.
// `from` = numéro d'émission attribué (celui qui doit s'afficher / sonner).
//
// Renvoie { ok: true, callId } si le callback est parti, sinon { ok: false, message }.
// callId (chaîne, pour éviter la perte de précision) sert ensuite à demander le RÉSULTAT.
// Ne LANCE jamais d'exception : l'appelant décide quoi faire.
export async function lancerAppelRingover(
  to: string,
  from?: string,
): Promise<{ ok: boolean; message?: string; callId?: string }> {
  if (!supabase) return { ok: false, message: "Supabase non configuré" }
  try {
    const { data, error } = await supabase.functions.invoke("rapid-task", {
      body: { to, from: from ?? "" },
    })
    if (error) {
      // Récupère le VRAI message renvoyé par la fonction (la réponse est dans error.context).
      let msg = error.message
      try {
        const ctx = (error as { context?: Response }).context
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json()
          if (body?.error) msg = body.error + (body.detail ? " — " + body.detail : "")
        }
      } catch {
        /* on garde le message générique */
      }
      return { ok: false, message: msg }
    }
    if (data && (data as { error?: string }).error) {
      return { ok: false, message: (data as { error: string }).error }
    }
    // Extrait le call_id EN CHAÎNE (regex) depuis la réponse texte de Ringover
    // (JSON.parse perdrait la précision : le call_id dépasse 2^53).
    const txt = String((data as { ringover?: string })?.ringover ?? "")
    const callId = txt.match(/"call_id"\s*:\s*(\d+)/)?.[1]
    return { ok: true, callId }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur inconnue" }
  }
}

// Résultat d'un appel terminé : ANSWERED / FAILED / MISSED / VOICEMAIL… + is_failed.
// Sert à prévenir l'utilisateur si le numéro est injoignable / invalide.
// `from`/`to` : les numéros de l'appel — le détail est souvent renseigné même quand
// /calls/current masque l'appelant (« Unknown ») → sert à reconnaître qui a appelé.
export async function detailAppelRingover(callId: string): Promise<{
  ok: boolean
  trouve?: boolean
  last_state?: string | null
  is_failed?: boolean | null
  from?: string
  to?: string
}> {
  if (!supabase || !callId) return { ok: false }
  try {
    const { data, error } = await supabase.functions.invoke("rapid-task", {
      body: { action: "detail", callId },
    })
    if (error) return { ok: false }
    const d = data as {
      trouve?: boolean
      last_state?: string | null
      is_failed?: boolean | null
      from?: string
      to?: string
    }
    return {
      ok: true,
      trouve: d?.trouve,
      last_state: d?.last_state ?? null,
      is_failed: d?.is_failed ?? null,
      from: typeof d?.from === "string" ? d.from : "",
      to: typeof d?.to === "string" ? d.to : "",
    }
  } catch {
    return { ok: false }
  }
}

// Un appel entrant en cours (quelqu'un t'appelle).
export type AppelEntrant = { callId: string; from: string; to: string; status: string }

// Récupère les appels ENTRANTS en cours chez Ringover (via le relais).
// `from` = numéro qui appelle (ou "Unknown" si masqué), `status` = RINGING / ANSWERED.
export async function appelsEntrantsRingover(): Promise<{ ok: boolean; entrants: AppelEntrant[] }> {
  if (!supabase) return { ok: false, entrants: [] }
  try {
    const { data, error } = await supabase.functions.invoke("rapid-task", {
      body: { action: "statut" },
    })
    if (error) return { ok: false, entrants: [] }
    const e = (data as { entrants?: AppelEntrant[] })?.entrants
    return { ok: true, entrants: Array.isArray(e) ? e : [] }
  } catch {
    return { ok: false, entrants: [] }
  }
}

// Demande à Ringover l'état des appels EN COURS (via le relais).
// - `total` : nombre d'appels en cours. ⚠️ Un compte ADMIN voit les appels de TOUTE
//   l'équipe → ne pas s'y fier seul pour suivre SON appel.
// - `actif` : si `callId` est fourni, vrai si CET appel précis est encore en ligne
//   (fiable même en équipe). Sans callId (ou ancien relais), retombe sur total > 0.
// Renvoie { ok: false } en cas de souci (le log ignore alors ce tour de surveillance).
export async function statutAppelsRingover(
  callId?: string,
): Promise<{ ok: boolean; total: number; actif: boolean }> {
  if (!supabase) return { ok: false, total: 0, actif: false }
  try {
    const { data, error } = await supabase.functions.invoke("rapid-task", {
      body: { action: "statut", callId: callId ?? "" },
    })
    if (error) return { ok: false, total: 0, actif: false }
    const d = data as { total?: number; actif?: boolean }
    const total = typeof d?.total === "number" ? d.total : 0
    // Repli : si le relais ne renvoie pas encore `actif` (ancienne version), total > 0.
    const actif = typeof d?.actif === "boolean" ? d.actif : total > 0
    return { ok: true, total, actif }
  } catch {
    return { ok: false, total: 0, actif: false }
  }
}
