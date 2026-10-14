// ════════════════════════════════════════════════════════════════════════════
// LA BASE DU DÉMARCHAGE (09/10/2026) — agences, contacts, activités.
//
// Toutes les lectures passent par la vue `agences_liste` (une agence avec ses
// compteurs) ; les écritures qui appliquent des RÈGLES passent par les
// fonctions de la base (`appel_enregistrer`, `agence_premier_os`,
// `tache_terminer`) : une seule définition, côté serveur.
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from "../lib/supabase"
import { lireParLots } from "../lib/pagination"
import type { Proprietaire } from "./attribution"
import type { Message } from "../lib/messagesDb"
import {
  type Activite,
  type Agence,
  type Contact,
  type Etape,
  type File,
  type Issue,
  type Motif,
  type Resultat,
  type Secteur,
  jourLocal,
  premiersInteresses,
  nomCle,
} from "./modele"

type LigneAgence = {
  id: string; nom: string; enseigne: string; type: Agence["type"]; secteur: string | null; secteur_libelle: string | null; adresse: string; telephone: string; email: string; site: string
  nb_lots: number; logo_url: string; etape: Etape; etape_depuis: string; commercial_id: string | null; tentatives: number; joint_fois: number; reveil_le: string | null; motif: string
  premier_os_le: string | null; numero_emission: string; derniere_activite_le: string | null; cree_le: string
  nb_contacts: number | null; contact_principal: string | null; contact_ligne: string | null; prochaine_echeance: string | null; prochaine_tache: string | null
  nb_appels: number | null; dernier_appel_le: string | null; dernier_resultat: string | null
  dernier_signal?: string | null; dernier_signal_le?: string | null; compte_ouvert_le?: string | null; compte_email?: string | null // signaux du site (table agences, absents de la vue)
}
type LigneContact = { id: string; agence_id: string; prenom: string; nom: string; role: Contact["role"]; ligne_directe: string; mobile: string; email: string; principal: boolean; parti: boolean; note: string; cree_le: string }
type LigneActivite = {
  id: string; agence_id: string; contact_id: string | null; type: Activite["type"]; date: string; echeance: string | null; fait_le: string | null; compte_id: string | null; compte_nom: string
  titre: string; note: string; resultat: string; issue: string; motif: string; numero_utilise: string; duree_s: number | null; call_id: string; sens: "sortant" | "entrant"; rdv_type: string
  message_id: string | null; etape_de: string; etape_vers: string; source: string
}

const COLONNES_AGENCE = "id, nom, enseigne, type, secteur, secteur_libelle, adresse, telephone, email, site, nb_lots, logo_url, etape, etape_depuis, commercial_id, tentatives, joint_fois, reveil_le, motif, premier_os_le, numero_emission, derniere_activite_le, cree_le, nb_contacts, contact_principal, contact_ligne, prochaine_echeance, prochaine_tache, nb_appels, dernier_appel_le, dernier_resultat"
const COLONNES_CONTACT = "id, agence_id, prenom, nom, role, ligne_directe, mobile, email, principal, parti, note, cree_le"
const COLONNES_ACTIVITE = "id, agence_id, contact_id, type, date, echeance, fait_le, compte_id, compte_nom, titre, note, resultat, issue, motif, numero_utilise, duree_s, call_id, sens, rdv_type, message_id, etape_de, etape_vers, source"

function versAgence(l: LigneAgence): Agence {
  return {
    id: l.id, nom: l.nom, enseigne: l.enseigne ?? "", type: l.type ?? "agence", secteur: l.secteur, secteurLibelle: l.secteur_libelle ?? l.secteur ?? "", adresse: l.adresse ?? "",
    telephone: l.telephone ?? "", email: l.email ?? "", site: l.site ?? "", nbLots: l.nb_lots ?? 0, logoUrl: l.logo_url ?? "", etape: l.etape, etapeDepuis: l.etape_depuis,
    commercialId: l.commercial_id, tentatives: l.tentatives ?? 0, jointFois: l.joint_fois ?? 0, reveilLe: l.reveil_le, motif: l.motif ?? "", premierOsLe: l.premier_os_le,
    numeroEmission: l.numero_emission ?? "", derniereActiviteLe: l.derniere_activite_le, creeLe: l.cree_le,
    nbContacts: l.nb_contacts ?? 0, contactPrincipal: l.contact_principal ?? "", contactLigne: l.contact_ligne ?? "", prochaineEcheance: l.prochaine_echeance, prochaineTache: l.prochaine_tache ?? "",
    nbAppels: l.nb_appels ?? 0, dernierAppelLe: l.dernier_appel_le, dernierResultat: l.dernier_resultat ?? "",
    dernierSignal: l.dernier_signal ?? "", dernierSignalLe: l.dernier_signal_le ?? null, compteOuvertLe: l.compte_ouvert_le ?? null, compteEmail: l.compte_email ?? "",
  }
}
function versContact(l: LigneContact): Contact {
  return { id: l.id, agenceId: l.agence_id, prenom: l.prenom ?? "", nom: l.nom ?? "", role: l.role ?? "gestionnaire", ligneDirecte: l.ligne_directe ?? "", mobile: l.mobile ?? "", email: l.email ?? "", principal: !!l.principal, parti: !!l.parti, note: l.note ?? "", creeLe: l.cree_le }
}
function versActivite(l: LigneActivite): Activite {
  return {
    id: l.id, agenceId: l.agence_id, contactId: l.contact_id, type: l.type, date: l.date, echeance: l.echeance, faitLe: l.fait_le, compteId: l.compte_id, compteNom: l.compte_nom ?? "",
    titre: l.titre ?? "", note: l.note ?? "", resultat: l.resultat ?? "", issue: l.issue ?? "", motif: l.motif ?? "", numeroUtilise: l.numero_utilise ?? "", dureeS: l.duree_s, callId: l.call_id ?? "",
    sens: l.sens === "entrant" ? "entrant" : "sortant", rdvType: l.rdv_type ?? "", messageId: l.message_id, etapeDe: l.etape_de ?? "", etapeVers: l.etape_vers ?? "", source: l.source ?? "",
  }
}
function sb() {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  return supabase
}
function erreur(e: { message: string } | null): void {
  if (e) throw new Error(e.message)
}
const chiffres = (t: string) => (t || "").replace(/\D/g, "")

// ── Secteurs ──
export async function chargerSecteurs(): Promise<Secteur[]> {
  const { data, error } = await sb().from("secteurs").select("code, libelle, zone, ordre, commercial_id").order("ordre").order("code")
  erreur(error)
  return ((data ?? []) as (Secteur & { commercial_id?: string | null })[]).map(({ commercial_id, ...s }) => ({ ...s, commercialId: commercial_id ?? null }))
}
// Attribuer un secteur à une personne (admins) : le réglage est mémorisé sur le secteur et les agences
// non attribuées du secteur passent à cette personne. Renvoie le nombre d'agences attribuées.
export async function attribuerSecteur(code: string, compteId: string | null, ecraser = false): Promise<number> {
  const { data, error } = await sb().rpc("attribuer_secteur", { p_secteur: code, p_compte_id: compteId, p_ecraser: ecraser })
  erreur(error)
  return Number(data ?? 0)
}

// Une agence qui s'avère être un apporteur d'affaires (Mahdi, 12/10/2026 : « un bouton direct, qu'on switche vite ») :
// son type change, elle sort du démarchage (les apporteurs sont une archive, jamais dans les files), et la fiche garde une note.
export async function passerApporteur(agenceId: string, compteNom: string): Promise<void> {
  await majAgence(agenceId, { type: "apporteur" })
  await creerNote({ agenceId, compteNom, note: "Passée en apporteur d'affaires : sortie du démarchage (modifiable dans Identité › Vous êtes)." })
}

// ── Agences : les listes ──
export type FiltresAgences = { etape?: Etape | "actives" | ""; secteur?: string; type?: Agence["type"] | ""; enseigne?: string; recherche?: string; jamaisJointe?: boolean; avecContact?: boolean; commercialId?: string; limite?: number }


// ⚠ PostgREST s'arrête à 1 000 lignes sans le dire (10/10 : « 1000 agences · 8 intéressées »
// alors qu'il y en a 2 372 et 17). Toute lecture qui peut dépasser passe par lireParLots.
export async function chargerAgences(f: FiltresAgences = {}): Promise<Agence[]> {
  const requete = (de: number, a: number) => {
    let q = sb().from("agences_liste").select(COLONNES_AGENCE).order("nom").order("id").range(de, a)
    if (f.etape === "actives") q = q.in("etape", ["a_prospecter", "gestionnaire_joint", "interesse", "rdv_planifie", "client"])
    else if (f.etape) q = q.eq("etape", f.etape)
    if (f.secteur) q = q.eq("secteur", f.secteur)
    if (f.type) q = q.eq("type", f.type)
    else q = q.neq("type", "apporteur") // les apporteurs sont une archive : jamais dans les listes par défaut
    if (f.enseigne) q = q.eq("enseigne", f.enseigne)
    if (f.jamaisJointe) q = q.eq("joint_fois", 0)
    if (f.avecContact) q = q.gt("nb_contacts", 0)
    if (f.commercialId === "aucun") q = q.is("commercial_id", null)
    else if (f.commercialId) q = q.eq("commercial_id", f.commercialId)
    if (f.recherche?.trim()) {
      const r = f.recherche.trim().replace(/[%,]/g, " ")
      q = q.or(`nom.ilike.%${r}%,telephone.ilike.%${r}%,email.ilike.%${r}%,adresse.ilike.%${r}%,contact_principal.ilike.%${r}%`)
    }
    return q
  }
  const limite = f.limite ?? 5000
  if (limite <= 1000) {
    const { data, error } = await requete(0, limite - 1)
    erreur(error)
    return ((data ?? []) as LigneAgence[]).map(versAgence)
  }
  const lignes = await lireParLots<LigneAgence>(requete)
  return lignes.slice(0, limite).map(versAgence)
}

// ── Les piles de la session : CALCULÉES PAR LA BASE (14/10) ──
// L'ordre (jamais appelées d'abord…), le repos, le « standard », un numéro = un appel par jour,
// les fiches au même standard, la base de chacun : tout est dans `pile_demarchage`
// (supabase/regles-demarchage.sql, testé avant chaque mise en ligne). L'écran ne trie ni ne
// filtre plus rien : il affiche. Les compteurs sont la longueur de ces mêmes listes.
const versProprietaireSql = (p: Proprietaire): string => (p === "tous" || p === "non_attribuees" ? p : p.compteId)
export type OptionsPile = { proprietaire: Proprietaire; etape?: Etape | ""; secteur?: string | null; sourcage?: "" | "sourcees" | "non_sourcees"; inclureAppelees?: boolean }
export async function chargerPile(pile: File, o: OptionsPile): Promise<Agence[]> {
  const args = {
    p_pile: o.etape ? "etape" : pile,
    p_proprietaire: versProprietaireSql(o.proprietaire),
    p_etape: o.etape || null,
    p_secteur: o.secteur || null,
    p_sourcage: o.sourcage ?? "",
    p_inclure_appelees: Boolean(o.inclureAppelees),
  }
  type L = { rang: number; agence: LigneAgence }
  const lignes = await lireParLots<L>((de, a) => sb().rpc("pile_demarchage", args).select("rang, agence").order("rang").range(de, a) as unknown as PromiseLike<LotDe<L>>)
  return lignes.map((l) => versAgence(l.agence))
}
export async function compterPiles(proprietaire: Proprietaire): Promise<Record<File, number>> {
  const { data, error } = await sb().rpc("compter_piles", { p_proprietaire: versProprietaireSql(proprietaire) })
  erreur(error)
  const c = (data ?? {}) as Partial<Record<File, number>>
  // Un comptage incomplet ne s'affiche jamais comme un vrai chiffre : l'appelant garde « — ».
  if ([c.a_prospecter, c.rappels, c.sans_nouvelle, c.a_reveiller].some((n) => typeof n !== "number")) throw new Error("Compteurs des piles incomplets (SQL du 14/10 non collé ?)")
  return c as Record<File, number>
}

export async function compterParEtape(): Promise<Record<string, number>> {
  const lignes = await lireParLots<{ id: string; etape: string }>((de, a) => sb().from("agences").select("id, etape").neq("type", "apporteur").order("id").range(de, a))
  const out: Record<string, number> = {}
  for (const l of lignes) out[l.etape] = (out[l.etape] ?? 0) + 1
  return out
}
// Les apporteurs d'affaires : une archive à part, jamais dans les files ni dans les comptes ci-dessus.
export async function compterApporteurs(): Promise<number> {
  const { count, error } = await sb().from("agences").select("id", { count: "exact", head: true }).eq("type", "apporteur")
  erreur(error)
  return count ?? 0
}

// ── Une agence, complète ──
export type AgenceComplete = { agence: Agence; contacts: Contact[]; activites: Activite[]; messages: Message[] }

export async function chargerAgence(id: string): Promise<AgenceComplete> {
  const s = sb()
  const [a, sg, c, t, m] = await Promise.all([
    s.from("agences_liste").select(COLONNES_AGENCE).eq("id", id).maybeSingle(),
    // Les signaux du site vivent sur la table (pas dans la vue) ; tant que les colonnes ne sont pas posées, on les ignore.
    s.from("agences").select("dernier_signal, dernier_signal_le, compte_ouvert_le, compte_email").eq("id", id).maybeSingle(),
    s.from("contacts").select(COLONNES_CONTACT).eq("agence_id", id).order("principal", { ascending: false }).order("cree_le"),
    s.from("activites").select(COLONNES_ACTIVITE).eq("agence_id", id).order("date", { ascending: false }).limit(300),
    s.from("messages").select("id, sens, espace, sous_traitant_id, de, a, objet, corps_text, corps_html, message_id, in_reply_to, prospect_id, lu, created_at, pieces_jointes").eq("agence_id", id).order("created_at", { ascending: false }).limit(100),
  ])
  erreur(a.error)
  erreur(c.error)
  erreur(t.error)
  if (!a.data) throw new Error("Agence introuvable.")
  type LigneMessage = { id: string; sens: "entrant" | "sortant"; espace: "demarchage" | "recrutement" | null; sous_traitant_id: string | null; de: string; a: string; objet: string; corps_text: string; corps_html: string; message_id: string | null; in_reply_to: string | null; prospect_id: string | null; lu: boolean; created_at: string; pieces_jointes: Message["piecesJointes"] | null }
  const messages: Message[] = ((m.data ?? []) as LigneMessage[]).map((l) => ({
    id: l.id, sens: l.sens, espace: l.espace ?? "demarchage", sousTraitantId: l.sous_traitant_id, de: l.de, a: l.a, objet: l.objet, corpsText: l.corps_text, corpsHtml: l.corps_html,
    messageId: l.message_id, inReplyTo: l.in_reply_to, prospectId: l.prospect_id, lu: l.lu, date: l.created_at, piecesJointes: Array.isArray(l.pieces_jointes) ? l.pieces_jointes : [],
  }))
  return { agence: versAgence({ ...(a.data as LigneAgence), ...((sg.error ? {} : sg.data ?? {}) as Partial<LigneAgence>) }), contacts: ((c.data ?? []) as LigneContact[]).map(versContact), activites: ((t.data ?? []) as LigneActivite[]).map(versActivite), messages }
}

// Avant de créer : la même agence existe-t-elle déjà (même nom dans le même secteur, ou même standard) ?
export async function chercherDoublons(nom: string, secteur: string | null, telephone: string): Promise<Agence[]> {
  const s = sb()
  const cle = nomCle(nom)
  const tel = chiffres(telephone)
  const requetes = []
  if (cle) {
    let q = s.from("agences_liste").select(COLONNES_AGENCE).eq("nom_cle", cle).limit(5)
    q = secteur ? q.eq("secteur", secteur) : q.is("secteur", null)
    requetes.push(q)
  }
  if (tel.length >= 9) requetes.push(s.from("agences_liste").select(COLONNES_AGENCE).ilike("telephone", `%${tel.slice(-4)}`).limit(20))
  const resultats = await Promise.all(requetes)
  const vus = new Set<string>()
  const out: Agence[] = []
  for (const r of resultats) {
    erreur(r.error)
    for (const l of (r.data ?? []) as (LigneAgence & { nom_cle?: string })[]) {
      if (vus.has(l.id)) continue
      if (tel.length >= 9 && chiffres(l.telephone) !== tel && nomCle(l.nom) !== cle) continue
      vus.add(l.id)
      out.push(versAgence(l))
    }
  }
  return out
}

export type ChampsAgence = Partial<Pick<Agence, "nom" | "enseigne" | "type" | "secteur" | "adresse" | "telephone" | "email" | "site" | "nbLots" | "commercialId" | "numeroEmission">>
function versLigneAgence(c: ChampsAgence): Record<string, unknown> {
  const l: Record<string, unknown> = {}
  if (c.nom !== undefined) { l.nom = c.nom.trim(); l.nom_cle = nomCle(c.nom) }
  if (c.enseigne !== undefined) l.enseigne = c.enseigne
  if (c.type !== undefined) l.type = c.type
  if (c.secteur !== undefined) l.secteur = c.secteur || null
  if (c.adresse !== undefined) l.adresse = c.adresse
  if (c.telephone !== undefined) l.telephone = c.telephone
  if (c.email !== undefined) l.email = c.email
  if (c.site !== undefined) l.site = c.site
  if (c.nbLots !== undefined) l.nb_lots = c.nbLots
  if (c.commercialId !== undefined) l.commercial_id = c.commercialId
  if (c.numeroEmission !== undefined) l.numero_emission = c.numeroEmission
  return l
}

export async function creerAgence(c: ChampsAgence & { nom: string }): Promise<string> {
  const { data, error } = await sb().from("agences").insert({ ...versLigneAgence(c), source: "saisie" }).select("id").single()
  erreur(error)
  return (data as { id: string }).id
}
export async function majAgence(id: string, c: ChampsAgence): Promise<void> {
  const { error } = await sb().from("agences").update(versLigneAgence(c)).eq("id", id)
  erreur(error)
}
// Changer l'étape à la main (depuis la fiche) : le journal se remplit tout seul (déclencheur).
export async function changerEtape(id: string, etape: Etape, motif: Motif | "" = "", reveilLe: string | null = null): Promise<void> {
  const maj: Record<string, unknown> = { etape }
  if (etape === "pas_interesse") maj.motif = motif || "autre"
  if (etape === "endormie") maj.reveil_le = reveilLe
  const { error } = await sb().from("agences").update(maj).eq("id", id)
  erreur(error)
}
export async function premierOs(id: string, date?: string): Promise<void> {
  const { error } = await sb().rpc("agence_premier_os", { p_agence_id: id, p_date: date ?? jourLocal(new Date()), p_source: "fiche" })
  erreur(error)
}
// Fusionner deux agences : tout ce qui est rattaché à `source` passe à `cible`, puis `source` disparaît.
export async function fusionnerAgences(cibleId: string, sourceId: string): Promise<void> {
  const s = sb()
  for (const table of ["contacts", "activites", "messages"]) {
    const { error } = await s.from(table).update({ agence_id: cibleId }).eq("agence_id", sourceId)
    erreur(error)
  }
  const { error } = await s.from("agences").delete().eq("id", sourceId)
  erreur(error)
}

// ── Contacts ──
export type ChampsContact = Partial<Pick<Contact, "prenom" | "nom" | "role" | "ligneDirecte" | "mobile" | "email" | "principal" | "parti" | "note">>
function versLigneContact(c: ChampsContact): Record<string, unknown> {
  const l: Record<string, unknown> = {}
  if (c.prenom !== undefined) l.prenom = c.prenom.trim()
  if (c.nom !== undefined) l.nom = c.nom.trim()
  if (c.role !== undefined) l.role = c.role
  if (c.ligneDirecte !== undefined) l.ligne_directe = c.ligneDirecte
  if (c.mobile !== undefined) l.mobile = c.mobile
  if (c.email !== undefined) l.email = c.email.trim().toLowerCase()
  if (c.principal !== undefined) l.principal = c.principal
  if (c.parti !== undefined) l.parti = c.parti
  if (c.note !== undefined) l.note = c.note
  return l
}
export async function creerContact(agenceId: string, c: ChampsContact): Promise<Contact> {
  const s = sb()
  // Le premier contact d'une agence est le contact principal.
  const { count } = await s.from("contacts").select("id", { count: "exact", head: true }).eq("agence_id", agenceId).eq("parti", false)
  const principal = c.principal ?? (count ?? 0) === 0
  if (principal) await s.from("contacts").update({ principal: false }).eq("agence_id", agenceId)
  const { data, error } = await s.from("contacts").insert({ agence_id: agenceId, ...versLigneContact({ ...c, principal }) }).select(COLONNES_CONTACT).single()
  erreur(error)
  return versContact(data as LigneContact)
}
export async function majContact(id: string, agenceId: string, c: ChampsContact): Promise<void> {
  const s = sb()
  if (c.principal) await s.from("contacts").update({ principal: false }).eq("agence_id", agenceId)
  const { error } = await s.from("contacts").update({ ...versLigneContact(c), maj_le: new Date().toISOString() }).eq("id", id)
  erreur(error)
}
export async function supprimerContact(id: string): Promise<void> {
  const { error } = await sb().from("contacts").delete().eq("id", id)
  erreur(error)
}

// ── Les activités ──
export type ParamsAppel = {
  agenceId: string; contactId: string | null; resultat: Resultat; issue?: Issue | ""; motif?: Motif | ""; note?: string; numero?: string; dureeS?: number | null; callId?: string
  rappelLe?: string | null; rdvLe?: string | null; rdvType?: string; compteNom: string; source?: "session" | "fiche"
  appelId?: string | null // l'appel déjà écrit au clic (appelLance) : le résultat complète cette ligne
}
export type BilanAppel = { appelId: string; tacheId: string | null; etape: Etape; tentatives: number; jointFois: number }

// LE point d'entrée après un appel : les règles sont dans la base.
export async function enregistrerAppel(p: ParamsAppel): Promise<BilanAppel> {
  const { data, error } = await sb().rpc("appel_enregistrer", {
    p_agence_id: p.agenceId, p_contact_id: p.contactId, p_resultat: p.resultat, p_issue: p.issue ?? "", p_motif: p.motif ?? "", p_note: p.note ?? "",
    p_numero: p.numero ?? "", p_duree_s: p.dureeS ?? null, p_call_id: p.callId ?? "", p_rappel_le: p.rappelLe ?? null, p_rdv_le: p.rdvLe ?? null, p_rdv_type: p.rdvType ?? "telephone",
    p_compte_nom: p.compteNom, p_source: p.source ?? "session",
    ...(p.appelId ? { p_appel_id: p.appelId } : {}),
  })
  erreur(error)
  const d = data as { appel_id: string; tache_id: string | null; etape: Etape; tentatives: number; joint_fois: number }
  return { appelId: d.appel_id, tacheId: d.tache_id, etape: d.etape, tentatives: d.tentatives, jointFois: d.joint_fois }
}

// Le clic sur « Appeler » : l'appel est écrit tout de suite (date, numéro, qui) ; le
// résultat viendra compléter cette même ligne. Renvoie la ligne, pour le fil.
// L'id est rendu même si la relecture échoue : le résultat doit compléter CETTE ligne (sinon doublon).
export async function appelLance(p: { agenceId: string; contactId: string | null; numero: string; callId: string; compteNom: string }): Promise<{ id: string; ligne: Activite | null }> {
  const s = sb()
  const { data: id, error } = await s.rpc("appel_lancer", { p_agence_id: p.agenceId, p_contact_id: p.contactId, p_numero: p.numero, p_call_id: p.callId, p_compte_nom: p.compteNom, p_source: "session" })
  erreur(error)
  const { data, error: e2 } = await s.from("activites").select(COLONNES_ACTIVITE).eq("id", id as string).maybeSingle()
  return { id: id as string, ligne: e2 || !data ? null : versActivite(data as LigneActivite) }
}

// Une page lue par lots dont les jointures (agences(...)) sont typées à la main.
type LotDe<T> = { data: T[] | null; error: { message: string } | null }

// La santé du démarchage (bloc 9 du contrôle du 13/10) : chaque ligne devrait valoir 0.
// null = contrôle pas encore installé en base (SQL du 13/10 non collé).
export type EcartSante = { code: string; libelle: string; nombre: number; exemples: string }
export async function santeDemarchage(): Promise<EcartSante[] | null> {
  const { data, error } = await sb().rpc("sante_demarchage")
  if (error) {
    if (/sante_demarchage/.test(error.message) && /(could not find|does not exist|introuvable)/i.test(error.message)) return null
    erreur(error)
  }
  return ((data ?? []) as EcartSante[]).filter((e) => e.nombre > 0)
}

// LA GARDE AVANT DE COMPOSER (règles en base, supabase/regles-demarchage.sql) : null = appel permis,
// sinon la raison du refus. undefined = garde pas encore installée en base (on retombe sur la vérification de l'écran).
export async function appelVerifier(agenceId: string, numero: string, direct: boolean): Promise<string | null | undefined> {
  const { data, error } = await sb().rpc("appel_verifier", { p_agence_id: agenceId, p_numero: numero, p_direct: direct })
  if (error) {
    if (/appel_verifier/.test(error.message) && /(could not find|does not exist)/i.test(error.message)) return undefined
    erreur(error)
  }
  return (data as string | null) ?? null
}

// Les appels lancés dont le résultat n'a pas été noté (Mahdi, 13/10 : « une liste pour les
// rentrer », pas un bandeau rouge). Ceux de moins du délai réglé (Réglages, 5 min) sont sans doute encore en ligne.
export type AppelANoter = { id: string; agenceId: string; agenceNom: string; date: string; compteNom: string }
export async function appelsANoter(minutes: number): Promise<AppelANoter[]> {
  type L = { id: string; agence_id: string; date: string; compte_nom: string; agences: { nom: string } | null }
  const avant = new Date(Date.now() - minutes * 60_000).toISOString()
  const lignes = await lireParLots<L>((d, f) => sb().from("activites").select("id, agence_id, date, compte_nom, agences(nom)").eq("type", "appel").eq("resultat", "lance").lt("date", avant).order("date").order("id").range(d, f) as unknown as PromiseLike<LotDe<L>>)
  return lignes.map((l) => ({ id: l.id, agenceId: l.agence_id, agenceNom: l.agences?.nom ?? "", date: l.date, compteNom: l.compte_nom }))
}

// Un appel entrant reconnu : journalisé sans toucher à l'étape.
export async function journaliserAppelEntrant(agenceId: string, contactId: string | null, callId: string, compteNom: string): Promise<void> {
  const { error } = await sb().from("activites").insert({ agence_id: agenceId, contact_id: contactId, type: "appel", resultat: "joint", sens: "entrant", call_id: callId, compte_nom: compteNom, note: "Appel entrant", source: "session" })
  erreur(error)
}

type ChampsCommun = { agenceId: string; contactId?: string | null; compteNom: string; note?: string }
export async function creerTache(c: ChampsCommun & { titre: string; echeance: string }): Promise<Activite> {
  const { data, error } = await sb().from("activites").insert({ agence_id: c.agenceId, contact_id: c.contactId ?? null, type: "tache", echeance: c.echeance, titre: c.titre, note: c.note ?? "", compte_nom: c.compteNom, source: "fiche" }).select(COLONNES_ACTIVITE).single()
  erreur(error)
  return versActivite(data as LigneActivite)
}
export async function creerRdv(c: ChampsCommun & { titre: string; echeance: string; rdvType: "telephone" | "visio" | "sur_place" }): Promise<Activite> {
  const { data, error } = await sb().from("activites").insert({ agence_id: c.agenceId, contact_id: c.contactId ?? null, type: "rdv", echeance: c.echeance, titre: c.titre, rdv_type: c.rdvType, note: c.note ?? "", compte_nom: c.compteNom, source: "fiche" }).select(COLONNES_ACTIVITE).single()
  erreur(error)
  return versActivite(data as LigneActivite)
}
export async function creerNote(c: ChampsCommun & { note: string }): Promise<Activite> {
  const { data, error } = await sb().from("activites").insert({ agence_id: c.agenceId, contact_id: c.contactId ?? null, type: "note", note: c.note, compte_nom: c.compteNom, source: "fiche" }).select(COLONNES_ACTIVITE).single()
  erreur(error)
  return versActivite(data as LigneActivite)
}
export async function terminerTache(id: string, faite = true): Promise<void> {
  const { error } = await sb().rpc("tache_terminer", { p_id: id, p_faite: faite })
  erreur(error)
}
export async function deplacerTache(id: string, echeance: string): Promise<void> {
  const { error } = await sb().from("activites").update({ echeance }).eq("id", id)
  erreur(error)
}
export async function supprimerActivite(id: string): Promise<void> {
  const { error } = await sb().from("activites").delete().eq("id", id)
  erreur(error)
}

// L'agenda : les tâches et RDV entre deux dates, avec l'agence.
// Lu par lots (au-delà de 1 000 tâches, celles du jour disparaissaient) ; les apporteurs (sortis du démarchage) n'y sont pas.
export type TacheAgenda = Activite & { agenceNom: string; agenceTelephone: string; contactNom: string; agenceCommercialId: string | null }
export async function chargerAgenda(de: Date, a: Date, options: { seulementOuvertes?: boolean } = {}): Promise<TacheAgenda[]> {
  type L = LigneActivite & { agences: { nom: string; telephone: string; type: string; commercial_id: string | null } | null; contacts: { prenom: string; nom: string } | null }
  const lignes = await lireParLots<L>((d, f) => {
    let q = sb().from("activites").select(`${COLONNES_ACTIVITE}, agences(nom, telephone, type, commercial_id), contacts(prenom, nom)`).in("type", ["tache", "rdv"]).gte("echeance", de.toISOString()).lt("echeance", a.toISOString())
    if (options.seulementOuvertes) q = q.is("fait_le", null)
    return q.order("echeance").order("id").range(d, f) as unknown as PromiseLike<LotDe<L>>
  })
  return lignes
    .filter((l) => l.agences?.type !== "apporteur")
    .map((l) => ({ ...versActivite(l), agenceNom: l.agences?.nom ?? "", agenceTelephone: l.agences?.telephone ?? "", contactNom: l.contacts ? `${l.contacts.prenom} ${l.contacts.nom}`.trim() : "", agenceCommercialId: l.agences?.commercial_id ?? null }))
}
// Les tâches en retard ou d'aujourd'hui (la To-do).
export async function chargerTachesDuJour(maintenant: Date): Promise<TacheAgenda[]> {
  const finJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1)
  return chargerAgenda(new Date(2020, 0, 1), finJour, { seulementOuvertes: true })
}

// ── Qui a fait quoi aujourd'hui (et sur une période) ──
// `agencesJointes` / `agencesInteressees` (13/10) : des agences DISTINCTES, base des taux de conversion
// (une agence jointe trois fois reste une agence). `ids` garde les agences pour un total exact (sans double compte).
export type StatsCompte = {
  compteId: string | null; compteNom: string; appels: number; joints: number; interesses: number; rdv: number; pasInteresses: number; premiersOs: number; dureeS: number
  agencesJointes?: number; agencesInteressees?: number; ids?: { jointes: string[]; interessees: string[] }
}
export const STATS_VIDES = (compteId: string | null, compteNom: string): StatsCompte => ({ compteId, compteNom, appels: 0, joints: 0, interesses: 0, rdv: 0, pasInteresses: 0, premiersOs: 0, dureeS: 0, agencesJointes: 0, agencesInteressees: 0, ids: { jointes: [], interessees: [] } })

// Les appels SORTANTS d'une période, par compte, plus les premiers OS des agences
// dont ce compte est responsable (Mahdi, 10/10 : « un classement, ça donne envie »).
export async function statsAppels(de: Date, a: Date): Promise<StatsCompte[]> {
  const s = sb()
  type LigneAppel = { id: string; agence_id: string; compte_id: string | null; compte_nom: string; resultat: string; issue: string; duree_s: number | null }
  // Les apporteurs (sortis du démarchage) ne comptent ni dans les appels ni dans les premiers OS du classement.
  const [appels, os, interesses] = await Promise.all([
    lireParLots<LigneAppel>((d, f) => s.from("activites").select("id, agence_id, compte_id, compte_nom, resultat, issue, duree_s, agences!inner(type)").eq("type", "appel").eq("sens", "sortant").neq("agences.type", "apporteur").gte("date", de.toISOString()).lt("date", a.toISOString()).order("id").range(d, f)),
    lireParLots<{ id: string; commercial_id: string | null }>((d, f) => s.from("agences").select("id, commercial_id").neq("type", "apporteur").not("premier_os_le", "is", null).gte("premier_os_le", jourLocal(de)).lt("premier_os_le", jourLocal(a)).order("id").range(d, f)),
    // Les premiers « intéressé » de chaque agence (toute l'histoire) : une relance où le gestionnaire
    // redit « intéressé » n'est pas une NOUVELLE agence intéressée (13/10 : des chiffres justes).
    lireParLots<{ id: string; agence_id: string; date: string }>((d, f) => s.from("activites").select("id, agence_id, date").eq("type", "appel").eq("sens", "sortant").eq("issue", "interesse").order("id").range(d, f)),
  ])
  const premierInteresse = premiersInteresses(interesses)
  const par = new Map<string, StatsCompte>()
  const cle = (id: string | null, nom: string) => id ?? `nom:${nom}`
  const jointes = new Map<string, Set<string>>()
  const convaincues = new Map<string, Set<string>>()
  const ajouter = (m: Map<string, Set<string>>, k: string, agenceId: string) => { const e = m.get(k) ?? new Set<string>(); e.add(agenceId); m.set(k, e) }
  for (const l of appels) {
    const nom = l.compte_nom || "(sans compte)"
    const k = cle(l.compte_id, nom)
    const st = par.get(k) ?? STATS_VIDES(l.compte_id, nom)
    st.appels++
    if (l.resultat === "joint") { st.joints++; ajouter(jointes, k, l.agence_id) }
    const premiere = l.issue === "interesse" && premierInteresse.get(l.agence_id) === l.id
    if (premiere) st.interesses++
    if (l.issue === "rdv") st.rdv++
    // Conv. intéressés : les agences devenues intéressées (premier intérêt) ou passées en RDV sur la période.
    if (premiere || l.issue === "rdv") ajouter(convaincues, k, l.agence_id)
    if (l.issue === "pas_interesse") st.pasInteresses++
    st.dureeS += l.duree_s ?? 0
    par.set(k, st)
  }
  for (const [k, st] of par) {
    const j = [...(jointes.get(k) ?? [])]
    const c = [...(convaincues.get(k) ?? [])]
    st.agencesJointes = j.length
    st.agencesInteressees = c.length
    st.ids = { jointes: j, interessees: c }
  }
  for (const l of os) {
    if (!l.commercial_id) continue
    const st = par.get(l.commercial_id) ?? STATS_VIDES(l.commercial_id, "")
    st.premiersOs++
    par.set(l.commercial_id, st)
  }
  return [...par.values()].sort((x, y) => y.appels - x.appels)
}
export async function compterPremiersOs(de: Date, a: Date): Promise<number> {
  const { count, error } = await sb().from("agences").select("id", { count: "exact", head: true }).neq("type", "apporteur").gte("premier_os_le", jourLocal(de)).lt("premier_os_le", jourLocal(a))
  erreur(error)
  return count ?? 0
}

// Les appels sortants du jour par numéro d'émission (jauge anti-spam : sur les appels réels).
export async function compterAppelsDuJourParNumero(maintenant: Date): Promise<Map<string, number>> {
  const debut = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()).toISOString()
  const lignes = await lireParLots<{ id: string; numero_utilise: string }>((de, a) => sb().from("activites").select("id, numero_utilise").eq("type", "appel").eq("sens", "sortant").gte("date", debut).order("id").range(de, a))
  const out = new Map<string, number>()
  for (const l of lignes) {
    const n = chiffres(l.numero_utilise)
    if (n) out.set(n, (out.get(n) ?? 0) + 1)
  }
  return out
}
// Les agences appelées aujourd'hui (pour ne pas les ressortir dans la file).
export async function agencesAppeleesAujourdHui(maintenant: Date): Promise<Set<string>> {
  const debut = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()).toISOString()
  const lignes = await lireParLots<{ id: string; agence_id: string }>((de, a) => sb().from("activites").select("id, agence_id").eq("type", "appel").eq("sens", "sortant").gte("date", debut).order("id").range(de, a))
  return new Set(lignes.map((l) => l.agence_id))
}

// ── Reconnaître qui appelle (appels entrants) ──
export async function agenceParTelephone(tel: string): Promise<{ agence: Agence; contact: Contact | null } | null> {
  const t = chiffres(tel).replace(/^33/, "0").replace(/^0033/, "0")
  if (t.length < 9) return null
  const s = sb()
  const fin = t.slice(-6)
  const [c, a] = await Promise.all([
    s.from("contacts").select(COLONNES_CONTACT).or(`ligne_directe.ilike.%${fin.slice(0, 2)}%${fin.slice(2, 4)}%${fin.slice(4)}%,mobile.ilike.%${fin.slice(0, 2)}%${fin.slice(2, 4)}%${fin.slice(4)}%`).limit(20),
    s.from("agences_liste").select(COLONNES_AGENCE).ilike("telephone", `%${fin.slice(0, 2)}%${fin.slice(2, 4)}%${fin.slice(4)}%`).limit(20),
  ])
  const memeNumero = (x: string) => { const n = chiffres(x).replace(/^33/, "0"); return n === t || n.endsWith(t.slice(-9)) }
  const contact = ((c.data ?? []) as LigneContact[]).map(versContact).find((k) => memeNumero(k.ligneDirecte) || memeNumero(k.mobile))
  if (contact) {
    const r = await s.from("agences_liste").select(COLONNES_AGENCE).eq("id", contact.agenceId).maybeSingle()
    if (r.data) return { agence: versAgence(r.data as LigneAgence), contact }
  }
  const agence = ((a.data ?? []) as LigneAgence[]).map(versAgence).find((x) => memeNumero(x.telephone))
  return agence ? { agence, contact: null } : null
}

// L'état de la conversion (pour l'écran d'accueil tant qu'elle n'est pas faite).
export async function conversionFaite(): Promise<boolean> {
  const { data } = await sb().from("parametres").select("valeur").eq("cle", "conversion_agences").maybeSingle()
  return Boolean((data as { valeur?: string } | null)?.valeur)
}

// ── Les clients signés, venus de STC Bâtiment (10/10) ──
// La fonction serveur `synchro-clients` dépose une proposition par gestionnaire
// qui a envoyé un ordre de service ; ici on la lit, et un humain tranche.
export type CandidatClient = { agenceId: string; nom: string; secteur: string | null; score: number; raisons: string[] }
export type ClientSignale = {
  id: string; gestionnaireId: string; societe: string; nom: string; email: string; telephones: string[]; premierOsLe: string | null; premierOsNumero: string
  dernierOsLe: string | null; nbOs: number; nomsAgence: string; codesPostaux: string; candidats: CandidatClient[]; statut: "a_confirmer" | "confirme" | "ignore" | "deja_client"
  agenceId: string | null; decidePar: string; decideLe: string | null; creeLe: string
}
type LigneClientSignale = {
  id: string; gestionnaire_id: string; societe: string; nom: string; email: string; telephones: string[] | null; premier_os_le: string | null; premier_os_numero: string
  dernier_os_le: string | null; nb_os: number; noms_agence: string; codes_postaux: string; candidats: CandidatClient[] | null; statut: ClientSignale["statut"]
  agence_id: string | null; decide_par: string; decide_le: string | null; cree_le: string
}
const COLONNES_CLIENT_SIGNALE = "id, gestionnaire_id, societe, nom, email, telephones, premier_os_le, premier_os_numero, dernier_os_le, nb_os, noms_agence, codes_postaux, candidats, statut, agence_id, decide_par, decide_le, cree_le"
const versClientSignale = (l: LigneClientSignale): ClientSignale => ({
  id: l.id, gestionnaireId: l.gestionnaire_id, societe: l.societe ?? "", nom: l.nom ?? "", email: l.email ?? "", telephones: l.telephones ?? [], premierOsLe: l.premier_os_le, premierOsNumero: l.premier_os_numero ?? "",
  dernierOsLe: l.dernier_os_le, nbOs: l.nb_os ?? 0, nomsAgence: l.noms_agence ?? "", codesPostaux: l.codes_postaux ?? "", candidats: l.candidats ?? [], statut: l.statut,
  agenceId: l.agence_id, decidePar: l.decide_par ?? "", decideLe: l.decide_le, creeLe: l.cree_le,
})
export async function chargerClientsAConfirmer(): Promise<ClientSignale[]> {
  const { data, error } = await sb().from("clients_signales").select(COLONNES_CLIENT_SIGNALE).eq("statut", "a_confirmer").order("premier_os_le", { ascending: false })
  if (error && /clients_signales/.test(error.message)) return [] // la table n'est pas encore posée : la carte reste vide
  erreur(error)
  return ((data ?? []) as LigneClientSignale[]).map(versClientSignale)
}
// « C'est elle » : l'agence passe cliente, datée du premier OS ; on garde une trace dans son fil, et le gestionnaire devient un contact s'il manque.
export async function confirmerClientSignale(c: ClientSignale, agenceId: string, compteNom: string): Promise<void> {
  const s = sb()
  // Le jour LOCAL (Paris) : un OS reçu à 0 h 30 le 13 n'est pas du 12 (`.slice(0, 10)` d'un horodatage UTC le faisait).
  const date = jourLocal(c.premierOsLe ? new Date(c.premierOsLe) : new Date())
  const { error: e1 } = await s.rpc("agence_premier_os", { p_agence_id: agenceId, p_date: date, p_source: "stc_batiment" })
  erreur(e1)
  if (c.email) {
    const { data: deja } = await s.from("contacts").select("id").eq("agence_id", agenceId).ilike("email", c.email).limit(1)
    if (!deja?.length) {
      const [prenom, ...reste] = c.nom.trim().split(/\s+/)
      await s.from("contacts").insert({ agence_id: agenceId, prenom: prenom ?? "", nom: reste.join(" "), role: "gestionnaire", email: c.email, ligne_directe: c.telephones[0] ?? "", mobile: c.telephones.find((t) => /^(\+33\s?|0)[67]/.test(t.replace(/[\s.]/g, ""))) ?? "", note: "Gestionnaire relevé sur les ordres de service STC Bâtiment." })
    }
  }
  const quoi = c.premierOsNumero ? `OS ${c.premierOsNumero}` : "ordre de service"
  await s.from("activites").insert({ agence_id: agenceId, type: "note", note: `Premier ${quoi} reçu dans STC Bâtiment le ${new Date(date).toLocaleDateString("fr-FR")} (${c.nbOs} OS au total). Confirmé par ${compteNom}.`, compte_nom: compteNom, source: "stc_batiment" })
  const { error: e2 } = await s.from("clients_signales").update({ statut: "confirme", agence_id: agenceId, decide_par: compteNom, decide_le: new Date().toISOString(), maj_le: new Date().toISOString() }).eq("id", c.id)
  erreur(e2)
}
export async function ignorerClientSignale(id: string, compteNom: string): Promise<void> {
  const { error } = await sb().from("clients_signales").update({ statut: "ignore", decide_par: compteNom, decide_le: new Date().toISOString(), maj_le: new Date().toISOString() }).eq("id", id)
  erreur(error)
}
// « Créer l'agence cliente » : une agence neuve, cliente d'emblée, avec le gestionnaire en contact.
export async function creerAgenceCliente(c: ClientSignale, compteNom: string, secteur: string | null): Promise<string> {
  const nom = (c.societe || c.nomsAgence.split("|")[0] || c.nom).trim()
  const id = await creerAgence({ nom, secteur, telephone: c.telephones[0] ?? "", email: c.email })
  await confirmerClientSignale(c, id, compteNom)
  return id
}
