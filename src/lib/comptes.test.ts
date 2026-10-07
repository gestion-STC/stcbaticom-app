import { describe, expect, it } from "vitest"
import type { Session } from "@supabase/supabase-js"
import {
  roleDeSession,
  estAdmin,
  nomAffiche,
  initialesDe,
  validerNouveauCompte,
  genererMotDePasse,
  LIBELLE_ROLE,
} from "./comptes"

// Une session réduite à ce que le code lit : l'utilisateur et ses métadonnées.
const session = (user: Record<string, unknown>) => ({ user }) as unknown as Session

describe("roleDeSession / estAdmin", () => {
  it("lit le rôle admin posé par le serveur dans app_metadata", () => {
    const s = session({ email: "a@b.fr", app_metadata: { role: "admin" } })
    expect(roleDeSession(s)).toBe("admin")
    expect(estAdmin(s)).toBe(true)
  })
  it("lit le rôle téléprospecteur", () => {
    const s = session({ email: "a@b.fr", app_metadata: { role: "telepro" } })
    expect(roleDeSession(s)).toBe("telepro")
    expect(estAdmin(s)).toBe(false)
  })
  it("un compte d'avant les rôles n'a pas de rôle, donc pas admin", () => {
    expect(roleDeSession(session({ email: "a@b.fr", app_metadata: {} }))).toBeNull()
    expect(estAdmin(session({ email: "a@b.fr" }))).toBe(false)
  })
  it("un rôle inconnu ou mal typé ne donne aucun droit", () => {
    expect(roleDeSession(session({ app_metadata: { role: "superadmin" } }))).toBeNull()
    expect(roleDeSession(session({ app_metadata: { role: 1 } }))).toBeNull()
  })
  it("pas de session → rien", () => {
    expect(roleDeSession(null)).toBeNull()
    expect(roleDeSession(undefined)).toBeNull()
    expect(estAdmin(null)).toBe(false)
  })
  it("chaque rôle a un libellé lisible", () => {
    expect(LIBELLE_ROLE.admin).toBe("Administrateur")
    expect(LIBELLE_ROLE.telepro).toBe("Téléprospecteur")
  })
})

describe("nomAffiche / initialesDe", () => {
  it("préfère le nom saisi à la création", () => {
    expect(nomAffiche(session({ email: "contact@crm.stcbatiment.fr", user_metadata: { nom: "Horlann" } }))).toBe("Horlann")
  })
  it("sinon prend la partie avant l'@", () => {
    expect(nomAffiche(session({ email: "gestion@stcbatiment.fr" }))).toBe("gestion")
  })
  it("ne laisse jamais vide", () => {
    expect(nomAffiche(null)).toBe("Compte")
    expect(nomAffiche(session({ email: "" }))).toBe("Compte")
  })
  it("fabrique des initiales", () => {
    expect(initialesDe("Horlann Maunier")).toBe("HM")
    expect(initialesDe("gestion")).toBe("GE")
    expect(initialesDe("")).toBe("?")
  })
})

describe("validerNouveauCompte", () => {
  const ok = { email: "nouveau@stcbatiment.fr", motDePasse: "AbCdEfGh2345", role: "telepro" as const, nom: "Test" }
  it("accepte un compte complet", () => {
    expect(validerNouveauCompte(ok)).toBeNull()
  })
  it("refuse une adresse invalide", () => {
    expect(validerNouveauCompte({ ...ok, email: "pas-une-adresse" })).toBe("Adresse e-mail invalide.")
  })
  it("refuse un mot de passe trop court", () => {
    expect(validerNouveauCompte({ ...ok, motDePasse: "court" })).toContain("au moins 10 caractères")
  })
  it("refuse un rôle inconnu", () => {
    expect(validerNouveauCompte({ ...ok, role: "patron" as never })).toContain("Choisis un rôle")
  })
})

describe("genererMotDePasse", () => {
  it("fait 14 caractères par défaut, sans caractère ambigu", () => {
    const m = genererMotDePasse()
    expect(m).toHaveLength(14)
    expect(m).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/)
  })
  it("respecte la longueur demandée et change à chaque tirage", () => {
    expect(genererMotDePasse(20)).toHaveLength(20)
    expect(genererMotDePasse()).not.toBe(genererMotDePasse())
  })
})
