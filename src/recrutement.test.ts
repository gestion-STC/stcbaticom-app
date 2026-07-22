import { describe, it, expect } from "vitest"
import { remplirST, etapeVide } from "./recrutement"

describe("recrutement — remplirST", () => {
  const st = { contact: "Jean", entreprise: "Plomberie Martin", metier: "Plombier" }
  const lien = "https://x.supabase.co/functions/v1/lien-st?t=abc123"

  it("remplace toutes les variables, dont le lien tracké", () => {
    const out = remplirST(
      "Bonjour {{contact}} de {{entreprise}} ({{metier}}). Déposez ici : {{lien}}",
      st,
      lien,
    )
    expect(out).toBe("Bonjour Jean de Plomberie Martin (Plombier). Déposez ici : " + lien)
  })

  it("remplace toutes les occurrences répétées", () => {
    expect(remplirST("{{contact}} {{contact}}", st, lien)).toBe("Jean Jean")
  })

  it("laisse une chaîne vide pour un champ absent", () => {
    expect(remplirST("[{{contact}}]", {}, lien)).toBe("[]")
  })
})

describe("recrutement — etapeVide", () => {
  it("première étape : e-mail à J+0", () => {
    const e = etapeVide("seq-1", 0)
    expect(e.sequenceId).toBe("seq-1")
    expect(e.ordre).toBe(0)
    expect(e.canal).toBe("email")
    expect(e.delaiJours).toBe(0)
    expect(e.actif).toBe(true)
  })

  it("étape suivante : délai par défaut J+2", () => {
    expect(etapeVide("seq-1", 1).delaiJours).toBe(2)
  })
})
