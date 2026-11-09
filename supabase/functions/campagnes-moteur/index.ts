// ════════════════════════════════════════════════════════════════════════════
// LE MOTEUR DES CAMPAGNES, CÔTÉ SERVEUR (07/11/2026) — passe toutes les 10 min (pg_cron, clé du passage).
//
// La décision (qui entre, quelle étape est due, A/B, « Si… », 48 h entre touches) est le moteur PUR
// partagé avec l'écran (_shared/campagnes/moteur.ts, copie exacte de src/prospection/moteur.ts, vérifiée
// par un test). Ici, l'exécution, avec les garde-fous de la machine sous-traitants (sequenceur-st) :
//   · budget par jour et par canal (réglé dans la campagne), 25 envois au plus par passage, cadence entre deux envois ;
//   · écart entre deux campagnes et exclusions de la campagne : valent pour les NOUVELLES entrées ;
//   · SMS seulement de 10 h à 17 h (heure de Paris), et seulement vers un mobile ;
//   · juste avant d'envoyer, la base est relue : jamais deux fois la même étape au même contact ;
//   · une erreur est rejouée après 15 min, 1 h, 4 h, puis abandonnée ; une limite de débit arrête le passage ;
//   · MODE TEST : tout part vers l'adresse et le mobile de test de la campagne, marqué « test ».
// Les mails partent par Instantly (_shared/campagnes/instantly.ts), JAMAIS par Resend : son règlement interdit la
// prospection et son compte fait tourner STC Bâtiment. Les SMS passent par envoyer-sms. Les retours arrivent par
// instantly-evenements et par les liens suivis, rattachés à la campagne par les déclencheurs du SQL du 07/11.
// Une campagne s'arrête pour un contact devenu lead (leads_demarchage, clic d'artisan), gagné,
// exclu ou désinscrit : il est alors dans la session de call de son équipe.
// ════════════════════════════════════════════════════════════════════════════
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { passage, heureParis } from "../_shared/campagnes/moteur.ts"
import type { Campagne, Contact, Envoi, Evenement, Inscription } from "../_shared/campagnes/modele.ts"
import { lienPublic } from "../_shared/campagnes/lien.ts"
import { envoyerParInstantly, preparerInstantly, type ContexteInstantly } from "../_shared/campagnes/instantly.ts"

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })
const JOUR_MS = 86_400_000
const ENVOIS_MAX_PAR_PASSAGE = 25
const PLAFOND_JOUR = { mail: 200, sms: 40 } as const
const CADENCE_MS = { mail: 700, sms: 3000 } as const
const REJOUER_APRES_MIN = [15, 60, 240]
const TENTATIVES_MAX = 3
const LIEN_NEUTRE = "https://www.stcbatiment.fr"
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const jourParisIso = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d)

type Ligne = Record<string, unknown>
async function tout<T>(q: (d: number, f: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let d = 0; ; d += 1000) {
    const { data, error } = await q(d, d + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

const versCampagne = (l: Ligne): Campagne => ({
  id: String(l.id), nom: String(l.nom), baseId: String(l.base_id), objectif: String(l.objectif ?? ""), statut: l.statut as Campagne["statut"],
  audience: l.audience as Campagne["audience"], rythme: l.rythme as Campagne["rythme"], etapes: l.etapes as Campagne["etapes"], signaux: (l.signaux ?? []) as Campagne["signaux"],
  creeParId: String(l.cree_par ?? ""), creeLe: String(l.cree_le), lanceeLe: (l.lancee_le as string) ?? null, coutSms: Number(l.cout_sms ?? 0),
})
const versContact = (l: Ligne): Contact => ({
  id: String(l.id), baseId: String(l.base_id), nom: String(l.nom ?? ""), personne: String(l.personne ?? ""), email: String(l.email ?? ""), mobile: String(l.mobile ?? ""), telephone: String(l.telephone ?? ""),
  champs: (l.champs ?? {}) as Record<string, string>, statut: l.statut as Contact["statut"], desinscrit: Boolean(l.desinscrit), proprietaireId: (l.proprietaire_id as string) ?? null,
})
const versInscription = (l: Ligne): Inscription => ({ id: String(l.id), campagneId: String(l.campagne_id), contactId: String(l.contact_ref), entreeLe: String(l.entree_le), etapeIndex: Number(l.etape_index), prochaineLe: new Date(String(l.prochaine_le)).toISOString(), statut: l.statut as Inscription["statut"], sortieLe: (l.sortie_le as string) ?? null })
const versEnvoi = (l: Ligne): Envoi => ({ id: String(l.id), campagneId: String(l.campagne_id), inscriptionId: String(l.inscription_id), contactId: String(l.contact_ref), etapeId: String(l.etape_id), varianteId: (l.variante_id as string) ?? null, canal: l.canal as Envoi["canal"], le: new Date(String(l.le)).toISOString(), statut: l.statut as Envoi["statut"], cause: String(l.cause ?? "") })
const versEvenement = (l: Ligne): Evenement => ({ id: String(l.id), campagneId: String(l.campagne_id), envoiId: (l.envoi_id as string) ?? null, contactId: String(l.contact_ref), type: l.type as Evenement["type"], le: new Date(String(l.le)).toISOString(), lien: (l.lien as string) ?? undefined })

function causeDe(erreur: string): string {
  if (/RateLimit|Trop d'envois|Trop de SMS|429/i.test(erreur)) return "limite de débit (prestataire)"
  if (/non mobile/i.test(erreur)) return "numéro non mobile"
  if (/Resend a refusé/i.test(erreur)) return "Resend a refusé"
  if (/Ringover a refusé/i.test(erreur)) return "Ringover a refusé"
  return erreur.slice(0, 80)
}

async function invoquer(base: string, cle: string, fonction: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const r = await fetch(`${base}/functions/v1/${fonction}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` }, body: JSON.stringify(body) })
    const data = await r.json().catch(() => ({}))
    return { ok: r.ok && data?.ok !== false, data }
  } catch (e) { return { ok: false, data: { error: String(e) } } }
}

/** Le lien suivi d'une agence (réutilisé s'il existe) : evenements-site note le clic sur la fiche. */
async function lienAgence(sb: SupabaseClient, base: string, agenceId: string, cible: "creer_compte" | "site"): Promise<{ url: string; jeton: string }> {
  const url = cible === "site" ? "https://www.stcbatiment.fr" : ""
  const { data } = await sb.from("liens_suivis").select("jeton").eq("agence_id", agenceId).eq("cible", cible).eq("url", url).order("cree_le", { ascending: false }).limit(1).maybeSingle()
  let jeton = (data as { jeton?: string } | null)?.jeton
  if (!jeton) {
    jeton = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 40)
    await sb.from("liens_suivis").insert({ jeton, agence_id: agenceId, cible, url })
  }
  return { url: `${base}/functions/v1/evenements-site?l=${jeton}`, jeton }
}

type GardeConfig = { ecartCampagnes?: number; exclusions?: string[]; plafondMail?: number; plafondSms?: number }
const REBOND = "E-mail rebondi (adresse injoignable)"
const EXCLUSIONS_CONNUES = ["Déjà client", "Désinscrit", "Adresse en erreur"]

/** Ceux que les garde-fous de la campagne empêchent d'entrer. Une campagne jamais enregistrée n'en a pas. */
async function contactsBloques(sb: SupabaseClient, campagneId: string, baseId: string, garde: GardeConfig | undefined, contacts: Contact[], maintenant: Date): Promise<Set<string>> {
  const bloques = new Set<string>()
  if (!garde) return bloques
  if ((garde.ecartCampagnes ?? 0) > 0) {
    const depuis = new Date(maintenant.getTime() - Number(garde.ecartCampagnes) * JOUR_MS).toISOString()
    const recus = await tout<{ contact_ref: string }>((d, f) => sb.from("cmp_envois").select("contact_ref").neq("campagne_id", campagneId).eq("statut", "envoye").eq("test", false).gte("le", depuis).order("id").range(d, f))
    for (const r of recus) bloques.add(r.contact_ref)
  }
  const exclusions = garde.exclusions ?? []
  if (baseId === "agences" && exclusions.includes("Adresse en erreur")) {
    const rebonds = await tout<{ agence_id: string }>((d, f) => sb.from("activites").select("agence_id").eq("type", "note").eq("source", "site").eq("titre", REBOND).order("id").range(d, f))
    for (const r of rebonds) bloques.add(r.agence_id)
  }
  if (exclusions.includes("Adresse en erreur")) {
    const rebonds = await tout<{ contact_ref: string }>((d, f) => sb.from("cmp_evenements").select("contact_ref").eq("type", "rebond").order("id").range(d, f))
    for (const r of rebonds) bloques.add(r.contact_ref)
  }
  // Une exclusion ajoutée à la main (« Endormie », « Orpi »…) : la valeur d'un champ du contact.
  const libres = exclusions.filter((x) => !EXCLUSIONS_CONNUES.includes(x)).map((x) => x.trim().toLowerCase()).filter(Boolean)
  if (libres.length) for (const k of contacts) if (Object.values(k.champs).some((v) => v.split(" / ").some((x) => libres.includes(x.trim().toLowerCase())))) bloques.add(k.id)
  return bloques
}

type Resultat = { ok: boolean; erreur?: string; fournisseurId?: string; saute?: string }
type CreatifConfig = { id: string; type: string; versId?: string; video?: boolean; remplirPar?: string; variantes?: { id: string }[] }
/** Le bouton du mail vers sa page ou son formulaire : dans le HTML s'il y en a, sinon une ligne de texte. */
function ajouterBouton(texte: string, url: string, libelle: string): string {
  if (!/<\/body>/i.test(texte)) return `${texte}\n\n${libelle} : ${url}`
  return texte.replace(/<\/body>/i, `<div style="text-align:center;padding:16px 0 28px"><a href="${url}" style="display:inline-block;padding:14px 32px;background:#0f172b;color:#fff;font-family:Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none">${libelle}</a></div></body>`)
}

async function envoyer(sb: SupabaseClient, base: string, service: string, c: Ligne, k: Contact, canal: "mail" | "sms" | "newsletter", objet: string, corps: string, test: boolean, varianteId: string | null, clePassage: string, ins: ContexteInstantly, plafond: number): Promise<Resultat> {
  // Les variables et les liens, selon la base.
  let texte = corps, sujet = objet
  const remplacer = (de: string, par: string) => { texte = texte.split(de).join(par); sujet = sujet.split(de).join(par) }
  remplacer("{{contact}}", k.personne); remplacer("{{entreprise}}", k.nom)
  // Les formulaires et les pages de la campagne : un lien personnel et signé.
  const creatifs = ((c.config as { creatifs?: CreatifConfig[] } | null)?.creatifs ?? [])
  const lienDe = (id: string) => lienPublic(clePassage, String(c.id), id, k.id, test)
  const formulaire = creatifs.find((x) => x.type === "formulaire" && x.remplirPar !== "commercial"), page = creatifs.find((x) => x.type === "page")
  if (formulaire && (texte + sujet).includes("{{lien_formulaire}}")) remplacer("{{lien_formulaire}}", await lienDe(formulaire.id))
  if (page && (texte + sujet).includes("{{lien_page}}")) remplacer("{{lien_page}}", await lienDe(page.id))
  const leCreatif = creatifs.find((x) => x.variantes?.some((v) => v.id === varianteId))
  const cible = leCreatif?.versId ? creatifs.find((x) => x.id === leCreatif.versId) : undefined
  if (cible && canal !== "sms") texte = ajouterBouton(texte, await lienDe(cible.id), leCreatif?.video ? "Voir la vidéo" : cible.type === "formulaire" ? "Remplir le formulaire" : "En savoir plus")
  // Mode test : aucun lien ne doit agir sur la vraie fiche (désinscrire l'agence, poser un lead).
  if (test) { for (const m of new Set(`${texte}${sujet}`.match(/{{lien_[a-z_]+}}/g) ?? [])) remplacer(m, LIEN_NEUTRE) }
  let stop = ""
  if (k.baseId === "artisans") {
    const { data } = await sb.from("st_sous_traitants").select("token, metier").eq("id", k.id).maybeSingle()
    const token = (data as { token?: string } | null)?.token
    if (!token) return { ok: false, saute: "fiche sans jeton de lien" }
    const l = (d: string) => `${base}/functions/v1/lien-st?t=${token}&d=${d}`
    stop = l("stop")
    remplacer("{{metier}}", String((data as { metier?: string }).metier ?? "")); remplacer("{{lien_candidature}}", l("candidature")); remplacer("{{lien_principal}}", l("candidature")); remplacer("{{lien_bareme}}", l("bareme")); remplacer("{{lien_desinscription}}", stop); remplacer("{{lien}}", l("candidature"))
  } else {
    const compte = await lienAgence(sb, base, k.id, "creer_compte")
    stop = `${base}/functions/v1/evenements-site?stop=${compte.jeton}`
    remplacer("{{lien_creer_compte}}", compte.url); remplacer("{{lien_principal}}", compte.url); remplacer("{{lien_desinscription}}", stop)
    if (texte.includes("{{lien_site}}")) remplacer("{{lien_site}}", (await lienAgence(sb, base, k.id, "site")).url)
  }
  if (test) stop = LIEN_NEUTRE
  // Un mail de prospection propose toujours de ne plus en recevoir, agence ou artisan.
  if (canal !== "sms" && !corps.includes("{{lien_desinscription}}")) texte += `\n\nPour ne plus recevoir nos messages : ${stop}`

  if (canal === "sms") {
    const to = test ? String(c.test_mobile ?? "") : k.mobile
    if (!to) return { ok: false, saute: test ? "mode test sans mobile de test" : "pas de mobile" }
    const r = await invoquer(base, service, "envoyer-sms", { to, message: test ? `[TEST] ${texte}` : texte })
    return r.ok ? { ok: true } : { ok: false, erreur: String(r.data?.error ?? "envoi SMS échoué"), saute: r.data?.code === "non_mobile" ? "numéro non mobile" : undefined }
  }
  const to = test ? String(c.test_email ?? "") : k.email
  if (!to) return { ok: false, saute: "pas de mail" }
  sujet = (test ? "[TEST] " : "") + sujet
  if (!varianteId) return { ok: false, saute: "mail sans texte" }
  return envoyerParInstantly(sb, ins, { id: String(c.id), nom: String(c.nom), baseId: k.baseId, rythme: c.rythme as { jours: number[]; heureMin: number; heureMax: number }, plafond }, k, to, sujet, texte, varianteId, test)
}

Deno.serve(async (req: Request) => {
  const base = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const sb = createClient(base, service)
  const { data: p } = await sb.from("parametres").select("valeur").eq("cle", "analyse_passage_cle").maybeSingle()
  const clePassage = String((p as { valeur?: string } | null)?.valeur ?? "")
  const attendue = String((p as { valeur?: unknown } | null)?.valeur ?? "").replace(/^"|"$/g, "")
  if (!(attendue.length >= 20 && req.headers.get("x-passage-cle") === attendue)) return json({ error: "non autorisé" }, 401)
  const maintenant = new Date()
  const iso = maintenant.toISOString()
  const bilan: Record<string, number | string> = { campagnes: 0, entrees: 0, envois: 0, erreurs: 0, sautes: 0, reportes: 0, sorties: 0, taches: 0 }

  try {
    const ins = await preparerInstantly(sb, base, iso)
    const { data: actives } = await sb.from("cmp_campagnes").select("*").eq("statut", "active")
    let envoisPassage = 0
    for (const ligne of (actives ?? []) as Ligne[]) {
      bilan.campagnes = Number(bilan.campagnes) + 1
      const c = versCampagne(ligne)
      const garde = (ligne.config as { garde?: GardeConfig } | null)?.garde
      const lus = (await tout<Ligne>((d, f) => sb.from("cmp_contacts").select("*").eq("base_id", c.baseId).order("id").range(d, f))).map(versContact)
      // « Déjà client » retiré des exclusions : la campagne a choisi de les toucher aussi. Un désinscrit, lui, ne l'est jamais.
      const contacts = garde?.exclusions && !garde.exclusions.includes("Déjà client") ? lus.map((k) => (k.statut === "gagne" ? { ...k, statut: "libre" as const } : k)) : lus
      const parContact = new Map(contacts.map((k) => [k.id, k]))
      const inscriptions = (await tout<Ligne>((d, f) => sb.from("cmp_inscriptions").select("*").or(`campagne_id.eq.${c.id},statut.eq.en_cours`).order("id").range(d, f))).map(versInscription)
      const depuis = new Date(maintenant.getTime() - 14 * JOUR_MS).toISOString()
      const envois = (await tout<Ligne>((d, f) => sb.from("cmp_envois").select("*").eq("campagne_id", c.id).gte("le", depuis).order("id").range(d, f))).map(versEnvoi)
      const evenements = (await tout<Ligne>((d, f) => sb.from("cmp_evenements").select("*").eq("campagne_id", c.id).order("id").range(d, f))).map(versEvenement)

      // 1. Les sorties : un contact devenu lead, gagné, exclu ou désinscrit quitte la séquence.
      for (const i of inscriptions.filter((x) => x.campagneId === c.id && x.statut === "en_cours")) {
        const k = parContact.get(i.contactId)
        const statut = !k ? "terminee" : k.desinscrit ? "desinscrit" : k.statut === "lead" ? "lead" : k.statut === "gagne" || k.statut === "exclu" ? "terminee" : null
        if (!statut) continue
        await sb.from("cmp_inscriptions").update({ statut, sortie_le: iso }).eq("id", i.id)
        i.statut = statut as Inscription["statut"]
        bilan.sorties = Number(bilan.sorties) + 1
      }

      // 2. La décision, par le moteur pur.
      const dejaDedans = new Set(inscriptions.filter((i) => i.campagneId === c.id).map((i) => i.contactId))
      const bloques = await contactsBloques(sb, c.id, c.baseId, garde, contacts, maintenant)
      const ecr = passage({ campagne: c, contacts: contacts.filter((k) => dejaDedans.has(k.id) || !bloques.has(k.id)), inscriptions, envois: envois.filter((e) => e.statut === "envoye"), evenements }, maintenant, () => crypto.randomUUID())
      const nouvelles = new Map(ecr.inscriptions.map((i) => [i.id, i]))
      const majs = new Map(ecr.majInscriptions.map((i) => [i.id, i]))
      const avant = new Map(inscriptions.map((i) => [i.id, i]))
      const reportees = new Set<string>()

      // 3. Les envois, un par un, avec les garde-fous.
      const debutJour = new Date(`${jourParisIso(maintenant)}T00:00:00+01:00`).toISOString()
      const { count: mailsJour } = await sb.from("cmp_envois").select("id", { count: "exact", head: true }).eq("campagne_id", c.id).eq("canal", "mail").eq("statut", "envoye").gte("le", debutJour)
      const { count: smsJour } = await sb.from("cmp_envois").select("id", { count: "exact", head: true }).eq("campagne_id", c.id).eq("canal", "sms").eq("statut", "envoye").gte("le", debutJour)
      const budget = { mail: (garde?.plafondMail ?? PLAFOND_JOUR.mail) - (mailsJour ?? 0), sms: (garde?.plafondSms ?? PLAFOND_JOUR.sms) - (smsJour ?? 0) }
      const hSms = heureParis(maintenant) >= 10 && heureParis(maintenant) < 17
      let arret = false
      for (const e of ecr.envois) {
        const canal = e.canal === "sms" ? "sms" : "mail"
        // Boîtes Instantly pas prêtes : le mail attend, il n'est ni perdu ni envoyé par un autre chemin.
        if (arret || envoisPassage >= ENVOIS_MAX_PAR_PASSAGE || budget[canal] <= 0 || (canal === "sms" && !hSms) || (canal === "mail" && !ins.pretes.length)) { reportees.add(e.inscriptionId); bilan.reportes = Number(bilan.reportes) + 1; continue }
        const etapeIndex = c.etapes.findIndex((x) => x.id === e.etapeId)
        const etape = c.etapes[etapeIndex]
        const v = etape && "variantes" in etape ? etape.variantes.find((x) => x.id === e.varianteId) ?? etape.variantes[0] : null
        // L'inscription doit exister avant l'envoi (la clé étrangère) : une nouvelle est écrite tout de suite, au pas d'avant.
        const nouvelle = nouvelles.get(e.inscriptionId)
        if (nouvelle) {
          const { error } = await sb.from("cmp_inscriptions").insert({ id: nouvelle.id, campagne_id: c.id, contact_ref: nouvelle.contactId, entree_le: nouvelle.entreeLe, etape_index: 0, prochaine_le: iso, statut: "en_cours" })
          if (error) { reportees.add(e.inscriptionId); continue } // déjà inscrit par un passage concurrent
          bilan.entrees = Number(bilan.entrees) + 1
        }
        // Dernier filet : cette étape est-elle déjà partie (ou sautée) pour ce contact ?
        const { count: deja } = await sb.from("cmp_envois").select("id", { count: "exact", head: true }).eq("inscription_id", e.inscriptionId).eq("etape_id", e.etapeId).in("statut", ["envoye", "saute"])
        if ((deja ?? 0) > 0) continue
        const { count: essais } = await sb.from("cmp_envois").select("id", { count: "exact", head: true }).eq("inscription_id", e.inscriptionId).eq("etape_id", e.etapeId).eq("statut", "erreur")
        const tentative = (essais ?? 0) + 1
        const k = parContact.get(e.contactId)!
        const test = Boolean(ligne.mode_test)
        await sb.from("cmp_envois").insert({ id: e.id, campagne_id: c.id, inscription_id: e.inscriptionId, contact_ref: e.contactId, etape_id: e.etapeId, variante_id: e.varianteId, canal: e.canal, le: iso, statut: "en_cours", tentative, test })
        const r = e.statut === "saute" ? { ok: false, saute: e.cause } as Resultat : await envoyer(sb, base, service, ligne, k, canal, v?.objet ?? "", v?.corps ?? "", test, e.varianteId, clePassage, ins, garde?.plafondMail ?? PLAFOND_JOUR.mail)
        if (r.ok) {
          await sb.from("cmp_envois").update({ statut: "envoye", fournisseur_id: r.fournisseurId || null }).eq("id", e.id)
          budget[canal]--; envoisPassage++; bilan.envois = Number(bilan.envois) + 1
          await pause(CADENCE_MS[canal])
        } else if (r.saute) {
          await sb.from("cmp_envois").update({ statut: "saute", cause: r.saute }).eq("id", e.id)
          bilan.sautes = Number(bilan.sautes) + 1
        } else {
          const cause = causeDe(r.erreur ?? "")
          await sb.from("cmp_envois").update({ statut: "erreur", cause }).eq("id", e.id)
          bilan.erreurs = Number(bilan.erreurs) + 1
          if (tentative < TENTATIVES_MAX) {
            // On revient sur l'étape, rejouée plus tard (la mise à jour du moteur pour ce contact n'est pas écrite).
            reportees.add(e.inscriptionId)
            await sb.from("cmp_inscriptions").update({ etape_index: etapeIndex, prochaine_le: new Date(maintenant.getTime() + REJOUER_APRES_MIN[tentative - 1] * 60_000).toISOString() }).eq("id", e.inscriptionId)
          }
          if (/débit/.test(cause)) arret = true
        }
      }

      // 4. Les avancées du moteur (sauf pour les contacts reportés), les nouvelles entrées sans envoi, les tâches.
      for (const [id, i] of majs) {
        if (reportees.has(id)) continue
        const a = avant.get(id)
        if (a && a.etapeIndex === i.etapeIndex && a.prochaineLe === i.prochaineLe && a.statut === i.statut) continue
        await sb.from("cmp_inscriptions").update({ etape_index: i.etapeIndex, prochaine_le: i.prochaineLe, statut: i.statut, sortie_le: i.sortieLe }).eq("id", id)
      }
      for (const [id, i] of nouvelles) {
        if (reportees.has(id)) continue
        const { data: existe } = await sb.from("cmp_inscriptions").select("id").eq("id", id).maybeSingle()
        if (existe) await sb.from("cmp_inscriptions").update({ etape_index: i.etapeIndex, prochaine_le: i.prochaineLe, statut: i.statut, sortie_le: i.sortieLe }).eq("id", id)
        else { await sb.from("cmp_inscriptions").insert({ id, campagne_id: c.id, contact_ref: i.contactId, entree_le: i.entreeLe, etape_index: i.etapeIndex, prochaine_le: i.prochaineLe, statut: i.statut, sortie_le: i.sortieLe }); bilan.entrees = Number(bilan.entrees) + 1 }
      }
      const reporteesContacts = new Set([...reportees].map((id) => (nouvelles.get(id) ?? avant.get(id))?.contactId))
      const taches = ecr.taches.filter((t) => !reporteesContacts.has(t.contactId))
      if (taches.length) {
        await sb.from("cmp_taches").insert(taches.map((t) => ({ id: t.id, campagne_id: c.id, contact_ref: t.contactId, etape_id: t.etapeId, type: t.type, consigne: t.consigne })))
        bilan.taches = Number(bilan.taches) + taches.length
      }
      if (envoisPassage >= ENVOIS_MAX_PAR_PASSAGE) break
    }
    console.log("[CAMPAGNES-MOTEUR]", JSON.stringify(bilan))
    return json({ ok: true, bilan })
  } catch (e) {
    console.error("[CAMPAGNES-MOTEUR] erreur :", e)
    return json({ ok: false, error: String((e as Error)?.message ?? e), bilan }, 500)
  }
})
