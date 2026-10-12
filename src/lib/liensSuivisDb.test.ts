import { beforeEach, describe, expect, it, vi } from "vitest"

// La base est doublée : un lien existant est réutilisé, sinon un lien neuf est inséré.
const etat = { existant: null as { jeton: string } | null, inseres: [] as Record<string, unknown>[] }
vi.mock("./supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: etat.existant }) }) }) }) }) }) }),
      insert: async (ligne: Record<string, unknown>) => { etat.inseres.push(ligne); return { error: null } },
    }),
  },
}))

const { remplirLiens, lienSuivi } = await import("./liensSuivisDb")

describe("liens suivis dans les e-mails", () => {
  beforeEach(() => { etat.existant = null; etat.inseres = [] })

  it("{{lien_creer_compte}} devient un lien cliquable propre à l'agence, qui passe par evenements-site", async () => {
    const html = await remplirLiens("Bonjour,<br>ouvrez votre espace : {{lien_creer_compte}}<br>Cordialement", "agence-1", "html")
    expect(html).not.toContain("{{lien_creer_compte}}")
    expect(html).toMatch(/<a href="[^"]*\/functions\/v1\/evenements-site\?l=[A-Za-z0-9]+">Créer mon compte STC Bâtiment<\/a>/)
    expect(etat.inseres).toHaveLength(1)
    expect(etat.inseres[0]).toMatchObject({ agence_id: "agence-1", cible: "creer_compte" })
  })
  it("réutilise le lien déjà créé pour cette agence", async () => {
    etat.existant = { jeton: "jetonExistant" }
    const url = await lienSuivi("agence-1", "creer_compte")
    expect(url).toContain("evenements-site?l=jetonExistant")
    expect(etat.inseres).toHaveLength(0)
  })
  it("sans agence, l'adresse brute, et l'objet reste du texte", async () => {
    expect(await remplirLiens("Voir : {{lien_creer_compte}}", null, "html")).toContain('<a href="https://www.stcbatiment.com/creer-mon-compte">')
    expect(await remplirLiens("Objet {{lien_site}}", null, "texte")).toBe("Objet https://www.stcbatiment.fr")
  })
})
