import { describe, it, expect } from "vitest"
import type { EtapeST } from "../recrutement"
import {
  segmentsSms, libelleSms, verifierEtape, aUnBloquant, exempleRemplissage, exempleObjet,
  estHtml, texteVersHtml, htmlPourEnvoi, apercuTexte, LIENS_EXEMPLE, LIENS_TAILLE_REELLE,
} from "./sequencesOutils"

const etape = (p: Partial<EtapeST>): EtapeST => ({
  sequenceId: "seq", ordre: 0, canal: "email", delaiJours: 0, objet: "Objet", contenu: "", actif: true, ...p,
})

describe("segmentsSms", () => {
  it("compte 160 caractères par SMS en GSM-7 (texte sans accent)", () => {
    const c = segmentsSms("Bonjour, STC Batiment recrute des artisans. Repondez a ce message.")
    expect(c.ucs2).toBe(false)
    expect(c.limiteSegment).toBe(160)
    expect(c.segments).toBe(1)
    expect(c.longueur).toBe(66)
  })

  it("un texte vide fait 0 caractère et 0 SMS", () => {
    expect(segmentsSms("")).toEqual({ longueur: 0, segments: 0, limiteSegment: 160, ucs2: false })
  })

  it("160 caractères tiennent dans 1 SMS, 161 en font 2", () => {
    expect(segmentsSms("a".repeat(160)).segments).toBe(1)
    expect(segmentsSms("a".repeat(161)).segments).toBe(2)
  })

  it("au-delà d'un segment, chaque morceau ne porte que 153 caractères utiles", () => {
    expect(segmentsSms("a".repeat(306)).segments).toBe(2)
    expect(segmentsSms("a".repeat(307)).segments).toBe(3)
  })

  it("un accent fait basculer tout le message en UCS-2 : 70 caractères par SMS", () => {
    const c = segmentsSms("Bonjour Karim, ça va ?")
    expect(c.ucs2).toBe(true)
    expect(c.limiteSegment).toBe(70)
    expect(segmentsSms("é".repeat(70)).segments).toBe(1)
    expect(segmentsSms("é".repeat(71)).segments).toBe(2)
    expect(segmentsSms("é".repeat(134)).segments).toBe(2)
    expect(segmentsSms("é".repeat(135)).segments).toBe(3)
  })

  it("é, à et € passent aussi en UCS-2 (règle de la maison : SMS sans accent)", () => {
    expect(segmentsSms("Rémunération").ucs2).toBe(true)
    expect(segmentsSms("à bientôt").ucs2).toBe(true)
    expect(segmentsSms("Prix 50 €").ucs2).toBe(true)
  })

  it("un emoji passe en UCS-2 et compte double", () => {
    const c = segmentsSms("Bonjour 👋")
    expect(c.ucs2).toBe(true)
    expect(c.longueur).toBe(10)
  })

  it("les caractères d'extension GSM-7 ({ } [ ] ~ ^ \\ |) comptent double sans basculer en UCS-2", () => {
    const c = segmentsSms("a{b}c")
    expect(c.ucs2).toBe(false)
    expect(c.longueur).toBe(7)
  })

  it("le retour à la ligne compte pour un caractère GSM-7", () => {
    const c = segmentsSms("a\nb")
    expect(c.ucs2).toBe(false)
    expect(c.longueur).toBe(3)
  })

  it("se lit en une phrase", () => {
    expect(libelleSms(segmentsSms("a".repeat(142)))).toBe("142 caractères · 1 SMS")
    expect(libelleSms(segmentsSms("é"))).toBe("1 caractère · 1 SMS (accent ou symbole : 70 caractères par SMS)")
  })
})

describe("verifierEtape — les bloquants", () => {
  it("un contenu vide bloque", () => {
    const a = verifierEtape(etape({ contenu: "   " }))
    expect(a.some((x) => x.niveau === "bloquant" && /vide/.test(x.texte))).toBe(true)
    expect(aUnBloquant(a)).toBe(true)
  })

  it("un e-mail sans objet bloque ; un SMS sans objet, non", () => {
    const ok = "Bonjour {{contact}} {{lien_candidature}} {{lien_desinscription}}"
    expect(verifierEtape(etape({ objet: "", contenu: ok })).some((x) => /objet/.test(x.texte))).toBe(true)
    expect(verifierEtape(etape({ canal: "sms", objet: "", contenu: ok })).some((x) => /objet/.test(x.texte))).toBe(false)
  })

  it("sans {{lien_desinscription}}, l'e-mail comme le SMS sont bloqués", () => {
    const sans = "Bonjour {{contact}}, candidatez : {{lien_candidature}}"
    expect(aUnBloquant(verifierEtape(etape({ contenu: sans })))).toBe(true)
    expect(aUnBloquant(verifierEtape(etape({ canal: "sms", contenu: sans })))).toBe(true)
    const avec = sans + " Stop : {{lien_desinscription}}"
    expect(aUnBloquant(verifierEtape(etape({ contenu: avec })))).toBe(false)
    expect(aUnBloquant(verifierEtape(etape({ canal: "sms", contenu: avec })))).toBe(false)
  })

  it("un contenu vide ne cumule pas le reproche du lien manquant", () => {
    const a = verifierEtape(etape({ canal: "sms", contenu: "" }))
    expect(a.filter((x) => x.niveau === "bloquant")).toHaveLength(1)
  })
})

describe("verifierEtape — les attentions", () => {
  it("un SMS de plus d'un segment, compté avec les liens à la taille réelle", () => {
    // 60 caractères de texte + un lien de 110 caractères = 2 segments, alors que
    // le gabarit seul tiendrait largement dans un SMS.
    const a = verifierEtape(etape({ canal: "sms", contenu: "STC Batiment recrute. Dossier : {{lien_candidature}} - desinscription : {{lien_desinscription}}" }))
    expect(a.some((x) => x.niveau === "attention" && /segments/.test(x.texte))).toBe(true)
    expect(aUnBloquant(a)).toBe(false)
  })

  it("un SMS court avec le seul lien de désinscription passe sans attention", () => {
    const a = verifierEtape(etape({ canal: "sms", contenu: "Bonjour {{contact}}. Stop : {{lien_desinscription}}" }))
    expect(a).toHaveLength(0)
  })

  it("« STOP » dans un SMS est signalé (Ringover ne reçoit pas les SMS)", () => {
    const a = verifierEtape(etape({ canal: "sms", contenu: "Repondez STOP pour ne plus recevoir. {{lien_desinscription}}" }))
    expect(a.some((x) => x.niveau === "attention" && /STOP/.test(x.texte))).toBe(true)
    // « stopper » n'est pas le mot STOP, et « Stop : <lien> » (en minuscules) est la façon normale d'annoncer le lien
    const b = verifierEtape(etape({ canal: "sms", contenu: "Pour stopper : {{lien_desinscription}}" }))
    expect(b.some((x) => /STOP/.test(x.texte))).toBe(false)
    const c = verifierEtape(etape({ canal: "sms", contenu: "Stop : {{lien_desinscription}}" }))
    expect(c.some((x) => /STOP/.test(x.texte))).toBe(false)
  })

  it("un e-mail sans lien de candidature est signalé, pas bloqué", () => {
    const a = verifierEtape(etape({ contenu: "Bonjour {{contact}}. {{lien_desinscription}}" }))
    expect(a).toEqual([{ niveau: "attention", texte: expect.stringMatching(/lien_candidature/) }])
    // {{lien}} (rétrocompat) vaut un lien de candidature
    expect(verifierEtape(etape({ contenu: "Bonjour {{lien}} {{lien_desinscription}}" }))).toHaveLength(0)
    expect(verifierEtape(etape({ contenu: "Bonjour {{lien_candidature}} {{lien_desinscription}}" }))).toHaveLength(0)
  })

  it("la règle du lien de candidature ne s'applique pas aux SMS", () => {
    const a = verifierEtape(etape({ canal: "sms", contenu: "Bonjour. {{lien_desinscription}}" }))
    expect(a.some((x) => /lien_candidature/.test(x.texte))).toBe(false)
  })
})

describe("exempleRemplissage", () => {
  it("remplit avec l'artisan d'exemple et les liens d'exemple", () => {
    const r = exempleRemplissage(etape({ contenu: "Bonjour {{contact}} ({{entreprise}}, {{metier}}) : {{lien_candidature}} / {{lien_bareme}} / {{lien_desinscription}} / {{lien}}" }))
    expect(r).toBe(`Bonjour Karim Benali (Benali Rénovation, Électricité) : ${LIENS_EXEMPLE.candidature} / ${LIENS_EXEMPLE.bareme} / ${LIENS_EXEMPLE.stop} / ${LIENS_EXEMPLE.candidature}`)
  })

  it("accepte une seule adresse (ancien usage) ou des liens à la taille réelle", () => {
    expect(exempleRemplissage(etape({ contenu: "{{lien}}" }), "https://x.invalid")).toBe("https://x.invalid")
    expect(exempleRemplissage(etape({ contenu: "{{lien_desinscription}}" }), LIENS_TAILLE_REELLE)).toBe(LIENS_TAILLE_REELLE.stop)
  })

  it("le lien de désinscription d'exemple ne mène nulle part : un test ne désinscrit personne", () => {
    expect(LIENS_EXEMPLE.stop).toMatch(/^https:\/\/exemple\.invalid\//)
  })

  it("remplit aussi l'objet", () => {
    expect(exempleObjet(etape({ objet: "{{entreprise}} : rejoignez STC" }))).toBe("Benali Rénovation : rejoignez STC")
  })
})

describe("estHtml — la même règle que le moteur", () => {
  it("reconnaît un contenu HTML", () => {
    expect(estHtml("<div>Bonjour</div>")).toBe(true)
    expect(estHtml("<p>Bonjour</p>")).toBe(true)
    expect(estHtml('<a href="x">lien</a>')).toBe(true)
    expect(estHtml("<TABLE><tr><td>x</td></tr></TABLE>")).toBe(true)
    expect(estHtml("<!doctype html><html><body>x</body></html>")).toBe(true)
  })

  it("un texte brut, même avec un chevron ou une balise inconnue, n'est pas du HTML", () => {
    expect(estHtml("Bonjour,\n\nDéposez votre dossier : {{lien}}")).toBe(false)
    expect(estHtml("prix < 100 et > 50")).toBe(false)
    expect(estHtml("<span>x</span>")).toBe(false)
    expect(estHtml("<party>")).toBe(false) // « p » suivi d'une lettre n'est pas <p>
  })
})

describe("texteVersHtml / htmlPourEnvoi", () => {
  it("échappe le texte, met les retours à la ligne et rend les liens cliquables", () => {
    const h = texteVersHtml("A < B\nhttps://x.invalid/a", ["https://x.invalid/a"])
    expect(h).toContain("A &lt; B<br>")
    expect(h).toContain('<a href="https://x.invalid/a">https://x.invalid/a</a>')
    expect(h.startsWith("<div style=")).toBe(true)
  })

  it("laisse un contenu HTML tel quel, met en page un texte brut", () => {
    expect(htmlPourEnvoi("<p>x</p>", LIENS_EXEMPLE)).toBe("<p>x</p>")
    expect(htmlPourEnvoi(`Stop : ${LIENS_EXEMPLE.stop}`, LIENS_EXEMPLE)).toContain(`<a href="${LIENS_EXEMPLE.stop}">`)
  })
})

describe("apercuTexte", () => {
  it("retire les balises, les styles et les entités, garde les lignes", () => {
    const t = apercuTexte("<style>p{color:red}</style><div><p>Bonjour&nbsp;<b>Karim</b></p><p>À bientôt &amp; merci</p></div>")
    expect(t).toBe("Bonjour Karim\nÀ bientôt & merci")
  })

  it("rend un texte brut inchangé (espaces superflus en moins)", () => {
    expect(apercuTexte("Bonjour  {{contact}},\n\n\nDossier : {{lien}}")).toBe("Bonjour {{contact}},\nDossier : {{lien}}")
  })
})
