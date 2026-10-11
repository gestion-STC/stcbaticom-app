// Contrats sous-traitants par DocuSign (11/10/2026) — côté logiciel.
// Les contrats sont des MODÈLES DocuSign ; le pack (quels modèles, dans quel
// ordre) vit dans `st_contrats_modeles` ; l'envoi et les relectures passent par
// la fonction serveur `docusign-envoyer` (clé DocuSign côté serveur, jamais ici).
import { supabase } from "./supabase"
import type { ModeleDocusign } from "./contratsOutils"

export type StatutContrat = "envoye" | "livre" | "signe_artisan" | "signe" | "refuse" | "annule" | "erreur"
export type ContratST = {
  id: string; sousTraitantId: string; envelopeId: string; statut: StatutContrat; envoyeLe: string; signeArtisanLe: string | null; signeLe: string | null
  pdfPath: string; documents: { nom: string; template_id?: string }[]; valeurs: Record<string, string>; signataireNom: string; signataireEmail: string; compteNom: string; erreur: string
}
export type ModelePack = { id: string; nom: string; templateId: string; ordre: number; actif: boolean }

export const LIBELLE_CONTRAT: Record<StatutContrat | "", string> = {
  "": "", envoye: "Contrats envoyés", livre: "Contrats ouverts", signe_artisan: "Signés par l'artisan", signe: "Contrats signés", refuse: "Signature refusée", annule: "Envoi annulé", erreur: "Erreur DocuSign",
}
export const ROLE_CONTRAT: Record<StatutContrat | "", "actif" | "fait" | "attente" | "probleme" | "inerte"> = {
  "": "inerte", envoye: "attente", livre: "attente", signe_artisan: "actif", signe: "fait", refuse: "probleme", annule: "inerte", erreur: "probleme",
}

type Ligne = {
  id: string; sous_traitant_id: string; envelope_id: string; statut: StatutContrat; envoye_le: string; signe_artisan_le: string | null; signe_le: string | null; pdf_path: string
  documents: { nom: string; template_id?: string }[] | null; valeurs: Record<string, string> | null; signataire_nom: string | null; signataire_email: string | null; compte_nom: string; erreur: string
}
const vers = (l: Ligne): ContratST => ({
  id: l.id, sousTraitantId: l.sous_traitant_id, envelopeId: l.envelope_id, statut: l.statut, envoyeLe: l.envoye_le, signeArtisanLe: l.signe_artisan_le, signeLe: l.signe_le,
  pdfPath: l.pdf_path ?? "", documents: l.documents ?? [], valeurs: l.valeurs ?? {}, signataireNom: l.signataire_nom ?? "", signataireEmail: l.signataire_email ?? "", compteNom: l.compte_nom ?? "", erreur: l.erreur ?? "",
})
function sb() {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  return supabase
}
const messageDe = (data: unknown, error: { message: string } | null): string => {
  const d = data as { error?: string } | null
  return d?.error || error?.message || "Erreur inconnue"
}
async function appeler<T>(corps: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().functions.invoke("docusign-envoyer", { body: corps })
  const d = data as ({ ok?: boolean; error?: string } & T) | null
  if (error || !d?.ok) throw new Error(messageDe(data, error))
  return d
}

export async function chargerContratsDe(sousTraitantId: string): Promise<ContratST[]> {
  const { data, error } = await sb().from("st_contrats").select("*").eq("sous_traitant_id", sousTraitantId).order("envoye_le", { ascending: false })
  if (error) {
    if (/st_contrats/.test(error.message)) return [] // la table n'est pas encore posée
    throw new Error(error.message)
  }
  return ((data ?? []) as Ligne[]).map(vers)
}

/** Les modèles du compte DocuSign, avec leurs rôles et champs (lus à la source). */
export async function chargerModelesDocusign(): Promise<{ modeles: ModeleDocusign[]; compte: string }> {
  const r = await appeler<{ modeles: ModeleDocusign[]; compte: string }>({ action: "modeles" })
  return { modeles: r.modeles ?? [], compte: r.compte ?? "" }
}

export type EnvoiContrats = { sousTraitantId: string; compteNom: string; valeurs: Record<string, string>; signataireNom: string; signataireEmail: string; templateIds?: string[]; forcer?: boolean }
export async function envoyerContrats(e: EnvoiContrats): Promise<{ envelopeId: string; documents: number; destinataire: string }> {
  const r = await appeler<{ envelopeId: string; documents: number; destinataire: string }>({
    sous_traitant_id: e.sousTraitantId, compte_nom: e.compteNom, valeurs: e.valeurs, signataire_nom: e.signataireNom, signataire_email: e.signataireEmail, template_ids: e.templateIds ?? [], forcer: !!e.forcer,
  })
  return { envelopeId: r.envelopeId, documents: r.documents ?? 0, destinataire: r.destinataire ?? "" }
}
export async function relireContrat(envelopeId: string): Promise<string> {
  const r = await appeler<{ statut?: string }>({ action: "statut", envelope_id: envelopeId })
  return r.statut ?? ""
}
export async function installerConnect(): Promise<string> {
  const r = await appeler<{ connectId?: string }>({ action: "installer_connect" })
  return r.connectId ?? ""
}
export async function lienContratSigne(pdfPath: string): Promise<string> {
  const { data, error } = await sb().storage.from("contrats").createSignedUrl(pdfPath, 600)
  if (error || !data?.signedUrl) throw new Error(error?.message || "Lien indisponible")
  return data.signedUrl
}

// ── Le pack (Réglages) : quels modèles DocuSign partent, dans quel ordre ──
type LignePack = { id: string; nom: string; template_id: string; ordre: number; actif: boolean }
export async function chargerPack(): Promise<ModelePack[]> {
  const { data, error } = await sb().from("st_contrats_modeles").select("id, nom, template_id, ordre, actif").neq("template_id", "").order("ordre")
  if (error) {
    if (/st_contrats_modeles|template_id/.test(error.message)) return []
    throw new Error(error.message)
  }
  return ((data ?? []) as LignePack[]).map((l) => ({ id: l.id, nom: l.nom, templateId: l.template_id, ordre: l.ordre, actif: l.actif }))
}
/** Remplace le pack : les modèles choisis, dans cet ordre, tous actifs. */
export async function enregistrerPack(choisis: { templateId: string; nom: string }[]): Promise<void> {
  const s = sb()
  const { error: eD } = await s.from("st_contrats_modeles").delete().neq("template_id", "")
  if (eD) throw new Error(eD.message)
  if (!choisis.length) return
  const { error } = await s.from("st_contrats_modeles").insert(choisis.map((c, i) => ({ nom: c.nom, template_id: c.templateId, chemin: "", ordre: i + 1, actif: true })))
  if (error) throw new Error(error.message)
}
