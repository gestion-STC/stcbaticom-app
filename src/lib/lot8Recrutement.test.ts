// Lot 8 (27/11/2026) : recrutement — contrats DocuSign, lien d'accès, formation, fiches artisans, Dashboard sous-traitants,
// machine des artisans abandonnée (décision 12).
import { describe, expect, it } from "vitest"
import { estDemo } from "../../supabase/functions/_shared/docusign"
import { lireReponseAcces, statutDepuisEnveloppe } from "../../supabase/functions/_shared/contratsPurs"
import { bonneAuTirage, questionsComptees } from "../../supabase/functions/_shared/formationST"
import { fraicheurStc, lignesSt, missionsA, mouvementsSt, type SousTraitantStc } from "./cockpitStc"
import { estLigneRebond } from "./sousTraitantsDb"
import { texteLienAcces } from "./contratsDb"
import { pageAutorisee } from "./carteMenu"
import contratSigne from "../../supabase/functions/_shared/contratSigne.ts?raw"
import evenements from "../../supabase/functions/docusign-evenements/index.ts?raw"
import envoyer from "../../supabase/functions/docusign-envoyer/index.ts?raw"
import formation from "../../supabase/functions/formation-st/index.ts?raw"
import app from "../App.tsx?raw"
import fiche from "../components/recrutement/FicheArtisan.tsx?raw"
import tableauDb from "./tableauStDb.ts?raw"
import sql from "../../supabase/maj-2026-11-27-f8.sql?raw"

describe("D77 : le compte DocuSign de démonstration se voit et ne part pas en silence", () => {
  it("reconnaît la démo (adresse ou hôte d'authentification) et le réel", () => {
    expect(estDemo({ baseUri: "https://demo.docusign.net", oauthHost: "account-d.docusign.com" })).toBe(true)
    expect(estDemo({ baseUri: "https://demo.docusign.net", oauthHost: "account.docusign.com" })).toBe(true)
    expect(estDemo({ baseUri: "https://eu.docusign.net", oauthHost: "account.docusign.com" })).toBe(false)
    expect(estDemo({ baseUri: "https://na3.docusign.net", oauthHost: "account-d.docusign.com" })).toBe(true)
  })
  it("l'envoi refuse la démo sans « envoi d'essai » coché, et marque l'envoi d'essai", () => {
    expect(envoyer).toMatch(/if \(demo && !corps\.accepter_demo\) return json\(/)
    expect(envoyer).toContain("DocuSign DÉMO (sans valeur)")
  })
  it("pas de lien d'accès automatique sur un contrat de démonstration", () => {
    expect(contratSigne).toMatch(/if \(estDemo\(config\)\) \{[\s\S]{0,300}lien d'accès non envoyé automatiquement/)
  })
})

describe("D78 / D79 : la réponse de STC Bâtiment au lien d'accès", () => {
  const T = "2026-11-27T10:00:00.000Z"
  it("compte déjà ouvert : aucun lien, accès ouvert", () => {
    expect(lireReponseAcces(true, 200, { ok: true, deja_ouvert: true, destinataire: "a@b.fr", ouvert_le: "2026-10-22T13:29:28Z" }, "a@b.fr", T))
      .toEqual({ ok: true, dejaOuvert: true, destinataire: "a@b.fr", ouvertLe: "2026-10-22T13:29:28Z" })
    expect(lireReponseAcces(true, 200, { ok: true, deja_ouvert: true }, "a@b.fr", T)).toMatchObject({ ok: true, dejaOuvert: true, ouvertLe: T })
  })
  it("mail pas parti = échec, plus un « ok »", () => {
    const r = lireReponseAcces(true, 200, { ok: true, envoye: false, destinataire: "a@b.fr" }, "a@b.fr", T)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.erreur).toMatch(/n'est pas parti/)
  })
  it("envoi normal, et refus de STC", () => {
    expect(lireReponseAcces(true, 200, { ok: true, envoye: true, destinataire: "a@b.fr", url: "u" }, "a@b.fr", T)).toEqual({ ok: true, destinataire: "a@b.fr", url: "u" })
    expect(lireReponseAcces(false, 401, { error: "clé" }, "a@b.fr", T)).toEqual({ ok: false, erreur: "STC Bâtiment répond 401 : clé" })
  })
  it("l'écran dit « déjà ouvert » au lieu de « lien envoyé »", () => {
    expect(texteLienAcces({ destinataire: "a@b.fr", dejaOuvert: true })).toMatch(/déjà son compte STC Bâtiment/)
    expect(texteLienAcces({ destinataire: "a@b.fr", dejaOuvert: false })).toBe("Lien « ouvrir mon accès » envoyé à a@b.fr, copie à STC.")
  })
})

describe("D80 / D81 / D83 : un seul traitement de la signature", () => {
  it("la date de signature est celle de DocuSign, l'artisan reste daté", () => {
    const e = { status: "completed", completedDateTime: "2026-11-20T09:00:00Z", recipients: { signers: [{ recipientId: "1", status: "completed", signedDateTime: "2026-10-13T08:00:00Z" }] } }
    expect(statutDepuisEnveloppe(e, "2026-11-27T10:00:00Z")).toEqual({ statut: "signe", signeArtisanLe: "2026-10-13T08:00:00Z", signeLe: "2026-11-20T09:00:00Z" })
    expect(statutDepuisEnveloppe({ status: "sent", recipients: { signers: [{ recipientId: "1", status: "completed", signedDateTime: "x" }] } }, "t").statut).toBe("signe_artisan")
  })
  it("passage à « signé » conditionnel, erreur vidée, retour arrière si la passe gagnante échoue", () => {
    expect(contratSigne).toMatch(/update\(\{ statut: "signe",[^)]*erreur: "" \}\)\s*\.eq\("id", contrat\.id\)\.neq\("statut", "signe"\)\.select\("id"\)/)
    expect(contratSigne).toMatch(/if \(!gagne\?\.length\)/)
    expect(contratSigne).toMatch(/update\(\{ statut: contrat\.statut, signe_le: null, erreur:/)
  })
  it("les retours DocuSign et « Relire » passent par le même traitement", () => {
    expect(evenements).toContain("traiterEnveloppe(sb, config, jeton, envelopeId")
    expect(envoyer).toContain("traiterEnveloppe(sb, config, jeton, corps.envelope_id")
    expect(envoyer).not.toMatch(/signe_le: etat\.signeLe/)
  })
})

describe("D84 : formation, questions modifiées pendant un essai", () => {
  it("une question supprimée et pas répondue ne bloque plus l'essai", () => {
    expect(questionsComptees(["a", "b", "c"], { a: { juste: true } }, ["a", "c"])).toEqual(["a", "c"])
    expect(questionsComptees(["a", "b"], { b: { juste: false } }, ["a"])).toEqual(["a", "b"]) // répondue puis supprimée : comptée
  })
  it("la bonne réponse est celle du tirage", () => {
    expect(bonneAuTirage({ a: "Ancienne" }, "a", "Corrigée")).toBe("Ancienne")
    expect(bonneAuTirage(undefined, "a", "Actuelle")).toBe("Actuelle")
    expect(formation).toContain("bonnes: Object.fromEntries(tirees.map((q) => [q.id, q.bonne]))")
  })
})

describe("Décision 12 : la machine des artisans est abandonnée", () => {
  it("ses écrans sont retirés, Contrats et Liste d'exclusion restent dans Réglages (administrateurs)", () => {
    expect(app).not.toMatch(/MachineST|SequencesST|ReglagesMachineST/)
    expect(pageAutorisee("parametrage", ["recrutement"], false)).toBe(true)
    expect(fiche).not.toMatch(/>Relancer maintenant<|>Mettre en pause<|relancerMaintenant|mettreEnPause/)
  })
  it("la tâche planifiée est mise à l'arrêt, sans être effacée", () => {
    expect(sql).toMatch(/cron\.alter_job\(job_id := jobid, active := false\)[\s\S]*jobname = 'sequenceur-st'/)
    expect(sql).not.toMatch(/cron\.unschedule|drop /i)
  })
})

describe("D86 : rebond", () => {
  it("reconnaît une ligne de rebond, jamais une désinscription", () => {
    expect(estLigneRebond("adresse e-mail injoignable (rebond)")).toBe(true)
    expect(estLigneRebond("désinscription via Instantly")).toBe(false)
    expect(estLigneRebond(null)).toBe(false)
  })
})

describe("D100 : une lecture en échec n'annonce plus « machine arrêtée » ni zéro", () => {
  it("les lectures secondaires sont nommées dans un bandeau", () => {
    expect(tableauDb).not.toMatch(/\.catch\(\(\) =>/)
    expect(tableauDb).toContain(`repli("l'état de la machine", null)`)
  })
})

describe("D101 / D102 / D103 : sous-traitants de STC Bâtiment", () => {
  const st = (nom: string, missions: string[], compte_actif = true): SousTraitantStc => ({ nom, compte_actif, missions: missions.map((j) => [j, 100] as [string, number]), paye_30: 0, paye_30_60: 0 })
  const m = new Date(2026, 10, 26, 14, 0) // 26/11/2026 14 h
  it("30 jours exactement, sans jour partagé avec les 30 d'avant", () => {
    const l: [string, number][] = [["2026-10-27", 1], ["2026-10-28", 1], ["2026-11-26", 1]]
    expect(missionsA(l, m).n).toBe(2) // 28/10 → 26/11
    expect(missionsA(l, m, 30).n).toBe(1) // 27/10 tombe dans les 30 j d'avant, et là seulement
  })
  it("un compte fermé qui travaillait le mois d'avant est « sorti », et compte dans les fins de mois passées", () => {
    const tabi = st("PCM TABI", ["2026-09-13", "2026-10-11"], false)
    const ferme = st("Fermé sans rien", ["2026-05-01"], false)
    expect(lignesSt([tabi], m)[0].statut).toBe("sorti")
    expect(lignesSt([ferme], m)[0].statut).toBe("inactif")
    const mv = mouvementsSt([tabi], m)
    expect(mv.find((x) => x.mois === "2026-10")?.actifs).toBe(1)
    expect(mv.find((x) => x.mois === "2026-11")?.sortis).toEqual(["PCM TABI"])
  })
  it("dit depuis quand les chiffres STC datent, en alerte au-delà de 2 h", () => {
    expect(fraicheurStc("2026-11-26T12:17:00", m)).toMatchObject({ vieux: false })
    expect(fraicheurStc("2026-11-26T11:00:00", m)?.vieux).toBe(true)
    expect(fraicheurStc("2026-11-26T12:17:00", m)?.texte).toMatch(/^chiffres STC du 26\/11 à 12:17$/)
    expect(fraicheurStc(null, m)).toBeNull()
  })
})
