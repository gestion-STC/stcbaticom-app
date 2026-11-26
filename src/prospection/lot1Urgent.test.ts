// Lot 1 urgent (26/11/2026) : relance après confirmation, désinscriptions en deux temps, arrêt des agences, faille fermée.
import { describe, expect, it } from "vitest"
import { relanceRetenue, type EnvoiPasse } from "../../supabase/functions/_shared/campagnes/confirmation"
import moteur from "../../supabase/functions/campagnes-moteur/index.ts?raw"
import formulaire from "../../supabase/functions/formulaire-campagne/index.ts?raw"
import lienSt from "../../supabase/functions/lien-st/index.ts?raw"
import recevoir from "../../supabase/functions/recevoir-email/index.ts?raw"
import resend from "../../supabase/functions/resend-evenements/index.ts?raw"
import instantly from "../../supabase/functions/instantly-evenements/index.ts?raw"
import clever from "../../supabase/functions/clever-responder/index.ts?raw"
import page from "../components/public/FormulairePublic.tsx?raw"
import sql from "../../supabase/maj-2026-11-26-lot1-urgent.sql?raw"

const env = (id: string, p: Partial<EnvoiPasse> = {}): EnvoiPasse => ({ id, etape_id: "m1", canal: "mail", statut: "envoye", test: false, le: "2026-11-23T07:00:00Z", ...p })

describe("une relance attend la confirmation du mail d'avant", () => {
  it("premier mail : rien à attendre", () => expect(relanceRetenue([], new Set(), "m1")).toBe(false))
  it("mail confié à Instantly, jamais confirmé : la relance attend (cas des 30 agences du 23/11)", () => {
    expect(relanceRetenue([env("a")], new Set(), "m2")).toBe(true)
  })
  it("mail confirmé parti : la relance part", () => expect(relanceRetenue([env("a")], new Set(["a"]), "m2")).toBe(false))
  it("un mail « non parti » (erreur) ne compte pas ; un renvoi confirmé de la même étape suffit", () => {
    expect(relanceRetenue([env("a", { statut: "erreur" })], new Set(), "m1")).toBe(false)
    expect(relanceRetenue([env("a", { statut: "erreur" }), env("b", { le: "2026-11-30T07:00:00Z" })], new Set(["a"]), "m2")).toBe(false)
  })
  it("c'est le DERNIER mail qui compte, les SMS et les essais n'en sont pas", () => {
    const l = [env("a"), env("b", { etape_id: "m2", le: "2026-11-30T07:00:00Z" }), env("s", { etape_id: "s1", canal: "sms", le: "2026-12-01T07:00:00Z" })]
    expect(relanceRetenue(l, new Set(["a"]), "m3")).toBe(true)
    expect(relanceRetenue(l, new Set(["a", "b"]), "m3")).toBe(false)
    expect(relanceRetenue([env("t", { test: true })], new Set(), "m2")).toBe(false)
  })
  it("le moteur la lit avant chaque envoi, hors entrée, essai, et seulement pour une campagne Instantly (lot 6)", () => {
    expect(moteur).toContain("await attendConfirmation(sb, e.inscriptionId, e.etapeId)")
    expect(moteur).toContain("!nouvelles.has(e.inscriptionId) && e.statut !== \"saute\" && !ligne.mode_test && parInstantly(c)")
    expect(instantly).toContain('update({ statut: "envoye" }).eq("id", envoi).eq("statut", "erreur")')
  })
})

describe("désinscriptions : jamais à l'ouverture d'un lien", () => {
  it("mail d'avis : l'en-tête List-Unsubscribe vise formulaire-campagne, qui accepte le POST en un clic", () => {
    expect(moteur).toContain("const desabo = `${base}/functions/v1/formulaire-campagne?")
    expect(moteur).toContain('"List-Unsubscribe": `<${desabo}>`')
    expect(formulaire).toContain('const unClic = adresse.has("stop") && adresse.has("fc")')
    expect(formulaire).toContain('if (unClic && req.method === "GET") return new Response(null, { status: 302')
  })
  it("la page publique demande de confirmer au lieu de désinscrire au chargement", () => {
    expect(page).toContain('if (q.has("stop")) return () => { vivant = false }')
    expect(page).toContain("Confirmer ma désinscription")
    expect(page.indexOf('action: "desinscrire"')).toBeGreaterThan(page.indexOf("const confirmerStop"))
  })
  it("artisans (lien-st) : le GET montre la page, seul le POST désinscrit", () => {
    const get = lienSt.indexOf('if (req.method !== "POST")'), maj = lienSt.indexOf('statut: "desinscrit"')
    expect(get).toBeGreaterThan(0)
    expect(maj).toBeGreaterThan(get)
    expect(lienSt).toContain('<form method="post"')
  })
})

describe("une agence qui demande l'arrêt est désinscrite", () => {
  it("par réponse (hors réponse automatique) et par plainte", () => {
    expect(recevoir).toContain("const arret = !reponseAutomatique(d.headers) && demandeArret(objet, corpsText);")
    expect(recevoir).toContain('if (!sousTraitantId && agenceId && arret)')
    expect(recevoir).toContain('update({ ne_plus_ecrire_le: new Date().toISOString() }).eq("id", agenceId).is("ne_plus_ecrire_le", null)')
    expect(resend).toContain('if (type === "email.complained" && !envoi && resendId)')
    expect(resend).toContain('update({ ne_plus_ecrire_le: quand }).eq("id", agenceId).is("ne_plus_ecrire_le", null)')
  })
  it("Resend : sans secret de signature, tout appel est refusé", () => {
    expect(resend).toContain('if (!secret) {')
    expect(resend).not.toContain("if (secret && !(await signatureValide")
  })
})

describe("faille et réparation", () => {
  it("l'ancien relais Ringover répond 410 à tout", () => {
    expect(clever).toContain('Deno.serve(() => new Response("Gone", { status: 410 }))')
    expect(clever).not.toMatch(/stc-wh-|appels_entrants|fetch\(/)
  })
  it("le SQL ne supprime rien et se contrôle", () => {
    expect(sql).not.toMatch(/\bdelete\b|\btruncate\b|\bdrop\s+(table|column|function|trigger)/i)
    expect(sql).toContain("envois_non_partis")
    expect(sql).toContain("artisans_reactives")
  })
})
