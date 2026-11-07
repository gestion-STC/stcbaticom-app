// ════════════════════════════════════════════════════════════════════════════
// PROPOSER LE RÉSULTAT DE L'APPEL, DÈS LE RACCROCHÉ (07/11/2026, Mahdi : « l'IA analyse l'appel et
// propose le résultat ; le commercial valide ou modifie » — « il attend 15-20 secondes max, il
// enchaîne 100 appels par jour »).
//
// L'écran l'appelle quand Ringover dit que l'appel est fini : { activite_id, call_id }, avec la
// session du commercial. Chaîne courte, pensée pour aller vite : la fiche Ringover (l'enregistrement
// arrive quelques secondes après le raccroché), la transcription ElevenLabs, puis UNE réponse courte
// d'un modèle rapide : le résultat, l'issue, la phrase qui le prouve, le mail de suivi.
// L'IA ne voit PAS ce que le commercial a noté : sa proposition est à l'aveugle, c'est ce qui permet
// de mesurer sa justesse. Elle est rangée dans `appels_propositions` (SQL maj-2026-11-07), avec la
// transcription, que l'analyse complète (analyser-appel) reprend ensuite sans la repayer.
// Le mail n'est JAMAIS envoyé ici : il part de l'écran, quand le commercial valide.
//
// Secrets : les mêmes qu'analyser-appel (RINGOVER_API_KEY, ELEVENLABS_API_KEY, ANTHROPIC_API_KEY).
// ⚠ call_id > 2^53 : toujours en TEXTE.
// ════════════════════════════════════════════════════════════════════════════
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import Anthropic from "npm:@anthropic-ai/sdk@0.137.0"

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } })

const RINGOVER = "https://public-api.ringover.com/v2"
const MODELE = "claude-haiku-5-5"   // le plus rapide : la proposition doit tomber en ~10 s
const ATTENTE_MAX_MS = 25_000       // l'enregistrement met quelques secondes à arriver chez Ringover
const PAUSE_MS = 1500

type AppelRingover = { is_answered?: boolean; incall_duration?: number; total_duration?: number; record?: string | null; record_url?: string | null }
const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))

function lireJsonRingover(texte: string): unknown {
  return JSON.parse(texte.replace(/"(call_id|cdr_id|user_id|channel_id)"\s*:\s*(\d{15,})/g, '"$1":"$2"'))
}
async function appelRingover(callId: string): Promise<AppelRingover | null> {
  // Header « Authorization: <clé> », SANS « Bearer ».
  const r = await fetch(`${RINGOVER}/calls/${encodeURIComponent(callId)}`, { headers: { Authorization: Deno.env.get("RINGOVER_API_KEY") || "" } })
  if (r.status === 204 || r.status === 404) return null
  if (!r.ok) throw new Error(`Ringover répond ${r.status}`)
  const d = lireJsonRingover(await r.text()) as { list?: AppelRingover[] } & AppelRingover
  return Array.isArray(d?.list) ? d.list[0] ?? null : d
}

/** Même transcription qu'analyser-appel (tours de parole « Voix 1 / Voix 2 ») : l'analyse la reprend telle quelle. */
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

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resultat", "issue", "preuve", "mail"],
  properties: {
    resultat: { type: "string", enum: ["pas_de_reponse", "standard", "joint", "faux_numero"], description: "joint = un gestionnaire ou un décideur des travaux en ligne ; standard = quelqu'un a décroché mais pas un décideur ; pas_de_reponse = répondeur, messagerie, personne ; faux_numero = mauvais numéro, agence fermée ou hors cible" },
    issue: { type: "string", enum: ["", "interesse", "rdv", "a_rappeler", "pas_interesse"], description: "Seulement si joint : interesse (veut une plaquette, des infos, nous essayer), rdv (un rendez-vous est fixé), a_rappeler (il demande d'être rappelé plus tard), pas_interesse. Vide sinon." },
    preuve: { type: "string", description: "Une phrase courte qui justifie la proposition : la citation exacte de l'interlocuteur entre « », ou un constat factuel. 25 mots maximum." },
    mail: {
      type: "object", additionalProperties: false, required: ["pertinent", "objet", "corps"],
      properties: {
        pertinent: { type: "boolean", description: "Un mail de suivi a-t-il du sens (un décideur ou un accueil qui renvoie vers un mail) ?" },
        objet: { type: "string" },
        corps: { type: "string", description: "Texte brut, sans signature." },
      },
    },
  },
} as const
type Proposition = { resultat: string; issue: string; preuve: string; mail: { pertinent: boolean; objet: string; corps: string } }

const CONSIGNES = `Tu écoutes un appel de prospection de STC Bâtiment, entreprise de travaux et de dépannage qui travaille pour les gestionnaires locatifs, syndics et agences immobilières : elle prend en charge leurs ordres de service de bout en bout (contact du locataire, prévisite, devis gratuit, intervention, suivi). Le commercial appelle une agence pour être référencé.

La transcription est en tours de parole « Voix 1 / Voix 2 » : déduis qui est le commercial et qui est l'interlocuteur.

Tu proposes le résultat à noter dans le logiciel. Le commercial le validera ou le corrigera.
- N'invente rien : seulement ce qui est dit dans l'appel ou donné dans le contexte.
- Mail : un mail de suivi en français, vouvoiement, ton professionnel et simple, 70 à 140 mots. Il rappelle un ou deux détails concrets de l'échange, reprend ce qui a été demandé ou convenu, propose une prochaine étape claire. Commence par « Bonjour » suivi du nom si on le connaît (« Bonjour Madame Petit, »), sinon « Bonjour, ». Trois ou quatre courts paragraphes séparés par une ligne vide. Termine par une formule de politesse courte, SANS signature ni nom. Ne mets AUCUN lien et ne parle pas de pièces jointes précises (elles sont ajoutées à l'envoi). Pas d'emoji. Pas de prix, de délai ni de promesse qui n'a pas été dit. Si un mail n'a pas de sens (répondeur, refus net, faux numéro), pertinent = false, objet et corps vides.`

async function proposer(transcription: string, contexte: string): Promise<Proposition> {
  const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") || "" })
  const r = await client.messages.create({
    model: MODELE,
    max_tokens: 1500,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    system: CONSIGNES,
    messages: [{ role: "user", content: `CONTEXTE\n${contexte}\n\nTRANSCRIPTION\n${transcription.slice(0, 60_000)}` }],
  } as never) as { stop_reason?: string; content?: Array<{ type: string; text?: string }> }
  if (r.stop_reason === "refusal") throw new Error("proposition refusée par le modèle")
  return JSON.parse((r.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("")) as Proposition
}

async function contexteDe(sb: SupabaseClient, agenceId: string | null, contactId: string | null): Promise<string> {
  const [{ data: a }, { data: c }] = await Promise.all([
    agenceId ? sb.from("agences").select("nom, enseigne, secteur").eq("id", agenceId).maybeSingle() : Promise.resolve({ data: null }),
    contactId ? sb.from("contacts").select("prenom, nom, role").eq("id", contactId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const ag = a as Record<string, string> | null, ct = c as Record<string, string> | null
  return [
    `Agence appelée : ${ag?.nom ?? "?"}${ag?.enseigne ? ` (${ag.enseigne})` : ""}${ag?.secteur ? `, secteur ${ag.secteur}` : ""}`,
    `Numéro composé : ${ct ? `la ligne de ${[ct.prenom, ct.nom].filter(Boolean).join(" ")}${ct.role ? ` (${ct.role})` : ""}` : "le standard de l'agence"}`,
  ].join("\n")
}

async function compte(req: Request): Promise<string | null> {
  const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "")
  if (!jeton) return null
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") || "", Authorization: `Bearer ${jeton}` } })
  if (!r.ok) return null
  const u = await r.json().catch(() => null)
  return u?.id ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405)
  const debut = Date.now()
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  // L'écran (session du commercial), ou un essai lancé depuis la base avec la clé du passage de secours.
  let qui = await compte(req)
  const clePassage = req.headers.get("x-passage-cle") || ""
  if (!qui && clePassage) {
    const { data } = await sb.from("parametres").select("valeur").eq("cle", "analyse_passage_cle").maybeSingle()
    const attendue = String((data as { valeur?: unknown } | null)?.valeur ?? "").replace(/^"|"$/g, "")
    if (attendue.length >= 20 && clePassage === attendue) qui = "essai"
  }
  if (!qui) return json({ error: "non autorisé" }, 401)
  for (const s of ["RINGOVER_API_KEY", "ELEVENLABS_API_KEY", "ANTHROPIC_API_KEY"]) if (!Deno.env.get(s)) return json({ error: `Secret ${s} manquant` }, 500)
  const corps = await req.json().catch(() => ({})) as { activite_id?: string; call_id?: string }
  if (!corps.activite_id) return json({ error: "activite_id attendu" }, 400)
  const { data: act } = await sb.from("activites").select("id, agence_id, contact_id, compte_id, call_id, type").eq("id", corps.activite_id).maybeSingle()
  const a = act as { id: string; agence_id: string | null; contact_id: string | null; compte_id: string | null; call_id: string | null; type: string } | null
  if (!a || a.type !== "appel") return json({ error: "appel introuvable" }, 404)
  const callId = String(a.call_id || corps.call_id || "")
  const ranger = (champs: Record<string, unknown>) => sb.from("appels_propositions").upsert({ activite_id: a.id, agence_id: a.agence_id, compte_id: a.compte_id ?? (qui === "essai" ? null : qui), call_id: callId, delai_ms: Date.now() - debut, ...champs })
  if (!callId) return json({ ok: true, rien: "sans identifiant Ringover" })

  try {
    // 1. La fiche Ringover, jusqu'à ce que l'enregistrement arrive (ou qu'on sache que personne n'a décroché).
    let appel = await appelRingover(callId)
    while (Date.now() - debut < ATTENTE_MAX_MS && !(appel?.record || appel?.record_url) && appel?.is_answered !== false) {
      await attendre(PAUSE_MS)
      appel = await appelRingover(callId)
    }
    const duree = Number(appel?.incall_duration ?? appel?.total_duration ?? 0) || null
    if (appel?.is_answered === false) {
      const p = { resultat: "pas_de_reponse", issue: "", preuve: "Ringover : l'appel n'a pas été décroché." }
      await ranger({ ia_resultat: p.resultat, preuve: p.preuve, duree_s: duree })
      return json({ ok: true, ...p, mail_objet: "", mail_corps: "", delai_ms: Date.now() - debut })
    }
    const url = appel?.record || appel?.record_url
    if (!url) { await ranger({ erreur: appel ? "pas d'enregistrement" : "appel inconnu de Ringover", duree_s: duree }); return json({ ok: true, rien: "pas d'enregistrement" }) }

    // 2. La transcription, puis la proposition (à l'aveugle : le choix du commercial n'est pas donné).
    const [transcription, contexte] = await Promise.all([transcrire(url), contexteDe(sb, a.agence_id, a.contact_id)])
    if (transcription.trim().length < 15) {
      const p = { resultat: "pas_de_reponse", issue: "", preuve: "Personne n'a parlé dans l'enregistrement." }
      await ranger({ ia_resultat: p.resultat, preuve: p.preuve, transcription, duree_s: duree })
      return json({ ok: true, ...p, mail_objet: "", mail_corps: "", delai_ms: Date.now() - debut })
    }
    const p = await proposer(transcription, contexte)
    const issue = p.resultat === "joint" ? p.issue : ""
    const mail = p.mail.pertinent && (p.resultat === "joint" || p.resultat === "standard") ? p.mail : { objet: "", corps: "" }
    await ranger({ ia_resultat: p.resultat, ia_issue: issue, preuve: p.preuve, mail_objet: mail.objet, mail_corps: mail.corps, transcription, duree_s: duree })
    return json({ ok: true, resultat: p.resultat, issue, preuve: p.preuve, mail_objet: mail.objet, mail_corps: mail.corps, delai_ms: Date.now() - debut })
  } catch (e) {
    const m = String((e as Error)?.message ?? e).slice(0, 500)
    await ranger({ erreur: m })
    return json({ ok: false, error: m })
  }
})
