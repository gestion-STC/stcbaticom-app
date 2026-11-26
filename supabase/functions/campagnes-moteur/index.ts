// ════════════════════════════════════════════════════════════════════════════
// LE MOTEUR DES CAMPAGNES, CÔTÉ SERVEUR (07/11/2026) — passe toutes les 10 min (pg_cron, clé du passage).
//
// La décision (qui entre, quelle étape est due, A/B, « Si… », 48 h entre touches) est le moteur PUR
// partagé avec l'écran (_shared/campagnes/moteur.ts, copie exacte de src/prospection/moteur.ts, vérifiée
// par un test). Ici, l'exécution, avec les garde-fous de la machine sous-traitants (sequenceur-st) :
//   · budget par jour et par canal (réglé dans la campagne), 25 envois au plus par passage, cadence entre deux envois ;
//   · écart entre deux campagnes et exclusions de la campagne : valent pour les NOUVELLES entrées ;
//   · PARE-FEU : une même personne (mail ou numéro, toutes bases confondues) n'est que dans une campagne à la fois ;
//   · SMS seulement de 10 h à 17 h (heure de Paris), et seulement vers un mobile ;
//   · juste avant d'envoyer, la base est relue : jamais deux fois la même étape au même contact ;
//   · une erreur est rejouée (mail : 15 min, 1 h, 4 h, 1 jour, puis l'inscription s'arrête ; SMS : 15 min, 1 h, puis
//     l'étape est abandonnée) ; une limite de débit arrête le passage ;
//   · une pause, une sortie ou un retrait agit aussi chez Instantly (lot 2, 27/11/2026) : campagnes Instantly mises en
//     pause, contacts confiés et pas encore partis retirés ;
//   · MODE TEST : tout part vers l'adresse et le mobile de test de la campagne, marqué « test ».
// Les mails partent par Instantly (_shared/campagnes/instantly.ts), JAMAIS par Resend : son règlement interdit la
// prospection et son compte fait tourner STC Bâtiment. Les SMS passent par envoyer-sms. Les retours arrivent par
// instantly-evenements et par les liens suivis, rattachés à la campagne par les déclencheurs du SQL du 07/11.
// Une campagne s'arrête pour un contact devenu lead (leads_demarchage, clic d'artisan), gagné,
// exclu ou désinscrit : il est alors dans la session de call de son équipe.
// ════════════════════════════════════════════════════════════════════════════
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { passage, heureParis, dansLaPlage, debutJourParis } from "../_shared/campagnes/moteur.ts"
import { estEligible } from "../_shared/campagnes/modele.ts"
import { verifierLesAdresses } from "../_shared/campagnes/verification.ts"
import { AB_DEPART, leadsAgencesRattaches, leadsArtisansRattaches, leadsPourAB, mesuresAB, verdictAB, type ReglageAB } from "../_shared/campagnes/abTest.ts"
import { REBOND_AGENCE, avecDejaClients, exclusionLibre, pasInteresseExclu } from "../_shared/campagnes/exclusions.ts"
import type { Campagne, Contact, Envoi, Evenement, Inscription } from "../_shared/campagnes/modele.ts"
import { lienCourt, lienPublic } from "../_shared/campagnes/lien.ts"
import { campagnesBaticomDansLaCarte, envoyerDansLeFil, envoyerParInstantly, preparerInstantly, retirerContactInstantly, synchroniserPause, type ContexteInstantly } from "../_shared/campagnes/instantly.ts"
import { ETAPE_ALERTE, aAppelerSurOuverture, boitesSaines, envoisDuJour, type AlerteOuverture, type Montee } from "../_shared/campagnes/montee.ts"
import { appliquerIA, concerneIA, fichePauvre, objetIA, type ReglageIA } from "../_shared/campagnes/ia.ts"
import { ceQuiMarche, ficheIA, genererTexteIA, interventionsSecteurs, offreSTC } from "../_shared/campagnes/generationIA.ts"
import { corpsAvecMentions, doitArreter, remplirVariables, valeursDe, type Mentions, type ReglageArret } from "../_shared/campagnes/instantlyOutils.ts"
import { sansDejaSollicites, type Coordonnees, domaineBloque } from "../_shared/campagnes/pareFeu.ts"
import { AVIS_DEPART, estBaseAvis, pretPourAvis, type ReglageAvis } from "../_shared/campagnes/avis.ts"
import { compteDeCampagne, estAttenteLinkedIn, estSautLinkedIn, faitsParCompte, identifiantLinkedIn, noteInvitation, restantLinkedIn, type CompteLinkedIn } from "../_shared/campagnes/linkedin.ts"
import { appelUnipile, comptesLinkedIn, profilLinkedIn, reglageLinkedIn, unipileBranche } from "../_shared/campagnes/unipile.ts"
import { departDuMailPrecedent, rejeuApres, relancePossibleLe, relanceRetenue, varianteAvecTexte, type EnvoiPasse } from "../_shared/campagnes/confirmation.ts"

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } })
const JOUR_MS = 86_400_000
const ENVOIS_MAX_PAR_PASSAGE = 25
const PLAFOND_JOUR = { mail: 200, sms: 40 } as const
const CADENCE_MS = { mail: 700, sms: 3000, linkedin: 4000 } as const
const LIEN_NEUTRE = "https://www.stcbatiment.fr"
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

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
  creeParId: String(l.cree_par ?? ""), creeLe: String(l.cree_le), lanceeLe: (l.lancee_le as string) ?? null, coutSms: Number(l.cout_sms ?? 0), origine: String(l.origine ?? ""),
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

// Les documents d'un mail de campagne (16/11/2026) : les deux plaquettes du 14/10, le Kbis et l'assurance, les mêmes
// que dans le mail de suivi après un appel. Instantly n'envoie pas de pièce jointe : chaque document est un lien suivi (src/lib/documentsBibliotheque.ts). Le clic passe par evenements-site, qui note « Plaquette
// ouverte » sur la fiche ; la base en fait un clic « plaquette » de la campagne (règle « A ouvert la plaquette »).
export const PLAQUETTES: Record<string, string> = {
  "{{lien_plaquette}}": "801aeb9d-311d-48a8-ba02-97c96754dfa2.pdf",            // STC - Plaquette Service Gestion
  "{{lien_plaquette_plateforme}}": "43fb4102-ec01-4710-ba3b-317bf4ace8c4.pdf", // STC - Plaquette Plateforme
  "{{lien_kbis}}": "aba7ff82-c739-4f18-a0b6-d65279ac5f28.pdf",                  // Kbis STC Bâtiment
  "{{lien_assurance}}": "5b129b47-c76a-4dda-a96a-19516ef7608b.pdf",             // Attestation d'assurance (décennale et RC)
}

/** Le lien suivi d'une agence (réutilisé s'il existe) : evenements-site note le clic sur la fiche. */
async function lienAgence(sb: SupabaseClient, base: string, agenceId: string, cible: "creer_compte" | "site" | "plaquette", fichier = ""): Promise<{ url: string; jeton: string }> {
  const url = cible === "site" ? "https://www.stcbatiment.fr" : cible === "plaquette" ? `${base}/storage/v1/object/public/pieces-jointes/${fichier}` : ""
  const { data } = await sb.from("liens_suivis").select("jeton").eq("agence_id", agenceId).eq("cible", cible).eq("url", url).order("cree_le", { ascending: false }).limit(1).maybeSingle()
  let jeton = (data as { jeton?: string } | null)?.jeton
  if (!jeton) {
    jeton = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 40)
    await sb.from("liens_suivis").insert({ jeton, agence_id: agenceId, cible, url })
  }
  return { url: `${base}/functions/v1/evenements-site?l=${jeton}`, jeton }
}

type GardeConfig = { retires?: string[]; boites?: string[]; smsDe?: number; smsA?: number; arret?: ReglageArret; signature?: string; libelleLien?: string; ecartCampagnes?: number; exclusions?: string[]; plafondMail?: number; plafondSms?: number; suiviOuvertures?: boolean; montee?: Montee; alerteOuverture?: AlerteOuverture }

/** Ceux que les garde-fous de la campagne empêchent d'entrer. Une campagne jamais enregistrée n'en a pas. */
/** Avant un premier envoi : l'adresse est vérifiée (Mahdi, 11/11/2026). Seuls les nouveaux contacts dont l'adresse a passé
 *  la vérification peuvent entrer ; ceux qui n'ont pas de mail (SMS seul) et ceux déjà dans la campagne ne changent pas. */
async function avecAdressesVerifiees(sb: SupabaseClient, c: Campagne, contacts: Contact[], dejaDedans: Set<string>, maintenant: Date, cle: string, invalides: Set<string>): Promise<{ contacts: Contact[]; refusees: number }> {
  if (!dansLaPlage(c, maintenant)) return { contacts, refusees: 0 }
  // Sans étape mail (une campagne d'avis par SMS, d'appels…), aucune adresse n'est vérifiée ni bloquée (25/11/2026).
  if (!c.etapes.some((e) => e.type === "mail" || e.type === "newsletter")) return { contacts, refusees: 0 }
  // Les adresses déjà jugées invalides ne reprennent plus de place dans le lot (17/11/2026 : sinon elles s'empilent en tête
  // et, au bout de quelques semaines, plus personne n'entre).
  const nouveaux = contacts.filter((k) => !dejaDedans.has(k.id) && k.statut === "libre" && k.email && !invalides.has(k.email.trim().toLowerCase()) && estEligible(k, c, maintenant))
  if (!nouveaux.length) return { contacts, refusees: 0 }
  const place = Math.max(1, c.rythme.parJour)
  const lot = nouveaux.slice(0, place * 3)
  const verdicts = await verifierLesAdresses(sb, lot.map((k) => k.email), cle, 40)
  const ok = new Set<string>()
  let refusees = 0
  for (const k of lot) {
    const v = verdicts.get(k.email.trim().toLowerCase())
    if (v?.statut === "invalide") refusees++
    if (v && (v.statut === "valide" || v.statut === "douteux")) { ok.add(k.id); if (ok.size >= place) break }
  }
  for (const [e, v] of verdicts) if (v.statut === "invalide") invalides.add(e)
  return { contacts: contacts.filter((k) => dejaDedans.has(k.id) || !k.email || ok.has(k.id)), refusees }
}

/** Le test A/B (Mahdi, 11/11/2026) : une étape dont le créatif demande la bascule n'envoie plus que son gagnant, dès qu'il y en a un. */
/** Les leads de CETTE campagne, comme la liste et le Suivi les comptent (abTest.ts) : lus seulement quand un test A/B
 *  doit décider d'une bascule. Agences : leads_demarchage hors robots, rattachés à la campagne où l'agence était entrée à
 *  leur date ; artisans : « lead » ou « gagné », rattachés à la campagne de leur premier vrai clic. */
async function leadsDeLaCampagne(sb: SupabaseClient, c: Campagne, inscriptions: Inscription[], fiches: Contact[]): Promise<Set<string>> {
  const inscrits = new Set(inscriptions.filter((i) => i.campagneId === c.id).map((i) => i.contactId))
  const parLots = async <T,>(ids: string[], lire: (lot: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> => {
    const out: T[] = []
    for (let i = 0; i < ids.length; i += 200) { const { data, error } = await lire(ids.slice(i, i + 200)); if (error) throw new Error(error.message); out.push(...(data ?? [])) }
    return out
  }
  if (c.baseId === "artisans") {
    const candidats = fiches.filter((k) => inscrits.has(k.id) && (k.statut === "lead" || k.statut === "gagne")).map((k) => k.id)
    const clics = await parLots<{ contact_ref: string; campagne_id: string; le: string }>(candidats, (lot) => sb.from("cmp_evenements").select("contact_ref, campagne_id, le").eq("type", "clic").eq("robot", false).in("contact_ref", lot))
    return leadsPourAB(c.id, leadsArtisansRattaches(fiches, clics.map((e) => ({ contactId: e.contact_ref, campagneId: e.campagne_id, le: e.le })), inscrits))
  }
  const lignes = (await tout<{ agence_id: string; cree_le: string; resultat: string | null }>((d, f) => sb.from("leads_demarchage").select("agence_id, cree_le, resultat").gte("cree_le", c.creeLe).order("id").range(d, f))).filter((l) => inscrits.has(String(l.agence_id)))
  const entrees = await parLots<{ campagne_id: string; contact_ref: string; entree_le: string }>([...new Set(lignes.map((l) => String(l.agence_id)))], (lot) => sb.from("cmp_inscriptions").select("campagne_id, contact_ref, entree_le").in("contact_ref", lot))
  return leadsPourAB(c.id, leadsAgencesRattaches(lignes.map((l) => ({ agenceId: String(l.agence_id), creeLe: l.cree_le, resultat: l.resultat })), entrees.map((i) => ({ campagneId: i.campagne_id, contactId: i.contact_ref, entreeLe: i.entree_le }))))
}

async function avecGagnants(sb: SupabaseClient, c: Campagne, config: Ligne["config"], evenements: Evenement[], inscriptions: Inscription[], fiches: Contact[]): Promise<Campagne> {
  const cfg = (config ?? {}) as { actions?: { id: string; creatifId?: string }[]; creatifs?: { id: string; ab?: ReglageAB }[] }
  let etapes = c.etapes
  let leads: Set<string> | null = null
  for (const et of c.etapes) {
    if (!("variantes" in et) || et.variantes.length < 2) continue
    const r = cfg.creatifs?.find((k) => k.id === cfg.actions?.find((a) => a.id === et.id)?.creatifId)?.ab ?? AB_DEPART
    if (!r.basculer) continue
    const envoyes = await tout<{ id: string; contact_ref: string; variante_id: string | null; statut: string; canal: string; test: boolean }>((d, f) => sb.from("cmp_envois").select("id, contact_ref, variante_id, statut, canal, test").eq("campagne_id", c.id).eq("etape_id", et.id).eq("statut", "envoye").eq("test", false).order("id").range(d, f))
    // Les mêmes chiffres qu'à l'écran (abTest.ts, 26/11/2026) : envois PARTIS (confirmés chez Instantly), leads de la campagne.
    leads ??= await leadsDeLaCampagne(sb, c, inscriptions, fiches)
    const instantly = parInstantly(c)
    const mesures = mesuresAB(et.variantes, envoyes.map((e) => ({ id: e.id, contactId: e.contact_ref, varianteId: e.variante_id, statut: e.statut, canal: e.canal, test: e.test })), evenements, leads, instantly)
    const g = verdictAB(mesures, r).gagnant
    if (g) etapes = etapes.map((e) => (e.id === et.id && "variantes" in e ? { ...e, variantes: e.variantes.filter((v) => v.id === g) } : e))
  }
  return etapes === c.etapes ? c : { ...c, etapes }
}

/** Rend aussi ceux qui doivent SORTIR de la séquence (lot 2, décision 1 du 26/11/2026) : « Pas intéressé » (même règle et
 *  même délai qu'à l'entrée) et exclusion ajoutée à la main. Avant, ces exclusions ne valaient que pour les entrées : une
 *  agence « pas intéressé » au téléphone recevait toutes les relances restantes. Un rebond ne compte que pour une
 *  campagne qui écrit par mail (un SMS n'a pas besoin de l'adresse). */
async function contactsBloques(sb: SupabaseClient, campagneId: string, baseId: string, garde: GardeConfig | undefined, contacts: Contact[], maintenant: Date, relanceMois: number, ecartCommun: number | null, rebondis: Set<string>, ecritParMail: boolean): Promise<{ bloques: Set<string>; aSortir: Set<string> }> {
  const bloques = new Set<string>(), aSortir = new Set<string>()
  if (!garde) return { bloques, aSortir }
  // L'écart commun à toutes les campagnes l'emporte sur l'ancien réglage de la campagne.
  const ecart = ecartCommun ?? garde.ecartCampagnes ?? 0
  if (ecart > 0) {
    const depuis = new Date(maintenant.getTime() - Number(ecart) * JOUR_MS).toISOString()
    const recus = await tout<{ contact_ref: string }>((d, f) => sb.from("cmp_envois").select("contact_ref").neq("campagne_id", campagneId).eq("statut", "envoye").eq("test", false).gte("le", depuis).order("id").range(d, f))
    for (const r of recus) bloques.add(r.contact_ref)
  }
  const exclusions = garde.exclusions ?? []
  if (ecritParMail && baseId !== "artisans" && exclusions.includes("Adresse en erreur")) {
    const rebonds = await tout<{ agence_id: string }>((d, f) => sb.from("activites").select("agence_id").eq("type", "note").eq("source", "site").eq("titre", REBOND_AGENCE).order("id").range(d, f))
    for (const r of rebonds) bloques.add(r.agence_id)
  }
  if (ecritParMail && exclusions.includes("Adresse en erreur")) for (const r of rebondis) bloques.add(r)
  // Pas intéressé : exclu, jusqu'au délai « Le recontacter après » de la campagne (0 : jamais).
  if (exclusions.includes("Pas intéressé")) {
    const lignes = baseId === "artisans"
      ? (await tout<{ id: string; suivi_le: string | null }>((d, f) => sb.from("st_sous_traitants").select("id, suivi_le").eq("suivi", "pas_interesse").order("id").range(d, f))).map((r) => ({ id: r.id, le: r.suivi_le }))
      : (await tout<{ id: string; etape_depuis: string | null }>((d, f) => sb.from("agences").select("id, etape_depuis").eq("etape", "pas_interesse").order("id").range(d, f))).map((r) => ({ id: r.id, le: r.etape_depuis }))
    for (const r of lignes) if (pasInteresseExclu(r.le, relanceMois, maintenant)) { bloques.add(r.id); aSortir.add(r.id) }
  }
  // Une exclusion ajoutée à la main (« Endormie », « Orpi »…) : la valeur d'un champ du contact.
  for (const k of contacts) if (exclusionLibre(k.champs, exclusions)) { bloques.add(k.id); aSortir.add(k.id) }
  return { bloques, aSortir }
}

/** Ses mails passent par Instantly (la règle de l'écran, prospection/indicateurs.ts) : ni une campagne d'avis, ni la
 *  machine sous-traitants reprise (origine « st », ses envois passés sont partis par Resend, sans « délivré »). */
const parInstantly = (c: { baseId: string; origine?: string }) => !estBaseAvis(c.baseId) && c.origine !== "st"

/** Le mail d'avant est-il parti (26/11/2026) ? Lu en base juste avant l'envoi ; une lecture en échec retient la relance.
 *  Rend aussi QUAND il est parti (lot 2, 27/11/2026) : l'attente avant la relance compte depuis ce départ réel. */
type Confirmation = { retenue: boolean; precedent?: { etapeId: string; parti: string } | null }
async function attendConfirmation(sb: SupabaseClient, inscriptionId: string, etapeId: string): Promise<Confirmation> {
  const { data: envois, error } = await sb.from("cmp_envois").select("id, etape_id, canal, statut, test, le").eq("inscription_id", inscriptionId)
  if (error) return { retenue: true }
  const liste = (envois ?? []) as EnvoiPasse[]
  if (!liste.some((e) => e.statut === "envoye" || e.statut === "erreur")) return { retenue: false }
  const { data: evs, error: errEv } = await sb.from("cmp_evenements").select("envoi_id, le").eq("type", "delivre").in("envoi_id", liste.map((e) => e.id))
  if (errEv) return { retenue: true }
  const delivres = new Map<string, string>()
  for (const x of (evs ?? []) as { envoi_id: string; le: string }[]) { const le = new Date(x.le).toISOString(); const d = delivres.get(x.envoi_id); if (!d || le < d) delivres.set(x.envoi_id, le) }
  return { retenue: relanceRetenue(liste, new Set(delivres.keys()), etapeId), precedent: departDuMailPrecedent(liste, delivres, etapeId) }
}

/** Les mails confiés à Instantly et pas encore partis (aucun « délivré ») d'un contact SORTI de sa campagne (désinscrit,
 *  rebond, lead, client, exclu, pas intéressé ou exclusion ajoutée à la main) ou retiré d'elle : le contact est retiré chez
 *  Instantly et l'envoi noté « sauté » (il n'est jamais parti). 14 jours en arrière. La fin normale d'une séquence n'est
 *  PAS une sortie : son dernier mail, confié juste avant, doit partir. */
async function retirerNonPartis(sb: SupabaseClient, ins: ContexteInstantly, campagnes: Ligne[], aSortirPar: Map<string, Set<string>>, maintenant: Date): Promise<{ retires: number; refus: string[] }> {
  const out = { retires: 0, refus: [] as string[] }
  if (!ins.cle) return out
  const viaInstantly = new Map(campagnes.filter((l) => parInstantly({ baseId: String(l.base_id), origine: String(l.origine ?? "") })).map((l) => [String(l.id), (l.config as { garde?: GardeConfig } | null)?.garde]))
  if (!viaInstantly.size) return out
  const depuis = new Date(maintenant.getTime() - 14 * JOUR_MS).toISOString()
  const confies = (await tout<{ id: string; campagne_id: string; inscription_id: string; contact_ref: string; fournisseur_id: string }>((d, f) => sb.from("cmp_envois").select("id, campagne_id, inscription_id, contact_ref, fournisseur_id").in("canal", ["mail", "newsletter"]).in("statut", ["envoye", "erreur"]).eq("test", false).not("fournisseur_id", "is", null).gte("le", depuis).in("campagne_id", [...viaInstantly.keys()]).order("id").range(d, f)))
  if (!confies.length) return out
  const partis = new Set<string>(), statuts = new Map<string, string>(), fiches = new Map<string, { statut: string; desinscrit: boolean }>()
  for (let i = 0; i < confies.length; i += 200) {
    const lot = confies.slice(i, i + 200)
    const { data: evs, error } = await sb.from("cmp_evenements").select("envoi_id").eq("type", "delivre").in("envoi_id", lot.map((e) => e.id))
    if (error) { out.refus.push(`lecture des confirmations : ${error.message}`); return out }
    for (const x of (evs ?? []) as { envoi_id: string }[]) partis.add(x.envoi_id)
    const { data: insc, error: errI } = await sb.from("cmp_inscriptions").select("id, statut").in("id", [...new Set(lot.map((e) => e.inscription_id))])
    if (errI) { out.refus.push(`lecture des inscriptions : ${errI.message}`); return out }
    for (const x of (insc ?? []) as { id: string; statut: string }[]) statuts.set(x.id, x.statut)
    const { data: ks, error: errK } = await sb.from("cmp_contacts").select("id, statut, desinscrit").in("id", [...new Set(lot.map((e) => e.contact_ref))])
    if (errK) { out.refus.push(`lecture des contacts : ${errK.message}`); return out }
    for (const x of (ks ?? []) as { id: string; statut: string; desinscrit: boolean }[]) fiches.set(String(x.id), { statut: String(x.statut), desinscrit: Boolean(x.desinscrit) })
  }
  // Un même contact Instantly déjà parti par un autre envoi (renvoi) : on n'y touche pas.
  const leadsPartis = new Set(confies.filter((e) => partis.has(e.id)).map((e) => e.fournisseur_id))
  for (const e of confies) {
    if (partis.has(e.id) || leadsPartis.has(e.fournisseur_id)) continue
    const garde = viaInstantly.get(e.campagne_id), fiche = fiches.get(e.contact_ref)
    const clientsVises = Boolean(garde?.exclusions && !garde.exclusions.includes("Déjà client"))
    const sorti = ["desinscrit", "rebond", "lead"].includes(statuts.get(e.inscription_id) ?? "")
      || Boolean(fiche && (fiche.desinscrit || fiche.statut === "lead" || fiche.statut === "exclu" || (fiche.statut === "gagne" && !clientsVises)))
      || Boolean(aSortirPar.get(e.campagne_id)?.has(e.contact_ref))
      || (garde?.retires ?? []).map(String).includes(e.contact_ref)
    if (!sorti) continue
    const r = await retirerContactInstantly(ins, e.fournisseur_id)
    if (!r.ok) { out.refus.push(r.erreur ?? "retrait refusé"); continue }
    await sb.from("cmp_envois").update({ statut: "saute", cause: "Retiré chez Instantly avant son départ (contact sorti ou retiré de la campagne)" }).eq("id", e.id).in("statut", ["envoye", "erreur"])
    out.retires++
  }
  return out
}

/** « 3 × boîte refusée, 1 × adresse vide » : les causes regroupées. */
const compter = (l: string[]) => Object.fromEntries([...l.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())])

/** Le journal du moteur (17/11/2026), lisible à l'écran : les 72 derniers passages (12 heures), campagne par campagne. */
const CLE_JOURNAL = "campagnes_moteur_journal"
async function garderJournal(sb: SupabaseClient, passage: Record<string, unknown>): Promise<void> {
  const { data } = await sb.from("parametres").select("valeur").eq("cle", CLE_JOURNAL).maybeSingle()
  let l: unknown[] = []
  try { l = JSON.parse(String((data as { valeur?: string } | null)?.valeur ?? "[]")) } catch { l = [] }
  if (!Array.isArray(l)) l = []
  const { error } = await sb.from("parametres").upsert({ cle: CLE_JOURNAL, valeur: JSON.stringify([passage, ...l].slice(0, 72)) }, { onConflict: "cle" })
  if (error) console.error("[CAMPAGNES-MOTEUR] journal non écrit :", error.message)
}

type Resultat = { ok: boolean; erreur?: string; fournisseurId?: string; saute?: string; /** Reporté, avec sa vraie cause (lot 2). */ reporte?: string; /** LinkedIn : déjà en relation. */ connexion?: boolean; /** Un mail parti tout de suite (relance dans le fil) : pas de « email_sent » d'Instantly à attendre. */ parti?: boolean }
type CreatifConfig = { id: string; type: string; versId?: string; video?: boolean; remplirPar?: string; variantes?: { id: string }[]; ia?: ReglageIA; memeFil?: boolean }
const IA_MAX_PAR_PASSAGE = 15
const compteurIA = { n: 0 }
// Les générations IA ratées (lot 2, 27/11/2026), par campagne, variante et contact : après 2 échecs, plus d'appel payant.
// Avant, le même contact était réécrit (et refacturé) toutes les 10 minutes. Gardé dans parametres, relu à chaque passage.
const IA_ESSAIS_MAX = 2
const CLE_ECHECS_IA = "cmp_ia_echecs"
const echecsIA: { carte: Record<string, number> | null; change: boolean } = { carte: null, change: false }
async function lireEchecsIA(sb: SupabaseClient): Promise<Record<string, number>> {
  if (echecsIA.carte) return echecsIA.carte
  const { data } = await sb.from("parametres").select("valeur").eq("cle", CLE_ECHECS_IA).maybeSingle()
  let carte: Record<string, number> = {}
  try { carte = JSON.parse(String((data as { valeur?: string } | null)?.valeur ?? "{}")) ?? {} } catch { carte = {} }
  echecsIA.carte = carte
  return carte
}

/** Le texte de l'IA pour ce contact : déjà écrit, sinon écrit maintenant. « Chaque mail » : rien ne part avant validation. */
async function texteIA(sb: SupabaseClient, c: Ligne, cr: CreatifConfig, r: ReglageIA, varianteId: string, objet: string, corps: string, k: Contact): Promise<{ texte: string } | { reporte: string } | { saute: string }> {
  const { data: deja } = await sb.from("cmp_textes_ia").select("texte, valide").eq("campagne_id", c.id).eq("variante_id", varianteId).eq("contact_ref", k.id).maybeSingle()
  const ligne = deja as { texte: string; valide: boolean } | null
  if (ligne) return r.relecture === "tous" && !ligne.valide ? { reporte: "texte IA à relire" } : { texte: ligne.texte }
  const fiche = await ficheIA(sb, k, r)
  if (fichePauvre(r, fiche)) return r.pauvre === "attente" ? { saute: "fiche trop pauvre" } : { texte: "" }
  // Deux générations ratées : traité comme une fiche trop pauvre (le mail part sans le texte de l'IA, ou l'étape est sautée).
  const echecs = await lireEchecsIA(sb), cleEchec = `${c.id}|${varianteId}|${k.id}`
  if ((echecs[cleEchec] ?? 0) >= IA_ESSAIS_MAX) return r.pauvre === "attente" ? { saute: `texte IA impossible (${IA_ESSAIS_MAX} essais ratés)` } : { texte: "" }
  if (compteurIA.n >= IA_MAX_PAR_PASSAGE) return { reporte: `IA : ${IA_MAX_PAR_PASSAGE} textes par passage` }
  compteurIA.n++
  try {
    const g = await genererTexteIA({ baseId: k.baseId, reglage: r, campagneNom: String(c.nom), objet, corps, fiche, offre: await offreSTC(sb), appels: await ceQuiMarche(sb, k.baseId, r), interventions: await interventionsSecteurs(sb) })
    const valide = r.relecture !== "tous"
    const { error } = await sb.from("cmp_textes_ia").upsert({ campagne_id: c.id, creatif_id: cr.id, variante_id: varianteId, contact_ref: k.id, texte: g.texte, valide, cout: g.cout }, { onConflict: "campagne_id,variante_id,contact_ref" })
    if (error) throw new Error(error.message)
    return valide ? { texte: g.texte } : { reporte: "texte IA à relire" }
  } catch (e) {
    console.error("[CAMPAGNES-MOTEUR] IA", e)
    echecs[cleEchec] = (echecs[cleEchec] ?? 0) + 1; echecsIA.change = true
    return { reporte: "génération IA ratée" }
  }
}
/** Le bouton du mail vers sa page ou son formulaire : dans le HTML s'il y en a, sinon une ligne de texte. */
function ajouterBouton(texte: string, url: string, libelle: string): string {
  if (!/<\/body>/i.test(texte)) return `${texte}\n\n[${libelle}](${url})`
  return texte.replace(/<\/body>/i, `<div style="text-align:center;padding:16px 0 28px"><a href="${url}" style="display:inline-block;padding:14px 32px;background:#0f172b;color:#fff;font-family:Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none">${libelle}</a></div></body>`)
}

/** Une étape LinkedIn automatique (11/11/2026) : par le compte branché chez Unipile. Jamais en mode essai. */
async function envoyerLinkedIn(sb: SupabaseClient, c: Ligne, k: Contact, mode: string, texte: string, test: boolean, compteChoisi?: CompteLinkedIn | null): Promise<Resultat> {
  if (test) return { ok: false, saute: "mode essai : rien ne part sur LinkedIn" }
  if (!unipileBranche()) return { ok: false, reporte: "LinkedIn : Unipile non branché" }
  // Le compte est choisi par le passage (ses plafonds y sont comptés) ; à défaut, relu ici.
  const compte = compteChoisi ?? compteDeCampagne(await comptesLinkedIn(), (c.config as { linkedinCompte?: string } | null)?.linkedinCompte)
  if (!compte) return { ok: false, reporte: "LinkedIn : aucun compte branché" }
  const ident = identifiantLinkedIn(k.champs.linkedin ?? "")
  if (!ident) return { ok: false, saute: "profil LinkedIn illisible" }
  const p = await profilLinkedIn(compte.id, ident)
  if (!p.ok) return estAttenteLinkedIn(p.r.status, p.r.type) ? { ok: false, reporte: "LinkedIn : en attente d'Unipile" } : estSautLinkedIn(p.r.type) ? { ok: false, saute: "profil LinkedIn introuvable" } : { ok: false, erreur: `LinkedIn (${p.r.status}) ${p.r.type}` }
  // Un message LinkedIn est du texte : un lien [texte](adresse) devient « texte : adresse ».
  const propre = texte.replace(/<[^>]+>/g, " ").replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 : $2").replace(/[ \t]+\n/g, "\n").trim()
  if (mode === "invitation") {
    if (p.enRelation) return { ok: false, saute: "déjà en relation sur LinkedIn", connexion: true }
    const r = await appelUnipile(`/${encodeURIComponent(compte.id)}/users/me/relation-requests`, { json: { user_id: p.providerId, ...(propre ? { message: noteInvitation(propre) } : {}) } })
    if (r.ok) return { ok: true, fournisseurId: `${p.providerId}|${String(r.data.id ?? "")}` }
    if (/already_connected|already_related|existing_relation/.test(r.type)) return { ok: false, saute: "déjà en relation sur LinkedIn", connexion: true }
    if (estAttenteLinkedIn(r.status, r.type)) return { ok: false, reporte: "LinkedIn : en attente d'Unipile" }
    if (estSautLinkedIn(r.type)) return { ok: false, saute: /already_invited/.test(r.type) ? "déjà invité récemment" : "invitation impossible (refusée ou profil fermé)" }
    return { ok: false, erreur: `LinkedIn (${r.status}) ${r.type}` }
  }
  if (!p.enRelation) return { ok: false, saute: "pas en relation sur LinkedIn" }
  if (!propre) return { ok: false, saute: "message LinkedIn vide" }
  const r = await appelUnipile(`/${encodeURIComponent(compte.id)}/chats/send`, { json: { users_ids: p.providerId, text: propre } })
  if (r.ok) return { ok: true, fournisseurId: `${p.providerId}|${String(r.data.chat_id ?? "")}` }
  if (estAttenteLinkedIn(r.status, r.type)) return { ok: false, reporte: "LinkedIn : en attente d'Unipile" }
  return { ok: false, erreur: `LinkedIn (${r.status}) ${r.type}` }
}

async function envoyer(sb: SupabaseClient, base: string, service: string, c: Ligne, k: Contact, canal: "mail" | "sms" | "newsletter" | "linkedin", objet: string, corps: string, test: boolean, varianteId: string | null, clePassage: string, ins: ContexteInstantly, plafond: number, modeLinkedIn = "", compteLinkedIn: CompteLinkedIn | null = null, envoiId = "", debutJour = ""): Promise<Resultat> {
  // Les variables et les liens, selon la base.
  let texte = corps, sujet = objet
  const gc = (c.config as { garde?: GardeConfig } | null)?.garde, mentions: Mentions = { signature: gc?.signature, libelleLien: gc?.libelleLien }
  const creatifIA = canal === "sms" ? undefined : (((c.config as { creatifs?: CreatifConfig[] } | null)?.creatifs ?? []).find((x) => x.variantes?.some((v) => v.id === varianteId)))
  if (creatifIA?.ia?.actif && varianteId && concerneIA(creatifIA.ia, k)) {
    const r = await texteIA(sb, c, creatifIA, creatifIA.ia, varianteId, objet, corps, k)
    if ("reporte" in r) return { ok: false, reporte: r.reporte }
    if ("saute" in r) return { ok: false, saute: r.saute }
    texte = appliquerIA(corps, creatifIA.ia.mode, r.texte)
    sujet = objetIA(objet, creatifIA.ia.mode, r.texte) // le mail entier : l'objet est celui de l'IA
  }
  const remplacer = (de: string, par: string) => { texte = texte.split(de).join(par); sujet = sujet.split(de).join(par) }
  const variables = valeursDe(k); texte = remplirVariables(texte, variables); sujet = remplirVariables(sujet, variables)
  // Le lien de désinscription est-il dans le TEXTE FINAL (25/11/2026) ? Avant, on regardait le modèle : un mail réécrit par
  // l'IA qui l'avait perdu partait sans lien, et sans la ligne ajoutée d'office.
  const aSonLienStop = texte.includes("{{lien_desinscription}}")
  // Les formulaires et les pages de la campagne : un lien personnel et signé.
  const creatifs = ((c.config as { creatifs?: CreatifConfig[] } | null)?.creatifs ?? [])
  const lienDe = (id: string) => lienPublic(clePassage, String(c.id), id, k.id, test)
  const formulaire = creatifs.find((x) => x.type === "formulaire" && x.remplirPar !== "commercial"), page = creatifs.find((x) => x.type === "page")
  if (formulaire && (texte + sujet).includes("{{lien_formulaire}}")) remplacer("{{lien_formulaire}}", await lienDe(formulaire.id))
  if (page && (texte + sujet).includes("{{lien_page}}")) remplacer("{{lien_page}}", await lienDe(page.id))
  const leCreatif = creatifs.find((x) => x.variantes?.some((v) => v.id === varianteId))
  const cible = leCreatif?.versId ? creatifs.find((x) => x.id === leCreatif.versId) : undefined
  if (cible && canal !== "sms") texte = ajouterBouton(texte, await lienDe(cible.id), leCreatif?.video ? "Voir la vidéo" : cible.type === "formulaire" ? "Remplir le formulaire" : "En savoir plus")
  // Une campagne d'avis : un lien personnel vers la page d'avis. Elle ne passe pas par les boîtes de prospection.
  if (estBaseAvis(k.baseId)) {
    const pageAvis = creatifs.find((x) => x.type === "avis")
    if (!pageAvis) return { ok: false, saute: "pas de page d'avis" }
    const lien = await lienDe(pageAvis.id), stopAvis = `${lien}&stop=1`
    const sansLien = !texte.includes("{{lien_avis}}"), sansStop = !aSonLienStop
    if (canal === "sms") {
      const to = test ? String(c.test_mobile ?? "") : k.mobile
      if (!to) return { ok: false, saute: test ? "mode test sans mobile de test" : "pas de mobile" }
      // Un seul lien, COURT (lot 2, décision 9 du 26/11/2026) : la page propose de ne plus rien recevoir, et le SMS dit
      // « répondez STOP ». Avant : le long lien signé, puis une ligne « STOP : » qui le répétait (4 SMS facturés).
      const court = (await lienCourt(sb, String(c.id), pageAvis.id, k.id, test)) ?? lien
      remplacer("{{lien_avis}}", court); remplacer("{{lien_desinscription}}", court)
      const message = `${test ? "[TEST] " : ""}${texte}${sansLien ? `\n${court}` : ""}${sansStop ? "\nSTOP : répondez STOP" : ""}`
      const r = await invoquer(base, service, "envoyer-sms", { to, message })
      return r.ok ? { ok: true } : { ok: false, erreur: String(r.data?.error ?? "envoi SMS échoué"), saute: r.data?.code === "non_mobile" ? "numéro non mobile" : undefined }
    }
    remplacer("{{lien_avis}}", lien); remplacer("{{lien_desinscription}}", stopAvis)
    const to = test ? String(c.test_email ?? "") : k.email
    if (!to) return { ok: false, saute: test ? "mode test sans mail de test" : "pas de mail" }
    const html = corpsAvecMentions(`${texte}${sansLien ? `\n\n[Donner mon avis](${lien})` : ""}`, sansStop ? stopAvis : undefined, false, mentions)
    // Les sous-traitants actuels relèvent du recrutement (25/11/2026) : avant, leur demande d'avis partait du démarchage
    // (contact@), était rangée sans agence (alerte « mail_sans_agence ») et leurs réponses arrivaient au démarchage.
    const espace = k.baseId === "sous_traitants_actifs" ? "recrutement" : "demarchage"
    // Le bouton « Se désinscrire » de Gmail/Yahoo poste sur l'adresse de l'en-tête (RFC 8058, 26/11/2026) : avant, elle
    // menait à la page publique (GitHub Pages), qui ne reçoit pas de POST, et rien n'était noté. formulaire-campagne,
    // elle, vérifie la signature du lien et désinscrit.
    const desabo = `${base}/functions/v1/formulaire-campagne?${new URL(stopAvis).searchParams.toString()}`
    const r = await invoquer(base, service, "envoyer-email", { espace, to, subject: `${test ? "[TEST] " : ""}${sujet}`, html, headers: { "List-Unsubscribe": `<${desabo}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } })
    return r.ok ? { ok: true, fournisseurId: String(r.data?.id ?? r.data?.resend_id ?? "") } : { ok: false, erreur: String(r.data?.error ?? "envoi e-mail échoué") }
  }
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
    // En test, la plaquette s'ouvre sans rien noter : un clic d'essai ne doit pas faire un lead sur une vraie agence.
    for (const [variable, fichier] of Object.entries(PLAQUETTES)) if (texte.includes(variable)) remplacer(variable, test ? `${base}/storage/v1/object/public/pieces-jointes/${fichier}` : (await lienAgence(sb, base, k.id, "plaquette", fichier)).url)
    // N'importe quel PDF de la bibliothèque (lot 3, 17/11/2026) : {{document:<fichier>}}, inséré depuis l'écran des créatifs.
    for (const variable of new Set(`${texte}${sujet}`.match(/\{\{document:[A-Za-z0-9._-]+\}\}/g) ?? [])) { const fichier = variable.slice(11, -2); remplacer(variable, test ? `${base}/storage/v1/object/public/pieces-jointes/${fichier}` : (await lienAgence(sb, base, k.id, "plaquette", fichier)).url) }
  }
  if (test) stop = LIEN_NEUTRE
  // Un mail de prospection propose toujours de ne plus en recevoir, agence ou artisan.
  const desinscription = canal !== "sms" && !aSonLienStop ? stop : undefined

  if (canal === "sms") {
    const to = test ? String(c.test_mobile ?? "") : k.mobile
    if (!to) return { ok: false, saute: test ? "mode test sans mobile de test" : "pas de mobile" }
    // Comme un mail : chaque SMS de prospection permet de ne plus en recevoir.
    const message = aSonLienStop ? texte : `${texte}\nSTOP : ${stop}`
    const r = await invoquer(base, service, "envoyer-sms", { to, message: test ? `[TEST] ${message}` : message })
    return r.ok ? { ok: true } : { ok: false, erreur: String(r.data?.error ?? "envoi SMS échoué"), saute: r.data?.code === "non_mobile" ? "numéro non mobile" : undefined }
  }
  if (canal === "linkedin") return envoyerLinkedIn(sb, c, k, modeLinkedIn, texte, test, compteLinkedIn)
  const to = test ? String(c.test_email ?? "") : k.email
  if (!to) return { ok: false, saute: "pas de mail" }
  sujet = (test ? "[TEST] " : "") + sujet
  if (!varianteId) return { ok: false, saute: "mail sans texte" }
  // Une relance part dans le fil du mail précédent, sauf si le créatif demande un nouveau mail.
  if (leCreatif?.memeFil !== false && !test) {
    const fil = await envoyerDansLeFil(sb, ins, { id: String(c.id), baseId: k.baseId, mentions }, k.id, to, sujet, texte, desinscription, debutJour || undefined)
    if (fil) return fil.ok ? { ...fil, parti: true } : fil
  }
  return envoyerParInstantly(sb, ins, { id: String(c.id), nom: String(c.nom), baseId: k.baseId, rythme: c.rythme as { jours: number[]; heureMin: number; heureMax: number }, plafond, suiviOuvertures: gc?.suiviOuvertures !== false, mentions, boites: gc?.boites }, k, to, sujet, texte, varianteId, test, desinscription, envoiId)
}

Deno.serve(async (req: Request) => {
  const base = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const sb = createClient(base, service)
  const { data: p } = await sb.from("parametres").select("valeur").eq("cle", "analyse_passage_cle").maybeSingle()
  const clePassage = String((p as { valeur?: string } | null)?.valeur ?? "")
  const attendue = String((p as { valeur?: unknown } | null)?.valeur ?? "").replace(/^"|"$/g, "")
  if (!(attendue.length >= 20 && req.headers.get("x-passage-cle") === attendue)) return json({ error: "non autorisé" }, 401)
  compteurIA.n = 0
  echecsIA.carte = null; echecsIA.change = false
  const maintenant = new Date()
  const iso = maintenant.toISOString()
  const bilan: Record<string, number | string> = { campagnes: 0, entrees: 0, envois: 0, erreurs: 0, sautes: 0, reportes: 0, sorties: 0, taches: 0 }

  try {
    const ins = await preparerInstantly(sb, base, iso)
    const { data: actives } = await sb.from("cmp_campagnes").select("*").eq("statut", "active")
    // Chez Instantly aussi (lot 2, 27/11/2026) : une campagne en pause, terminée ou supprimée met en pause ses campagnes
    // Instantly AVANT tout envoi du passage ; les mails déjà confiés n'y partent plus.
    const { data: toutes, error: errToutes } = await sb.from("cmp_campagnes").select("id, statut, base_id, origine, config")
    const statutDe = new Map(((toutes ?? []) as Ligne[]).map((l) => [String(l.id), String(l.statut)]))
    const refusInstantly: string[] = []
    // Lecture en échec : rien n'est touché chez Instantly ce passage (sinon tout serait mis en pause à tort).
    const synchroInstantly = !errToutes && toutes !== null
    if (synchroInstantly) for (const id of campagnesBaticomDansLaCarte(ins.carte)) if (statutDe.get(id) !== "active") refusInstantly.push(...await synchroniserPause(sb, ins, id, true))
    const misesEnPause = new Set<string>()
    const aSortirPar = new Map<string, Set<string>>()
    // Le pare-feu regarde toutes les bases, une fois par passage.
    const annuaire = new Map((await tout<Coordonnees>((d, f) => sb.from("cmp_contacts").select("id, email, mobile, telephone").order("id").range(d, f))).map((k) => [k.id, k]))
    const entresCePassage: Coordonnees[] = []
    const { data: ligneDomaines } = await sb.from("parametres").select("valeur").eq("cle", "domaines_bloques").maybeSingle()
    let domaines: string[] = []
    try { domaines = JSON.parse(String((ligneDomaines as { valeur?: string } | null)?.valeur ?? "[]")) } catch { domaines = [] }
    const { data: ligneEcart } = await sb.from("parametres").select("valeur").eq("cle", "cmp_ecart_campagnes").maybeSingle()
    const brutEcart = (ligneEcart as { valeur?: string } | null)?.valeur
    const ecartCommun = brutEcart != null && brutEcart !== "" && Number.isFinite(Number(brutEcart)) ? Number(brutEcart) : null
    let envoisPassage = 0
    const debutPassage = Date.now()
    const journal: Record<string, unknown>[] = []
    // Une fois par passage (17/11/2026) : les adresses invalides connues, et les contacts dont un mail a rebondi.
    const invalides = new Set((await tout<{ email: string }>((d, f) => sb.from("cmp_verifications").select("email").eq("statut", "invalide").order("email").range(d, f))).map((x) => x.email.trim().toLowerCase()))
    const rebondis = new Set((await tout<{ contact_ref: string }>((d, f) => sb.from("cmp_evenements").select("contact_ref").eq("type", "rebond").order("id").range(d, f))).map((x) => x.contact_ref))
    // Un envoi resté « en cours » (passage coupé avant la fin) : on ne sait pas s'il est parti. Il est noté « sauté » pour ne
    // JAMAIS le renvoyer en double, et le journal le signale.
    const { data: interrompus } = await sb.from("cmp_envois").update({ statut: "saute", cause: "Envoi interrompu (passage coupé) : peut-être parti, non renvoyé" }).eq("statut", "en_cours").lt("le", new Date(maintenant.getTime() - 15 * 60_000).toISOString()).select("id")
    if (interrompus?.length) console.warn("[CAMPAGNES-MOTEUR] envois interrompus passés en « sauté » :", interrompus.length)
    // LinkedIn (13/11/2026) : les plafonds (jour, semaine), les heures, et 2 actions au plus par passage, comptés
    // COMPTE PAR COMPTE. Les comptes branchés ne sont lus chez Unipile qu'une fois, et seulement si une action attend.
    const reglageLi = await reglageLinkedIn(sb)
    let comptesLi: CompteLinkedIn[] | null = null
    let faitsLi = new Map<string, { jour: number; semaine: number }>()
    const passageLi = new Map<string, number>()
    const compteLinkedInDe = async (l: Ligne): Promise<CompteLinkedIn | null> => {
      if (!unipileBranche()) return null
      if (comptesLi === null) {
        comptesLi = await comptesLinkedIn()
        const { data: liEnvois } = await sb.from("cmp_envois").select("compte_linkedin, le").eq("canal", "linkedin").eq("statut", "envoye").eq("test", false).gte("le", new Date(maintenant.getTime() - 7 * JOUR_MS).toISOString()).limit(5000)
        faitsLi = faitsParCompte(((liEnvois ?? []) as { compte_linkedin: string | null; le: string }[]).map((x) => ({ compte: x.compte_linkedin, le: x.le })), debutJourParis(maintenant).toISOString(), comptesLi[0]?.id ?? "")
      }
      return compteDeCampagne(comptesLi, (l.config as { linkedinCompte?: string } | null)?.linkedinCompte)
    }
    const restantLi = (id: string) => restantLinkedIn(reglageLi, { ...(faitsLi.get(id) ?? { jour: 0, semaine: 0 }), passage: passageLi.get(id) ?? 0 }, heureParis(maintenant))
    for (const ligne of (actives ?? []) as Ligne[]) {
      bilan.campagnes = Number(bilan.campagnes) + 1
      const debutCampagne = Date.now()
      const avantBilan = { ...bilan }
      const j: Record<string, unknown> = { id: ligne.id, campagne: ligne.nom }
      const reports: Record<string, number> = {}
      const erreursCampagne: string[] = []
      const sautesCampagne: string[] = []
      const ecart = (cle: string) => Number(bilan[cle] ?? 0) - Number(avantBilan[cle] ?? 0)
      try {
      const c = versCampagne(ligne)
      j.creneau = dansLaPlage(c, maintenant) ? "ouvert" : "fermé"
      const garde = (ligne.config as { garde?: GardeConfig } | null)?.garde
      const lus = (await tout<Ligne>((d, f) => sb.from("cmp_contacts").select("*").eq("base_id", c.baseId).order("id").range(d, f))).map(versContact)
      // « Déjà client » retiré des exclusions : la campagne a choisi de les toucher aussi. Un désinscrit, lui, ne l'est jamais.
      const contacts = avecDejaClients(lus, garde?.exclusions)
      const parContact = new Map(contacts.map((k) => [k.id, k]))
      const inscriptions = (await tout<Ligne>((d, f) => sb.from("cmp_inscriptions").select("*").or(`campagne_id.eq.${c.id},statut.eq.en_cours`).order("id").range(d, f))).map(versInscription)
      const depuis = new Date(maintenant.getTime() - 14 * JOUR_MS).toISOString()
      const envois = (await tout<Ligne>((d, f) => sb.from("cmp_envois").select("*").eq("campagne_id", c.id).gte("le", depuis).order("id").range(d, f))).map(versEnvoi)
      const evenements = (await tout<Ligne>((d, f) => sb.from("cmp_evenements").select("*").eq("campagne_id", c.id).eq("robot", false).order("id").range(d, f))).map(versEvenement)

      // Trop de rebonds depuis le dernier arrêt : la campagne se met en pause, et le dit à l'écran.
      const arretConfig = (ligne.config as { arret?: { le?: string } } | null)?.arret
      const depuisArret = Math.max(maintenant.getTime() - 14 * JOUR_MS, arretConfig?.le ? new Date(arretConfig.le).getTime() : 0)
      const nbEnvoyes = envois.filter((e) => e.statut === "envoye" && new Date(e.le).getTime() > depuisArret).length
      const nbRebonds = evenements.filter((e) => e.type === "rebond" && new Date(e.le).getTime() > depuisArret).length
      if (!ligne.mode_test && doitArreter(nbEnvoyes, nbRebonds, garde?.arret)) {
        // maj_le change aussi (17/11/2026) : un écran ouvert avant la pause ne peut plus la défaire en enregistrant.
        await sb.from("cmp_campagnes").update({ statut: "pause", maj_le: iso, config: { ...((ligne.config as Ligne | null) ?? {}), arret: { le: iso, envois: nbEnvoyes, rebonds: nbRebonds } } }).eq("id", c.id)
        console.warn("[CAMPAGNES-MOTEUR] mise en pause, rebonds", c.nom, nbRebonds, "/", nbEnvoyes)
        j.miseEnPause = `${nbRebonds} rebonds sur ${nbEnvoyes} envois`
        // Le but de l'arrêt est de protéger les boîtes : les mails déjà confiés à Instantly ne partent plus non plus.
        misesEnPause.add(c.id)
        const refus = await synchroniserPause(sb, ins, c.id, true)
        if (refus.length) { erreursCampagne.push(...refus); refusInstantly.push(...refus) }
        continue
      }

      // La montée en charge : le volume du jour, selon l'ancienneté de la campagne et la santé des boîtes.
      const avecMontee = !estBaseAvis(c.baseId) && garde?.montee?.actif
      if (avecMontee) c.rythme = { ...c.rythme, parJour: envoisDuJour(garde!.montee!, c.rythme.parJour, c.lanceeLe ?? iso, maintenant, boitesSaines(nbEnvoyes, nbRebonds)) }

      // 1. Les sorties : un contact devenu lead, gagné, exclu ou désinscrit quitte la séquence.
      // Une adresse jugée invalide par la vérification (25/11/2026) arrête aussi ceux DÉJÀ inscrits, comme un rebond : avant,
      // la liste ne filtrait que les nouvelles entrées (cas réel : adresse invalide le 16/11, mail le 17/11, relance le 24/11).
      // Seulement pour une campagne qui écrit par mail : un SMS ou un appel n'a pas besoin de l'adresse.
      const ecritParMail = c.etapes.some((e) => e.type === "mail" || e.type === "newsletter")
      const { bloques, aSortir } = await contactsBloques(sb, c.id, c.baseId, garde, contacts, maintenant, Number((ligne.config as { qualification?: { relanceMois?: number } } | null)?.qualification?.relanceMois ?? 0), ecartCommun, rebondis, ecritParMail)
      aSortirPar.set(c.id, aSortir)
      for (const i of inscriptions.filter((x) => x.campagneId === c.id && x.statut === "en_cours")) {
        const k = parContact.get(i.contactId)
        // Un mail rebondi (17/11/2026) : l'adresse est morte, les relances ne partent plus. Seulement pour une campagne qui
        // écrit par mail (lot 2, 27/11/2026) : un artisan au mail rebondi garde ses SMS.
        const adresseMorte = ecritParMail && (rebondis.has(i.contactId) || Boolean(k?.email && invalides.has(k.email.trim().toLowerCase())))
        // « Pas intéressé » et exclusion ajoutée à la main arrêtent aussi la séquence en cours (décision 1 du 26/11/2026).
        const statut = !k ? "terminee" : k.desinscrit ? "desinscrit" : adresseMorte ? "rebond" : k.statut === "lead" ? "lead" : k.statut === "gagne" || k.statut === "exclu" || aSortir.has(k.id) ? "terminee" : null
        if (!statut) continue
        await sb.from("cmp_inscriptions").update({ statut, sortie_le: iso }).eq("id", i.id)
        i.statut = statut as Inscription["statut"]
        bilan.sorties = Number(bilan.sorties) + 1
      }

      // 2. La décision, par le moteur pur.
      const dejaDedans = new Set(inscriptions.filter((i) => i.campagneId === c.id).map((i) => i.contactId))
      const actifs = [...inscriptions.filter((i) => i.statut === "en_cours").flatMap((i) => annuaire.get(i.contactId) ?? []), ...entresCePassage]
      // Campagne d'avis des locataires : chacun entre au moment réglé après la fin de son chantier.
      const pasPrets = new Set<string>()
      if (c.baseId === "locataires") {
        const r = (ligne.config as { avis?: ReglageAvis } | null)?.avis ?? AVIS_DEPART
        const fins = await tout<{ id: string; fin_le: string | null }>((d, f) => sb.from("avis_contacts").select("id, fin_le").eq("public", "locataires").order("id").range(d, f))
        for (const x of fins) if (!pretPourAvis(x.fin_le, r, maintenant)) pasPrets.add(String(x.id))
      }
      // Retirés de CETTE campagne (lot 4) : ni entrée, ni envoi ; remis, ils reprennent où ils en étaient.
      const retires = new Set(garde?.retires ?? [])
      const autorises = sansDejaSollicites(contacts.filter((k) => !retires.has(k.id) && (dejaDedans.has(k.id) || (!bloques.has(k.id) && !pasPrets.has(k.id) && !domaineBloque(k.email, domaines)))), dejaDedans, actifs)
      const verifies = await avecAdressesVerifiees(sb, c, autorises, dejaDedans, maintenant, ins.cle, invalides)
      Object.assign(j, { parJour: c.rythme.parJour, contacts: contacts.length, dejaDedans: dejaDedans.size, bloquesParGardeFous: bloques.size, retires: retires.size, autorises: autorises.length - dejaDedans.size, adressesRefusees: verifies.refusees })
      bilan.adressesRefusees = Number(bilan.adressesRefusees ?? 0) + verifies.refusees
      const avecGagnant = await avecGagnants(sb, c, ligne.config as Ligne["config"], evenements, inscriptions, lus)
      // Les 48 h entre deux touches comptent depuis le départ réel d'un mail Instantly (lot 2, 27/11/2026), pas depuis sa remise.
      const delivreLe = new Map<string, string>()
      if (parInstantly(c)) for (const ev of evenements) if (ev.type === "delivre" && ev.envoiId && (!delivreLe.has(ev.envoiId) || ev.le < delivreLe.get(ev.envoiId)!)) delivreLe.set(ev.envoiId, ev.le)
      const ecr = passage({ campagne: avecGagnant, contacts: verifies.contacts, inscriptions, envois: envois.filter((e) => e.statut === "envoye").map((e) => (delivreLe.has(e.id) && delivreLe.get(e.id)! > e.le ? { ...e, le: delivreLe.get(e.id)! } : e)), evenements }, maintenant, () => crypto.randomUUID())
      const nouvelles = new Map(ecr.inscriptions.map((i) => [i.id, i]))
      for (const i of ecr.inscriptions) { const k = annuaire.get(i.contactId); if (k) entresCePassage.push(k) }
      const majs = new Map(ecr.majInscriptions.map((i) => [i.id, i]))
      const avant = new Map(inscriptions.map((i) => [i.id, i]))
      const reportees = new Set<string>(), enErreur = new Set<string>()

      // 3. Les envois, un par un, avec les garde-fous.
      // Minuit à Paris, été comme hiver (25/11/2026 : avant, +01:00 fixe, le budget du jour repartait à 23 h l'été).
      const debutJour = debutJourParis(maintenant).toISOString()
      const { count: mailsJour } = await sb.from("cmp_envois").select("id", { count: "exact", head: true }).eq("campagne_id", c.id).eq("canal", "mail").eq("statut", "envoye").gte("le", debutJour)
      const { count: smsJour } = await sb.from("cmp_envois").select("id", { count: "exact", head: true }).eq("campagne_id", c.id).eq("canal", "sms").eq("statut", "envoye").gte("le", debutJour)
      const avis = estBaseAvis(c.baseId)
      const plafondMail = avecMontee ? c.rythme.parJour : garde?.plafondMail ?? PLAFOND_JOUR.mail
      const budget = { mail: plafondMail - (mailsJour ?? 0), sms: (garde?.plafondSms ?? PLAFOND_JOUR.sms) - (smsJour ?? 0) }
      const hSms = heureParis(maintenant) >= (garde?.smsDe ?? 10) && heureParis(maintenant) < (garde?.smsA ?? 17)
      let arret = false
      for (const e of ecr.envois) {
        const canal = e.canal === "sms" ? "sms" : e.canal === "linkedin" ? "linkedin" : "mail"
        // LinkedIn : le compte de la campagne, et ce qu'il peut encore faire (une action sautée d'avance ne compte pas).
        const compteLi = canal === "linkedin" && e.statut !== "saute" && !ligne.mode_test ? await compteLinkedInDe(ligne) : null
        const liBloque = canal === "linkedin" && e.statut !== "saute" && !ligne.mode_test && (!compteLi || restantLi(compteLi.id) <= 0)
        // Boîtes Instantly pas prêtes : le mail attend, il n'est ni perdu ni envoyé par un autre chemin.
        const causeReport = arret ? "limite de débit du prestataire" : envoisPassage >= ENVOIS_MAX_PAR_PASSAGE ? `plafond de ${ENVOIS_MAX_PAR_PASSAGE} envois par passage` : canal === "linkedin" && liBloque ? "LinkedIn : compte absent ou quota atteint" : canal !== "linkedin" && budget[canal] <= 0 ? `plafond du jour (${canal})` : canal === "sms" && !hSms ? "hors des heures SMS" : canal === "mail" && !avis && !ins.pretes.length ? "aucune boîte Instantly prête" : ""
        if (causeReport) { reportees.add(e.inscriptionId); bilan.reportes = Number(bilan.reportes) + 1; reports[causeReport] = (reports[causeReport] ?? 0) + 1; continue }
        // Une relance ne part qu'après la confirmation du mail d'avant (26/11/2026) : « confié à Instantly » n'est pas « parti ».
        // Seulement pour une campagne qui passe par Instantly (lot 6) : la confirmation « délivré » vient d'Instantly ; une
        // campagne envoyée par Resend (origine « st » : 623 envois sur 1 130 sans « délivré ») restait retenue à vie.
        const confirmation: Confirmation = (!nouvelles.has(e.inscriptionId) && e.statut !== "saute" && !ligne.mode_test && parInstantly(c) && await attendConfirmation(sb, e.inscriptionId, e.etapeId)) || { retenue: false }
        if (confirmation.retenue) {
          const cause = "mail précédent pas encore confirmé parti"
          reportees.add(e.inscriptionId); bilan.reportes = Number(bilan.reportes) + 1; reports[cause] = (reports[cause] ?? 0) + 1; continue
        }
        // L'attente compte depuis le DÉPART RÉEL du mail d'avant (lot 2, 27/11/2026), pas depuis sa remise à Instantly : un
        // mail confié le 19/11 et parti le 23/11 n'a sa relance qu'à partir du 30/11 (« Attendre 7 jours »), pas le 26/11.
        if (confirmation.precedent) {
          const possible = relancePossibleLe(c.etapes as { id: string; type: string; jours?: number }[], confirmation.precedent.etapeId, e.etapeId, confirmation.precedent.parti, c.rythme.ecartMinH)
          if (possible > maintenant.getTime()) {
            const cause = "attente comptée depuis le départ réel du mail d'avant"
            reportees.add(e.inscriptionId); bilan.reportes = Number(bilan.reportes) + 1; reports[cause] = (reports[cause] ?? 0) + 1
            await sb.from("cmp_inscriptions").update({ prochaine_le: new Date(possible).toISOString() }).eq("id", e.inscriptionId).eq("statut", "en_cours")
            continue
          }
        }
        const etapeIndex = c.etapes.findIndex((x) => x.id === e.etapeId)
        const etape = c.etapes[etapeIndex]
        const v = etape && "variantes" in etape ? (canal === "linkedin" ? etape.variantes.find((x) => x.id === e.varianteId) ?? etape.variantes[0] : varianteAvecTexte(etape.variantes, e.varianteId)) : null
        // Aucune variante écrite pour cette étape (lot 2, 27/11/2026) : rien ne part, l'envoi attend le texte. Une variante
        // vide (B ajoutée, pas encore écrite) est remplacée par l'autre : avant, elle partait vide à la moitié des contacts.
        if (etape && "variantes" in etape && canal !== "linkedin" && e.statut !== "saute" && !v) {
          const cause = "étape sans texte (variante vide)"
          reportees.add(e.inscriptionId); bilan.reportes = Number(bilan.reportes) + 1; reports[cause] = (reports[cause] ?? 0) + 1; continue
        }
        if (v && v.id !== e.varianteId) e.varianteId = v.id
        // L'inscription doit exister avant l'envoi (la clé étrangère) : une nouvelle est écrite tout de suite, au pas d'avant.
        const nouvelle = nouvelles.get(e.inscriptionId)
        if (nouvelle) {
          const { error } = await sb.from("cmp_inscriptions").insert({ id: nouvelle.id, campagne_id: c.id, contact_ref: nouvelle.contactId, entree_le: nouvelle.entreeLe, etape_index: 0, prochaine_le: iso, statut: "en_cours" })
          if (error) { reportees.add(e.inscriptionId); reports["inscription refusée (déjà inscrit ?)"] = (reports["inscription refusée (déjà inscrit ?)"] ?? 0) + 1; continue } // déjà inscrit par un passage concurrent
          bilan.entrees = Number(bilan.entrees) + 1
        }
        // Dernier filet : cette étape est-elle déjà partie (ou sautée) pour ce contact ?
        // Un envoi d'essai (mode test) ne compte pas pour un vrai envoi (lot 2, 27/11/2026) : il est parti vers l'adresse de test.
        const test = Boolean(ligne.mode_test)
        const filet = sb.from("cmp_envois").select("id", { count: "exact", head: true }).eq("inscription_id", e.inscriptionId).eq("etape_id", e.etapeId).in("statut", ["envoye", "saute", "en_cours"])
        const { count: deja } = await (test ? filet : filet.eq("test", false))
        if ((deja ?? 0) > 0) continue
        const { count: essais } = await sb.from("cmp_envois").select("id", { count: "exact", head: true }).eq("inscription_id", e.inscriptionId).eq("etape_id", e.etapeId).eq("statut", "erreur")
        const tentative = (essais ?? 0) + 1
        const k = parContact.get(e.contactId)!
        const { error: errLigne } = await sb.from("cmp_envois").insert({ id: e.id, campagne_id: c.id, inscription_id: e.inscriptionId, contact_ref: e.contactId, etape_id: e.etapeId, variante_id: e.varianteId, canal: e.canal, le: iso, statut: "en_cours", tentative, test })
        // Sans sa ligne, l'envoi ne serait pas tracé : il ne part pas (il sera rejoué au passage suivant).
        if (errLigne) { reportees.add(e.inscriptionId); erreursCampagne.push(`ligne d'envoi non écrite : ${errLigne.message}`); continue }
        const r = e.statut === "saute" ? { ok: false, saute: e.cause } as Resultat : await envoyer(sb, base, service, ligne, k, canal, v?.objet ?? "", v?.corps ?? "", test, e.varianteId, clePassage, ins, garde?.plafondMail ?? PLAFOND_JOUR.mail, etape && "linkedin" in etape ? etape.linkedin ?? "" : "", compteLi, e.id, debutJour)
        // La vraie cause du report dans le journal (lot 2, 27/11/2026) : avant, tout report était noté « texte IA à relire ».
        if (r.reporte) { await sb.from("cmp_envois").delete().eq("id", e.id); reportees.add(e.inscriptionId); bilan.reportes = Number(bilan.reportes) + 1; reports[r.reporte] = (reports[r.reporte] ?? 0) + 1; continue }
        if (r.ok) {
          const { error: errEnvoye } = await sb.from("cmp_envois").update({ statut: "envoye", fournisseur_id: r.fournisseurId || null, ...(canal === "linkedin" && compteLi ? { compte_linkedin: compteLi.id } : {}) }).eq("id", e.id)
          // Parti, mais pas noté : la ligne reste « en cours », le filet empêche tout renvoi. Le journal le dit.
          if (errEnvoye) erreursCampagne.push(`envoi parti mais non noté (${e.contactId}) : ${errEnvoye.message}`)
          // Une relance dans le fil part à l'instant (Instantly n'envoie pas de « email_sent ») : elle est confirmée ici (25/11/2026).
          if (r.parti && !test) await sb.from("cmp_evenements").insert({ campagne_id: c.id, envoi_id: e.id, contact_ref: e.contactId, type: "delivre", le: new Date().toISOString() })
          if (canal === "linkedin") {
            if (compteLi) {
              const f = faitsLi.get(compteLi.id) ?? { jour: 0, semaine: 0 }
              faitsLi.set(compteLi.id, { jour: f.jour + 1, semaine: f.semaine + 1 })
              passageLi.set(compteLi.id, (passageLi.get(compteLi.id) ?? 0) + 1)
            }
          } else budget[canal]--
          envoisPassage++; bilan.envois = Number(bilan.envois) + 1
          await pause(CADENCE_MS[canal])
        } else if (r.saute) {
          await sb.from("cmp_envois").update({ statut: "saute", cause: r.saute }).eq("id", e.id)
          sautesCampagne.push(String(r.saute))
          // Déjà en relation sur LinkedIn : c'est comme une invitation acceptée (pour « Si… a accepté »).
          if (r.connexion) await sb.from("cmp_evenements").insert({ campagne_id: c.id, envoi_id: e.id, contact_ref: e.contactId, type: "connexion", le: iso })
          bilan.sautes = Number(bilan.sautes) + 1
        } else {
          const cause = causeDe(r.erreur ?? "")
          await sb.from("cmp_envois").update({ statut: "erreur", cause }).eq("id", e.id)
          erreursCampagne.push(cause)
          bilan.erreurs = Number(bilan.erreurs) + 1
          const rejeu = rejeuApres(canal, tentative)
          if (rejeu !== null) {
            // On revient sur l'étape, rejouée plus tard (la mise à jour du moteur pour ce contact n'est pas écrite).
            reportees.add(e.inscriptionId)
            enErreur.add(e.inscriptionId)
            await sb.from("cmp_inscriptions").update({ etape_index: etapeIndex, prochaine_le: new Date(maintenant.getTime() + rejeu * 60_000).toISOString() }).eq("id", e.inscriptionId).eq("etape_index", avant.get(e.inscriptionId)?.etapeIndex ?? 0)
          } else if (canal === "mail") {
            // Un mail jamais parti après tous ses rejeux (lot 2, 27/11/2026) : l'inscription s'arrête. Avant, la séquence
            // continuait et la relance (« je reviens vers vous ») partait 7 jours plus tard sans premier mail.
            reportees.add(e.inscriptionId)
            await sb.from("cmp_inscriptions").update({ statut: "terminee", sortie_le: iso }).eq("id", e.inscriptionId)
            await sb.from("cmp_envois").update({ cause: `${cause} ; abandonné après ${tentative} essais, séquence arrêtée` }).eq("id", e.id)
            bilan.sorties = Number(bilan.sorties) + 1
          }
          if (/débit/.test(cause)) arret = true
        }
      }

      // 4. Les avancées du moteur (sauf pour les contacts reportés), les nouvelles entrées sans envoi, les tâches.
      for (const [id, i] of majs) {
        if (reportees.has(id)) continue
        const a = avant.get(id)
        if (a && a.etapeIndex === i.etapeIndex && a.prochaineLe === i.prochaineLe && a.statut === i.statut) continue
        // Écrite seulement si la position n'a pas bougé depuis la lecture (lot 2, 27/11/2026) : des étapes modifiées pendant
        // le passage sont recalées par le déclencheur cmp_campagnes_recaler_inscriptions ; une position calculée sur les
        // anciennes étapes ne doit pas l'écraser. Le passage suivant repart de la position recalée (le filet par étape
        // empêche tout double envoi).
        const { data: ecrite } = await sb.from("cmp_inscriptions").update({ etape_index: i.etapeIndex, prochaine_le: i.prochaineLe, statut: i.statut, sortie_le: i.sortieLe }).eq("id", id).eq("etape_index", a?.etapeIndex ?? 0).eq("statut", "en_cours").select("id")
        if (!ecrite?.length) erreursCampagne.push("position non écrite : étapes modifiées ou contact sorti pendant le passage")
      }
      for (const [id, i] of nouvelles) {
        if (reportees.has(id)) continue
        const { data: existe } = await sb.from("cmp_inscriptions").select("id").eq("id", id).maybeSingle()
        if (existe) await sb.from("cmp_inscriptions").update({ etape_index: i.etapeIndex, prochaine_le: i.prochaineLe, statut: i.statut, sortie_le: i.sortieLe }).eq("id", id).eq("etape_index", 0)
        else { await sb.from("cmp_inscriptions").insert({ id, campagne_id: c.id, contact_ref: i.contactId, entree_le: i.entreeLe, etape_index: i.etapeIndex, prochaine_le: i.prochaineLe, statut: i.statut, sortie_le: i.sortieLe }); bilan.entrees = Number(bilan.entrees) + 1 }
      }
      // Un envoi en erreur est rejoué à SON étape : les tâches d'avant (un appel) ne seront pas refaites, on les écrit donc.
      const reporteesContacts = new Set([...reportees].filter((id) => !enErreur.has(id)).map((id) => (nouvelles.get(id) ?? avant.get(id))?.contactId))
      const taches = ecr.taches.filter((t) => !reporteesContacts.has(t.contactId))
      if (taches.length) {
        const { error: errTaches } = await sb.from("cmp_taches").insert(taches.map((t) => ({ id: t.id, campagne_id: c.id, contact_ref: t.contactId, etape_id: t.etapeId, type: t.type, consigne: t.consigne, cible: t.cible ?? "contact" })))
        if (errTaches) erreursCampagne.push(`tâches non écrites : ${errTaches.message}`)
        bilan.taches = Number(bilan.taches) + taches.length
      }
      // L'alerte d'ouverture : un appel au standard, une seule fois par contact.
      if (garde?.alerteOuverture?.actif && garde.suiviOuvertures !== false && c.baseId !== "artisans" && !estBaseAvis(c.baseId)) {
        const { data: deja } = await sb.from("cmp_taches").select("contact_ref").eq("campagne_id", c.id).eq("etape_id", ETAPE_ALERTE)
        const a = aAppelerSurOuverture(garde.alerteOuverture, inscriptions.filter((i) => i.campagneId === c.id), evenements, new Set(((deja ?? []) as { contact_ref: string }[]).map((x) => x.contact_ref)), maintenant)
        if (a.length) { await sb.from("cmp_taches").insert(a.map((id) => ({ id: crypto.randomUUID(), campagne_id: c.id, contact_ref: id, etape_id: ETAPE_ALERTE, type: "appel", consigne: `A ouvert le mail ${garde.alerteOuverture!.fois} fois : appeler le standard.`, cible: "standard" }))); bilan.taches = Number(bilan.taches) + a.length }
      }
      // Plafond du passage atteint : on ne s'arrête plus (17/11/2026) ; les campagnes suivantes font leurs sorties, leur
      // contrôle des rebonds et leurs tâches, et leurs envois sont reportés (cause notée dans le journal).
      } catch (err) {
        // Une campagne en erreur n'arrête plus les autres.
        erreursCampagne.push(`passage interrompu : ${String((err as Error)?.message ?? err).slice(0, 300)}`)
        console.error("[CAMPAGNES-MOTEUR] erreur sur la campagne", ligne.nom, ligne.id, err)
        bilan.campagnesEnErreur = Number(bilan.campagnesEnErreur ?? 0) + 1
      }
      Object.assign(j, { entrees: ecart("entrees"), envois: ecart("envois"), sorties: ecart("sorties"), taches: ecart("taches"), reportes: reports, erreurs: compter(erreursCampagne), sautes: compter(sautesCampagne), ms: Date.now() - debutCampagne })
      console.log("[CAMPAGNES-MOTEUR] campagne", JSON.stringify(j))
      journal.push(j)
    }
    // Les contacts sortis (désinscrit, lead, client, exclu, pas intéressé, rebond, réponse…) ou retirés d'une campagne, dont un
    // mail confié à Instantly n'est pas encore parti : retirés chez Instantly (lot 2, 27/11/2026). Avant, il partait quand
    // même, jusqu'à 4 jours plus tard. Toutes les sorties sont vues ici, celles du moteur comme celles des autres fonctions
    // (formulaire, réponses, déclencheurs) ; un retrait refusé est rejoué au passage suivant.
    if (synchroInstantly) {
      const retraits = await retirerNonPartis(sb, ins, (toutes ?? []) as Ligne[], aSortirPar, maintenant)
      if (retraits.retires) bilan.retiresInstantly = retraits.retires
      refusInstantly.push(...retraits.refus)
    }
    // Reprise : les campagnes actives réactivent leurs campagnes Instantly, APRÈS les sorties et les retraits ci-dessus.
    if (synchroInstantly) for (const id of campagnesBaticomDansLaCarte(ins.carte)) if (statutDe.get(id) === "active" && !misesEnPause.has(id)) refusInstantly.push(...await synchroniserPause(sb, ins, id, false))
    if (refusInstantly.length) bilan.instantly = Object.entries(compter(refusInstantly)).map(([k, n]) => `${n} × ${k}`).join(" ; ").slice(0, 500)
    if (echecsIA.change && echecsIA.carte) await sb.from("parametres").upsert({ cle: CLE_ECHECS_IA, valeur: JSON.stringify(echecsIA.carte) }, { onConflict: "cle" })
    bilan.ms = Date.now() - debutPassage
    bilan.boites = `${ins.pretes.length} prête(s) sur ${ins.boites.length}`
    if (interrompus?.length) bilan.envoisInterrompus = interrompus.length
    console.log("[CAMPAGNES-MOTEUR]", JSON.stringify(bilan))
    await garderJournal(sb, { le: iso, bilan, campagnes: journal })
    return json({ ok: true, bilan })
  } catch (e) {
    console.error("[CAMPAGNES-MOTEUR] erreur :", e)
    await garderJournal(sb, { le: iso, bilan, erreur: String((e as Error)?.message ?? e).slice(0, 500), campagnes: [] }).catch(() => undefined)
    return json({ ok: false, error: String((e as Error)?.message ?? e), bilan }, 500)
  }
})
