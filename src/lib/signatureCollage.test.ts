import { describe, it, expect } from "vitest"
import {
  nettoyerHtmlSignature,
  listerImages,
  sortImage,
  trierImages,
  messageApresCollage,
  imageTropLourde,
} from "./signatureCollage"

describe("nettoyerHtmlSignature", () => {
  it("retire les blocs <style> — ils deformeraient TOUT le logiciel", () => {
    const colle = '<style>body{background:red}</style><p>Horlann</p>'
    const propre = nettoyerHtmlSignature(colle)
    expect(propre).not.toContain("<style")
    expect(propre).not.toContain("background:red")
    expect(propre).toContain("Horlann")
  })

  it("retire les commentaires conditionnels Microsoft", () => {
    const colle = '<!--[if gte mso 9]><xml>bla</xml><![endif]--><p>Nom</p>'
    expect(nettoyerHtmlSignature(colle)).toBe("<p>Nom</p>")
  })

  it("retire les scripts", () => {
    const colle = '<script>alert(1)</script><p>Nom</p>'
    const propre = nettoyerHtmlSignature(colle)
    expect(propre).not.toContain("script")
    expect(propre).not.toContain("alert")
  })

  it("retire les gestionnaires d'evenements", () => {
    const colle = `<img src="x" onerror="alert(1)" /><a href="#" onclick='vol()'>lien</a>`
    const propre = nettoyerHtmlSignature(colle)
    expect(propre).not.toContain("onerror")
    expect(propre).not.toContain("onclick")
    expect(propre).toContain('src="x"')
  })

  it("neutralise les liens javascript:", () => {
    const colle = `<a href="javascript:vol()">clic</a>`
    expect(nettoyerHtmlSignature(colle)).toContain('href="#"')
  })

  it("garde la mise en forme utile (styles en ligne, gras, liens, images)", () => {
    const colle =
      '<p style="color:#c00"><b>Horlann Maunier</b><br><a href="https://stcbatiment.fr">stcbatiment.fr</a><img src="data:image/png;base64,AAA"></p>'
    const propre = nettoyerHtmlSignature(colle)
    expect(propre).toContain('style="color:#c00"')
    expect(propre).toContain("<b>Horlann Maunier</b>")
    expect(propre).toContain("https://stcbatiment.fr")
    expect(propre).toContain("data:image/png;base64,AAA")
  })

  it("retire les balises Office orphelines et les classes Mso", () => {
    const colle = '<p class="MsoNormal">Nom<o:p></o:p></p>'
    const propre = nettoyerHtmlSignature(colle)
    expect(propre).not.toContain("MsoNormal")
    expect(propre).not.toContain("o:p")
    expect(propre).toContain("Nom")
  })

  it("tolere une entree vide", () => {
    expect(nettoyerHtmlSignature("")).toBe("")
  })
})

describe("listerImages", () => {
  it("trouve toutes les adresses d'images, guillemets simples ou doubles", () => {
    const html = `<img src="https://a.fr/logo.png"><img src='cid:image001.png'>`
    expect(listerImages(html)).toEqual(["https://a.fr/logo.png", "cid:image001.png"])
  })

  it("rend une liste vide s'il n'y a pas d'image", () => {
    expect(listerImages("<p>Nom</p>")).toEqual([])
    expect(listerImages("")).toEqual([])
  })
})

describe("sortImage", () => {
  it("reconnait une image deja integree", () => {
    expect(sortImage("data:image/png;base64,AAA")).toBe("integree")
  })

  it("reconnait une image distante", () => {
    expect(sortImage("https://a.fr/logo.png")).toBe("distante")
    expect(sortImage("http://a.fr/logo.png")).toBe("distante")
  })

  it("reconnait une reference interne au logiciel de mail comme impossible", () => {
    expect(sortImage("cid:image001.png@01D.")).toBe("impossible")
    expect(sortImage("file:///C:/logo.png")).toBe("impossible")
    expect(sortImage("/local/logo.png")).toBe("impossible")
  })
})

describe("trierImages", () => {
  it("range chaque adresse dans la bonne categorie", () => {
    const t = trierImages([
      "data:image/png;base64,AAA",
      "https://a.fr/logo.png",
      "cid:image001.png",
    ])
    expect(t.integrees).toHaveLength(1)
    expect(t.distantes).toHaveLength(1)
    expect(t.impossibles).toHaveLength(1)
  })
})

describe("messageApresCollage", () => {
  it("ne dit rien quand tout s'est bien passe", () => {
    expect(messageApresCollage(0, 0, 0)).toBeNull()
  })

  it("annonce les images integrees", () => {
    expect(messageApresCollage(2, 0, 0)).toContain("2 images intégrées")
  })

  it("explique le cas des images du logiciel de mail", () => {
    const m = messageApresCollage(0, 0, 1) as string
    expect(m).toContain("bouton image")
  })

  it("cumule les trois cas", () => {
    const m = messageApresCollage(1, 1, 1) as string
    expect(m).toContain("intégrée")
    expect(m).toContain("rapatriée")
    expect(m).toContain("bouton image")
  })
})

describe("imageTropLourde", () => {
  it("accepte un logo de taille normale", () => {
    expect(imageTropLourde("data:image/png;base64," + "A".repeat(50_000))).toBe(false)
  })

  it("refuse une image manifestement trop lourde", () => {
    expect(imageTropLourde("data:image/png;base64," + "A".repeat(3_000_000))).toBe(true)
  })
})
