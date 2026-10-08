// Moteur du recrutement sous-traitants — lancé par pg_cron toutes les 15 minutes.
//
// À chaque passage, dans cet ordre :
//   1) DÉPÔTS — toujours, même machine à l'arrêt : un dossier déposé sur le site
//      (table dossiers_st) se rattache à sa fiche (jeton du lien, sinon e-mail),
//      la fiche passe en « déposé » et sa séquence s'arrête. Mahdi est prévenu.
//   2) RECALAGE — une fois par mise en marche : les fiches en séquence qui ont
//      pris du retard pendant l'arrêt voient leur calendrier décalé, de sorte
//      que leur PROCHAINE étape soit due maintenant et les suivantes gardent
//      leurs écarts. Sans ça, toutes les relances tombaient d'un coup (06/10).
//   3) DÉMARRAGE — piloté par les objectifs par corps de métier : on ne met en
//      séquence que le volume nécessaire (objectif ÷ taux × 1,25), par vagues
//      capées par le budget du jour, et seulement des fiches complètes (mobile
//      ET e-mail valide, ni exclues, ni désinscrites).
//   4) ENVOIS — pour chaque fiche en séquence, l'étape due la plus ancienne :
//      canal par canal (cadence, plafond du jour et plage horaire PROPRES à
//      l'e-mail et au SMS), jamais deux touches à moins de 48 h, et UNE ERREUR
//      N'EST PLUS UNE ÉTAPE PERDUE : elle est rejouée 15 min, 1 h puis 4 h plus
//      tard avant d'être abandonnée (le 19/08, 466 envois refusés par la
//      plateforme n'avaient jamais été rejoués). Quand toutes les étapes sont
//      faites, la fiche passe en « terminé ».
//   5) ALERTE — au-delà d'un seuil d'erreurs sur la journée, un e-mail, une
//      fois par jour.
// Chaque passage est journalisé (st_passages) : l'écran Machine le montre.
//
// Clé service_role fournie par Supabase → passe au-dessus de RLS.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" }
const JOUR_MS = 86_400_000
const HEURE_MS = 3_600_000
/** Délais avant de rejouer une erreur, par tentative déjà faite. */
const REJOUER_APRES_MIN = [15, 60, 240]
/** Borne par passage : avec la cadence, un gros budget dépasserait le temps d'exécution. */
const ENVOIS_MAX_PAR_PASSAGE = 25
const TAUX_DEFAUT = 0.01, MARGE = 0.25, FENETRE_JOURS = 60, MIN_DEPOTS_FIABLE = 10

type Pilotage = Record<string, unknown> & {
  actif: boolean; sequence_id: string | null; jours: number[] | null
  plafond_jour: number; plafond_sms_jour: number; cadence_email_ms: number; cadence_sms_ms: number
  heure_min: string; heure_max: string; heure_min_sms: string; heure_max_sms: string
  delai_min_touches_h: number; tentatives_max: number; abandon_apres_jours: number
  alerte_email: string; seuil_erreurs_pct: number; recaler_au_demarrage: boolean
  actif_depuis: string | null; recale_le: string | null; adresse_envoi: string
}
type Etape = { id: string; ordre: number; canal: "email" | "sms"; delai_jours: number; objet: string; contenu: string; actif: boolean }
type Envoi = { id: string; sous_traitant_id: string; etape_id: string; statut: string; tentative: number; rejouer_apres: string | null; envoye_le: string }

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } })
}

// Heure murale (HH:MM) et jour (1=lundi … 7=dimanche) à Paris.
function maintenantParis(d: Date): { heure: string; jour: number } {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  const jours: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return { heure: `${p.hour}:${p.minute}`, jour: jours[p.weekday] ?? 1 }
}
const jourParis = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d) // AAAA-MM-JJ

function echapper(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
// Le texte d'un e-mail en HTML simple : retours à la ligne + liens cliquables.
function texteVersHtml(texte: string, liens: string[]): string {
  let html = echapper(texte)
  for (const l of liens) html = html.replaceAll(echapper(l), `<a href="${l}">${l}</a>`)
  return `<div style="font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#1e293b">${html.replace(/\n/g, "<br>")}</div>`
}

type Liens = { candidature: string; bareme: string; stop: string }
function remplir(texte: string, st: Record<string, unknown>, liens: Liens): string {
  return String(texte || "")
    .replaceAll("{{contact}}", String(st.contact || ""))
    .replaceAll("{{entreprise}}", String(st.entreprise || ""))
    .replaceAll("{{metier}}", String(st.metier || ""))
    .replaceAll("{{lien_candidature}}", liens.candidature)
    .replaceAll("{{lien_bareme}}", liens.bareme)
    .replaceAll("{{lien_desinscription}}", liens.stop)
    .replaceAll("{{lien}}", liens.candidature) // rétrocompat : ancien {{lien}} = candidature
}

async function invoquer(base: string, cle: string, fonction: string, body: unknown) {
  // Une erreur réseau sur UN envoi ne doit jamais faire planter le passage.
  try {
    const r = await fetch(`${base}/functions/v1/${fonction}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
      body: JSON.stringify(body),
    })
    const data = await r.json().catch(() => ({}))
    return { ok: r.ok && data?.ok !== false, data }
  } catch (e) {
    return { ok: false, data: { error: String(e) } }
  }
}
const pause = (ms: number) => new Promise((res) => setTimeout(res, ms))

// SMS uniquement vers les MOBILES français (06/07 → 336/337 en international).
export function estMobileFR(n: string): boolean {
  let d = String(n || "").replace(/\D/g, "")
  if (d.startsWith("00")) d = d.slice(2)
  if (d.length === 12 && d.startsWith("330")) d = "33" + d.slice(3)
  else if (d.length === 10 && d.startsWith("0")) d = "33" + d.slice(1)
  return /^33[67]\d{8}$/.test(d)
}
const emailValide = (e: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(e || "").trim())
const normTel = (n: string) => String(n || "").replace(/\D/g, "")

/** La famille d'une erreur, lisible dans l'écran. */
export function causeDe(erreur: string): string {
  const e = String(erreur || "")
  if (!e) return ""
  if (/RateLimitError/i.test(e)) return "limite de débit (plateforme)"
  if (/Trop de SMS/i.test(e)) return "Ringover : SMS trop rapprochés"
  if (/Trop d'envois/i.test(e)) return "Resend : envois trop rapprochés"
  if (/pas d'e-mail/i.test(e)) return "fiche sans e-mail"
  if (/pas de téléphone/i.test(e)) return "fiche sans téléphone"
  if (/non mobile/i.test(e)) return "numéro non mobile"
  if (/Ringover a refusé/i.test(e)) return "Ringover a refusé"
  if (/Resend a refusé/i.test(e)) return "Resend a refusé"
  if (/Clé .* non configurée/i.test(e)) return "clé manquante (secret)"
  return e.slice(0, 60)
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const base = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const sb: SupabaseClient = createClient(base, service)
  const now = new Date()
  const nowIso = now.toISOString()
  const bilan = { conversions: 0, recales: 0, demarrages: 0, envois: 0, rejoues: 0, erreurs: 0, abandons: 0, termines: 0, sms_sautes_fixe: 0, saut: "" as string | null }

  const { data: passage } = await sb.from("st_passages").insert({}).select("id").single()
  const finir = async (status = 200, erreur = "") => {
    if (passage?.id) await sb.from("st_passages").update({ fin: new Date().toISOString(), bilan, erreur }).eq("id", passage.id)
    return json(erreur ? { ...bilan, error: erreur } : bilan, status)
  }

  try {
    const { data: pil } = await sb.from("st_pilotage").select("*").eq("id", 1).maybeSingle() as { data: Pilotage | null }
    if (!pil) return finir(500, "pas de ligne de réglages (st_pilotage id=1)")

    // ── 1) DÉPÔTS : toujours, même à l'arrêt ─────────────────────────────
    const { data: dossiers } = await sb.from("dossiers_st").select("id, email, raison_sociale, token_ref, sous_traitant_id, notifie_le, created_at")
      .or("sous_traitant_id.is.null,notifie_le.is.null").order("created_at", { ascending: true }).limit(50)
    for (const d of dossiers ?? []) {
      let stId: string | null = d.sous_traitant_id
      if (!stId && d.token_ref) {
        const { data: s } = await sb.from("st_sous_traitants").select("id").eq("token", d.token_ref).maybeSingle()
        stId = s?.id ?? null
      }
      if (!stId && d.email) {
        const { data: s } = await sb.from("st_sous_traitants").select("id").ilike("email", String(d.email).trim()).limit(1).maybeSingle()
        stId = s?.id ?? null
      }
      let entreprise = ""
      if (stId) {
        if (!d.sous_traitant_id) await sb.from("dossiers_st").update({ sous_traitant_id: stId }).eq("id", d.id)
        const { data: st } = await sb.from("st_sous_traitants").select("entreprise, statut").eq("id", stId).maybeSingle()
        entreprise = String(st?.entreprise || "")
        if (st && st.statut !== "depose") {
          await sb.from("st_sous_traitants").update({ statut: "depose", depose_le: d.created_at, dossier_id: d.id, statut_motif: "dossier déposé sur le site" }).eq("id", stId)
          bilan.conversions++
        }
      }
      // Prévenir, une fois par dossier (même non rattaché : il faut le regarder).
      if (!d.notifie_le && pil.alerte_email) {
        const cle = `dossier:${d.id}`
        const { error: deja } = await sb.from("st_alertes").insert({ cle, detail: String(d.raison_sociale || "") })
        if (!deja) {
          await invoquer(base, service, "envoyer-email", {
            espace: "recrutement",
            to: pil.alerte_email,
            subject: `Dossier déposé — ${d.raison_sociale || d.email}`,
            html: texteVersHtml(
              `Un artisan a déposé son dossier sur le site.\n\nEntreprise : ${d.raison_sociale || "(sans nom)"}\nE-mail : ${d.email || "—"}\n${stId ? `Fiche de recrutement : ${entreprise || "rattachée"} (séquence arrêtée)` : "⚠ Aucune fiche de recrutement ne correspond : à rattacher depuis l'onglet Dossiers déposés."}`,
              [],
            ),
          })
        }
        await sb.from("dossiers_st").update({ notifie_le: nowIso }).eq("id", d.id)
      }
    }

    if (!pil.actif) { bilan.saut = "inactif"; return finir() }

    // Séquence en vigueur (celle des réglages, sinon la séquence marquée active).
    let sequenceId = pil.sequence_id
    if (!sequenceId) {
      const { data: act } = await sb.from("st_sequences").select("id").eq("actif", true).maybeSingle()
      sequenceId = act?.id ?? null
    }
    if (!sequenceId) { bilan.saut = "aucune séquence active"; return finir() }
    const { data: etapesBrutes } = await sb.from("st_etapes").select("*").eq("sequence_id", sequenceId).eq("actif", true).order("ordre", { ascending: true })
    const etapes = (etapesBrutes ?? []) as Etape[]
    if (etapes.length === 0) { bilan.saut = "séquence sans étape active"; return finir() }

    // Les envois déjà faits, par fiche : « traité » = envoyé, sauté ou abandonné ;
    // « en erreur » = à rejouer (ou à abandonner si les tentatives sont épuisées).
    const traiteDe = new Map<string, Set<string>>()
    const erreurDe = new Map<string, Map<string, Envoi>>()
    const chargerEnvois = async (ids: string[]) => {
      for (let i = 0; i < ids.length; i += 500) {
        const { data } = await sb.from("st_envois").select("id, sous_traitant_id, etape_id, statut, tentative, rejouer_apres, envoye_le")
          .in("sous_traitant_id", ids.slice(i, i + 500)).order("envoye_le", { ascending: true })
        for (const e of (data ?? []) as Envoi[]) {
          if (e.statut === "envoye" || e.statut === "saute" || e.statut === "abandonne") {
            if (!traiteDe.has(e.sous_traitant_id)) traiteDe.set(e.sous_traitant_id, new Set())
            traiteDe.get(e.sous_traitant_id)!.add(e.etape_id)
            erreurDe.get(e.sous_traitant_id)?.delete(e.etape_id)
          } else if (e.statut === "erreur") {
            if (!erreurDe.has(e.sous_traitant_id)) erreurDe.set(e.sous_traitant_id, new Map())
            erreurDe.get(e.sous_traitant_id)!.set(e.etape_id, e) // la plus récente l'emporte (tri croissant)
          }
        }
      }
    }
    const estTraite = (stId: string, etapeId: string) => traiteDe.get(stId)?.has(etapeId) ?? false
    const marquerTraite = (stId: string, etapeId: string) => {
      const s = traiteDe.get(stId)
      if (s) s.add(etapeId)
      else traiteDe.set(stId, new Set([etapeId]))
    }

    // ── 2) RECALAGE, une fois par mise en marche ─────────────────────────
    const aRecaler = pil.recaler_au_demarrage && pil.actif_depuis && (!pil.recale_le || pil.recale_le < pil.actif_depuis)
    const { data: enSeqTous } = await sb.from("st_sous_traitants").select("id, demarre_le").eq("statut", "en_sequence").eq("sequence_id", sequenceId)
    const idsEnSeq = (enSeqTous ?? []).map((s) => s.id as string)
    if (idsEnSeq.length) await chargerEnvois(idsEnSeq)
    if (aRecaler) {
      for (const s of enSeqTous ?? []) {
        const prochaine = etapes.find((e) => !estTraite(s.id, e.id))
        if (!prochaine) {
          await sb.from("st_sous_traitants").update({ statut: "termine", termine_le: nowIso, statut_motif: "toutes les étapes reçues" }).eq("id", s.id)
          bilan.termines++
          continue
        }
        const nouveauDebut = new Date(now.getTime() - Number(prochaine.delai_jours ?? 0) * JOUR_MS)
        // Seulement si la fiche est vraiment en retard (sa prochaine étape était due avant aujourd'hui).
        const ancienDebut = s.demarre_le ? new Date(s.demarre_le).getTime() : now.getTime()
        if (ancienDebut + Number(prochaine.delai_jours ?? 0) * JOUR_MS < now.getTime() - JOUR_MS) {
          await sb.from("st_sous_traitants").update({ demarre_le: nouveauDebut.toISOString(), recale_le: nowIso }).eq("id", s.id)
          bilan.recales++
        }
      }
      await sb.from("st_pilotage").update({ recale_le: nowIso }).eq("id", 1)
    }

    // ── Fenêtres et budgets, PAR CANAL ────────────────────────────────────
    const { heure, jour } = maintenantParis(now)
    const joursOk: number[] = pil.jours ?? [1, 2, 3, 4, 5]
    const dans = (min: unknown, max: unknown, defMin: string, defMax: string) =>
      joursOk.includes(jour) && heure >= String(min ?? defMin).slice(0, 5) && heure <= String(max ?? defMax).slice(0, 5)
    const plage = { email: dans(pil.heure_min, pil.heure_max, "09:00", "18:00"), sms: dans(pil.heure_min_sms, pil.heure_max_sms, "10:00", "17:00") }
    const depuis24h = new Date(now.getTime() - JOUR_MS).toISOString()
    const faits = async (canal: string) => {
      const { count } = await sb.from("st_envois").select("id", { count: "exact", head: true }).eq("statut", "envoye").eq("canal", canal).gte("envoye_le", depuis24h)
      return count ?? 0
    }
    const budget = {
      email: Math.max(0, Number(pil.plafond_jour ?? 100) - (await faits("email"))),
      sms: Math.max(0, Number(pil.plafond_sms_jour ?? 40) - (await faits("sms"))),
    }

    // ── 3) DÉMARRAGE adaptatif, corps par corps ───────────────────────────
    const depuis60j = new Date(now.getTime() - FENETRE_JOURS * JOUR_MS).toISOString()
    const { count: contactes60 } = await sb.from("st_sous_traitants").select("id", { count: "exact", head: true }).gte("demarre_le", depuis60j)
    const { count: depots60 } = await sb.from("st_sous_traitants").select("id", { count: "exact", head: true }).gte("depose_le", depuis60j)
    const tauxFiable = (depots60 ?? 0) >= MIN_DEPOTS_FIABLE && (contactes60 ?? 0) > 0
    const taux = tauxFiable ? (depots60 ?? 0) / (contactes60 ?? 1) : TAUX_DEFAUT
    // Une vague de démarrage ne dépasse jamais le budget du canal de la 1re étape :
    // chaque démarré doit recevoir sa première touche sans creuser une file.
    let vagueDispo = budget[etapes[0].canal]
    const { data: exclusions } = await sb.from("st_exclusions").select("email, telephone")
    const emailsExclus = new Set((exclusions ?? []).map((x) => String(x.email || "").toLowerCase().trim()).filter(Boolean))
    const telsExclus = new Set((exclusions ?? []).map((x) => normTel(String(x.telephone || ""))).filter(Boolean))
    const depuis7j = new Date(now.getTime() - 7 * JOUR_MS).toISOString()
    const { data: objectifs } = await sb.from("st_objectifs").select("*").eq("actif", true)
    for (const o of objectifs ?? []) {
      const metier = String(o.metier || "").trim()
      const voulu = Number(o.objectif_hebdo ?? 0)
      if (!metier || voulu <= 0 || vagueDispo <= 0) continue
      const volumeHebdo = Math.ceil((voulu / taux) * (1 + MARGE))
      const { count: demarresRecents } = await sb.from("st_sous_traitants").select("id", { count: "exact", head: true }).ilike("metier", `%${metier}%`).gte("demarre_le", depuis7j)
      const aDemarrer = Math.min(vagueDispo, Math.max(0, volumeHebdo - (demarresRecents ?? 0)))
      if (aDemarrer <= 0) continue
      const { data: candidats } = await sb.from("st_sous_traitants").select("id, telephone, email")
        .eq("statut", "a_contacter").eq("email_invalide", false).ilike("metier", `%${metier}%`)
        .order("cree_le", { ascending: true }).limit(aDemarrer * 4 + 20)
      const retenus = (candidats ?? []).filter((s) =>
        estMobileFR(String(s.telephone || "")) && emailValide(String(s.email || ""))
        && !emailsExclus.has(String(s.email).toLowerCase().trim()) && !telsExclus.has(normTel(String(s.telephone)))
      ).slice(0, aDemarrer)
      for (const s of retenus) {
        await sb.from("st_sous_traitants").update({ statut: "en_sequence", demarre_le: nowIso, etape_courante: 0, sequence_id: sequenceId, statut_motif: `campagne ${metier}` }).eq("id", s.id)
        bilan.demarrages++
        vagueDispo--
      }
    }

    // ── 4) ENVOIS ─────────────────────────────────────────────────────────
    if (!plage.email && !plage.sms) { bilan.saut = "hors plage horaire (envois reportés)"; return finir() }
    const { data: stEnSeq } = await sb.from("st_sous_traitants").select("*")
      .eq("statut", "en_sequence").eq("sequence_id", sequenceId).order("demarre_le", { ascending: true })
    const nouveaux = (stEnSeq ?? []).map((s) => s.id as string).filter((id) => !idsEnSeq.includes(id))
    if (nouveaux.length) await chargerEnvois(nouveaux)

    const delaiMinMs = Number(pil.delai_min_touches_h ?? 48) * HEURE_MS
    const tentativesMax = Number(pil.tentatives_max ?? 3)
    const abandonMs = Number(pil.abandon_apres_jours ?? 21) * JOUR_MS
    let envoisPassage = 0

    for (const st of stEnSeq ?? []) {
      if (envoisPassage >= ENVOIS_MAX_PAR_PASSAGE) break
      if (st.pause_jusqu_au && new Date(st.pause_jusqu_au).getTime() > now.getTime()) continue
      if (st.dernier_envoi_le && now.getTime() - new Date(st.dernier_envoi_le).getTime() < delaiMinMs) continue
      const debut = st.demarre_le ? new Date(st.demarre_le).getTime() : now.getTime()

      // L'étape due la plus ancienne, pas encore traitée.
      let due: Etape | undefined
      let tentative = 1
      let aSauter = false
      for (const e of etapes) {
        if (estTraite(st.id, e.id)) continue
        const echeance = debut + Number(e.delai_jours ?? 0) * JOUR_MS
        if (echeance > now.getTime()) break // pas encore due : les suivantes non plus
        const err = erreurDe.get(st.id)?.get(e.id)
        if (err) {
          if (err.tentative >= tentativesMax) {
            await sb.from("st_envois").update({ statut: "abandonne" }).eq("id", err.id)
            marquerTraite(st.id, e.id)
            bilan.abandons++
            continue
          }
          if (err.rejouer_apres && new Date(err.rejouer_apres).getTime() > now.getTime()) { aSauter = true; break }
          tentative = err.tentative + 1
        } else if (now.getTime() - echeance > abandonMs) {
          // Trop ancienne et jamais tentée (fiche restée en pause, par exemple) : on saute.
          await sb.from("st_envois").insert({ sous_traitant_id: st.id, etape_id: e.id, canal: e.canal, statut: "saute", erreur: "étape trop ancienne, sautée", cause: "trop ancienne" })
          marquerTraite(st.id, e.id)
          continue
        }
        due = e
        break
      }
      if (aSauter) continue
      if (!due) {
        if (etapes.every((e) => estTraite(st.id, e.id))) {
          await sb.from("st_sous_traitants").update({ statut: "termine", termine_le: nowIso, statut_motif: "toutes les étapes reçues" }).eq("id", st.id)
          bilan.termines++
        }
        continue
      }
      if (!plage[due.canal] || budget[due.canal] <= 0) continue

      const liens: Liens = {
        candidature: `${base}/functions/v1/lien-st?t=${st.token}&d=candidature`,
        bareme: `${base}/functions/v1/lien-st?t=${st.token}&d=bareme`,
        stop: `${base}/functions/v1/lien-st?t=${st.token}&d=stop`,
      }
      const contenu = remplir(due.contenu, st, liens)
      let envoi: { ok: boolean; erreur?: string; resendId?: string }

      if (due.canal === "sms") {
        if (!st.telephone) envoi = { ok: false, erreur: "pas de téléphone" }
        else if (!estMobileFR(st.telephone)) {
          // Un fixe ne recevra jamais le SMS mais l'envoi serait facturé : on saute.
          await sb.from("st_envois").insert({ sous_traitant_id: st.id, etape_id: due.id, canal: "sms", statut: "saute", erreur: `numéro non mobile (${st.telephone}) — SMS non envoyé, étape sautée`, cause: "numéro non mobile" })
          marquerTraite(st.id, due.id)
          await sb.from("st_sous_traitants").update({ etape_courante: etapes.indexOf(due) + 1 }).eq("id", st.id)
          bilan.sms_sautes_fixe++
          continue
        } else {
          const r = await invoquer(base, service, "envoyer-sms", { to: st.telephone, message: contenu })
          envoi = { ok: r.ok, erreur: r.ok ? undefined : String(r.data?.error || "envoi SMS échoué") }
        }
      } else {
        if (!st.email) envoi = { ok: false, erreur: "pas d'e-mail" }
        else {
          const estHtml = /<(html|body|table|div|p|a|img|tr|td)\b/i.test(due.contenu)
          const html = estHtml ? contenu : texteVersHtml(contenu, [liens.candidature, liens.bareme, liens.stop])
          const r = await invoquer(base, service, "envoyer-email", {
            espace: "recrutement",
            to: st.email,
            subject: remplir(due.objet, st, liens),
            html,
            headers: { "List-Unsubscribe": `<${liens.stop}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          })
          envoi = { ok: r.ok, erreur: r.ok ? undefined : String(r.data?.error || "envoi e-mail échoué"), resendId: r.ok ? String(r.data?.id || "") : undefined }
        }
      }

      const cause = causeDe(envoi.erreur ?? "")
      await sb.from("st_envois").insert({
        sous_traitant_id: st.id, etape_id: due.id, canal: due.canal,
        statut: envoi.ok ? "envoye" : "erreur", erreur: envoi.erreur ?? "", cause, tentative,
        rejouer_apres: envoi.ok ? null : new Date(now.getTime() + (REJOUER_APRES_MIN[tentative - 1] ?? 240) * 60_000).toISOString(),
        resend_id: envoi.resendId || null,
      })
      if (envoi.ok) {
        marquerTraite(st.id, due.id)
        budget[due.canal]--
        envoisPassage++
        bilan.envois++
        if (tentative > 1) bilan.rejoues++
        await sb.from("st_sous_traitants").update({ etape_courante: etapes.indexOf(due) + 1, dernier_envoi_le: nowIso, nb_envois_ok: Number(st.nb_envois_ok ?? 0) + 1, derniere_erreur: "" }).eq("id", st.id)
        await pause(due.canal === "sms" ? Number(pil.cadence_sms_ms ?? 3000) : Number(pil.cadence_email_ms ?? 700))
      } else {
        bilan.erreurs++
        await sb.from("st_sous_traitants").update({ nb_envois_erreur: Number(st.nb_envois_erreur ?? 0) + 1, derniere_erreur: envoi.erreur ?? "" }).eq("id", st.id)
        // Une limite de débit touche tout le monde : inutile d'insister ce passage-ci.
        if (/débit|rapprochés|RateLimit/i.test(cause)) break
      }
    }

    // ── 5) ALERTE du jour ─────────────────────────────────────────────────
    if (pil.alerte_email) {
      const debutJour = new Date(now.getTime() - 24 * HEURE_MS).toISOString()
      const { count: ok } = await sb.from("st_envois").select("id", { count: "exact", head: true }).eq("statut", "envoye").gte("envoye_le", debutJour)
      const { count: ko } = await sb.from("st_envois").select("id", { count: "exact", head: true }).eq("statut", "erreur").gte("envoye_le", debutJour)
      const total = (ok ?? 0) + (ko ?? 0)
      if ((ko ?? 0) >= 10 && total > 0 && (100 * (ko ?? 0)) / total >= Number(pil.seuil_erreurs_pct ?? 20)) {
        const cle = `erreurs:${jourParis(now)}`
        const { error: deja } = await sb.from("st_alertes").insert({ cle, detail: `${ko} erreurs sur ${total}` })
        if (!deja) {
          await invoquer(base, service, "envoyer-email", {
            espace: "recrutement", to: pil.alerte_email,
            subject: `Machine de recrutement : ${ko} envois en erreur sur ${total} aujourd'hui`,
            html: texteVersHtml(`La machine a eu ${ko} envois en erreur sur ${total} ces 24 dernières heures. Elle rejoue chaque erreur jusqu'à ${tentativesMax} fois ; le détail par cause est dans l'onglet Machine du CRM.`, []),
          })
        }
      }
    }

    return finir()
  } catch (e) {
    return finir(500, String(e))
  }
})
