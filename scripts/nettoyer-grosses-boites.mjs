#!/usr/bin/env node
/**
 * nettoyer-grosses-boites.mjs — décision Mahdi 05/08/2026 :
 * le recrutement ST ne vise que les artisans/TPE. On enrichit chaque prospect
 * via l'annuaire officiel (API Recherche d'entreprises, recherche-entreprises.api.gouv.fr)
 * et on EXCLUT (statut 'exclu' → plus aucun envoi) :
 *   - effectif ≥ 10 salariés (tranches INSEE 11 et au-delà), OU
 *   - catégorie ETI / GE.
 * S'applique aussi aux prospects déjà en séquence (stoppe leurs relances).
 * Les entreprises INTROUVABLES ou sans effectif connu → liste CSV pour arbitrage
 * manuel de Mahdi (elles ne sont PAS exclues automatiquement).
 *
 * Usage : node scripts/nettoyer-grosses-boites.mjs --appliquer
 *         (sans --appliquer : analyse seule, rien n'est écrit)
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { tmpdir, homedir } from "node:os"

const K = readFileSync(resolve(tmpdir(), "stcbaticom-sk.txt"), "utf8").replace(/^﻿/, "").trim()
const U = "https://ifvrmsiwlwppinfdmeao.supabase.co"
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" }
const APPLIQUER = process.argv.includes("--appliquer")
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

// Tranches INSEE ≥ 10 salariés
const TRANCHES_10_PLUS = new Set(["11", "12", "21", "22", "31", "32", "41", "42", "51", "52", "53"])
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\b(sas|sasu|sarl|eurl|sa|sci|scop|ste|societe|ets|entreprise)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()

// Charge les prospects encore actifs
let sts = [], de = 0
for (;;) {
  const lot = await fetch(`${U}/rest/v1/st_sous_traitants?select=id,entreprise,statut,zone&statut=in.(a_contacter,en_sequence)&order=cree_le`, { headers: { ...H, Range: `${de}-${de + 999}` } }).then((r) => r.json())
  sts.push(...lot)
  if (lot.length < 1000) break
  de += 1000
}
console.log(`Prospects à vérifier : ${sts.length}`)

const exclusions = [], introuvables = [], gardes = []
let i = 0
for (const st of sts) {
  i++
  if (i % 100 === 0) console.log(`  … ${i}/${sts.length} (exclus: ${exclusions.length}, introuvables: ${introuvables.length})`)
  const nom = String(st.entreprise || "").trim()
  if (!nom) { introuvables.push({ ...st, raison: "nom vide" }); continue }
  try {
    const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(nom)}&per_page=3`)
    if (r.status === 429) { await pause(2000); i--; continue } // trop vite : on retentera ce prospect
    const d = await r.json().catch(() => ({}))
    const resultats = Array.isArray(d?.results) ? d.results : []
    // Meilleur candidat = nom normalisé qui se recouvre réellement
    const cible = norm(nom)
    const hit = resultats.find((e) => {
      const n1 = norm(e?.nom_complet), n2 = norm(e?.nom_raison_sociale)
      return (n1 && (n1.includes(cible) || cible.includes(n1))) || (n2 && (n2.includes(cible) || cible.includes(n2)))
    })
    if (!hit) { introuvables.push({ ...st, raison: "aucune correspondance fiable" }); await pause(220); continue }
    const tranche = String(hit.tranche_effectif_salarie ?? "")
    const categorie = String(hit.categorie_entreprise ?? "")
    const effectifConnu = TRANCHES_10_PLUS.has(tranche) || ["00", "01", "02", "03", "NN"].includes(tranche)
    const grosse = TRANCHES_10_PLUS.has(tranche) || categorie === "ETI" || categorie === "GE"
    if (grosse) exclusions.push({ ...st, tranche, categorie, officiel: hit.nom_complet })
    else if (effectifConnu || categorie === "PME") gardes.push(st.id)
    else introuvables.push({ ...st, raison: `effectif inconnu (tranche ${tranche || "vide"})` })
  } catch {
    introuvables.push({ ...st, raison: "erreur annuaire" })
  }
  await pause(220) // ≤ ~4,5 req/s, sous la limite de l'API publique (7/s)
}

console.log(`\nBILAN : ${gardes.length} gardés (< 10 salariés) | ${exclusions.length} à exclure | ${introuvables.length} à arbitrer`)
const enSeqExclues = exclusions.filter((e) => e.statut === "en_sequence").length
console.log(`Dont déjà en séquence à stopper : ${enSeqExclues}`)

// Rapports CSV (Downloads)
const csv = (rows, cols) => "﻿" + cols.join(";") + "\r\n" + rows.map((r) => cols.map((c) => String(r[c] ?? "").replace(/[;\r\n]+/g, " ")).join(";")).join("\r\n")
writeFileSync(resolve(homedir(), "Downloads", "st-exclus-grosses-boites.csv"),
  csv(exclusions, ["entreprise", "officiel", "tranche", "categorie", "statut", "zone"]), "utf8")
writeFileSync(resolve(homedir(), "Downloads", "st-a-arbitrer-introuvables.csv"),
  csv(introuvables, ["entreprise", "raison", "statut", "zone", "id"]), "utf8")
console.log("CSV écrits : Downloads/st-exclus-grosses-boites.csv + st-a-arbitrer-introuvables.csv")

if (!APPLIQUER) { console.log("\nANALYSE seule — rien écrit en base."); process.exit(0) }

let n = 0
for (const e of exclusions) {
  const r = await fetch(`${U}/rest/v1/st_sous_traitants?id=eq.${e.id}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ statut: "exclu" }),
  })
  if (r.ok) n++
}
console.log(`✅ ${n} prospects exclus (statut 'exclu' → plus aucun envoi, séquences stoppées).`)
