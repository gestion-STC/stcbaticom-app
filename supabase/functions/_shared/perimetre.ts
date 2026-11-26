// LE PÉRIMÈTRE DE L'APPELANT, CÔTÉ SERVEUR (26/11/2026, audit D6). Les fonctions écrivent avec la clé de service :
// elles doivent appliquer elles-mêmes la règle « ce qui n'est pas offert à l'écran est refusé ». Deux outils :
//  · espacesDeLAppelant : les boîtes du compte (fonction de la base `mes_espaces()`, la même que l'écran et la RLS) ;
//  · optionsDeLAppelant : les options d'un client Supabase qui lit AVEC LE JETON de l'appelant, donc sous la RLS (un
//    message qu'il ne voit pas à l'écran est introuvable).
// Sans dépendance (testé par vitest : src/lib/boiteF7.test.ts).

export type EspaceMail = "demarchage" | "recrutement"

/** Règle pure : un administrateur a les deux boîtes ; un téléprospecteur, celles que la base lui donne. */
export function espaceAutorise(role: string, espaces: readonly string[] | null, espace: EspaceMail): boolean {
  if (role === "admin") return true
  return Array.isArray(espaces) && espaces.includes(espace)
}

/** Les options d'un client qui agit au nom de l'appelant (clé publique + son jeton). */
export function optionsDeLAppelant(jeton: string) {
  return { global: { headers: { Authorization: `Bearer ${jeton}` } }, auth: { persistSession: false, autoRefreshToken: false } }
}

// Lu sans le type global « Deno » : ce fichier est aussi chargé par les tests de l'écran (Node).
const env = (k: string) => (globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k) ?? ""

/** Les boîtes de l'appelant, lues par la base ; null si la lecture échoue (on refuse alors, jamais l'inverse). */
export async function espacesDeLAppelant(jeton: string): Promise<string[] | null> {
  try {
    const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/mes_espaces`, {
      method: "POST",
      headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
      body: "{}",
    })
    if (!r.ok) return null
    const data = await r.json().catch(() => null)
    return Array.isArray(data) ? data.map(String) : null
  } catch {
    return null
  }
}
