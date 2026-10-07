// Gestion des comptes du CRM — réservée aux administrateurs.
//
// Deux rôles (Mahdi, 07/10/2026) : « admin » ouvre des comptes et change les
// rôles ; « telepro » (téléprospecteur) utilise le logiciel sans toucher aux
// comptes. Le rôle vit dans app_metadata du compte Supabase Auth : seul le
// serveur (clé service_role) peut l'écrire, et il voyage dans le jeton de
// session — le front le lit pour afficher ou cacher l'onglet, cette fonction
// le REVÉRIFIE à chaque appel (le front n'est jamais la garde).
//
// Actions (POST, JSON, { action, ... }) :
//   lister        → { comptes: [...] }
//   creer         → { email, motDePasse, role, nom? } → { compte }
//   changer_role  → { id, role } → { compte }
//   renommer      → { id, nom } → { compte }   (le nom qui signe les e-mails)
//   nouveau_mot_de_passe → { id, motDePasse } → { compte }   (un mot de passe perdu ne se relit pas, il se remplace)
//
// Secrets : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase.

import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const ROLES = ["admin", "telepro"] as const
type Role = (typeof ROLES)[number]
const estRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v)

function reponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  })
}

function versCompte(u: User) {
  const role = u?.app_metadata?.role
  return {
    id: u.id as string,
    email: (u.email ?? "") as string,
    nom: String(u.user_metadata?.nom ?? ""),
    role: estRole(role) ? role : null,
    creeLe: (u.created_at ?? null) as string | null,
    derniereConnexion: (u.last_sign_in_at ?? null) as string | null,
  }
}

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return reponse({ error: "Méthode non autorisée." }, 405)

  try {
    const url = Deno.env.get("SUPABASE_URL")
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!url || !service) return reponse({ error: "Fonction mal configurée (SUPABASE_URL / SERVICE_ROLE)." }, 500)

    // 1. Qui appelle ? Le jeton de session du navigateur, vérifié par Supabase Auth.
    const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim()
    if (!jeton) return reponse({ error: "Connexion requise." }, 401)

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: { user: appelant }, error: errAppelant } = await admin.auth.getUser(jeton)
    if (errAppelant || !appelant) return reponse({ error: "Session invalide — reconnecte-toi." }, 401)
    if (appelant.app_metadata?.role !== "admin") return reponse({ error: "Réservé aux administrateurs." }, 403)

    const corps = await req.json().catch(() => ({}))
    const action = corps?.action

    // 2. Lister tous les comptes.
    if (action === "lister") {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
      if (error) return reponse({ error: error.message }, 500)
      const comptes = (data.users ?? []).map(versCompte).sort((a, b) => a.email.localeCompare(b.email))
      return reponse({ comptes })
    }

    // 3. Créer un compte. Le mot de passe est choisi par l'administrateur (ou
    //    généré côté navigateur) et transmis à la personne : pas d'e-mail de
    //    confirmation, le compte est utilisable tout de suite.
    if (action === "creer") {
      const email = String(corps?.email ?? "").trim().toLowerCase()
      const motDePasse = String(corps?.motDePasse ?? "")
      const nom = String(corps?.nom ?? "").trim().slice(0, 80)
      const role = corps?.role
      if (!EMAIL_VALIDE.test(email)) return reponse({ error: "Adresse e-mail invalide." }, 400)
      if (motDePasse.length < 10) return reponse({ error: "Le mot de passe doit faire au moins 10 caractères." }, 400)
      if (!estRole(role)) return reponse({ error: "Rôle inconnu (admin ou telepro)." }, 400)

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: motDePasse,
        email_confirm: true,
        user_metadata: nom ? { nom } : {},
        app_metadata: { role },
      })
      if (error) {
        const deja = /already|exists|registered/i.test(error.message)
        return reponse({ error: deja ? "Un compte existe déjà avec cette adresse." : error.message }, deja ? 409 : 500)
      }
      return reponse({ compte: versCompte(data.user) })
    }

    // 4. Changer le rôle d'un compte. Un administrateur ne peut pas se retirer
    //    lui-même le rôle s'il est le dernier : le logiciel ne doit jamais se
    //    retrouver sans personne pour ouvrir des comptes.
    if (action === "changer_role") {
      const id = String(corps?.id ?? "")
      const role = corps?.role
      if (!id) return reponse({ error: "Compte manquant." }, 400)
      if (!estRole(role)) return reponse({ error: "Rôle inconnu (admin ou telepro)." }, 400)

      if (id === appelant.id && role !== "admin") {
        const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
        if (error) return reponse({ error: error.message }, 500)
        const autresAdmins = (data.users ?? []).filter((u) => u.id !== id && u.app_metadata?.role === "admin")
        if (autresAdmins.length === 0)
          return reponse({ error: "Tu es le seul administrateur : nomme-en un autre avant de changer ton rôle." }, 400)
      }

      const { data, error } = await admin.auth.admin.updateUserById(id, { app_metadata: { role } })
      if (error) return reponse({ error: error.message }, 500)
      return reponse({ compte: versCompte(data.user) })
    }

    // 5. Renommer un compte : le nom qui signe les e-mails et s'affiche en bas de la barre.
    if (action === "renommer") {
      const id = String(corps?.id ?? "")
      const nom = String(corps?.nom ?? "").trim().slice(0, 80)
      if (!id) return reponse({ error: "Compte manquant." }, 400)
      if (!nom) return reponse({ error: "Le nom ne peut pas être vide." }, 400)
      const { data, error } = await admin.auth.admin.updateUserById(id, { user_metadata: { nom } })
      if (error) return reponse({ error: error.message }, 500)
      return reponse({ compte: versCompte(data.user) })
    }

    // 6. Nouveau mot de passe. Un mot de passe perdu ne se retrouve pas (il est
    //    chiffré) : l'administrateur en pose un nouveau et le transmet.
    if (action === "nouveau_mot_de_passe") {
      const id = String(corps?.id ?? "")
      const motDePasse = String(corps?.motDePasse ?? "")
      if (!id) return reponse({ error: "Compte manquant." }, 400)
      if (motDePasse.length < 10) return reponse({ error: "Le mot de passe doit faire au moins 10 caractères." }, 400)
      const { data, error } = await admin.auth.admin.updateUserById(id, { password: motDePasse })
      if (error) return reponse({ error: error.message }, 500)
      return reponse({ compte: versCompte(data.user) })
    }

    return reponse({ error: "Action inconnue (lister, creer, changer_role, renommer, nouveau_mot_de_passe)." }, 400)
  } catch (e) {
    return reponse({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
