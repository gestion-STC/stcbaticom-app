// DocuSign, côté serveur (11/10/2026) : le jeton (JWT signé avec la clé RSA du
// compte), les appels à l'API eSignature, et deux petits outils purs
// (clé PKCS#1 → PKCS#8, nombre de pages d'un PDF) testés depuis le dépôt.
//
// Secrets : DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID,
// DOCUSIGN_BASE_URI (https://demo.docusign.net en bac à sable), DOCUSIGN_OAUTH_HOST
// (account-d.docusign.com en bac à sable, account.docusign.com en réel),
// DOCUSIGN_PRIVATE_KEY_B64 (la clé privée PEM, en base64).

export type ConfigDocusign = { integrationKey: string; userId: string; accountId: string; baseUri: string; oauthHost: string; privateKeyPem: string }

export function configDepuisEnv(env: (k: string) => string | undefined): ConfigDocusign {
  const lire = (k: string) => { const v = env(k); if (!v) throw new Error(`Secret ${k} manquant`); return v }
  const pemB64 = lire("DOCUSIGN_PRIVATE_KEY_B64")
  return {
    integrationKey: lire("DOCUSIGN_INTEGRATION_KEY"), userId: lire("DOCUSIGN_USER_ID"), accountId: lire("DOCUSIGN_ACCOUNT_ID"),
    baseUri: (env("DOCUSIGN_BASE_URI") || "https://demo.docusign.net").replace(/\/$/, ""), oauthHost: env("DOCUSIGN_OAUTH_HOST") || "account-d.docusign.com",
    privateKeyPem: new TextDecoder().decode(base64VersOctets(pemB64)),
  }
}

// ── Outils purs ──
export function base64VersOctets(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64.replace(/\s+/g, ""))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
export function octetsVersBase64(o: Uint8Array): string {
  let s = ""
  for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode(...o.subarray(i, i + 0x8000))
  return btoa(s)
}
const base64url = (o: Uint8Array | string) => octetsVersBase64(typeof o === "string" ? new TextEncoder().encode(o) : o).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

/** La longueur DER d'un bloc. */
function longueurDer(n: number): number[] {
  if (n < 0x80) return [n]
  const octets: number[] = []
  for (let v = n; v > 0; v >>= 8) octets.unshift(v & 0xff)
  return [0x80 | octets.length, ...octets]
}
/**
 * DocuSign donne une clé « RSA PRIVATE KEY » (PKCS#1) ; WebCrypto n'importe que du
 * PKCS#8. On enveloppe le DER PKCS#1 dans la structure PKCS#8 :
 * SEQUENCE { INTEGER 0, SEQUENCE { OID rsaEncryption, NULL }, OCTET STRING { pkcs1 } }.
 */
export function pemVersPkcs8Der(pem: string): Uint8Array<ArrayBuffer> {
  const corps = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")
  const der = base64VersOctets(corps)
  if (/BEGIN PRIVATE KEY/.test(pem)) return der // déjà en PKCS#8
  if (!/BEGIN RSA PRIVATE KEY/.test(pem)) throw new Error("Clé privée : format PEM inconnu")
  const algo = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]
  const version = [0x02, 0x01, 0x00]
  const octetString = [0x04, ...longueurDer(der.length)]
  const contenuLongueur = version.length + algo.length + octetString.length + der.length
  const entete = [0x30, ...longueurDer(contenuLongueur)]
  const out = new Uint8Array(entete.length + contenuLongueur)
  out.set([...entete, ...version, ...algo, ...octetString], 0)
  out.set(der, entete.length + version.length + algo.length + octetString.length)
  return out
}

/** Le nombre de pages d'un PDF, lu dans ses objets (« /Type /Page » hors « /Pages »). Au moins 1. */
export function compterPagesPdf(pdf: Uint8Array): number {
  const texte = new TextDecoder("latin1").decode(pdf)
  const n = (texte.match(/\/Type\s*\/Page(?![s\w])/g) || []).length
  return Math.max(1, n)
}

// ── Le jeton ──
export async function jetonDocusign(c: ConfigDocusign): Promise<string> {
  const cle = await crypto.subtle.importKey("pkcs8", pemVersPkcs8Der(c.privateKeyPem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"])
  const now = Math.floor(Date.now() / 1000)
  const entete = base64url(JSON.stringify({ typ: "JWT", alg: "RS256" }))
  const corps = base64url(JSON.stringify({ iss: c.integrationKey, sub: c.userId, aud: c.oauthHost, iat: now, exp: now + 3600, scope: "signature impersonation" }))
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cle, new TextEncoder().encode(`${entete}.${corps}`)))
  const jwt = `${entete}.${corps}.${base64url(signature)}`
  const r = await fetch(`https://${c.oauthHost}/oauth/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    if (j.error === "consent_required") throw new Error("DocuSign attend le consentement : ouvrir le lien d'autorisation une fois.")
    throw new Error(`DocuSign refuse le jeton (${r.status}) : ${JSON.stringify(j)}`)
  }
  return j.access_token as string
}

// ── L'API eSignature ──
export async function api(c: ConfigDocusign, jeton: string, methode: string, chemin: string, corps?: unknown): Promise<Response> {
  return fetch(`${c.baseUri}/restapi/v2.1/accounts/${c.accountId}${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json", Accept: corps === undefined && methode === "GET" ? "application/json, application/pdf" : "application/json" },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
}
export async function apiJson<T>(c: ConfigDocusign, jeton: string, methode: string, chemin: string, corps?: unknown): Promise<T> {
  const r = await api(c, jeton, methode, chemin, corps)
  const texte = await r.text()
  if (!r.ok) throw new Error(`DocuSign ${methode} ${chemin} → ${r.status} : ${texte.slice(0, 400)}`)
  return (texte ? JSON.parse(texte) : {}) as T
}

/** Vérifie la signature HMAC d'un message Connect (en-tête X-DocuSign-Signature-1). */
export async function hmacValide(secret: string, corpsBrut: string, signatureBase64: string): Promise<boolean> {
  if (!secret || !signatureBase64) return false
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const attendu = octetsVersBase64(new Uint8Array(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(corpsBrut))))
  if (attendu.length !== signatureBase64.length) return false
  let diff = 0
  for (let i = 0; i < attendu.length; i++) diff |= attendu.charCodeAt(i) ^ signatureBase64.charCodeAt(i)
  return diff === 0
}
