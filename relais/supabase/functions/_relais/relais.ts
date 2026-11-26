// LES RELAIS DE L'ANCIEN PROJET BATICOM (fusion dans STC Bâtiment, préparés le 26/11/2026).
//
// Après la bascule, les écrans et les fonctions du Commercial vivent dans le projet STC Bâtiment, sous le préfixe
// `commercial-`. Mais des milliers de liens déjà envoyés (désinscriptions, liens suivis, formulaires d'avis) et les
// branchements extérieurs (Resend, DocuSign, Ringover, Instantly, Unipile, site vitrine) visent encore l'adresse de
// l'ancien projet : https://ifvrmsiwlwppinfdmeao.supabase.co/functions/v1/<nom>.
//
// Chaque fonction de ce dossier remplace, SUR L'ANCIEN PROJET, la fonction du même nom par un relais qui transmet la
// demande telle quelle à `commercial-<nom>` du projet STC :
//   · même méthode (GET, POST, OPTIONS…), mêmes paramètres d'adresse (?t=, ?d=, ?l=, ?stop=, ?cle=, ?hook=, ?fc=…),
//     même corps, À L'OCTET PRÈS (les signatures Resend/svix et DocuSign HMAC portent sur le corps brut) ;
//   · les en-têtes utiles (user-agent, content-type, svix-*, x-docusign-signature-*, x-baticom-cle, x-passage-cle,
//     list-unsubscribe…) ; l'adresse IP du visiteur part en x-forwarded-for ;
//   · PAS les en-têtes propres à l'ancien projet (authorization et apikey : ses jetons ne valent rien chez STC ; les
//     fonctions `commercial-` sont toutes déployées sans vérification de jeton et contrôlent elles-mêmes l'appelant) ;
//   · la réponse revient telle quelle, redirections comprises (302 non suivie : le navigateur la suit lui-même). Un lien
//     ouvert par un navigateur arrive donc exactement où il arrivait, et le formulaire « Confirmer ma désinscription »
//     (action relative « ?t=…&d=stop ») revient au relais, qui le transmet à son tour.
//
// Rien ici n'écrit dans la base : le relais ne garde aucune donnée. Si STC ne répond pas, il répond 502 : Resend,
// DocuSign et Ringover retentent d'eux-mêmes ; un visiteur voit une page « réessayez ».
//
// Réglages (secrets de l'ancien projet, aucun n'est obligatoire sauf pour le dépôt de dossier) :
//   RELAIS_STC_URL           adresse du projet STC (défaut : https://yytpxonzlhdevddpkjzy.supabase.co)
//   RELAIS_STC_CLE_PUBLIQUE  clé PUBLIQUE (anon / publishable) du projet STC, pour copier les pièces d'un dossier
//                            déposé sur le site vitrine (voir copierPieces)
//   RELAIS_STC_ESPACE_DOSSIERS  espace de fichiers des dossiers chez STC (défaut : commercial-dossiers-st)

export const CIBLE_PAR_DEFAUT = "https://yytpxonzlhdevddpkjzy.supabase.co"
export const ESPACE_DOSSIERS_PAR_DEFAUT = "commercial-dossiers-st"
const DELAI_MS = 30_000

export type ConfigRelais = { cibleBase: string; clePublique: string; espaceDossiers: string }

export function configDepuis(lire: (cle: string) => string | undefined): ConfigRelais {
  return {
    cibleBase: (lire("RELAIS_STC_URL") || CIBLE_PAR_DEFAUT).replace(/\/+$/, ""),
    clePublique: lire("RELAIS_STC_CLE_PUBLIQUE") || "",
    espaceDossiers: lire("RELAIS_STC_ESPACE_DOSSIERS") || ESPACE_DOSSIERS_PAR_DEFAUT,
  }
}

/** L'adresse de la fonction STC : la même chaîne de paramètres, intacte (ordre, encodage, répétitions). */
export function adresseCible(urlSource: string, nomCible: string, cibleBase: string): string {
  const u = new URL(urlSource)
  return `${cibleBase}/functions/v1/${nomCible}${u.search}`
}

// En-têtes jamais transmis : ceux du transport, ceux de l'ancien projet (jetons), ceux de la plateforme.
const RETIRES = new Set([
  "host", "authorization", "apikey", "x-client-info", "cookie", "content-length", "connection", "keep-alive",
  "transfer-encoding", "upgrade", "te", "trailer", "proxy-authorization", "proxy-connection", "accept-encoding",
  "forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port", "x-real-ip", "via",
  "cdn-loop", "baggage", "traceparent", "tracestate", "sentry-trace",
])
const PREFIXES_RETIRES = ["cf-", "x-sb-", "sb-", "x-amzn-", "x-envoy-", "x-supabase-"]

export function entetesTransmises(source: Headers, nomCible: string): Headers {
  const h = new Headers()
  source.forEach((valeur, nom) => {
    const n = nom.toLowerCase()
    if (RETIRES.has(n) || PREFIXES_RETIRES.some((p) => n.startsWith(p))) return
    h.set(n, valeur)
  })
  const ip = source.get("cf-connecting-ip") || source.get("x-real-ip") || (source.get("x-forwarded-for") || "").split(",")[0].trim()
  if (ip) h.set("x-forwarded-for", ip)
  h.set("x-relais-baticom", nomCible)
  return h
}

// En-têtes de la réponse STC qu'on ne renvoie pas : le corps est déjà décompressé par fetch, sa longueur change.
const RETIRES_REPONSE = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"])

export function entetesRenvoyees(source: Headers): Headers {
  const h = new Headers()
  source.forEach((valeur, nom) => { if (!RETIRES_REPONSE.has(nom.toLowerCase())) h.append(nom, valeur) })
  return h
}

const SANS_CORPS = new Set([101, 204, 205, 304])

function pageIndisponible(): Response {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Réessayez dans un instant</title></head><body style="margin:0;background:#f6f6f8;font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px"><div style="background:#fff;border:1px solid #e8e8e8;border-radius:14px;padding:32px 28px;max-width:440px"><h1 style="font-size:20px;margin:0 0 10px">Réessayez dans un instant</h1><p style="margin:0;color:#525252;line-height:1.55">Le service est momentanément indisponible. Pour ne plus recevoir nos messages, vous pouvez aussi répondre « stop » à notre message.<br>STC Bâtiment</p></div></body></html>`
  return new Response(html, { status: 502, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
}

/** Transmet la demande à `nomCible` du projet STC et renvoie sa réponse telle quelle. */
export async function relayer(req: Request, nomCible: string, cfg: ConfigRelais, corps?: ArrayBuffer | null, f: typeof fetch = fetch): Promise<Response> {
  const methode = req.method.toUpperCase()
  const avecCorps = methode !== "GET" && methode !== "HEAD"
  const brut = avecCorps ? (corps !== undefined ? corps : await req.arrayBuffer()) : null
  try {
    const r = await f(adresseCible(req.url, nomCible, cfg.cibleBase), {
      method: methode,
      headers: entetesTransmises(req.headers, nomCible),
      body: brut && brut.byteLength > 0 ? brut : (avecCorps ? new ArrayBuffer(0) : undefined),
      redirect: "manual",
      signal: AbortSignal.timeout(DELAI_MS),
    })
    const vide = methode === "HEAD" || SANS_CORPS.has(r.status)
    return new Response(vide ? null : r.body, { status: r.status, statusText: r.statusText, headers: entetesRenvoyees(r.headers) })
  } catch (e) {
    console.error(`[RELAIS ${nomCible}] STC injoignable :`, e instanceof Error ? e.message : String(e))
    const navigateur = methode === "GET" && /text\/html/i.test(req.headers.get("accept") || "")
    if (navigateur) return pageIndisponible()
    return new Response(JSON.stringify({ error: "relais : STC Bâtiment injoignable, réessayez" }), { status: 502, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } })
  }
}

// ── Le dépôt de dossier du site vitrine (soumettre-dossier-st) ──
// Le site vitrine (stcbatiment.fr/sous-traitants) dépose d'abord les pièces DANS L'ESPACE `dossiers-st` DE L'ANCIEN
// PROJET (dépôt anonyme autorisé), puis appelle soumettre-dossier-st avec leurs chemins. Tant que le site n'est pas
// rebranché sur STC, le relais recopie ces pièces dans l'espace des dossiers de STC (même chemin), puis transmet le
// dossier. Lecture côté ancien projet : sa clé de service (déjà présente, jamais copiée ailleurs). Écriture côté STC :
// la clé PUBLIQUE de STC, comme le site le fait aujourd'hui chez Baticom ; l'espace STC doit donc accepter le dépôt
// anonyme, comme `dossiers-st` (règle « depot anonyme dossiers st »).

/** Les chemins des pièces d'un dossier, filtrés comme le fait soumettre-dossier-st (dossier UUID, 40 au plus). */
export function cheminsDesPieces(corps: string): string[] {
  let b: { site?: unknown; fichiers?: unknown }
  try { b = JSON.parse(corps) ?? {} } catch { return [] }
  if (b.site) return [] // le piège à robots : soumettre-dossier-st n'enregistre rien, inutile de copier
  const fichiers = Array.isArray(b.fichiers) ? b.fichiers : []
  return fichiers
    .map((x) => (x as { path?: unknown })?.path)
    .filter((p): p is string => typeof p === "string" && /^[0-9a-f-]{36}\//.test(p) && !p.includes(".."))
    .slice(0, 40)
}

const encoderChemin = (p: string) => p.split("/").map(encodeURIComponent).join("/")

/** Recopie les pièces chez STC. Renvoie null si tout est copié (ou déjà là), sinon la raison de l'échec. */
export async function copierPieces(chemins: string[], cfg: ConfigRelais, source: { url: string; cleService: string }, f: typeof fetch = fetch): Promise<string | null> {
  if (chemins.length === 0) return null
  if (!cfg.clePublique) return "RELAIS_STC_CLE_PUBLIQUE absente : pièces non recopiées"
  for (const chemin of chemins) {
    const lu = await f(`${source.url.replace(/\/+$/, "")}/storage/v1/object/dossiers-st/${encoderChemin(chemin)}`, {
      headers: { apikey: source.cleService, Authorization: `Bearer ${source.cleService}` },
      signal: AbortSignal.timeout(DELAI_MS),
    })
    if (!lu.ok) return `pièce illisible dans l'ancien projet (${lu.status}) : ${chemin}`
    const contenu = await lu.arrayBuffer()
    const ecrit = await f(`${cfg.cibleBase}/storage/v1/object/${cfg.espaceDossiers}/${encoderChemin(chemin)}`, {
      method: "POST",
      headers: { apikey: cfg.clePublique, Authorization: `Bearer ${cfg.clePublique}`, "Content-Type": lu.headers.get("content-type") || "application/octet-stream", "x-upsert": "false" },
      body: contenu,
      signal: AbortSignal.timeout(DELAI_MS),
    })
    if (ecrit.ok) continue
    const texte = await ecrit.text().catch(() => "")
    // Déjà copiée (le visiteur a renvoyé le formulaire) : c'est bon.
    if (ecrit.status === 409 || /duplicate|already exists/i.test(texte)) continue
    return `pièce non recopiée chez STC (${ecrit.status}) : ${chemin}`
  }
  return null
}
