// Les réponses, lot B (Mahdi, 11/11/2026) : le bon contact cité, et la pause pendant une absence.
import sql from "../../supabase/maj-2026-11-11-reponses-contact-absence.sql?raw"
import { describe, expect, it } from "vitest"
import { CONSIGNES_TRI, SCHEMA_TRI } from "./ia"

describe("ce que l'IA lit dans une réponse", () => {
  it("le tri, la date de retour et le bon contact, toujours remplis (vides s'il n'y a rien)", () => {
    expect(SCHEMA_TRI.required).toEqual(["tri", "retour", "contact_nom", "contact_email", "contact_telephone"])
    expect(CONSIGNES_TRI).toContain("AAAA-MM-JJ")
    expect(CONSIGNES_TRI).toContain("sans rien inventer")
  })
  it("un absent met la séquence en pause : le lendemain de son retour à 9 h, sinon 7 jours", () => {
    expect(sql).toContain("(v_retour::date + 1)::timestamp + time '09:00'")
    expect(sql).toContain("now() + interval '7 days'")
    expect(sql).toContain("greatest(prochaine_le, v_reprise)")
  })
  it("le lead dit vers qui la réponse renvoie", () => {
    expect(sql.split("left('Renvoie vers '").length - 1).toBe(2)
  })
})
