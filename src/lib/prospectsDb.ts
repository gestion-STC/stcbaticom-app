import { supabase } from "./supabase"
import type { Prospect, Priorite } from "../data"

// Ligne telle qu'elle est stockée dans Supabase (colonnes en snake_case).
type LigneDb = {
  id: string
  volume_os?: string | null
  entreprise: string
  contact: string
  telephone: string
  email: string
  adresse: string
  arrondissement: string
  commentaire: string
  type: string
  statut: string
  priorite: string
  prochaine_relance: string
  numero_emission?: string | null
}

function versProspect(r: LigneDb): Prospect {
  return {
    id: r.id,
    volume: r.volume_os ?? "",
    entreprise: r.entreprise,
    contact: r.contact,
    telephone: r.telephone,
    email: r.email,
    adresse: r.adresse ?? "",
    arrondissement: r.arrondissement ?? "",
    commentaire: r.commentaire ?? "",
    type: r.type,
    statut: r.statut,
    priorite: r.priorite as Priorite,
    prochaineRelance: r.prochaine_relance,
    numeroEmission: r.numero_emission ?? "",
  }
}

function versLigne(p: Prospect) {
  return {
    volume_os: p.volume ?? "",
    entreprise: p.entreprise,
    contact: p.contact,
    telephone: p.telephone,
    email: p.email,
    adresse: p.adresse,
    arrondissement: p.arrondissement,
    commentaire: p.commentaire,
    type: p.type,
    statut: p.statut,
    priorite: p.priorite,
    prochaine_relance: p.prochaineRelance,
    numero_emission: p.numeroEmission ?? "",
  }
}

// Récupère tous les prospects, triés par entreprise.
export async function chargerProspects(): Promise<Prospect[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("prospects")
    .select("*")
    .order("entreprise", { ascending: true })
  if (error) throw new Error(error.message)
  return (data as LigneDb[]).map(versProspect)
}

// Insère une liste de prospects (import) et renvoie les lignes créées.
export async function insererProspects(
  prospects: Prospect[],
): Promise<Prospect[]> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("prospects")
    .insert(prospects.map(versLigne))
    .select("*")
  if (error) throw new Error(error.message)
  return (data as LigneDb[]).map(versProspect)
}

// Met à jour quelques champs (statut, priorité, commentaire) d'un prospect.
export async function majProspect(
  id: string,
  champs: Partial<{
    statut: string
    priorite: string
    commentaire: string
    prochaine_relance: string
    contact: string
    email: string
    telephone: string
    adresse: string
    numero_emission: string
  }>,
): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("prospects").update(champs).eq("id", id)
  if (error) throw new Error(error.message)
}

// Crée un seul prospect (saisie manuelle) et renvoie la ligne créée.
export async function creerProspect(p: Prospect): Promise<Prospect> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { data, error } = await supabase
    .from("prospects")
    .insert(versLigne(p))
    .select("*")
    .single()
  if (error) throw new Error(error.message)
  return versProspect(data as LigneDb)
}

// Met à jour tous les champs modifiables d'un prospect.
export async function majProspectComplet(id: string, p: Prospect): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("prospects").update(versLigne(p)).eq("id", id)
  if (error) throw new Error(error.message)
}

// Supprime un prospect (et, en cascade, ses appels/RDV/liens).
export async function supprimerProspect(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  const { error } = await supabase.from("prospects").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

// Fusionne plusieurs prospects en un seul (la fiche "garde").
//
// Méthode PRÉFÉRÉE : une fonction Postgres atomique (« tout ou rien ») — si une
// étape échoue, tout est annulé et aucune fiche n'est supprimée. Elle s'active
// dès que le script supabase/maj-2026-07-02-fusion-atomique.sql a été exécuté.
// Tant qu'il ne l'est pas, on retombe automatiquement sur l'ancienne méthode
// étape par étape (fusionnerProspectsLegacy), pour ne rien casser.
export async function fusionnerProspects(
  garde: Prospect,
  autres: Prospect[],
): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  if (!garde.id) throw new Error("Fiche à garder sans id")
  const ids = autres.map((a) => a.id).filter((x): x is string => !!x)
  if (ids.length === 0) return

  // 1) On tente la voie atomique (fonction SQL).
  const { error } = await supabase.rpc("fusionner_prospects", {
    p_garde: garde.id,
    p_autres: ids,
    p_champs: versLigne(garde),
  })
  if (!error) return

  // La fonction n'existe pas encore (SQL non exécuté) → repli sur l'ancienne
  // méthode. Tout AUTRE type d'erreur doit remonter (fusion réellement échouée).
  const fonctionAbsente =
    error.code === "PGRST202" ||
    /could not find the function|function .*does not exist/i.test(error.message ?? "")
  if (!fonctionAbsente) {
    throw new Error(`Fusion impossible — aucune fiche supprimée. Détail : ${error.message}`)
  }
  return fusionnerProspectsLegacy(garde, ids)
}

// Ancienne fusion étape par étape (NON atomique) — repli tant que la fonction
// SQL n'est pas installée. Rapatrie l'historique avant de supprimer les fiches.
async function fusionnerProspectsLegacy(
  garde: Prospect,
  ids: string[],
): Promise<void> {
  if (!supabase) throw new Error("Supabase non configuré")
  if (!garde.id) throw new Error("Fiche à garder sans id")

  // Une erreur "table absente" est tolérée (ex. emails_envoyes pas encore créée) ;
  // toute AUTRE erreur doit STOPPER la fusion pour ne jamais supprimer une fiche
  // dont l'historique n'a pas pu être déplacé.
  const tableAbsente = (e: { code?: string; message?: string } | null) =>
    !!e && (e.code === "42P01" || /does not exist|could not find the table|schema cache/i.test(e.message ?? ""))

  // 1. Réaffecter l'historique vers la fiche gardée.
  for (const table of ["appels", "rdv", "emails_envoyes"]) {
    for (const ancien of ids) {
      const { error } = await supabase.from(table).update({ prospect_id: garde.id }).eq("prospect_id", ancien)
      if (error && !tableAbsente(error)) {
        throw new Error(
          `Déplacement de l'historique impossible (${table}) — fusion annulée, aucune fiche supprimée. Détail : ${error.message}`,
        )
      }
    }
  }

  // 2. Liens agence : déplacer sans créer de doublon de lien.
  try {
    const { data: dejaLies } = await supabase
      .from("prospect_agence")
      .select("agence_id")
      .eq("prospect_id", garde.id)
    const vus = new Set((dejaLies ?? []).map((l: { agence_id: string }) => l.agence_id))
    for (const ancien of ids) {
      const { data: liens } = await supabase
        .from("prospect_agence")
        .select("id, agence_id")
        .eq("prospect_id", ancien)
      for (const l of (liens ?? []) as { id: string; agence_id: string }[]) {
        if (vus.has(l.agence_id)) {
          await supabase.from("prospect_agence").delete().eq("id", l.id)
        } else {
          await supabase.from("prospect_agence").update({ prospect_id: garde.id }).eq("id", l.id)
          vus.add(l.agence_id)
        }
      }
    }
  } catch {
    /* table de liens absente : on ignore */
  }

  // 3. Enregistrer les champs fusionnés sur la fiche gardée.
  await majProspectComplet(garde.id, garde)

  // 4. Supprimer les autres fiches (leur historique a déjà été déplacé).
  for (const ancien of ids) await supprimerProspect(ancien)
}

// Construit une fiche "complète" en partant de `garde` et en comblant les trous
// avec les autres fiches ; les commentaires distincts sont tous conservés.
export function fusionnerChamps(garde: Prospect, autres: Prospect[]): Prospect {
  const tous = [garde, ...autres]
  const premier = (sel: (p: Prospect) => string | undefined) =>
    (sel(garde) ?? "").trim() || tous.map(sel).find((v) => (v ?? "").trim())?.trim() || ""
  const commentaires = [
    ...new Set(tous.map((p) => (p.commentaire ?? "").trim()).filter(Boolean)),
  ]
  return {
    ...garde,
    entreprise: premier((p) => p.entreprise),
    contact: premier((p) => p.contact),
    email: premier((p) => p.email),
    telephone: premier((p) => p.telephone),
    adresse: premier((p) => p.adresse),
    arrondissement: premier((p) => p.arrondissement),
    volume: premier((p) => p.volume),
    commentaire: commentaires.join("\n———\n"),
  }
}
