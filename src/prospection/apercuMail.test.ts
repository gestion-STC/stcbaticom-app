import { describe, expect, it } from "vitest"
import { apercuMail, baliseImage, remplirExemples, conseilsMail } from "./apercuMail"
import { corpsAvecMentions } from "./instantlyOutils"

describe("aperçu du mail", () => {
  it("remplace les variables par des exemples", () => {
    expect(remplirExemples("Bonjour {{contact}} de {{entreprise}} : {{lien_principal}} {{inconnue}}")).toBe("Bonjour Claire Martin de Agence Exemple : https://www.stcbatiment.fr {{inconnue}}")
  })
  it("montre la signature, l'adresse et la désinscription", () => {
    const a = apercuMail("Pour {{entreprise}}", "Bonjour")
    expect(a.objet).toBe("Pour Agence Exemple")
    expect(a.document).toContain("78280 Guyancourt")
    expect(a.document).toContain("Pour ne plus recevoir nos messages")
    expect(a.document).toContain("Nous suivons les clics sur ces liens")
  })
  it("ne parle pas de suivi dans un mail d'avis", () => expect(apercuMail("", "Bonjour", "", false).document).not.toContain("Nous suivons les clics"))
  it("ne double pas la désinscription quand le texte la contient", () => {
    expect(apercuMail("", "Stop : {{lien_desinscription}}").document).not.toContain("Pour ne plus recevoir")
  })
  it("conseille sans bloquer", () => {
    expect(conseilsMail("Un objet", "Bonjour", true)).toEqual([])
    expect(conseilsMail("Objet", "{{lien_page}} {{lien_formulaire}}", true)[0]).toContain("un seul lien")
    expect(conseilsMail("Objet", "{{lien_page}} {{lien_formulaire}}", false)).toEqual([])
  })
  it("rend une image cliquable", () => expect(baliseImage("u", "l")).toContain('<a href="l">'))
  it("ajoute le lien du créatif", () => expect(apercuMail("", "Bonjour", "Remplir le formulaire").document).toContain(">Remplir le formulaire</a>"))
})

describe("une image au milieu du texte", () => {
  const img = baliseImage("https://x.fr/a.jpg")
  it("garde l'image et les retours à la ligne, échappe le reste", () => {
    const c = corpsAvecMentions(`Bonjour <toi>\n${img}\nFin`)
    expect(c).toContain(img)
    expect(c).toContain("Bonjour &lt;toi&gt;<br/>")
    expect(c).toContain("<br/>Fin")
  })
})

describe("la désinscription", () => {
  it("est un vrai lien, même dans un mail HTML", () => expect(corpsAvecMentions("<html><body>x</body></html>", "https://a.fr/stop")).toContain('<a href="https://a.fr/stop">'))
  it("reste présente quand l'adresse postale est déjà dans le texte", () => {
    const c = corpsAvecMentions("<p>Adresse 78280</p>", "https://a.fr/stop")
    expect(c).toContain("https://a.fr/stop")
    expect(c.match(/78280/g)).toHaveLength(1)
  })
})
