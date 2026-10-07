// Comptes et rôles du CRM (Mahdi, 07/10/2026).
//
// Deux rôles : « admin » ouvre des comptes et change les rôles, « telepro »
// (téléprospecteur) travaille sans y toucher. Le rôle est écrit par le serveur
// dans app_metadata du compte Supabase Auth et arrive dans la session : ici on
// le LIT (pour afficher ou cacher l'onglet Comptes) ; la fonction serveur
// « comptes » le revérifie à chaque action — le navigateur n'est jamais la garde.
import type { Session } from "@supabase/supabase-js"
import { supabase } from "./supabase"

export const ROLES = ["admin", "telepro"] as const
export type Role = (typeof ROLES)[number]

export const LIBELLE_ROLE: Record<Role, string> = {
  admin: "Administrateur",
  telepro: "Téléprospecteur",
}

export const estRole = (v: unknown): v is Role =>
  typeof v === "string" && (ROLES as readonly string[]).includes(v)

/** Le rôle porté par la session ; null si absent ou inconnu (compte d'avant les rôles). */
export function roleDeSession(session: Session | null | undefined): Role | null {
  const role = session?.user?.app_metadata?.role
  return estRole(role) ? role : null
}

export const estAdmin = (session: Session | null | undefined): boolean =>
  roleDeSession(session) === "admin"

/** Le nom à afficher : le nom saisi à la création, sinon la partie avant l'@ de l'e-mail. */
export function nomAffiche(session: Session | null | undefined): string {
  const nom = session?.user?.user_metadata?.nom
  if (typeof nom === "string" && nom.trim()) return nom.trim()
  const email = session?.user?.email ?? ""
  const avantArobase = email.split("@")[0]?.trim()
  return avantArobase || "Compte"
}

/** « Horlann Maunier » → « HM », « contact » → « CO ». */
export function initialesDe(nom: string): string {
  const mots = nom.trim().split(/[\s.\-_]+/).filter(Boolean)
  if (mots.length === 0) return "?"
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase()
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase()
}

export interface Compte {
  id: string
  email: string
  nom: string
  role: Role | null
  creeLe: string | null
  derniereConnexion: string | null
}

export interface NouveauCompte {
  email: string
  motDePasse: string
  role: Role
  nom: string
}

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const LONGUEUR_MIN_MOT_DE_PASSE = 10

/** Le message d'erreur à montrer avant d'appeler le serveur, ou null si tout va bien. */
export function validerNouveauCompte(c: NouveauCompte): string | null {
  if (!EMAIL_VALIDE.test(c.email.trim())) return "Adresse e-mail invalide."
  if (c.motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE)
    return `Le mot de passe doit faire au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`
  if (!estRole(c.role)) return "Choisis un rôle : administrateur ou téléprospecteur."
  return null
}

// Alphabet sans caractères ambigus (pas de 0/O, 1/l/I) : un mot de passe qu'on
// peut dicter au téléphone ou recopier sans se tromper.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"

export function genererMotDePasse(longueur = 14): string {
  const tirage = new Uint32Array(longueur)
  crypto.getRandomValues(tirage)
  return Array.from(tirage, (n) => ALPHABET[n % ALPHABET.length]).join("")
}

async function appeler<T>(action: string, corps: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error("Supabase n'est pas configuré.")
  const { data, error } = await supabase.functions.invoke("comptes", { body: { action, ...corps } })
  if (error) {
    // Une erreur HTTP porte la réponse du serveur : on lit SON message, pas le générique.
    let message = error.message
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === "function") {
      try {
        const corpsErreur = (await ctx.json()) as { error?: string }
        if (corpsErreur?.error) message = corpsErreur.error
      } catch {
        // corps illisible : on garde le message générique
      }
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(String(data.error))
  return data as T
}

export async function listerComptes(): Promise<Compte[]> {
  const r = await appeler<{ comptes: Compte[] }>("lister")
  return r.comptes ?? []
}

export async function creerCompte(c: NouveauCompte): Promise<Compte> {
  const r = await appeler<{ compte: Compte }>("creer", {
    email: c.email.trim(),
    motDePasse: c.motDePasse,
    role: c.role,
    nom: c.nom.trim(),
  })
  return r.compte
}

export async function renommerCompte(id: string, nom: string): Promise<Compte> {
  const r = await appeler<{ compte: Compte }>("renommer", { id, nom: nom.trim() })
  return r.compte
}

/** Pose un nouveau mot de passe (un mot de passe perdu ne se relit pas, il se remplace). */
export async function nouveauMotDePasse(id: string, motDePasse: string): Promise<Compte> {
  const r = await appeler<{ compte: Compte }>("nouveau_mot_de_passe", { id, motDePasse })
  return r.compte
}

export async function changerRole(id: string, role: Role): Promise<Compte> {
  const r = await appeler<{ compte: Compte }>("changer_role", { id, role })
  return r.compte
}
