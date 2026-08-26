import { describe, it, expect } from "vitest"
import {
  LOGO_SIGNATURE_URL,
  balisesLogoSignature,
  compterImagesIntegrees,
  avertissementImagesIntegrees,
} from "./signatureLogo"

describe("balisesLogoSignature", () => {
  it("pointe vers une adresse publique en https", () => {
    // une adresse relative ou en http ne s'afficherait pas dans un email
    expect(LOGO_SIGNATURE_URL.startsWith("https://")).toBe(true)
    expect(balisesLogoSignature()).toContain(LOGO_SIGNATURE_URL)
  })

  it("borne la largeur pour ne pas deborder du message", () => {
    expect(balisesLogoSignature()).toContain("max-width:200px")
    expect(balisesLogoSignature()).toContain("height:auto")
  })

  it("porte un texte de remplacement", () => {
    expect(balisesLogoSignature()).toContain('alt="STC Bâtiment"')
  })
})

describe("compterImagesIntegrees", () => {
  it("compte les images en data:", () => {
    const html = '<img src="data:image/png;base64,AAA"><img src="data:image/png;base64,BBB">'
    expect(compterImagesIntegrees(html)).toBe(2)
  })

  it("ne compte pas les images hebergees", () => {
    expect(compterImagesIntegrees('<img src="https://a.fr/logo.png">')).toBe(0)
  })

  it("gere les guillemets simples", () => {
    expect(compterImagesIntegrees("<img src='data:image/png;base64,AAA'>")).toBe(1)
  })

  it("rend 0 sur du vide ou sans image", () => {
    expect(compterImagesIntegrees("")).toBe(0)
    expect(compterImagesIntegrees("<p>Nom</p>")).toBe(0)
  })
})

describe("avertissementImagesIntegrees", () => {
  it("ne dit rien quand tout est heberge", () => {
    expect(avertissementImagesIntegrees('<img src="https://a.fr/l.png">')).toBeNull()
    expect(avertissementImagesIntegrees("<p>Nom</p>")).toBeNull()
  })

  it("previent que le destinataire verra un carre casse", () => {
    const m = avertissementImagesIntegrees('<img src="data:image/png;base64,AAA">') as string
    expect(m).toContain("Gmail")
    expect(m).toContain("carré cassé")
  })

  it("accorde au pluriel", () => {
    const html = '<img src="data:image/png;base64,A"><img src="data:image/png;base64,B">'
    const m = avertissementImagesIntegrees(html) as string
    expect(m).toContain("2 images")
    expect(m).toContain("sont intégrées")
  })
})
