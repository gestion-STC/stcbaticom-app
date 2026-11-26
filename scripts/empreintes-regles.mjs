// Recalcule les empreintes des règles du démarchage et les écrit dans supabase/regles-demarchage.sql
// (contrôle « règle modifiée » de sante_demarchage). À lancer après toute modification VOULUE d'une règle :
//   node scripts/empreintes-regles.mjs
import { PGlite } from "@electric-sql/pglite"
import { readFileSync, writeFileSync } from "node:fs"

export const REGLES = ["activites_relance_continue", "activites_touche_agence", "agence_premier_os", "agence_suit_son_secteur", "agences_etape_journal",
  "agences_etape_relances", "appel_enregistrer", "appel_lancer", "appel_verifier", "attribuer_secteur", "compter_piles", "demarchage_echeance",
  "demarchage_repos", "messages_rattacher_agence", "pile_demarchage", "reglage_demarchage", "reglages_demarchage", "tache_terminer"]

export async function empreintes(fichierRegles) {
  const db = new PGlite()
  await db.exec(readFileSync("supabase/tests/socle-demarchage.sql", "utf8"))
  await db.exec(fichierRegles)
  const r = await db.query(`select p.proname as nom, md5(replace(p.prosrc, chr(13), '')) as e from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any($1) order by 1`, [REGLES])
  await db.close()
  return r.rows
}

if (process.argv[1]?.endsWith("empreintes-regles.mjs")) {
  const chemin = "supabase/regles-demarchage.sql"
  const texte = readFileSync(chemin, "utf8")
  const lignes = (await empreintes(texte)).map((x) => `      ('${x.nom}', '${x.e}')`).join(",\n")
  const debut = "-- empreintes:debut", fin = "-- empreintes:fin"
  const i = texte.indexOf(debut), j = texte.indexOf(fin)
  if (i < 0 || j < 0) throw new Error("repères « empreintes » absents de " + chemin)
  writeFileSync(chemin, texte.slice(0, i) + debut + "\n" + lignes + "\n    " + texte.slice(j))
  console.log("empreintes écrites :", REGLES.length)
}
