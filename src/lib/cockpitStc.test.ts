// Le cockpit, chiffres de STC Bâtiment : statut des agences à chaque fin de mois, mouvements, OS, CA à jours égaux, sous-traitants.
import { describe, expect, it } from "vitest"
import { SEUILS_DEPART, statutAgence } from "./croissance"
import { activeA, caMoisCompare, compteursA, estActif, finsDeMois, intervalleOs, lignesAgences, lignesSt, lireChiffres, mouvementsAgences, mouvementsSt, osRecus, type AgenceBrute, type SousTraitantStc } from "./cockpitStc"

const m = new Date(2026, 10, 26, 12, 40) // jeudi 26/11/2026 12:40
const iso = (a: number, mo: number, j: number, h = 10) => new Date(a, mo, j, h).toISOString()
/** Une agence qui envoie `n` OS et facture `ht` € par OS, un OS tous les `pas` jours, du jour `de` au jour `a` (non compris). */
function agence(nom: string, de: Date, a: Date, pas: number, ht: number): AgenceBrute {
  const os: string[] = [], factures: [string, number][] = []
  for (let d = new Date(de); d < a; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + pas)) {
    os.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10).toISOString())
    factures.push([`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, ht])
  }
  const c = compteursA({ os, factures }, m)
  return { nom, ...c, dernier_os_le: os[os.length - 1] ?? null, mois: [], os, factures }
}

describe("les compteurs d'une agence à une date", () => {
  it("OS sur 30 jours et les 30 d'avant, facturé au jour", () => {
    const a = { os: [iso(2026, 9, 20), iso(2026, 9, 29), iso(2026, 10, 2), iso(2026, 10, 25)], factures: [["2026-10-31", 500], ["2026-11-01", 700], ["2026-10-01", 9999]] as [string, number][] }
    expect(compteursA(a, new Date(2026, 10, 30))).toEqual({ os_30: 2, os_30_60: 2, facture_30: 1200 }) // 31/10 → 30/11 : le 02/11 et le 25/11
    // À la fin d'octobre (le 1er novembre à minuit), la facture du 01/11 ne compte pas encore.
    expect(compteursA(a, new Date(2026, 10, 1)).facture_30).toBe(500)
  })
  it("la règle validée (statutAgence) appliquée à la date", () => {
    const a = agence("A", new Date(2026, 9, 1), new Date(2026, 10, 26), 5, 300)
    expect(activeA(a, new Date(2026, 10, 1), SEUILS_DEPART)).toBe(true)
    expect(activeA(a, new Date(2026, 9, 1), SEUILS_DEPART)).toBe(false) // pas encore d'OS
  })
})

describe("les fins de mois et les mouvements", () => {
  it("le 1er du mois suivant pour les mois clos, maintenant pour le mois en cours", () => {
    const f = finsDeMois("2026-09", m)
    expect(f.map((x) => x.mois)).toEqual(["2026-09", "2026-10", "2026-11"])
    expect(f[0].fin).toEqual(new Date(2026, 9, 1))
    expect(f[2].fin).toBe(m)
  })
  it("nouvelle, revenue, décrochée, et le mois en cours jugé avec les compteurs de STC", () => {
    const fidele = agence("Fidèle", new Date(2026, 4, 1), new Date(2026, 10, 26), 4, 400) // active dès fin mai
    const partie = agence("Partie", new Date(2026, 6, 1), new Date(2026, 8, 10), 3, 500) // active fin juillet, août ; plus fin sept.
    const revient = { ...agence("Revient", new Date(2026, 5, 1), new Date(2026, 6, 15), 3, 500) }
    const r2 = agence("Revient", new Date(2026, 9, 15), new Date(2026, 10, 25), 3, 500)
    const revenue: AgenceBrute = { ...r2, os: [...revient.os!, ...r2.os!], factures: [...revient.factures!, ...r2.factures!] }
    const actives = new Set(["Fidèle", "Revient"])
    const { mois, dejaActives } = mouvementsAgences([fidele, partie, revenue], "2026-03-01", m, SEUILS_DEPART, actives)
    expect(mois.map((x) => x.mois)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"])
    const par = Object.fromEntries(mois.map((x) => [x.mois, x]))
    expect(par["2026-06"].nouvelles).toEqual(["Revient"])
    expect(par["2026-07"].nouvelles).toEqual(["Partie"])
    expect(par["2026-07"].decrochees).toEqual(["Revient"]) // fin juillet : 4 OS contre 10 les 30 jours d'avant, en chute
    expect(par["2026-09"].decrochees).toEqual(["Partie"])
    expect(par["2026-10"].revenues).toEqual(["Revient"])
    expect(par["2026-11"].actives).toBe(2)
    expect(dejaActives.has("Partie")).toBe(true)
    // La ligne de suivi : « Partie » est décrochée (déjà active), pas « pas active ».
    const l = lignesAgences([partie], SEUILS_DEPART, dejaActives, ["2026-11"], m)
    expect(l[0].statut).toBe("decrochee")
  })
  it("à surveiller : active mais silencieuse depuis plus de 2 fois son rythme ; en chute : pas comptée active", () => {
    const a = agence("Silence", new Date(2026, 9, 20), new Date(2026, 10, 13), 2, 300) // un OS tous les 2 jours, rien depuis le 12/11
    expect(statutAgence(a, SEUILS_DEPART).active).toBe(true)
    expect(lignesAgences([a], SEUILS_DEPART, new Set(), [], m)[0].statut).toBe("surveiller")
    const chute: AgenceBrute = { nom: "Chute", os_30: 2, os_30_60: 8, facture_30: 2000, dernier_os_le: iso(2026, 10, 25), mois: [], os: [], factures: [] }
    expect(lignesAgences([chute], SEUILS_DEPART, new Set(), [], m)[0].statut).toBe("chute")
  })
  it("le rythme : l'écart moyen entre deux OS sur 90 jours", () => {
    expect(intervalleOs([iso(2026, 10, 1), iso(2026, 10, 11), iso(2026, 10, 21)], m)).toBe(10)
    expect(intervalleOs([iso(2026, 10, 1)], m)).toBeNull()
  })
})

describe("les OS reçus et le CA à jours égaux", () => {
  it("la semaine contre la semaine dernière À LA MÊME HEURE", () => {
    const os = [iso(2026, 10, 23, 9), iso(2026, 10, 26, 9), iso(2026, 10, 16, 9), iso(2026, 10, 19, 11), iso(2026, 10, 19, 13), iso(2026, 10, 20, 9)]
    const r = osRecus(os, m)
    expect(r.semaine).toBe(2)
    expect(r.semaineAvant).toBe(2) // lundi 16 → jeudi 19 12:40 : le 16 à 9 h et le 19 à 11 h ; pas le 19 à 13 h ni le 20
    expect(r.jour).toBe(1)
    expect(r.semaines).toHaveLength(12)
    expect(r.semaines[11].n).toBe(2)
  })
  it("le mois en cours contre le mois d'avant du 1er au même quantième", () => {
    const j: [string, number][] = [["2026-11-01", 100], ["2026-11-26", 50], ["2026-10-26", 30], ["2026-10-27", 999], ["2026-10-01", 20], ["2026-09-30", 5]]
    expect(caMoisCompare(j, m)).toEqual({ mois: 150, avantMemesJours: 50, jusquAu: 26 })
    // Le 31 mars, comparé au 28 février.
    expect(caMoisCompare([["2027-02-28", 10], ["2027-03-31", 1]], new Date(2027, 2, 31, 12)).jusquAu).toBe(28)
  })
  it("lit la passerelle : ancien format, illisible, vide", () => {
    expect(lireChiffres(null)).toBeNull()
    expect(lireChiffres("{x")).toBeNull()
    expect(lireChiffres(JSON.stringify({ version: 1, agences: [] }))).toBeNull()
    expect(lireChiffres(JSON.stringify({ version: 2, calcule_le: "x", mois: [], particuliers: [], agences: [] }))?.version).toBe(2)
  })
})

describe("les sous-traitants (définitions validées le 26/11/2026)", () => {
  const st = (nom: string, missions: string[], compte_actif = true): SousTraitantStc => ({ nom, compte_actif, missions: missions.map((j) => [j, 100] as [string, number]), paye_30: 0, paye_30_60: 0 })
  const sts = [
    st("Nouveau", ["2026-11-05", "2026-11-20"]),
    st("Fidèle", ["2026-09-10", "2026-10-15", "2026-11-10"]),
    st("Revenu", ["2026-06-01", "2026-11-12"]),
    st("Sorti", ["2026-10-20"]), // actif fin octobre, plus rien depuis 30 jours au 26/11
    st("Fermé", ["2026-11-15"], false),
    st("Jamais", []),
    st("Vieux", ["2026-03-01"]),
  ]
  it("le statut de chacun, compte fermé non compté actif", () => {
    const l = Object.fromEntries(lignesSt(sts, m).map((x) => [x.nom, x.statut]))
    expect(l).toEqual({ Nouveau: "nouveau", Fidèle: "actif", Revenu: "revenu", Sorti: "sorti", Fermé: "ferme", Jamais: "jamais", Vieux: "inactif" })
    expect(lignesSt(sts, m).filter(estActif).map((x) => x.nom).sort()).toEqual(["Fidèle", "Nouveau", "Revenu"])
    expect(lignesSt(sts, m)[0].statut).toBe("sorti") // les sortis en tête
  })
  it("missions et montant sur 30 jours, et les 30 d'avant", () => {
    const f = lignesSt([st("Fidèle", ["2026-09-10", "2026-10-15", "2026-11-10"])], m)[0]
    expect([f.missions30, f.missions30Avant, f.montant30, f.total]).toEqual([1, 1, 100, 3])
  })
  it("les mouvements du mois : nouveaux, revenus, sortis, actifs en fin de mois", () => {
    const mv = mouvementsSt(sts, m)
    const nov = mv[mv.length - 1], oct = mv[mv.length - 2]
    expect(nov.mois).toBe("2026-11")
    expect(nov.nouveaux).toEqual(["Nouveau"])
    expect(nov.revenus).toEqual(["Revenu"])
    expect(nov.sortis).toEqual(["Sorti"])
    expect(nov.actifs).toBe(3)
    expect(oct.actifs).toBe(2) // Fidèle et Sorti à la fin d'octobre
  })
})
