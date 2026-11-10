// Les fichiers importés (10/11/2026) : un seul endroit, Campagnes › Fichiers. Chaque contact reste rattaché au premier
// fichier qui l'a apporté, pour que le classement des fichiers reste juste.
import { useEffect, useState } from "react"
import { supabase } from "./supabase"
import { lireParLots } from "./pagination"
import type { Espace } from "./messagesDb"

export type Fichier = {
  id: string; nom: string; baseId: string; source: string; zone: string; lignes: number; importes: number; deja: number; ignores: number
  enSession: boolean; attribueA: string[]; creeLe: string; contacts: number; mails: number; mobiles: number; leads: number; gagnes: number
  appels: number; joints: number; touches: number; reponses: number; campagnes: string[]; enCours: number
}
type Ligne = { id: string; nom: string; base_id: string; source: string; zone: string; lignes: number; importes: number; deja: number; ignores: number; en_session: boolean; attribue_a: string[] | null; cree_le: string; contacts: number; mails: number; mobiles: number; leads: number; gagnes: number; appels: number; joints: number; touches: number; reponses: number; campagnes: string[] | null; en_cours: number }

function sb() {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  return supabase
}
const vers = (l: Ligne): Fichier => ({ id: l.id, nom: l.nom, baseId: l.base_id, source: l.source, zone: l.zone, lignes: l.lignes, importes: l.importes, deja: l.deja, ignores: l.ignores, enSession: l.en_session, attribueA: l.attribue_a ?? [], creeLe: l.cree_le, contacts: l.contacts, mails: l.mails, mobiles: l.mobiles, leads: l.leads, gagnes: l.gagnes, appels: l.appels, joints: l.joints, touches: l.touches, reponses: l.reponses, campagnes: l.campagnes ?? [], enCours: l.en_cours })

export async function chargerFichiers(): Promise<Fichier[]> {
  const { data, error } = await sb().from("cmp_fichiers_stats").select("*").is("archive_le", null).order("cree_le", { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Ligne[]).map(vers)
}

export async function creerFichier(f: { nom: string; baseId: string; source: string; zone: string; lignes: number; importes: number; deja: number; ignores: number; creePar: string }): Promise<string> {
  const { data, error } = await sb().from("cmp_fichiers").insert({ nom: f.nom, base_id: f.baseId, source: f.source, zone: f.zone, lignes: f.lignes, importes: f.importes, deja: f.deja, ignores: f.ignores, cree_par: f.creePar }).select("id").single()
  if (error) throw new Error(error.message)
  return String((data as { id: string }).id)
}

export async function majFichier(id: string, champs: { en_session?: boolean; attribue_a?: string[]; archive_le?: string; importes?: number }): Promise<void> {
  const { data, error } = await sb().from("cmp_fichiers").update(champs).eq("id", id).select("id")
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error("La base a refusé la modification.")
}

/** Les fichiers d'un service mis en session de call, pour ce compte. */
export function useFichiersEnSession(espace: Espace, moiId: string, admin: boolean): Fichier[] {
  const [fichiers, setFichiers] = useState<Fichier[]>([])
  useEffect(() => {
    let vivant = true
    chargerFichiers().then((l) => { if (vivant) setFichiers(l.filter((f) => f.enSession && (espace === "recrutement") === (f.baseId === "artisans") && (admin || !f.attribueA.length || f.attribueA.includes(moiId)))) }).catch(() => undefined)
    return () => { vivant = false }
  }, [espace, moiId, admin])
  return fichiers
}

/** Le pare-feu au téléphone : ceux qui sont dans une campagne en cours ne sortent pas dans une file d'appel direct. */
export async function contactsEnCampagne(): Promise<Set<string>> {
  const l = await lireParLots<{ contact_ref: string }>((d, f) => sb().from("cmp_inscriptions").select("contact_ref").eq("statut", "en_cours").order("id").range(d, f) as unknown as PromiseLike<{ data: { contact_ref: string }[] | null; error: { message: string } | null }>)
  return new Set(l.map((x) => x.contact_ref))
}

/** Plus aucune sollicitation pour cette agence : ni mail, ni SMS, ni téléphone. */
export async function nePlusContacterAgence(id: string): Promise<void> {
  const { data, error } = await sb().from("agences").update({ ne_plus_ecrire_le: new Date().toISOString(), etape: "hors_cible", motif: "ne plus contacter" }).eq("id", id).select("id")
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error("La base a refusé la modification.")
}
