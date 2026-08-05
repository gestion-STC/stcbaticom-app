#!/usr/bin/env node
/** Contrôle du lancement de la « machine à sous-traitants ». LECTURE SEULE.
 *  Clé service lue depuis %TEMP%\stcbaticom-sk.txt (posée par le CLI). */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const K = readFileSync(resolve(tmpdir(), "stcbaticom-sk.txt"), "utf8").replace(/^﻿/, "").trim();
const U = "https://ifvrmsiwlwppinfdmeao.supabase.co";
const H = { apikey: K, Authorization: `Bearer ${K}` };
const get = async (p) => { const r = await fetch(`${U}/rest/v1/${p}`, { headers: H }); if (!r.ok) return { __err: `${r.status} ${(await r.text()).slice(0, 150)}` }; return r.json(); };
const count = async (t, f = "") => { const r = await fetch(`${U}/rest/v1/${t}?select=id${f}`, { method: "HEAD", headers: { ...H, Prefer: "count=exact" } }); return r.ok ? Number((r.headers.get("content-range") || "0/0").split("/")[1]) : `ERR ${r.status}`; };

console.log("═══ 1. PILOTAGE (objectifs saisis) ═══");
const pil = await get("st_pilotage?select=*");
if (pil.__err) console.log(" ", pil.__err); else for (const p of pil) console.log(" ", JSON.stringify(p));

console.log("\n═══ 2. SÉQUENCES & ÉTAPES ═══");
const seqs = await get("st_sequences?select=*");
if (Array.isArray(seqs)) for (const s of seqs) {
  const et = await get(`st_etapes?select=ordre,canal,delai_jours,actif,objet&sequence_id=eq.${s.id}&order=ordre`);
  console.log(`  Séquence « ${s.nom || s.id.slice(0, 8)} » (actif=${s.actif ?? "?"}) — ${Array.isArray(et) ? et.length : "?"} étapes :`);
  if (Array.isArray(et)) for (const e of et) console.log(`     J+${e.delai_jours} [${e.canal}]${e.actif ? "" : " (inactif)"} ${(e.objet || "").slice(0, 50)}`);
} else console.log(" ", seqs.__err);

console.log("\n═══ 3. SOUS-TRAITANTS PAR STATUT ═══");
for (const st of ["a_contacter", "en_sequence", "depose", "exclu"]) console.log(`  ${st.padEnd(13)} : ${await count("st_sous_traitants", `&statut=eq.${st}`)}`);
const enSeq = await get("st_sous_traitants?select=nom,telephone,email,metier,demarre_le,etape_courante&statut=eq.en_sequence&order=demarre_le.desc&limit=10");
if (Array.isArray(enSeq)) for (const s of enSeq) console.log(`    → ${(s.nom || "?").slice(0, 25).padEnd(26)} ${s.metier?.slice(0, 12) || ""} démarré ${s.demarre_le?.slice(0, 16) || "?"} étape ${s.etape_courante}`);

console.log("\n═══ 4. ENVOIS (moteur vivant ?) ═══");
const envois = await get("st_envois?select=envoye_le,canal,statut,erreur&order=envoye_le.desc&limit=12");
if (Array.isArray(envois) && envois.length) for (const e of envois) console.log(`  ${e.envoye_le.slice(0, 16)} [${e.canal}] ${e.statut}${e.erreur ? " — " + e.erreur.slice(0, 60) : ""}`);
else console.log("  AUCUN envoi enregistré", envois.__err || "");

console.log("\n═══ 5. CLICS & CONVERSIONS ═══");
console.log("  clics lien-st :", await count("st_clics"));
console.log("  dossiers déposés (dossiers_st) :", await count("dossiers_st"));
const conv = await count("st_sous_traitants", "&statut=eq.depose");
console.log("  ST passés en 'depose' :", conv);
