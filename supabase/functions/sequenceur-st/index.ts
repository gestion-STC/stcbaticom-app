// Moteur du recrutement sous-traitants — à lancer par pg_cron (toutes les ~10 min).
//
// À chaque passage :
//   1) CONVERSIONS : repère les sous-traitants qui ont déposé leur dossier sur le
//      site (table dossiers_st, même base) en croisant par e-mail → les passe en
//      « depose » (ce qui STOPPE leur séquence).
//   2) DÉMARRAGE PILOTÉ PAR LE VOLUME : ne met en séquence que le nombre voulu de
//      nouveaux ST (objectif_hebdo sur 7 jours glissants) — pour ne pas cramer la base.
//   3) ENVOIS : pour chaque ST en séquence, envoie l'étape due (J+X atteint, pas déjà
//      envoyée), via envoyer-email ou envoyer-sms, dans la limite du plafond/jour et
//      de la plage horaire. Anti-doublon : jamais deux fois la même étape.
//
// Utilise la clé service_role (fournie automatiquement) → passe au-dessus de RLS.
// Verify JWT peut rester ACTIVÉ (pg_cron appelle avec l'en-tête service_role).
//
// ⚠️ HYPOTHÈSE À VÉRIFIER : la table `dossiers_st` (backend du site vitrine) possède
//    une colonne `email` et une colonne `id`. Si les noms diffèrent, ajuster la
//    section CONVERSIONS (constantes COL_EMAIL / requête dossiers_st).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" }
const COL_EMAIL = "email" // colonne e-mail dans dossiers_st (à confirmer)
const JOUR_MS = 86_400_000

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } })
}

// Heure murale (HH:MM) et jour (1=lundi … 7=dimanche) à Paris.
function maintenantParis(d: Date): { heure: string; jour: number } {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  const jours: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return { heure: `${p.hour}:${p.minute}`, jour: jours[p.weekday] ?? 1 }
}

function echapper(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Transforme le texte d'un e-mail en HTML simple : retours à la ligne + lien cliquable.
function texteVersHtml(texte: string, lien: string): string {
  const html = echapper(texte).replaceAll(echapper(lien), `<a href="${lien}">${lien}</a>`).replace(/\n/g, "<br>")
  return `<div style="font-family:Montserrat,Arial,sans-serif;font-size:14px;color:#1e293b">${html}</div>`
}

function remplir(texte: string, st: Record<string, unknown>, lien: string): string {
  return String(texte || "")
    .replaceAll("{{contact}}", String(st.contact || ""))
    .replaceAll("{{entreprise}}", String(st.entreprise || ""))
    .replaceAll("{{metier}}", String(st.metier || ""))
    .replaceAll("{{lien}}", lien)
}

async function invoquer(base: string, cle: string, fonction: string, body: unknown) {
  const r = await fetch(`${base}/functions/v1/${fonction}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok && data?.ok !== false, data }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })

  const base = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const sb: SupabaseClient = createClient(base, service)
  const now = new Date()
  const nowIso = now.toISOString()
  const bilan = { conversions: 0, demarrages: 0, envois: 0, erreurs: 0, saut: "" as string | null }

  try {
    // --- Pilotage ------------------------------------------------------------
    const { data: pil } = await sb.from("st_pilotage").select("*").eq("id", 1).maybeSingle()
    if (!pil || !pil.actif) return json({ ...bilan, saut: "inactif" })

    // --- 1) CONVERSIONS : qui a déposé son dossier sur le site ? -------------
    // On croise les e-mails de dossiers_st avec les ST pas encore « déposé ».
    const { data: enCours } = await sb
      .from("st_sous_traitants")
      .select("id, email")
      .neq("statut", "depose")
      .not("email", "is", null)
    const parEmail = new Map<string, string>() // email → st.id
    for (const s of enCours ?? []) {
      const e = String(s.email || "").trim().toLowerCase()
      if (e) parEmail.set(e, s.id)
    }
    if (parEmail.size > 0) {
      const { data: dossiers } = await sb.from("dossiers_st").select(`id, ${COL_EMAIL}`)
      for (const d of dossiers ?? []) {
        const e = String((d as Record<string, unknown>)[COL_EMAIL] || "").trim().toLowerCase()
        const stId = e && parEmail.get(e)
        if (stId) {
          await sb
            .from("st_sous_traitants")
            .update({ statut: "depose", depose_le: nowIso, dossier_id: (d as { id: string }).id })
            .eq("id", stId)
          parEmail.delete(e) // évite de recompter
          bilan.conversions++
        }
      }
    }

    // Séquence en vigueur (celle du pilotage, sinon la séquence marquée active).
    let sequenceId = pil.sequence_id as string | null
    if (!sequenceId) {
      const { data: act } = await sb.from("st_sequences").select("id").eq("actif", true).maybeSingle()
      sequenceId = act?.id ?? null
    }
    if (!sequenceId) return json({ ...bilan, saut: "aucune séquence active" })

    // --- Fenêtre d'envoi (jour + plage horaire, à Paris) ---------------------
    // Le démarrage et les conversions se font quand même ; seuls les ENVOIS
    // respectent la plage (on n'écrit pas aux artisans à 3h du matin).
    const { heure, jour } = maintenantParis(now)
    const joursOk: number[] = pil.jours ?? [1, 2, 3, 4, 5]
    const dansPlage =
      joursOk.includes(jour) &&
      heure >= String(pil.heure_min ?? "09:00").slice(0, 5) &&
      heure <= String(pil.heure_max ?? "18:00").slice(0, 5)

    // --- 2) DÉMARRAGE piloté par le volume, MÉTIER PAR MÉTIER ----------------
    // Pour chaque objectif actif (ex. Plombier: 2/sem), on démarre juste ce qu'il
    // faut de ST de CE métier (7 jours glissants). Insensible à la casse (ilike).
    const depuis7j = new Date(now.getTime() - 7 * JOUR_MS).toISOString()
    const { data: objectifs } = await sb.from("st_objectifs").select("*").eq("actif", true)
    for (const o of objectifs ?? []) {
      const metier = String(o.metier || "").trim()
      const cible = Number(o.objectif_hebdo ?? 0)
      if (!metier || cible <= 0) continue

      const { count: demarresRecents } = await sb
        .from("st_sous_traitants")
        .select("id", { count: "exact", head: true })
        .ilike("metier", metier)
        .gte("demarre_le", depuis7j)
      const aDemarrer = Math.max(0, cible - (demarresRecents ?? 0))
      if (aDemarrer <= 0) continue

      const { data: aContacter } = await sb
        .from("st_sous_traitants")
        .select("id")
        .eq("statut", "a_contacter")
        .ilike("metier", metier)
        .order("cree_le", { ascending: true })
        .limit(aDemarrer)
      for (const s of aContacter ?? []) {
        await sb
          .from("st_sous_traitants")
          .update({ statut: "en_sequence", demarre_le: nowIso, etape_courante: 0, sequence_id: sequenceId })
          .eq("id", s.id)
        bilan.demarrages++
      }
    }

    if (!dansPlage) return json({ ...bilan, saut: "hors plage horaire (envois reportés)" })

    // --- 3) ENVOIS -----------------------------------------------------------
    const { data: etapes } = await sb
      .from("st_etapes")
      .select("*")
      .eq("sequence_id", sequenceId)
      .eq("actif", true)
      .order("ordre", { ascending: true })
    if (!etapes || etapes.length === 0) return json({ ...bilan, saut: "séquence sans étape active" })

    // Plafond du jour (24 h glissantes) : combien d'envois réussis déjà faits.
    const depuis24h = new Date(now.getTime() - JOUR_MS).toISOString()
    const { count: faits24h } = await sb
      .from("st_envois")
      .select("id", { count: "exact", head: true })
      .eq("statut", "envoye")
      .gte("envoye_le", depuis24h)
    let budget = Math.max(0, Number(pil.plafond_jour ?? 20) - (faits24h ?? 0))
    if (budget <= 0) return json({ ...bilan, saut: "plafond du jour atteint" })

    // Les ST actuellement en séquence sur cette séquence.
    const { data: stEnSeq } = await sb
      .from("st_sous_traitants")
      .select("*")
      .eq("statut", "en_sequence")
      .eq("sequence_id", sequenceId)
      .order("demarre_le", { ascending: true })

    // Étapes déjà traitées (envoyées OU en erreur) pour ne pas les rejouer.
    const ids = (stEnSeq ?? []).map((s) => s.id)
    const traite = new Set<string>() // `${stId}:${etapeId}`
    if (ids.length > 0) {
      const { data: envois } = await sb.from("st_envois").select("sous_traitant_id, etape_id").in("sous_traitant_id", ids)
      for (const e of envois ?? []) traite.add(`${e.sous_traitant_id}:${e.etape_id}`)
    }

    for (const st of stEnSeq ?? []) {
      if (budget <= 0) break
      const debut = st.demarre_le ? new Date(st.demarre_le).getTime() : now.getTime()

      // Étape due la plus ancienne, pas encore traitée pour ce ST.
      const due = etapes.find((e) => {
        if (traite.has(`${st.id}:${e.id}`)) return false
        return debut + Number(e.delai_jours ?? 0) * JOUR_MS <= now.getTime()
      })
      if (!due) continue

      const lien = `${base}/functions/v1/lien-st?t=${st.token}`
      const contenu = remplir(due.contenu, st, lien)
      let envoi: { ok: boolean; erreur?: string }

      if (due.canal === "sms") {
        if (!st.telephone) envoi = { ok: false, erreur: "pas de téléphone" }
        else {
          const r = await invoquer(base, service, "envoyer-sms", { to: st.telephone, message: contenu })
          envoi = { ok: r.ok, erreur: r.ok ? undefined : String(r.data?.error || "envoi SMS échoué") }
        }
      } else {
        if (!st.email) envoi = { ok: false, erreur: "pas d'e-mail" }
        else {
          const r = await invoquer(base, service, "envoyer-email", {
            to: st.email,
            subject: remplir(due.objet, st, lien),
            html: texteVersHtml(contenu, lien),
          })
          envoi = { ok: r.ok, erreur: r.ok ? undefined : String(r.data?.error || "envoi e-mail échoué") }
        }
      }

      await sb.from("st_envois").insert({
        sous_traitant_id: st.id,
        etape_id: due.id,
        canal: due.canal,
        statut: envoi.ok ? "envoye" : "erreur",
        erreur: envoi.erreur ?? "",
      })
      traite.add(`${st.id}:${due.id}`)

      if (envoi.ok) {
        budget--
        bilan.envois++
        await sb
          .from("st_sous_traitants")
          .update({ etape_courante: etapes.indexOf(due) + 1 })
          .eq("id", st.id)
      } else {
        bilan.erreurs++
      }
    }

    return json(bilan)
  } catch (e) {
    return json({ ...bilan, error: String(e) }, 500)
  }
})
