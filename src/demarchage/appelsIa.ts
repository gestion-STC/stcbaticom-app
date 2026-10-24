// ════════════════════════════════════════════════════════════════════════════
// LES APPELS ANALYSÉS PAR L'IA (24/10/2026) — lecture et écriture.
//
// Un appel où quelqu'un a décroché (joint, standard) est transcrit puis analysé
// par la fonction serveur `analyser-appel` : un brouillon de mail personnalisé,
// un résumé, les arguments avancés et les objections entendues. Ce fichier est le
// seul passage entre l'écran et la table `appels_ia` (SQL maj-2026-10-24-appels-ia).
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from "../lib/supabase"
import { lireParLots } from "../lib/pagination"
import type { Destinataire } from "../lib/destinataire"

export type StatutIa = "en_attente" | "en_cours" | "pret" | "sans_enregistrement" | "trop_court" | "erreur"
export type Interet = "nul" | "faible" | "moyen" | "fort"
export type Reaction = "positive" | "neutre" | "negative"
export type ArgumentAppel = { libelle: string; extrait: string; reaction: Reaction }
export type ObjectionAppel = { libelle: string; extrait: string; reponse: string; levee: boolean }
export type AnalyseAppel = {
  decideurJoint: boolean
  prochaineEtape: string
  arguments: ArgumentAppel[]
  objections: ObjectionAppel[]
  pointsForts: string[]
  aAmeliorer: string[]
}
export type AppelIa = {
  id: string
  activiteId: string
  agenceId: string | null
  agenceNom: string
  contactId: string | null
  compteId: string | null
  compteNom: string
  resultat: string
  issue: string
  statut: StatutIa
  dureeS: number | null
  transcription: string
  resume: string
  interet: Interet | null
  analyse: AnalyseAppel | null
  mailPertinent: boolean | null
  mailObjet: string
  mailCorps: string
  mailEnvoyeLe: string | null
  mailEcarteLe: string | null
  erreur: string
  creeLe: string
}

type Ligne = {
  id: string; activite_id: string; agence_id: string | null; contact_id: string | null; compte_id: string | null; compte_nom: string | null
  resultat: string | null; statut: StatutIa; duree_s: number | null; transcription: string | null; resume: string | null; interet: Interet | null
  analyse_detail: { decideur_joint?: boolean; prochaine_etape?: string; arguments?: ArgumentAppel[]; objections?: ObjectionAppel[]; points_forts?: string[]; a_ameliorer?: string[] } | null
  mail_pertinent: boolean | null; mail_objet: string | null; mail_corps: string | null; mail_envoye_le: string | null; mail_ecarte_le: string | null
  erreur: string | null; cree_le: string
  agences?: { nom: string } | null
  activites?: { issue: string | null } | null
}
const COLONNES = "id, activite_id, agence_id, contact_id, compte_id, compte_nom, resultat, statut, duree_s, transcription, resume, interet, analyse_detail, mail_pertinent, mail_objet, mail_corps, mail_envoye_le, mail_ecarte_le, erreur, cree_le, agences(nom), activites(issue)"

export function versAppelIa(l: Ligne): AppelIa {
  const a = l.analyse_detail
  return {
    id: l.id, activiteId: l.activite_id, agenceId: l.agence_id, agenceNom: l.agences?.nom ?? "", contactId: l.contact_id, compteId: l.compte_id, compteNom: l.compte_nom ?? "",
    resultat: l.resultat ?? "", issue: l.activites?.issue ?? "", statut: l.statut, dureeS: l.duree_s, transcription: l.transcription ?? "", resume: l.resume ?? "", interet: l.interet,
    analyse: a ? {
      decideurJoint: Boolean(a.decideur_joint), prochaineEtape: a.prochaine_etape ?? "", arguments: a.arguments ?? [], objections: a.objections ?? [],
      pointsForts: a.points_forts ?? [], aAmeliorer: a.a_ameliorer ?? [],
    } : null,
    mailPertinent: l.mail_pertinent, mailObjet: l.mail_objet ?? "", mailCorps: l.mail_corps ?? "", mailEnvoyeLe: l.mail_envoye_le, mailEcarteLe: l.mail_ecarte_le,
    erreur: l.erreur ?? "", creeLe: l.cree_le,
  }
}

function sb() {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  return supabase
}
// Table absente (SQL du 24/10 pas encore passé) : l'écran se tait au lieu d'afficher une erreur.
function tableAbsente(m: string): boolean {
  return /appels_ia/.test(m) && /(does not exist|could not find|schema cache)/i.test(m)
}

/** Juste après « Valider le résultat » : l'analyse démarre tout de suite (réponse non attendue). */
export function lancerAnalyseAppel(activiteId: string): void {
  if (!supabase || !activiteId) return
  void supabase.functions.invoke("analyser-appel", { body: { activite_id: activiteId } }).catch(() => {})
}

/** Le contrôle de mise en service : chaque pièce (clés, enregistrements Ringover, table, passage de secours). */
export type ControleMiseEnService = { nom: string; ok: boolean; detail: string }
export async function verifierMiseEnService(): Promise<ControleMiseEnService[]> {
  const { data, error } = await sb().functions.invoke("analyser-appel", { body: { verifier: true } })
  if (error) throw new Error("La fonction analyser-appel ne répond pas : est-elle déployée ?")
  const l = (data as { controles?: ControleMiseEnService[] } | null)?.controles
  if (!Array.isArray(l)) throw new Error("Réponse inattendue de la fonction analyser-appel : la redéployer.")
  return l
}

/** Les mails de MES appels des dernières 24 h, ni envoyés ni écartés (le panneau de la session). */
export async function mesMailsIa(): Promise<AppelIa[]> {
  const s = sb()
  const { data: u } = await s.auth.getUser()
  if (!u.user) return []
  const depuis = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data, error } = await s.from("appels_ia").select(COLONNES).eq("compte_id", u.user.id).gte("cree_le", depuis)
    .is("mail_envoye_le", null).is("mail_ecarte_le", null).order("cree_le", { ascending: false }).limit(30)
  if (error) { if (tableAbsente(error.message)) return []; throw new Error(error.message) }
  return ((data ?? []) as unknown as Ligne[]).map(versAppelIa)
}

/** Les appels analysés d'une agence (la fiche). */
export async function appelsIaDeLAgence(agenceId: string): Promise<AppelIa[]> {
  const { data, error } = await sb().from("appels_ia").select(COLONNES).eq("agence_id", agenceId).order("cree_le", { ascending: false }).limit(20)
  if (error) { if (tableAbsente(error.message)) return []; throw new Error(error.message) }
  return ((data ?? []) as unknown as Ligne[]).map(versAppelIa)
}

/** Les appels analysés d'une période (l'onglet Analyse IA). */
export async function appelsIaPeriode(de: Date, a: Date): Promise<AppelIa[]> {
  try {
    const lignes = await lireParLots<Ligne>((d, f) => sb().from("appels_ia").select(COLONNES).gte("cree_le", de.toISOString()).lt("cree_le", a.toISOString())
      .order("cree_le").order("id").range(d, f) as unknown as PromiseLike<{ data: Ligne[] | null; error: { message: string } | null }>)
    return lignes.map(versAppelIa)
  } catch (e) {
    if (e instanceof Error && tableAbsente(e.message)) return []
    throw e
  }
}

export async function marquerMailEnvoye(id: string): Promise<void> {
  const { error } = await sb().from("appels_ia").update({ mail_envoye_le: new Date().toISOString(), maj_le: new Date().toISOString() }).eq("id", id)
  if (error) throw new Error(error.message)
}
export async function ecarterMail(id: string): Promise<void> {
  const { error } = await sb().from("appels_ia").update({ mail_ecarte_le: new Date().toISOString(), maj_le: new Date().toISOString() }).eq("id", id)
  if (error) throw new Error(error.message)
}
/** « Relancer » une analyse en erreur ou sans enregistrement : elle repart au prochain passage. */
export async function relancerAnalyse(id: string, activiteId: string): Promise<void> {
  const { error } = await sb().from("appels_ia").update({ statut: "en_attente", tentatives: 0, prochain_essai: new Date().toISOString(), erreur: null, maj_le: new Date().toISOString() }).eq("id", id)
  if (error) throw new Error(error.message)
  lancerAnalyseAppel(activiteId)
}

// ── Le verrou du compte (Mahdi, 24/10) : « à partir du moment où tu as passé ton call, tu es
//    obligé de rentrer les états ; tu ne peux pas faire suivant ou précédent. »
export type AppelEnAttente = { id: string; agenceId: string; agenceNom: string; date: string }
/** Mon plus ancien appel lancé dont le résultat n'est pas noté (null s'il n'y en a pas). */
export async function monAppelSansResultat(): Promise<AppelEnAttente | null> {
  const s = sb()
  const { data: u } = await s.auth.getUser()
  if (!u.user) return null
  const { data, error } = await s.from("activites").select("id, agence_id, date, agences(nom)")
    .eq("type", "appel").eq("resultat", "lance").eq("compte_id", u.user.id).order("date").limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  const l = data as { id: string; agence_id: string; date: string; agences: { nom: string } | null } | null
  return l ? { id: l.id, agenceId: l.agence_id, agenceNom: l.agences?.nom ?? "", date: l.date } : null
}

/** À qui envoyer le mail d'un appel : le contact appelé s'il a une adresse, sinon l'agence. */
export async function destinatairePourAppel(a: AppelIa): Promise<Destinataire | null> {
  if (!a.agenceId) return null
  const s = sb()
  const [{ data: ag, error: e1 }, { data: ct }] = await Promise.all([
    s.from("agences").select("id, nom, telephone, email, arrondissement, secteur").eq("id", a.agenceId).maybeSingle(),
    a.contactId ? s.from("contacts").select("prenom, nom, email, ligne_directe, mobile").eq("id", a.contactId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  if (e1) throw new Error(e1.message)
  const agence = ag as { id: string; nom: string; telephone: string | null; email: string | null; arrondissement: string | null; secteur: string | null } | null
  if (!agence) return null
  const c = ct as { prenom: string | null; nom: string | null; email: string | null; ligne_directe: string | null; mobile: string | null } | null
  return {
    agenceId: agence.id,
    entreprise: agence.nom,
    contact: c ? [c.prenom, c.nom].filter(Boolean).join(" ") : "",
    telephone: c?.ligne_directe || c?.mobile || agence.telephone || "",
    email: c?.email || agence.email || "",
    arrondissement: agence.arrondissement || agence.secteur || "",
  }
}
