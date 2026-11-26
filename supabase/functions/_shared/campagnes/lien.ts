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

// Le lien COURT d'un SMS d'avis (lot 2, décision 9 du 26/11/2026) : « <page publique>?a=<10 caractères> », environ 55
// caractères au lieu de 172. Avant, le SMS portait ce long lien et une ligne « STOP : » qui le répétait : 465 caractères,
// 4 SMS facturés. La page relit le lien signé auprès de formulaire-campagne (action « court ») et propose la désinscription.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
export const codeCourt = (n = 10) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => ALPHABET[x % ALPHABET.length]).join("")
export const lienCourtDe = (code: string) => `${URL_PUBLIQUE}?a=${code}`

type Lecteur = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
/** Le lien court d'un contact pour une page de campagne : réutilisé s'il existe, sinon créé. Échec : null (le long lien sert). */
export async function lienCourt(sb: Lecteur, campagne: string, creatif: string, contact: string, test: boolean): Promise<string | null> {
  const { data } = await sb.from("cmp_liens_courts").select("code").eq("campagne_id", campagne).eq("creatif_id", creatif).eq("contact_ref", contact).eq("test", test).limit(1).maybeSingle()
  const deja = (data as { code?: string } | null)?.code
  if (deja) return lienCourtDe(deja)
  for (let essai = 0; essai < 3; essai++) {
    const code = codeCourt()
    const { error } = await sb.from("cmp_liens_courts").insert({ code, campagne_id: campagne, creatif_id: creatif, contact_ref: contact, test })
    if (!error) return lienCourtDe(code)
  }
  return null
}
