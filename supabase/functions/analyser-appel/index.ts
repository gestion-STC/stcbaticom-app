// ════════════════════════════════════════════════════════════════════════════
// ANALYSER UN APPEL : enregistrement Ringover → transcription → mail + analyse
// (24/10/2026, Mahdi : « à la fin de l'appel, tout de suite le mail personnalisé
// généré par l'IA ; et analyser les meilleurs argumentaires, ce qui tape »).
//
// Trois portes d'entrée, une seule mécanique :
//   · l'écran, juste après « Valider le résultat » : { activite_id } avec la session
//     du commercial (Authorization: Bearer <jeton>) — c'est le chemin « tout de suite » ;
//   · le webhook Ringover (?cle=…, via ringover-webhook) : { call_id } ;
//   · le passage de secours toutes les 2 minutes (en-tête x-passage-cle) : {} →
//     reprend ce que l'enregistrement pas encore prêt a fait attendre.
//
// Chaque appel est RÉSERVÉ avant d'être traité (statut en_cours, une seule écriture
// conditionnelle) : l'écran et le passage de secours ne paient jamais deux fois la
// même transcription.
//
// Le mail n'est JAMAIS envoyé ici : il est rangé en brouillon, le commercial le relit.
//
// Secrets : RINGOVER_API_KEY (déjà là), ELEVENLABS_API_KEY, ANTHROPIC_API_KEY,
// ANALYSE_PASSAGE_CLE (le passage de secours), RINGOVER_WEBHOOK_JETON (facultatif).
// ⚠ call_id > 2^53 : toujours en TEXTE (pièges §8.1 de CLAUDE.md).
// Déployer avec « Verify JWT » DÉSACTIVÉ (le passage de secours et le webhook n'ont
// pas de session) : la fonction vérifie elle-même qui l'appelle.
// ════════════════════════════════════════════════════════════════════════════
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk@0.137.0"

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

const RINGOVER = "https://public-api.ringover.com/v2"
const MODELE = "claude-opus-5-5"
const DUREE_MIN_S = 20          // en dessous : rien d'exploitable (répondeur, « rappelez plus tard »)
const ATTENTE_ECRAN_S = 60      // l'écran attend l'enregistrement au plus une minute, puis le secours prend le relais
const ESSAIS_MAX = 12           // ~24 min de patience (passage toutes les 2 min), puis « sans enregistrement »
const PAR_PASSAGE = 4           // une transcription prend du temps

type Ligne = {
  id: string; activite_id: string; agence_id: string | null; contact_id: string | null; compte_nom: string | null
  call_id: string; resultat: string | null; statut: string; tentatives: number; transcription: string | null
}
type AppelRingover = { is_answered?: boolean; incall_duration?: number; total_duration?: number; record?: string | null; record_url?: string | null; end_time?: string | null; start_time?: string | null }

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Le JSON de Ringover, call_id et cdr_id gardés en TEXTE. */
function lireJsonRingover(texte: string): unknown {
  return JSON.parse(texte.replace(/"(call_id|cdr_id|user_id|channel_id)"\s*:\s*(\d{15,})/g, '"$1":"$2"'))
}

async function appelRingover(callId: string): Promise<AppelRingover | null> {
  const cle = Deno.env.get("RINGOVER_API_KEY") || ""
  // Header « Authorization: <clé> », SANS « Bearer » (piège §8.2).
  const r = await fetch(`${RINGOVER}/calls/${encodeURIComponent(callId)}`, { headers: { Authorization: cle } })
  if (r.status === 204 || r.status === 404) return null
  if (!r.ok) throw new Error(`Ringover répond ${r.status}`)
  const d = lireJsonRingover(await r.text()) as { list?: AppelRingover[] } & AppelRingover
  return Array.isArray(d?.list) ? d.list[0] ?? null : d
}

/** L'enregistrement → texte en tours de parole (ElevenLabs, comme STC Bâtiment). */
async function transcrire(url: string): Promise<string> {
  const audio = await fetch(url)
  if (!audio.ok) throw new Error(`enregistrement illisible (code ${audio.status})`)
  const forme = new FormData()
  forme.append("model_id", "scribe_v1")
  forme.append("language_code", "fra")
  forme.append("diarize", "true")
  forme.append("file", new Blob([await audio.arrayBuffer()], { type: audio.headers.get("content-type") || "audio/mpeg" }), "appel.mp3")
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": Deno.env.get("ELEVENLABS_API_KEY") || "" }, body: forme })
  if (!r.ok) throw new Error(`transcription refusée (ElevenLabs ${r.status}) : ${(await r.text()).slice(0, 200)}`)
  const t = await r.json() as { text?: string; words?: Array<{ text: string; type?: string; speaker_id?: string }> }
  const mots = (t.words ?? []).filter((m) => m.type !== "audio_event")
  if (!mots.length) return (t.text ?? "").trim()
  const voix = new Map<string, number>()
  const lignes: string[] = []
  let courant = "", qui = ""
  for (const m of mots) {
    const s = m.speaker_id ?? "speaker_0"
    if (!voix.has(s)) voix.set(s, voix.size + 1)
    if (s !== qui && courant.trim()) { lignes.push(`Voix ${voix.get(qui)} : ${courant.trim()}`); courant = "" }
    qui = s
    courant += m.text
  }
  if (courant.trim()) lignes.push(`Voix ${voix.get(qui)} : ${courant.trim()}`)
  return lignes.join("\n")
}

// ── L'analyse : UNE réponse structurée (résumé, mail, arguments, objections) ──
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resume", "interet", "decideur_joint", "prochaine_etape", "arguments", "objections", "points_forts", "a_ameliorer", "mail"],
  properties: {
    resume: { type: "string", description: "Résumé factuel en tirets courts, sans emoji." },
    interet: { type: "string", enum: ["nul", "faible", "moyen", "fort"] },
    decideur_joint: { type: "boolean", description: "La personne en ligne décide-t-elle du choix des entreprises de travaux ?" },
    prochaine_etape: { type: "string", description: "Ce qui a été convenu, ou vide." },
    arguments: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["libelle", "extrait", "reaction"],
        properties: {
          libelle: { type: "string", description: "Nom court et stable de l'argument (réutiliser un nom de la liste fournie s'il convient)." },
          extrait: { type: "string", description: "La phrase du commercial, citée." },
          reaction: { type: "string", enum: ["positive", "neutre", "negative"] },
        },
      },
    },
    objections: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["libelle", "extrait", "reponse", "levee"],
        properties: {
          libelle: { type: "string", description: "Nom court et stable de l'objection (réutiliser un nom de la liste fournie s'il convient)." },
          extrait: { type: "string", description: "La phrase de l'interlocuteur, citée." },
          reponse: { type: "string", description: "Ce que le commercial a répondu, ou vide." },
          levee: { type: "boolean", description: "L'objection a-t-elle été levée ?" },
        },
      },
    },
    points_forts: { type: "array", items: { type: "string" } },
    a_ameliorer: { type: "array", items: { type: "string" } },
    mail: {
      type: "object", additionalProperties: false, required: ["pertinent", "objet", "corps"],
      properties: {
        pertinent: { type: "boolean", description: "Un mail de suivi a-t-il du sens après cet appel ?" },
        objet: { type: "string" },
        corps: { type: "string", description: "Texte brut, sans signature." },
      },
    },
  },
} as const

type Analyse = {
  resume: string; interet: "nul" | "faible" | "moyen" | "fort"; decideur_joint: boolean; prochaine_etape: string
  arguments: { libelle: string; extrait: string; reaction: string }[]
  objections: { libelle: string; extrait: string; reponse: string; levee: boolean }[]
  points_forts: string[]; a_ameliorer: string[]
  mail: { pertinent: boolean; objet: string; corps: string }
}

const CONSIGNES = `Tu analyses un appel de prospection de STC Bâtiment, entreprise de travaux et de dépannage qui travaille pour les gestionnaires locatifs, syndics et agences immobilières (ordres de service, interventions chez les locataires, devis). Le commercial appelle une agence pour être référencé et recevoir des ordres de service.

La transcription est en tours de parole « Voix 1 / Voix 2 » : déduis qui est le commercial de STC Bâtiment et qui est l'interlocuteur de l'agence.

Règles :
- N'invente rien : seulement ce qui est dit dans l'appel ou donné dans le contexte. Pas de prix, de délai ou de promesse qui n'a pas été dit.
- Arguments : ceux que le commercial a réellement avancés. Objections : ce que l'interlocuteur a opposé. Nomme-les avec des libellés courts et stables (3 à 6 mots) ; si un libellé de la liste fournie convient, reprends-le EXACTEMENT, pour que les appels se comparent entre eux.
- Mail : un mail de suivi que le commercial enverra après relecture, en français, vouvoiement, ton professionnel et simple, 80 à 160 mots. Il rappelle l'échange (un ou deux détails concrets de l'appel), reprend ce que l'interlocuteur a demandé ou ce qui a été convenu, et propose une prochaine étape claire. Commence par « Bonjour » suivi du nom si on le connaît, sinon « Bonjour, ». Termine par une formule de politesse courte, SANS signature ni nom du commercial (elle est ajoutée à l'envoi). Pas d'emoji. Si un mail n'a pas de sens (refus net, mauvais interlocuteur sans suite, faux numéro), mets pertinent à false et laisse objet et corps vides.
- Résumé : tirets courts et factuels, sans emoji.`

async function analyser(transcription: string, contexte: string, libelles: { arguments: string[]; objections: string[] }): Promise<Analyse> {
  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "" })
  const message = [
    "CONTEXTE",
    contexte,
    "",
    `Libellés d'arguments déjà utilisés : ${libelles.arguments.length ? libelles.arguments.join(" ; ") : "(aucun encore)"}`,
    `Libellés d'objections déjà utilisés : ${libelles.objections.length ? libelles.objections.join(" ; ") : "(aucun encore)"}`,
    "",
    "TRANSCRIPTION",
    transcription.slice(0, 120_000),
  ].join("\n")
  // Structured output : la réponse respecte le schéma. Repli serveur activé en cas de refus de sécurité.
  const reponse = await client.beta.messages.create({
    model: MODELE,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: CONSIGNES,
    messages: [{ role: "user", content: message }],
  } as never) as { stop_reason?: string; content?: Array<{ type: string; text?: string }> }
  if (reponse.stop_reason === "refusal") throw new Error("analyse refusée par le modèle")
  if (reponse.stop_reason === "max_tokens") throw new Error("analyse coupée (trop longue)")
  const texte = (reponse.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("")
  return JSON.parse(texte) as Analyse
}

/** Les libellés déjà employés (les plus fréquents d'abord) : l'IA les réutilise, les chiffres se comparent. */
async function libellesConnus(sb: SupabaseClient): Promise<{ arguments: string[]; objections: string[] }> {
  const { data } = await sb.from("appels_ia").select("analyse").eq("statut", "pret").order("cree_le", { ascending: false }).limit(400)
  const compter = (cle: "arguments" | "objections") => {
    const n = new Map<string, number>()
    for (const l of (data ?? []) as { analyse: Analyse | null }[]) for (const x of l.analyse?.[cle] ?? []) if (x.libelle) n.set(x.libelle, (n.get(x.libelle) ?? 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k]) => k)
  }
  return { arguments: compter("arguments"), objections: compter("objections") }
}

async function contexteDe(sb: SupabaseClient, l: Ligne): Promise<string> {
  const [{ data: agence }, { data: contact }, { data: script }] = await Promise.all([
    l.agence_id ? sb.from("agences").select("nom, enseigne, type, adresse, secteur").eq("id", l.agence_id).maybeSingle() : Promise.resolve({ data: null }),
    l.contact_id ? sb.from("contacts").select("prenom, nom, role").eq("id", l.contact_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("parametres").select("valeur").eq("cle", "script_appel").maybeSingle(),
  ])
  const a = agence as Record<string, unknown> | null
  const c = contact as Record<string, unknown> | null
  const nomContact = c ? [c.prenom, c.nom].filter(Boolean).join(" ") : ""
  return [
    `Agence : ${a?.nom ?? "?"}${a?.enseigne ? ` (${a.enseigne})` : ""}${a?.secteur ? `, secteur ${a.secteur}` : ""}${a?.adresse ? `, ${a.adresse}` : ""}`,
    `Interlocuteur connu : ${nomContact || "inconnu"}${c?.role ? ` (${c.role})` : ""}`,
    `Commercial STC Bâtiment : ${l.compte_nom ?? "?"}`,
    `Résultat noté par le commercial : ${l.resultat ?? "?"}`,
    `Script d'appel de STC Bâtiment (pour connaître l'offre, pas à recopier) :\n${String((script as { valeur?: unknown } | null)?.valeur ?? "").slice(0, 6000)}`,
  ].join("\n")
}

/** Réserve l'appel (une seule écriture conditionnelle) : rien ne le traite deux fois. */
async function reserver(sb: SupabaseClient, filtre: { id?: string }): Promise<Ligne | null> {
  const avant = new Date(Date.now() - 5 * 60_000).toISOString() // un « en cours » de plus de 5 min a planté : on le reprend
  let q = sb.from("appels_ia").update({ statut: "en_cours", verrou_le: new Date().toISOString(), maj_le: new Date().toISOString() })
  if (filtre.id) q = q.eq("id", filtre.id)
  const { data } = await q
    .or(`statut.in.(en_attente,erreur),and(statut.eq.en_cours,verrou_le.lt.${avant})`)
    .select("id, activite_id, agence_id, contact_id, compte_nom, call_id, resultat, statut, tentatives, transcription")
    .maybeSingle()
  return (data as Ligne | null) ?? null
}

async function traiter(sb: SupabaseClient, l: Ligne, attendreEnregistrement: boolean): Promise<string> {
  const maj = (champs: Record<string, unknown>) => sb.from("appels_ia").update({ ...champs, maj_le: new Date().toISOString() }).eq("id", l.id)
  try {
    // 1. L'appel chez Ringover : l'enregistrement arrive quelques secondes après le raccroché.
    let appel = await appelRingover(l.call_id)
    const fin = Date.now() + (attendreEnregistrement ? ATTENTE_ECRAN_S * 1000 : 0)
    while (!(appel?.record || appel?.record_url) && Date.now() < fin) {
      await attendre(10_000)
      appel = await appelRingover(l.call_id)
    }
    const duree = Number(appel?.incall_duration ?? appel?.total_duration ?? 0)
    const url = appel?.record || appel?.record_url || null
    if (appel && (appel.is_answered === false || (duree > 0 && duree < DUREE_MIN_S))) {
      await maj({ statut: "trop_court", duree_s: duree, verrou_le: null })
      return "trop_court"
    }
    if (!url) {
      const essais = l.tentatives + 1
      await maj(essais >= ESSAIS_MAX
        ? { statut: "sans_enregistrement", tentatives: essais, duree_s: duree || null, verrou_le: null, erreur: "Aucun enregistrement chez Ringover : l'enregistrement des appels est-il activé sur ce compte ?" }
        : { statut: "en_attente", tentatives: essais, prochain_essai: new Date(Date.now() + 90_000).toISOString(), verrou_le: null })
      return "attente_enregistrement"
    }
    // 2. La transcription (payante) : gardée dès qu'elle existe.
    let transcription = l.transcription ?? ""
    if (!transcription) {
      transcription = await transcrire(url)
      await maj({ transcription, duree_s: duree || null, enregistrement_url: url })
    }
    if (transcription.trim().length < 40) {
      await maj({ statut: "trop_court", duree_s: duree || null, verrou_le: null })
      return "trop_court"
    }
    // 3. Le mail et l'analyse, en une réponse.
    const [contexte, libelles] = await Promise.all([contexteDe(sb, l), libellesConnus(sb)])
    const a = await analyser(transcription, contexte, libelles)
    await maj({
      statut: "pret", verrou_le: null, erreur: null, duree_s: duree || null, enregistrement_url: url,
      resume: a.resume, interet: a.interet,
      analyse: { decideur_joint: a.decideur_joint, prochaine_etape: a.prochaine_etape, arguments: a.arguments, objections: a.objections, points_forts: a.points_forts, a_ameliorer: a.a_ameliorer },
      mail_pertinent: a.mail.pertinent, mail_objet: a.mail.pertinent ? a.mail.objet : null, mail_corps: a.mail.pertinent ? a.mail.corps : null,
    })
    return "pret"
  } catch (e) {
    const essais = l.tentatives + 1
    await maj({ statut: "erreur", tentatives: essais, verrou_le: null, prochain_essai: new Date(Date.now() + 120_000).toISOString(), erreur: String((e as Error)?.message ?? e).slice(0, 500) })
    return "erreur"
  }
}

async function compteConnecte(req: Request): Promise<boolean> {
  const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
  if (!jeton) return false
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") || "", Authorization: `Bearer ${jeton}` } })
  if (!r.ok) return false
  const u = await r.json().catch(() => null)
  return Boolean(u?.id)
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405)
  const passage = Deno.env.get("ANALYSE_PASSAGE_CLE") || ""
  const jetonWebhook = Deno.env.get("RINGOVER_WEBHOOK_JETON") || ""
  const url = new URL(req.url)
  const parPassage = passage.length > 0 && req.headers.get("x-passage-cle") === passage
  const parWebhook = jetonWebhook.length > 0 && url.searchParams.get("cle") === jetonWebhook
  const parEcran = !parPassage && !parWebhook && await compteConnecte(req)
  if (!parPassage && !parWebhook && !parEcran) return json({ error: "non autorisé" }, 401)
  for (const s of ["RINGOVER_API_KEY", "ELEVENLABS_API_KEY", "ANTHROPIC_API_KEY"]) {
    if (!Deno.env.get(s)) return json({ error: `Secret ${s} manquant sur la fonction analyser-appel` }, 500)
  }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const texte = await req.text()
  let corps: { activite_id?: string } = {}
  try { corps = texte ? JSON.parse(texte) : {} } catch { /* corps libre (webhook) */ }

  // L'écran : un appel précis, qu'on attend jusqu'à une minute.
  if (parEcran) {
    if (!corps.activite_id) return json({ error: "activite_id attendu" }, 400)
    const { data } = await sb.from("appels_ia").select("id").eq("activite_id", corps.activite_id).maybeSingle()
    if (!data) return json({ ok: true, bilan: "non_concerne" }) // appel sans décroché, ou SQL pas encore passé
    const l = await reserver(sb, { id: (data as { id: string }).id })
    if (!l) return json({ ok: true, bilan: "deja_en_cours_ou_fait" })
    return json({ ok: true, bilan: await traiter(sb, l, true) })
  }

  // Le webhook : l'appel de ce call_id, s'il attend (le call_id lu en TEXTE dans le corps brut).
  if (parWebhook) {
    const callId = texte.match(/"call_id"\s*:\s*"?(\d+)/)?.[1]
    if (!callId) return json({ ok: true, bilan: "sans_call_id" })
    const { data } = await sb.from("appels_ia").select("id").eq("call_id", callId).in("statut", ["en_attente", "erreur"]).limit(1).maybeSingle()
    if (!data) return json({ ok: true, bilan: "rien_a_faire" })
    const l = await reserver(sb, { id: (data as { id: string }).id })
    return json({ ok: true, bilan: l ? await traiter(sb, l, true) : "deja_en_cours_ou_fait" })
  }

  // Le passage de secours : quelques appels dus.
  const { data: dus } = await sb.from("appels_ia").select("id").in("statut", ["en_attente", "erreur", "en_cours"]).lte("prochain_essai", new Date().toISOString()).lt("tentatives", ESSAIS_MAX).order("prochain_essai").limit(PAR_PASSAGE)
  const bilan: Record<string, number> = {}
  for (const d of (dus ?? []) as { id: string }[]) {
    const l = await reserver(sb, { id: d.id })
    if (!l) continue
    const r = await traiter(sb, l, false)
    bilan[r] = (bilan[r] ?? 0) + 1
  }
  return json({ ok: true, bilan })
})
