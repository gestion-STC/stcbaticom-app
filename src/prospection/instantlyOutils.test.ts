import { describe, expect, it } from "vitest"
import { boitePrete, boitesDe, capaciteJour, corpsAvecMentions, doitArreter, horaireInstantly } from "./instantlyOutils"
import ecran from "./instantlyOutils.ts?raw"
import serveur from "../../supabase/functions/_shared/campagnes/instantlyOutils.ts?raw"

const boites = ["partenaires@x.com", "interventions@x.com", "artisans@x.com"]

describe("instantlyOutils", () => {
  it("le serveur a la même copie que l'écran", () => {
    const n = (s: string) => s.replace(/\r\n/g, "\n")
    expect(n(serveur)).toBe(n(ecran))
  })
  it("sépare les boîtes des agences et des artisans", () => {
    expect(boitesDe("agences", boites)).toEqual(["partenaires@x.com", "interventions@x.com"])
    expect(boitesDe("artisans", boites)).toEqual(["artisans@x.com"])
  })
  it("reconnaît partenaire au singulier", () => {
    expect(boitesDe("agences", ["partenaire@x.org", "artisans@x.org"])).toEqual(["partenaire@x.org"])
  })
  it("prend toutes les boîtes si aucune ne porte le bon nom", () => {
    expect(boitesDe("agences", ["autre@x.com"])).toEqual(["autre@x.com"])
  })
  it("refuse une boîte en cours de configuration ou en erreur", () => {
    expect(boitePrete({ status: 1, setup_pending: false })).toBe(true)
    expect(boitePrete({ status: 1, setup_pending: true })).toBe(false)
    expect(boitePrete({ status: -1, setup_pending: false })).toBe(false)
  })
  it("traduit les jours et les heures", () => {
    const h = horaireInstantly({ jours: [1, 5, 7], heureMin: 9, heureMax: 24 }).schedules[0]
    expect(h.days).toEqual({ "1": true, "5": true, "0": true })
    expect(h.timing).toEqual({ from: "09:00", to: "23:59" })
  })
  it("ajoute la signature et l'adresse à un texte, en échappant et avec des liens", () => {
    const c = corpsAvecMentions("Bonjour <toi>\nVoir https://a.fr/x")
    expect(c).toContain("Bonjour &lt;toi&gt;<br/>")
    expect(c).toContain('<a href="https://a.fr/x">')
    expect(c).toContain("7 rue Oscar Niemeyer, 78280 Guyancourt")
  })
  it("insère la signature dans un mail HTML, sans la doubler", () => {
    expect(corpsAvecMentions("<html><body>x</body></html>")).toMatch(/78280 Guyancourt<\/p><\/body>/)
    expect(corpsAvecMentions("<p>Adresse 78280</p>")).toBe("<p>Adresse 78280</p>")
  })
  it("limite le volume selon le nombre de boîtes", () => expect(capaciteJour(3)).toBe(90))
  it("s'arrête au-delà de 3 % de rebonds, jamais sur un petit nombre", () => {
    expect(doitArreter(29, 20)).toBe(false)
    expect(doitArreter(100, 3)).toBe(false)
    expect(doitArreter(100, 4)).toBe(true)
  })
})
