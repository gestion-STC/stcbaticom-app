// ════════════════════════════════════════════════════════════════════════════
// La version en ligne (13/10/2026). Un onglet ouvert depuis le matin garde
// l'ancienne version de l'écran, et donc les anciennes règles d'appel. Toutes les
// 2 minutes, on relit la page publiée : si elle charge un autre bundle, cet onglet
// est PÉRIMÉ — la session de call refuse alors d'appeler tant qu'on n'a pas rechargé.
// ════════════════════════════════════════════════════════════════════════════

const INTERVALLE_MS = 2 * 60_000
let perimee = false
const abonnes = new Set<(p: boolean) => void>()

/** Le nom du bundle principal dans un HTML (« assets/index-XXXX.js »), ou null. */
export function bundleDe(html: string): string | null {
  return /assets\/index-[\w-]+\.js/.exec(html)?.[0] ?? null
}

export const versionPerimee = (): boolean => perimee
export function suivreVersion(f: (p: boolean) => void): () => void {
  abonnes.add(f)
  return () => abonnes.delete(f)
}

let lancee = false
export function veillerVersion(): void {
  if (lancee || typeof window === "undefined" || import.meta.env.DEV) return
  lancee = true
  const actuel = bundleDe(document.documentElement.outerHTML)
  if (!actuel) return
  const verifier = async () => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}index.html?v=${Date.now()}`, { cache: "no-store" })
      if (!r.ok) return
      const enLigne = bundleDe(await r.text())
      if (enLigne && enLigne !== actuel && !perimee) {
        perimee = true
        abonnes.forEach((f) => f(true))
      }
    } catch {
      /* hors ligne : on réessaiera */
    }
  }
  setInterval(() => void verifier(), INTERVALLE_MS)
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void verifier() })
}
