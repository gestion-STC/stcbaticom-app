#!/usr/bin/env node
/** Active réellement la machine à ST (demande Mahdi 05/08) :
 *  1. st_sequences « Campagne partenaires » → actif = true
 *  2. st_pilotage.sequence_id → cette séquence
 *  Puis déclenche UN passage du séquenceur et affiche son bilan. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const K = readFileSync(resolve(tmpdir(), "stcbaticom-sk.txt"), "utf8").replace(/^﻿/, "").trim();
const U = "https://ifvrmsiwlwppinfdmeao.supabase.co";
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };

// 1. Séquence active
const seqs = await fetch(`${U}/rest/v1/st_sequences?select=id,nom,actif`, { headers: H }).then((r) => r.json());
if (!seqs.length) { console.error("Aucune séquence"); process.exit(1); }
const seq = seqs[0];
console.log(`Séquence : « ${seq.nom} » (actif=${seq.actif})`);
if (!seq.actif) {
  const r = await fetch(`${U}/rest/v1/st_sequences?id=eq.${seq.id}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ actif: true }) });
  console.log(r.ok ? "✅ séquence activée" : `ÉCHEC activation ${r.status}`);
}

// 2. Pilotage pointe sur la séquence
const r2 = await fetch(`${U}/rest/v1/st_pilotage?id=eq.1`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ sequence_id: seq.id }) });
console.log(r2.ok ? "✅ pilotage relié à la séquence" : `ÉCHEC pilotage ${r2.status}`);

// 3. Un passage du moteur, tout de suite
console.log("\nPassage du séquenceur…");
const run = await fetch(`${U}/functions/v1/sequenceur-st`, { method: "POST", headers: H, body: "{}" });
console.log("HTTP", run.status, ":", JSON.stringify(await run.json().catch(() => ({}))));

// 4. Preuves
const envois = await fetch(`${U}/rest/v1/st_envois?select=envoye_le,canal,statut,erreur&order=envoye_le.desc&limit=10`, { headers: H }).then((r) => r.json());
console.log("\nDerniers envois :");
for (const e of envois) console.log(` ${e.envoye_le.slice(0, 16)} [${e.canal}] ${e.statut}${e.erreur ? " — " + e.erreur.slice(0, 60) : ""}`);
const enSeq = await fetch(`${U}/rest/v1/st_sous_traitants?select=nom,metier,demarre_le&statut=eq.en_sequence&order=demarre_le.desc&limit=12`, { headers: H }).then((r) => r.json());
console.log("\nEn séquence :");
for (const s of enSeq) console.log(`  ${(s.nom || "?").slice(0, 30).padEnd(31)} ${(s.metier || "").slice(0, 40)}`);
