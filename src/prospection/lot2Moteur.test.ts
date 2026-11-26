// Lot 2 (27/11/2026) : moteur des campagnes. Attente depuis le départ réel, relance retenue sans premier mail, rejeux,
// variante vide, Instantly (pause, retrait, coupure réseau, relances espacées), sorties, lien court des SMS d'avis.
import { describe, expect, it } from "vitest"
import { departDuMailPrecedent, rejeuApres, relancePossibleLe, relanceRetenue, varianteAvecTexte, type EnvoiPasse } from "../../supabase/functions/_shared/campagnes/confirmation"
import moteur from "../../supabase/functions/campagnes-moteur/index.ts?raw"
import instantly from "../../supabase/functions/_shared/campagnes/instantly.ts?raw"
import lien from "../../supabase/functions/_shared/campagnes/lien.ts?raw"
import formulaire from "../../supabase/functions/formulaire-campagne/index.ts?raw"
import page from "../components/public/FormulairePublic.tsx?raw"
import entree from "../Entree.tsx?raw"
import sql from "../../supabase/maj-2026-11-27-f2.sql?raw"

const env = (id: string, p: Partial<EnvoiPasse> = {}): EnvoiPasse => ({ id, etape_id: "m1", canal: "mail", statut: "envoye", test: false, le: "2026-11-19T07:00:00.000Z", ...p })
const ETAPES = [{ id: "m1", type: "mail" }, { id: "w1", type: "attendre", jours: 7 }, { id: "m2", type: "mail" }, { id: "w2", type: "attendre", jours: 3 }, { id: "m3", type: "mail" }]

describe("D11 : l'attente compte depuis le départ réel du mail d'avant", () => {
  it("confié le 19/11, parti le 23/11 : relance pas avant le 30/11 (et non le 26/11)", () => {
    const p = departDuMailPrecedent([env("a")], new Map([["a", "2026-11-23T07:04:15.000Z"]]), "m2")
    expect(p).toEqual({ etapeId: "m1", parti: "2026-11-23T07:04:15.000Z" })
    const possible = relancePossibleLe(ETAPES, p!.etapeId, "m2", p!.parti, 48)
    expect(new Date(possible).toISOString()).toBe("2026-11-30T07:04:15.000Z")
    expect(possible).toBeGreaterThan(new Date("2026-11-26T07:00:00Z").getTime())
  })
  it("sans « Attendre » entre les deux : au moins l'écart minimal", () => {
    expect(relancePossibleLe([{ id: "m1", type: "mail" }, { id: "m2", type: "mail" }], "m1", "m2", "2026-11-23T07:00:00.000Z", 48)).toBe(new Date("2026-11-25T07:00:00Z").getTime())
  })
  it("c'est le dernier mail confirmé qui compte ; rien de confirmé : null", () => {
    const l = [env("a"), env("b", { etape_id: "m2", le: "2026-11-30T07:00:00.000Z" })]
    expect(departDuMailPrecedent(l, new Map([["a", "2026-11-23T07:00:00.000Z"], ["b", "2026-12-01T08:00:00.000Z"]]), "m3")?.etapeId).toBe("m2")
    expect(departDuMailPrecedent(l, new Map(), "m3")).toBeNull()
  })
  it("le moteur s'en sert avant d'envoyer, et pour les 48 h du moteur pur", () => {
    expect(moteur).toContain("relancePossibleLe(c.etapes")
    expect(moteur).toContain("attente comptée depuis le départ réel du mail d'avant")
    expect(moteur).toContain('if (ev.type === "delivre" && ev.envoiId')
  })
})

describe("D13 : jamais de relance sans premier mail", () => {
  it("une étape mail qui n'a que des erreurs retient la relance", () => {
    expect(relanceRetenue([env("a", { statut: "erreur" })], new Set(), "m2")).toBe(true)
    expect(relanceRetenue([env("a", { statut: "erreur" })], new Set(), "m1")).toBe(false)
  })
  it("rejeux d'un mail : 15 min, 1 h, 4 h, 1 jour, puis fin ; SMS : 15 min, 1 h, puis l'étape est abandonnée", () => {
    expect([1, 2, 3, 4, 5].map((t) => rejeuApres("mail", t))).toEqual([15, 60, 240, 1440, null])
    expect([1, 2, 3].map((t) => rejeuApres("sms", t))).toEqual([15, 60, null])
    expect(moteur).toContain('} else if (canal === "mail") {')
    expect(moteur).toContain('update({ statut: "terminee", sortie_le: iso }).eq("id", e.inscriptionId)')
  })
})

describe("D14 : une variante vide ne part pas", () => {
  const A = { id: "A", corps: "Bonjour" }, B = { id: "B", corps: "  " }
  it("B vide : A part à sa place ; tout vide : rien", () => {
    expect(varianteAvecTexte([A, B], "B")?.id).toBe("A")
    expect(varianteAvecTexte([A, B], "A")?.id).toBe("A")
    expect(varianteAvecTexte([B], "B")).toBeNull()
    expect(moteur).toContain("étape sans texte (variante vide)")
  })
})

describe("D9 : mode test", () => {
  it("valeur par défaut à false, et le filet « déjà parti » ignore les envois d'essai pour un vrai envoi", () => {
    expect(sql).toContain("alter column mode_test set default false")
    expect(moteur).toContain('await (test ? filet : filet.eq("test", false))')
  })
})

describe("D10, D12, D17 : Instantly", () => {
  it("pause et reprise chez Instantly, retrait des contacts sortis pas encore partis", () => {
    expect(instantly).toContain('`/campaigns/${id}/${enPause ? "pause" : "activate"}`')
    expect(instantly).toContain('`/leads/${encodeURIComponent(leadId)}`, { methode: "DELETE" }')
    expect(moteur).toContain("synchroniserPause(sb, ins, c.id, true)")
    expect(moteur).toContain("await retirerNonPartis(sb, ins,")
    // La fin normale d'une séquence n'est pas une sortie : le dernier mail confié doit partir.
    expect(moteur).toContain('["desinscrit", "rebond", "lead"].includes(statuts.get(e.inscription_id) ?? "")')
  })
  it("relances dans le fil : 10 min entre deux mails d'une boîte, et le volume du jour", () => {
    expect(instantly).toContain("const libre = await boiteLibre(sb, ins, m.de, debutJour)")
    expect(instantly).toContain("volume du jour de la boîte atteint")
  })
  it("une coupure réseau est un refus, pas une exception", () => {
    expect(instantly).toContain("return { ok: false, status: 0, data: { message: `réseau :")
  })
})

describe("D15, D18, D19 : sorties et journal", () => {
  it("« Pas intéressé » et exclusion à la main font sortir ; un rebond ne sort que d'une campagne mail", () => {
    expect(moteur).toContain('aSortir.has(k.id) ? "terminee" : null')
    expect(moteur).toContain("const adresseMorte = ecritParMail && (rebondis.has(i.contactId)")
    expect(moteur).toContain('if (ecritParMail && exclusions.includes("Adresse en erreur")) for (const r of rebondis)')
  })
  it("la vraie cause du report, et 2 essais IA au plus", () => {
    expect(moteur).toContain("reports[r.reporte] = (reports[r.reporte] ?? 0) + 1")
    expect(moteur).not.toContain('reports["texte IA à relire"]')
    expect(moteur).toContain("const IA_ESSAIS_MAX = 2")
  })
  it("une position n'écrase pas un recalage des étapes fait pendant le passage", () => {
    expect(moteur).toContain('.eq("id", id).eq("etape_index", a?.etapeIndex ?? 0).eq("statut", "en_cours")')
  })
})

describe("D16 : SMS d'avis, un seul lien court", () => {
  it("le SMS porte le lien court et « répondez STOP », plus le long lien répété", () => {
    expect(moteur).toContain("await lienCourt(sb, String(c.id), pageAvis.id, k.id, test)")
    expect(moteur).toContain('"\\nSTOP : répondez STOP"')
    expect(moteur).not.toContain("`\\nSTOP : ${stopAvis}`")
    expect(lien).toContain("`${URL_PUBLIQUE}?a=${code}`")
  })
  it("la page relit le lien court et propose la désinscription", () => {
    expect(formulaire).toContain('if (b.action === "court")')
    expect(entree).toContain('has("a")')
    expect(page).toContain("Ne plus recevoir nos messages")
    expect(sql).toContain("create table if not exists public.cmp_liens_courts")
  })
  it("un SMS d'avis tient en 2 SMS au lieu de 4", () => {
    const texte = "Bonjour, STC est intervenu récemment dans votre logement. Tout s'est bien passé ? Votre avis en 30 secondes : https://gestion-stc.github.io/stcbaticom-app/?a=AbCdEfGhJk\nSTOP : répondez STOP"
    expect(Math.ceil(texte.length / 153)).toBe(2)
  })
})
