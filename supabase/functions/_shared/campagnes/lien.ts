// Le lien personnel vers un formulaire ou une page de campagne (09/11/2026) : signé, pour qu'on ne puisse pas
// répondre à la place d'un autre contact. Partagé par le moteur (qui l'écrit) et formulaire-campagne (qui le vérifie).
export const URL_PUBLIQUE = "https://gestion-stc.github.io/stcbaticom-app/"

export async function signer(cle: string, campagne: string, contact: string, test: boolean): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(cle), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const s = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${campagne}|${contact}|${test ? 1 : 0}`))
  return btoa(String.fromCharCode(...new Uint8Array(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 32)
}

export async function lienPublic(cle: string, campagne: string, creatif: string, contact: string, test: boolean): Promise<string> {
  const q = new URLSearchParams({ fc: campagne, f: creatif, k: contact, s: await signer(cle, campagne, contact, test) })
  if (test) q.set("t", "1")
  return `${URL_PUBLIQUE}?${q.toString()}`
}
