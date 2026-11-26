// Les relais de l'ancien projet Baticom : chaque forme de lien déjà envoyé, et chaque webhook, arrive intacte chez STC.
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { adresseCible, cheminsDesPieces, configDepuis, copierPieces, entetesTransmises, relayer } from "./supabase/functions/_relais/relais.ts"

const ANCIEN = "https://ifvrmsiwlwppinfdmeao.supabase.co/functions/v1"
const STC = "https://yytpxonzlhdevddpkjzy.supabase.co"
const cfg = configDepuis(() => undefined)

type Appel = { url: string; init: RequestInit }
function faux(reponse: () => Response) {
  const appels: Appel[] = []
  const f = (async (url: string, init: RequestInit) => { appels.push({ url, init }); return reponse() }) as unknown as typeof fetch
  return { f, appels }
}

describe("relais — adresse cible", () => {
  it("vise STC par défaut, commercial-<nom>, paramètres intacts", () => {
    expect(cfg.cibleBase).toBe(STC)
    for (const lien of [
      `${ANCIEN}/lien-st?t=0123456789abcdef0123456789abcdef&d=candidature`,
      `${ANCIEN}/lien-st?t=0123456789abcdef0123456789abcdef&d=bareme`,
      `${ANCIEN}/lien-st?t=0123456789abcdef0123456789abcdef&d=stop`,
      `${ANCIEN}/evenements-site?l=abc123`,
      `${ANCIEN}/evenements-site?stop=abc123`,
      `${ANCIEN}/formulaire-campagne?fc=c1&f=f1&k=k%3A1&s=sig_-x&t=1&stop=1`,
      `${ANCIEN}/ringover-webhook?cle=xyz`,
      `${ANCIEN}/linkedin?hook=xyz`,
      `${ANCIEN}/docusign-evenements?cle=a%2Bb`,
    ]) {
      const u = new URL(lien)
      const nom = u.pathname.split("/").pop()!
      expect(adresseCible(lien, `commercial-${nom}`, STC)).toBe(`${STC}/functions/v1/commercial-${nom}${u.search}`)
    }
  })
  it("une adresse STC réglée est prise sans barre finale", () => {
    expect(configDepuis((k) => (k === "RELAIS_STC_URL" ? "https://exemple.supabase.co/" : undefined)).cibleBase).toBe("https://exemple.supabase.co")
  })
})

describe("relais — en-têtes", () => {
  it("garde les en-têtes utiles, retire les jetons de l'ancien projet, passe l'IP du visiteur", () => {
    const h = entetesTransmises(new Headers({
      authorization: "Bearer ancien", apikey: "ancienne", host: "ifvrmsiwlwppinfdmeao.supabase.co", cookie: "x=1",
      "user-agent": "Mozilla/5.0", "content-type": "application/json", "svix-id": "msg_1", "svix-timestamp": "1", "svix-signature": "v1,abc",
      "x-docusign-signature-1": "hmac", "x-baticom-cle": "cle", "x-passage-cle": "p", "cf-connecting-ip": "203.0.113.5", "cf-ray": "r",
    }), "commercial-resend-evenements")
    for (const n of ["user-agent", "content-type", "svix-id", "svix-timestamp", "svix-signature", "x-docusign-signature-1", "x-baticom-cle", "x-passage-cle"]) expect(h.has(n)).toBe(true)
    for (const n of ["authorization", "apikey", "host", "cookie", "cf-ray", "cf-connecting-ip"]) expect(h.has(n)).toBe(false)
    expect(h.get("x-forwarded-for")).toBe("203.0.113.5")
    expect(h.get("x-relais-baticom")).toBe("commercial-resend-evenements")
  })
})

describe("relais — transmission", () => {
  it("GET d'un lien : la redirection 302 de STC revient au navigateur, sans être suivie", async () => {
    const { f, appels } = faux(() => new Response(null, { status: 302, headers: { Location: "https://www.stcbatiment.fr/sous-traitants?ref=abc" } }))
    const r = await relayer(new Request(`${ANCIEN}/lien-st?t=abc&d=candidature`, { headers: { "user-agent": "Mozilla/5.0" } }), "commercial-lien-st", cfg, undefined, f)
    expect(r.status).toBe(302)
    expect(r.headers.get("location")).toBe("https://www.stcbatiment.fr/sous-traitants?ref=abc")
    expect(appels[0].url).toBe(`${STC}/functions/v1/commercial-lien-st?t=abc&d=candidature`)
    expect(appels[0].init.method).toBe("GET")
    expect(appels[0].init.redirect).toBe("manual")
    expect(appels[0].init.body).toBeUndefined()
  })
  it("POST de désinscription en un clic (RFC 8058) : méthode et corps intacts, page renvoyée", async () => {
    const { f, appels } = faux(() => new Response("<h1>C'est noté</h1>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Encoding": "gzip" } }))
    const r = await relayer(new Request(`${ANCIEN}/evenements-site?stop=jeton`, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } }), "commercial-evenements-site", cfg, undefined, f)
    expect(r.status).toBe(200)
    expect(await r.text()).toContain("C'est noté")
    expect(r.headers.get("content-encoding")).toBeNull()
    expect(appels[0].init.method).toBe("POST")
    expect(new TextDecoder().decode(appels[0].init.body as ArrayBuffer)).toBe("List-Unsubscribe=One-Click")
  })
  it("webhook signé : corps transmis à l'octet près (signature svix / HMAC DocuSign)", async () => {
    const brut = '{"type":"email.opened","data":{"email_id":"e1","to":["a@b.fr"]},"created_at":"2026-11-26T10:00:00.000Z"}'
    const { f, appels } = faux(() => new Response('{"ok":true}', { status: 200 }))
    await relayer(new Request(`${ANCIEN}/resend-evenements`, { method: "POST", body: brut, headers: { "svix-signature": "v1,x" } }), "commercial-resend-evenements", cfg, undefined, f)
    expect(new TextDecoder().decode(appels[0].init.body as ArrayBuffer)).toBe(brut)
  })
  it("STC injoignable : 502 (les prestataires retentent), page lisible pour un navigateur", async () => {
    const f = (async () => { throw new Error("coupure") }) as unknown as typeof fetch
    const webhook = await relayer(new Request(`${ANCIEN}/docusign-evenements?cle=x`, { method: "POST", body: "{}" }), "commercial-docusign-evenements", cfg, undefined, f)
    expect(webhook.status).toBe(502)
    const page = await relayer(new Request(`${ANCIEN}/lien-st?t=a&d=stop`, { headers: { accept: "text/html" } }), "commercial-lien-st", cfg, undefined, f)
    expect(page.status).toBe(502)
    expect(await page.text()).toContain("stop")
  })
})

describe("relais — pièces du dossier déposé sur le site vitrine", () => {
  const uuid = "0f8b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d"
  it("ne garde que les chemins acceptés par soumettre-dossier-st ; rien pour le piège à robots", () => {
    const corps = JSON.stringify({ fichiers: [{ path: `${uuid}/kbis.pdf` }, { path: "../etc/x" }, { path: "pas-un-dossier/x.pdf" }, { path: 3 }] })
    expect(cheminsDesPieces(corps)).toEqual([`${uuid}/kbis.pdf`])
    expect(cheminsDesPieces(JSON.stringify({ site: "robot", fichiers: [{ path: `${uuid}/a.pdf` }] }))).toEqual([])
    expect(cheminsDesPieces("pas du json")).toEqual([])
  })
  it("recopie chez STC avec la clé publique ; une pièce déjà copiée n'est pas une erreur", async () => {
    const appels: Appel[] = []
    const f = (async (url: string, init: RequestInit = {}) => {
      appels.push({ url, init })
      if (!init.method) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "application/pdf" } })
      return url.includes("deja") ? new Response('{"error":"Duplicate"}', { status: 409 }) : new Response("{}", { status: 200 })
    }) as unknown as typeof fetch
    const c = { ...cfg, clePublique: "publique" }
    expect(await copierPieces([`${uuid}/kbis.pdf`, `${uuid}/deja.pdf`], c, { url: "https://ancien.supabase.co", cleService: "service" }, f)).toBeNull()
    expect(appels[0].url).toBe(`https://ancien.supabase.co/storage/v1/object/dossiers-st/${uuid}/kbis.pdf`)
    expect(appels[1].url).toBe(`${STC}/storage/v1/object/commercial-dossiers-st/${uuid}/kbis.pdf`)
    expect((appels[1].init.headers as Record<string, string>).apikey).toBe("publique")
  })
  it("sans clé publique STC, ou pièce introuvable : échec dit, rien de silencieux", async () => {
    expect(await copierPieces([`${uuid}/a.pdf`], cfg, { url: "https://a", cleService: "s" })).toMatch(/RELAIS_STC_CLE_PUBLIQUE/)
    const f = (async () => new Response("", { status: 404 })) as unknown as typeof fetch
    expect(await copierPieces([`${uuid}/a.pdf`], { ...cfg, clePublique: "p" }, { url: "https://a", cleService: "s" }, f)).toMatch(/illisible/)
  })
})

describe("relais — chaque fonction vise son homologue commercial-", () => {
  it("11 relais, chacun vers commercial-<son nom>", () => {
    const dossier = new URL("./supabase/functions/", import.meta.url)
    const noms = readdirSync(dossier).filter((n) => !n.startsWith("_"))
    expect(noms.sort()).toEqual(["docusign-evenements", "evenements-site", "formation-st", "formulaire-campagne", "instantly-evenements", "lien-st", "linkedin", "recevoir-email", "resend-evenements", "ringover-webhook", "soumettre-dossier-st"])
    for (const n of noms) expect(readFileSync(new URL(`${n}/index.ts`, dossier), "utf8")).toContain(`"commercial-${n}"`)
  })
})

describe("relais — page GitHub Pages", () => {
  it("renvoie vers stcbatiment.com/commercial/ en gardant les paramètres ; 404 identique ; logo des signatures gardé", () => {
    const dossier = new URL("./pages/", import.meta.url)
    const page = readFileSync(new URL("index.html", dossier), "utf8")
    expect(page).toContain('var cible = "https://www.stcbatiment.com/commercial/"')
    expect(page).toContain("location.replace(cible + location.search + ancre)")
    expect(readFileSync(new URL("404.html", dossier), "utf8")).toBe(page)
    expect(readdirSync(dossier)).toContain("logo-stc.png")
  })
})
