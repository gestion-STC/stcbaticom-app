// QUI PEUT APPELER UNE FONCTION SERVEUR (Mahdi, 11/11/2026 : « fermer tout ça »).
// Un membre de l'équipe (compte admin ou télépro), ou le serveur lui-même (clé de service, ancienne ou nouvelle).
// Un compte sans rôle n'est PAS un membre : l'inscription publique ne donne accès à rien.

export const ROLES_MEMBRES = ["admin", "telepro"]
export const jetonDe = (req: Request) => (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim()

/** Le compte du jeton, s'il est membre de l'équipe ; sinon null. */
export async function membre(jeton: string): Promise<{ id: string; role: string } | null> {
  if (!jeton) return null
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") || "", Authorization: `Bearer ${jeton}` } })
    if (!r.ok) return null
    const u = await r.json().catch(() => null) as { id?: string; app_metadata?: { role?: string } } | null
    const role = String(u?.app_metadata?.role ?? "")
    return u?.id && ROLES_MEMBRES.includes(role) ? { id: u.id, role } : null
  } catch { return null }
}

/** La clé de service : celle de l'environnement, ou une ancienne clé de service (les tâches planifiées), vérifiée auprès d'Auth. */
export async function estServeur(jeton: string): Promise<boolean> {
  if (!jeton) return false
  if (jeton === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) return true
  if (!jeton.startsWith("eyJ")) return false
  try {
    const b = jeton.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    if (JSON.parse(atob(b + "=".repeat((4 - (b.length % 4)) % 4)))?.role !== "service_role") return false
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/users?per_page=1`, { headers: { apikey: jeton, Authorization: `Bearer ${jeton}` } })
    return r.ok
  } catch { return false }
}
