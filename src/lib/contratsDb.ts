// Contrats sous-traitants par DocuSign (11/10/2026) — côté logiciel.
// L'envoi et la relecture passent par la fonction serveur `docusign-envoyer`
// (clé DocuSign côté serveur, jamais dans le navigateur) ; les modèles PDF
// vivent dans le bucket privé `contrats/modeles`.
import { supabase } from "./supabase"

export type StatutContrat = "envoye" | "livre" | "signe_artisan" | "signe" | "refuse" | "annule" | "erreur"
export type ContratST = {
  id: string; sousTraitantId: string; envelopeId: string; statut: StatutContrat; envoyeLe: string; signeArtisanLe: string | null; signeLe: string | null
  pdfPath: string; documents: { nom: string; chemin: string }[]; compteNom: string; erreur: string
}
export type ModeleContrat = { id: string; nom: string; chemin: string; ordre: number; actif: boolean }

export const LIBELLE_CONTRAT: Record<StatutContrat | "", string> = {
  "": "", envoye: "Contrats envoyés", livre: "Contrats ouverts", signe_artisan: "Signés par l'artisan", signe: "Contrats signés", refuse: "Signature refusée", annule: "Envoi annulé", erreur: "Erreur DocuSign",
}
export const ROLE_CONTRAT: Record<StatutContrat | "", "actif" | "fait" | "attente" | "probleme" | "inerte"> = {
  "": "inerte", envoye: "attente", livre: "attente", signe_artisan: "actif", signe: "fait", refuse: "probleme", annule: "inerte", erreur: "probleme",
}

type Ligne = { id: string; sous_traitant_id: string; envelope_id: string; statut: StatutContrat; envoye_le: string; signe_artisan_le: string | null; signe_le: string | null; pdf_path: string; documents: { nom: string; chemin: string }[] | null; compte_nom: string; erreur: string }
const vers = (l: Ligne): ContratST => ({
  id: l.id, sousTraitantId: l.sous_traitant_id, envelopeId: l.envelope_id, statut: l.statut, envoyeLe: l.envoye_le, signeArtisanLe: l.signe_artisan_le, signeLe: l.signe_le,
  pdfPath: l.pdf_path ?? "", documents: l.documents ?? [], compteNom: l.compte_nom ?? "", erreur: l.erreur ?? "",
})
function sb() {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  return supabase
}
const messageDe = (data: unknown, error: { message: string } | null): string => {
  const d = data as { error?: string } | null
  return d?.error || error?.message || "Erreur inconnue"
}

export async function chargerContratsDe(sousTraitantId: string): Promise<ContratST[]> {
  const { data, error } = await sb().from("st_contrats").select("*").eq("sous_traitant_id", sousTraitantId).order("envoye_le", { ascending: false })
  if (error) {
    if (/st_contrats/.test(error.message)) return [] // la table n'est pas encore posée
    throw new Error(error.message)
  }
  return ((data ?? []) as Ligne[]).map(vers)
}

export async function envoyerContrats(sousTraitantId: string, compteNom: string, forcer = false): Promise<{ envelopeId: string; documents: number; destinataire: string }> {
  const { data, error } = await sb().functions.invoke("docusign-envoyer", { body: { sous_traitant_id: sousTraitantId, compte_nom: compteNom, forcer } })
  const d = data as { ok?: boolean; envelopeId?: string; documents?: number; destinataire?: string; error?: string } | null
  if (error || !d?.ok) throw new Error(messageDe(data, error))
  return { envelopeId: d.envelopeId!, documents: d.documents ?? 0, destinataire: d.destinataire ?? "" }
}

export async function relireContrat(envelopeId: string): Promise<string> {
  const { data, error } = await sb().functions.invoke("docusign-envoyer", { body: { action: "statut", envelope_id: envelopeId } })
  const d = data as { ok?: boolean; statut?: string; error?: string } | null
  if (error || !d?.ok) throw new Error(messageDe(data, error))
  return d.statut ?? ""
}

export async function installerConnect(): Promise<string> {
  const { data, error } = await sb().functions.invoke("docusign-envoyer", { body: { action: "installer_connect" } })
  const d = data as { ok?: boolean; connectId?: string; error?: string } | null
  if (error || !d?.ok) throw new Error(messageDe(data, error))
  return d.connectId ?? ""
}

export async function lienContratSigne(pdfPath: string): Promise<string> {
  const { data, error } = await sb().storage.from("contrats").createSignedUrl(pdfPath, 600)
  if (error || !data?.signedUrl) throw new Error(error?.message || "Lien indisponible")
  return data.signedUrl
}

// ── Les modèles (Réglages) ──
export async function chargerModeles(): Promise<ModeleContrat[]> {
  const { data, error } = await sb().from("st_contrats_modeles").select("id, nom, chemin, ordre, actif").order("ordre")
  if (error) {
    if (/st_contrats_modeles/.test(error.message)) return []
    throw new Error(error.message)
  }
  return (data ?? []) as ModeleContrat[]
}
export async function deposerModele(fichier: File, nom: string, ordre: number): Promise<void> {
  const s = sb()
  const propre = fichier.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").toLowerCase()
  const chemin = `modeles/${Date.now()}-${propre}`
  const { error: eU } = await s.storage.from("contrats").upload(chemin, fichier, { contentType: "application/pdf", upsert: false })
  if (eU) throw new Error(eU.message)
  const { error } = await s.from("st_contrats_modeles").insert({ nom: nom.trim() || fichier.name.replace(/\.pdf$/i, ""), chemin, ordre, actif: true })
  if (error) throw new Error(error.message)
}
export async function majModele(id: string, champs: Partial<Pick<ModeleContrat, "nom" | "ordre" | "actif">>): Promise<void> {
  const { error } = await sb().from("st_contrats_modeles").update(champs).eq("id", id)
  if (error) throw new Error(error.message)
}
export async function supprimerModele(m: ModeleContrat): Promise<void> {
  const s = sb()
  const { error } = await s.from("st_contrats_modeles").delete().eq("id", m.id)
  if (error) throw new Error(error.message)
  await s.storage.from("contrats").remove([m.chemin])
}
export async function lienModele(chemin: string): Promise<string> {
  const { data, error } = await sb().storage.from("contrats").createSignedUrl(chemin, 600)
  if (error || !data?.signedUrl) throw new Error(error?.message || "Lien indisponible")
  return data.signedUrl
}
