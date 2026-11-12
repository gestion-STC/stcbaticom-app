import { describe, expect, it } from "vitest"
import { appliquerIA, avecObjetIA, consignesIA, concerneIA, faitLocal, fichePauvre, lireInterventions, messageIA, objetIA, reglageIADepart, separerObjetIA } from "./ia"
import ecran from "./ia.ts?raw"
import serveur from "../../supabase/functions/_shared/campagnes/ia.ts?raw"

const n = (s: string) => s.replace(/\r\n/g, "\n")
describe("personnalisation par l'IA", () => {
  it("le serveur a la même copie que l'écran", () => expect(n(serveur)).toBe(n(ecran)))
  it("place le texte à la balise, ou après la salutation", () => {
    expect(appliquerIA("Bonjour,\n\n{{accroche_ia}}\n\nSuite", "accroche", "X")).toBe("Bonjour,\n\nX\n\nSuite")
    expect(appliquerIA("Bonjour,\n\nSuite", "accroche", "X")).toBe("Bonjour,\n\nX\n\nSuite")
  })
  it("retire la balise si la fiche est trop pauvre", () => expect(appliquerIA("Bonjour,\n\n{{accroche_ia}}\n\nSuite", "accroche", "")).toBe("Bonjour,\n\nSuite"))
  it("remplace le mail entier", () => expect(appliquerIA("Modèle", "mail", "Tout")).toBe("Tout"))
  it("repère une fiche sans rien à citer", () => {
    const r = reglageIADepart("agences")
    expect(fichePauvre(r, { entreprise: "A", secteur: "" })).toBe(true)
    expect(fichePauvre(r, { entreprise: "A", secteur: "Paris" })).toBe(false)
  })
  it("garde toujours la même moitié", () => {
    const r = { ...reglageIADepart("agences"), qui: "moitie" as const }
    expect(concerneIA(r, { id: "abc", champs: {} })).toBe(concerneIA(r, { id: "abc", champs: {} }))
  })
  it("donne à l'IA le contexte, mais seulement les champs autorisés", () => {
    const m = messageIA({ baseId: "agences", reglage: { ...reglageIADepart("agences"), champs: ["entreprise", "secteur"] }, campagneNom: "C", objet: "O", corps: "B", fiche: { entreprise: "Agence A", secteur: "Paris", prenom: "Secret" }, offre: "" })
    expect(m).toContain("Cold emailing")
    expect(m).toContain("Agence A")
    expect(m).not.toContain("Secret")
  })
  it("l'objet écrit par l'IA voyage en première ligne, et part comme objet du mail", () => {
    const t = avecObjetIA("Un relais pour vos travaux", "Bonjour,\n\nTexte")
    expect(t).toBe("Objet : Un relais pour vos travaux\n\nBonjour,\n\nTexte")
    expect(separerObjetIA(t)).toEqual({ objet: "Un relais pour vos travaux", corps: "Bonjour,\n\nTexte" })
    expect(appliquerIA("Modèle", "mail", t)).toBe("Bonjour,\n\nTexte")
    expect(objetIA("Objet du modèle", "mail", t)).toBe("Un relais pour vos travaux")
    expect(objetIA("Objet du modèle", "mail", "Bonjour,\n\nTexte")).toBe("Objet du modèle") // texte relu sans ligne d'objet
    expect(objetIA("Objet du modèle", "accroche", t)).toBe("Objet du modèle")
    expect(avecObjetIA("", "Texte")).toBe("Texte")
    expect(appliquerIA("Modèle", "mail", "Objet : seul\n\n")).toBe("Modèle") // un objet sans mail : le modèle part
  })
  it("le vrai chiffre du secteur : cité à partir de 5, sans chiffre en dessous, rien sinon", () => {
    const t = lireInterventions(JSON.stringify({ depuis: "2026-02-06", cp: { "75016": 34, "75001": 6, "92150": 3 } }))
    expect(faitLocal({ cp: "75016", secteur: "Paris 16" }, t)).toContain("Depuis février 2026, des gestionnaires nous ont confié 34 interventions dans le 16e arrondissement de Paris.")
    expect(faitLocal({ cp: "75001", secteur: "Paris 1" }, t)).toContain("dans le 1er arrondissement de Paris")
    const peu = faitLocal({ cp: "92150", secteur: "Suresnes" }, t)
    expect(peu).toContain("à Suresnes")
    expect(peu).not.toMatch(/\d/)
    expect(faitLocal({ cp: "95000", secteur: "Cergy" }, t)).toBe("")
    expect(faitLocal({ cp: "", secteur: "Paris 16" }, t)).toBe("")
    expect(faitLocal({ cp: "75016", secteur: "Paris 16" }, null)).toBe("")
    expect(lireInterventions("pas du JSON")).toBeNull()
  })
  it("le message donne le fait vrai, le réglage du nom, et jamais le code postal en clair", () => {
    const interventions = { depuis: "2026-02-06", cp: { "75016": 34 } }
    const fiche = { entreprise: "Dupont Immobilier", secteur: "Paris 16", cp: "75016" }
    const m = messageIA({ baseId: "agences", reglage: reglageIADepart("agences"), campagneNom: "C", objet: "O", corps: "B", fiche, offre: "", interventions })
    expect(m).toContain("34 interventions dans le 16e arrondissement")
    expect(m).toContain("seulement là où une personne le ferait")
    expect(m).not.toContain("cp :")
    expect(m).not.toContain("CE QUE PROPOSE STC") // une offre vide ne s'affiche pas
    const jamais = messageIA({ baseId: "agences", reglage: { ...reglageIADepart("agences"), citer: "jamais" }, campagneNom: "C", objet: "O", corps: "B", fiche, offre: "", interventions })
    expect(jamais).not.toContain("34 interventions")
    const sans = messageIA({ baseId: "agences", reglage: reglageIADepart("agences"), campagneNom: "C", objet: "O", corps: "B", fiche: { entreprise: "A", secteur: "Cergy", cp: "95000" }, offre: "" })
    expect(sans).toContain("n'écris aucun chiffre")
  })
  it("avec la fiche des appels, le problème vient du téléphone ; sans elle, de la liste", () => {
    const base = { baseId: "agences", reglage: reglageIADepart("agences"), campagneNom: "C", objet: "O", corps: "B", fiche: { entreprise: "A", secteur: "Paris" }, offre: "" }
    expect(messageIA({ ...base, appels: "1. Ce qui accroche\n- les prestataires débordés" })).toContain("situation (compte les tirets")
    expect(messageIA(base)).not.toContain("compte les tirets")
  })
  it("les consignes interdisent de parler du destinataire à la troisième personne, et demandent l'objet du mail entier", () => {
    expect(consignesIA("mail")).toContain("jamais à parler de lui")
    expect(consignesIA("mail")).toContain("L'objet : 2 à 7 mots")
    expect(consignesIA("accroche")).toContain("Laisse l'objet vide")
  })
})
