#!/usr/bin/env node
/**
 * nettoyer-non-mobiles.mjs — critère Mahdi 05/08/2026 :
 * profil recruté = ARTISAN → son numéro est un MOBILE (06/07).
 * Tout prospect dont le téléphone n'est pas un mobile français (fixe 01-05/09,
 * vide ou invalide) passe en statut 'exclu' → plus aucun envoi, séquence stoppée.
 *
 * Usage : node scripts/nettoyer-non-mobiles.mjs [--appliquer]
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { tmpdir, homedir } from "node:os"

const K = readFileSync(resolve(tmpdir(), "stcbaticom-sk.txt"), "utf8").replace(/^﻿/, "").trim()
const U = "https://ifvrmsiwlwppinfdmeao.supabase.co"
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" }
const APPLIQUER = process.argv.includes("--appliquer")

// Même normalisation que le filtre SMS du séquenceur : mobile FR = 336/337.
function estMobileFR(n) {
  let d = String(n || "").replace(/\D/g, "")
  if (d.startsWith("00")) d = d.slice(2)
  if (d.length === 12 && d.startsWith("330")) d = "33" + d.slice(3)
  else if (d.length === 10 && d.startsWith("0")) d = "33" + d.slice(1)
  return /^33[67]\d{8}$/.test(d)
}

let sts = [], de = 0
for (;;) {
  const lot = await fetch(`${U}/rest/v1/st_sous_traitants?select=id,entreprise,telephone,email,statut,zone&statut=in.(a_contacter,en_sequence)&order=cree_le`, { headers: { ...H, Range: `${de}-${de + 999}` } }).then((r) => r.json())
  sts.push(...lot)
  if (lot.length < 1000) break
  de += 1000
}
const gardes = sts.filter((s) => estMobileFR(s.telephone))
const exclus = sts.filter((s) => !estMobileFR(s.telephone))
const enSeqStop = exclus.filter((s) => s.statut === "en_sequence")
console.log(`Base active : ${sts.length}`)
console.log(`  ✅ gardés (mobile 06/07)      : ${gardes.length}`)
console.log(`  ❌ à exclure (fixe/vide/autre): ${exclus.length} — dont ${enSeqStop.length} déjà en séquence (relances stoppées)`)
const motifs = {}
for (const e of exclus) {
  const t = String(e.telephone || "").trim()
  const m = !t ? "sans téléphone" : /^0?[1-5]/.test(t.replace(/\D/g, "").replace(/^33/, "0")) ? "fixe 01-05" : /^0?9/.test(t.replace(/\D/g, "").replace(/^33/, "0")) ? "fixe 09" : "format invalide/étranger"
  motifs[m] = (motifs[m] || 0) + 1
}
console.log("  Détail exclusions :", JSON.stringify(motifs))

const csv = (rows, cols) => "﻿" + cols.join(";") + "\r\n" + rows.map((r) => cols.map((c) => String(r[c] ?? "").replace(/[;\r\n]+/g, " ")).join(";")).join("\r\n")
writeFileSync(resolve(homedir(), "Downloads", "st-exclus-non-mobiles.csv"),
  csv(exclus, ["entreprise", "telephone", "email", "statut", "zone"]), "utf8")
console.log("CSV : Downloads/st-exclus-non-mobiles.csv (liste complète, récupérable si besoin)")

if (!APPLIQUER) { console.log("\nANALYSE seule — rien écrit."); process.exit(0) }

let n = 0
for (let i = 0; i < exclus.length; i += 80) {
  const ids = exclus.slice(i, i + 80).map((e) => e.id)
  const r = await fetch(`${U}/rest/v1/st_sous_traitants?id=in.(${ids.join(",")})`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ statut: "exclu" }),
  })
  if (r.ok) n += ids.length
}
console.log(`✅ ${n} prospects exclus.`)
