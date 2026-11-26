// ════════════════════════════════════════════════════════════════════════════
// LA FUSION DE DEUX FICHES (lot F5, 27/11/2026, décision 5 du gérant)
//
// Cas réel : « District Saint-Germain-des-Prés » existe deux fois. Fusionner la cliente DANS la fiche
// « à prospecter » lui faisait perdre l'étape, le premier OS, le chargé d'affaires et la désinscription.
// Ce banc charge la VRAIE fonction (supabase/maj-2026-11-27-f5.sql) dans une base Postgres locale
// (PGlite), sur le socle du démarchage et les règles de référence, avec les tables voisines réduites
// à leurs colonnes utiles.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { beforeAll, describe, expect, it } from "vitest"

const racine = process.cwd()
const sql = (f: string) => readFileSync(join(racine, f), "utf8")
const MAHDI = "b3a3dd4d-de08-4370-b794-227b8ddf0ba5"
const HORLANN = "46fd93e4-fcd0-4b5e-bac0-5ba1f92babdd"

let db: PGlite
type Ligne = Record<string, unknown>
const q = async <T = Ligne>(texte: string, params: unknown[] = []) => (await db.query<T>(texte, params)).rows
const un = async <T = Ligne>(texte: string, params: unknown[] = []) => (await q<T>(texte, params))[0]

beforeAll(async () => {
  db = new PGlite()
  await db.exec(sql("supabase/tests/socle-demarchage.sql"))
  await db.exec(sql("supabase/regles-demarchage.sql"))
  await db.exec(`
    alter table public.agences add column ne_plus_ecrire_le timestamptz, add column fichier_id uuid;
    create or replace function public.est_membre() returns boolean language sql stable as 'select true';
    create table public.appels_ia (id uuid primary key default gen_random_uuid(), agence_id uuid);
    create table public.liens_suivis (id uuid primary key default gen_random_uuid(), agence_id uuid);
    create table public.clients_signales (id uuid primary key default gen_random_uuid(), agence_id uuid, maj_le timestamptz);
    create table public.cmp_inscriptions (id uuid primary key default gen_random_uuid(), campagne_id uuid, contact_ref text, statut text not null default 'actif', sortie_le timestamptz);
    create table public.cmp_envois (id uuid primary key default gen_random_uuid(), inscription_id uuid, contact_ref text);
    create table public.cmp_evenements (id uuid primary key default gen_random_uuid(), contact_ref text);
    create table public.cmp_reponses (id uuid primary key default gen_random_uuid(), contact_ref text);
    create table public.cmp_progression (campagne_id uuid, etape_id uuid, contact_ref text);
    create table public.cmp_textes_ia (campagne_id uuid, variante_id uuid, contact_ref text);
    create schema archive;
    create table archive.prospect_agence (prospect_id uuid, agence_id uuid);
    create table archive.prospects_conversion (agence_id uuid);
    insert into public.secteurs (code, libelle, zone, commercial_id) values ('75006', 'Paris 6', 'Paris', '${MAHDI}'), ('75005', 'Paris 5', 'Paris', '${MAHDI}');
    insert into public.parametres (cle, valeur) values ('heure_relance', '10');
    select set_config('request.jwt.claims', '{"sub":"${MAHDI}","role":"authenticated","app_metadata":{"role":"admin"},"user_metadata":{"nom":"Mahdi"}}', false);
  `)
  const maj = sql("supabase/maj-2026-11-27-f5.sql")
  const debut = maj.indexOf("create or replace function public.agences_fusionner(")
  const fin = maj.indexOf("$function$;", debut) + "$function$;".length
  await db.exec(maj.slice(debut, fin))
}, 60_000)

async function fiche(champs: Ligne): Promise<string> {
  const cles = Object.keys(champs)
  const r = await un<{ id: string }>(`insert into public.agences (${cles.join(", ")}) values (${cles.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(champs))
  return r.id
}
const lire = (id: string) => un<Ligne>(`select etape, type, premier_os_le::text as os, commercial_id::text as ca, ne_plus_ecrire_le is not null as desinscrite, telephone, email, site, enseigne,
  tentatives, joint_fois, secteur, motif, compte_email from public.agences where id = $1`, [id])
const fusionner = (garder: string, supprimer: string) => q(`select public.agences_fusionner($1, $2)`, [garder, supprimer])

describe("la fusion garde ce que savaient les deux fiches", () => {
  it("District : la cliente fusionnée DANS la fiche à prospecter (apporteur) reste cliente, avec son premier OS et son chargé d'affaires", async () => {
    const cliente = await fiche({ nom: "District SGdP", secteur: "75006", telephone: "01 43 26 37 69", email: "victor@services-gestion.fr" })
    await q(`update public.agences set commercial_id = $2, etape = 'client', premier_os_le = '2026-07-29' where id = $1`, [cliente, HORLANN])
    const doublon = await fiche({ nom: "District SGdP", secteur: "75006", type: "apporteur", telephone: "06 89 94 86 67", email: "s.jumele@district-immo.com" })
    await q(`update public.agences set commercial_id = null where id = $1`, [doublon])
    await q(`insert into public.activites (agence_id, type, titre, note) values ($1, 'note', '', 'note de la cliente')`, [cliente])
    await fusionner(doublon, cliente)
    const f = await lire(doublon)
    expect(f).toMatchObject({ etape: "client", type: "agence", os: "2026-07-29", ca: HORLANN, telephone: "06 89 94 86 67", email: "s.jumele@district-immo.com" })
    expect((await un<{ n: number }>(`select count(*)::int n from public.agences where id = $1`, [cliente])).n).toBe(0)
    expect((await un<{ n: number }>(`select count(*)::int n from public.activites where agence_id = $1 and note = 'note de la cliente'`, [doublon])).n).toBe(1)
  })
  it("dans l'autre sens (la cliente gardée) : rien ne change sur la cliente, les champs vides sont complétés", async () => {
    const cliente = await fiche({ nom: "C", secteur: "75006", email: "" })
    await q(`update public.agences set commercial_id = $2, etape = 'client', premier_os_le = '2026-07-29' where id = $1`, [cliente, HORLANN])
    const autre = await fiche({ nom: "C bis", secteur: "75006", email: "contact@c.fr", site: "c.fr", enseigne: "Orpi" })
    await fusionner(cliente, autre)
    expect(await lire(cliente)).toMatchObject({ etape: "client", os: "2026-07-29", ca: HORLANN, email: "contact@c.fr", site: "c.fr", enseigne: "Orpi" })
  })
  it("deux clientes : le premier OS le plus ancien", async () => {
    const a = await fiche({ nom: "A", secteur: "75006" })
    const b = await fiche({ nom: "B", secteur: "75006" })
    await q(`update public.agences set etape = 'client', premier_os_le = '2026-09-10' where id = $1`, [a])
    await q(`update public.agences set etape = 'client', premier_os_le = '2026-07-02' where id = $1`, [b])
    await fusionner(a, b)
    expect((await lire(a)).os).toBe("2026-07-02")
  })
  it("la désinscription de la fiche qui disparaît est conservée", async () => {
    const a = await fiche({ nom: "A", secteur: "75006" })
    const b = await fiche({ nom: "B", secteur: "75006" })
    await q(`update public.agences set ne_plus_ecrire_le = now() - interval '3 days' where id = $1`, [b])
    await fusionner(a, b)
    expect((await lire(a)).desinscrite).toBe(true)
  })
  it("le chargé d'affaires de la fiche gardée est retenu ; sans lui, celui de l'autre (même si le secteur est complété)", async () => {
    const a = await fiche({ nom: "A", secteur: "75006" })
    const b = await fiche({ nom: "B", secteur: "75006" })
    await q(`update public.agences set commercial_id = $2 where id = $1`, [b, HORLANN])
    await fusionner(a, b)
    expect((await lire(a)).ca).toBe(MAHDI) // celui de la fiche gardée (son secteur)
    const c = await fiche({ nom: "C" })
    const d = await fiche({ nom: "D", secteur: "75005" })
    await q(`update public.agences set commercial_id = $2 where id = $1`, [d, HORLANN])
    await fusionner(c, d)
    expect(await lire(c)).toMatchObject({ ca: HORLANN, secteur: "75005" })
  })
  it("une fiche gardée encore « à prospecter » prend l'étape de l'autre ; les « joint » suivent les appels", async () => {
    const a = await fiche({ nom: "A", secteur: "75006" })
    const b = await fiche({ nom: "B", secteur: "75006" })
    await q(`select public.appel_enregistrer(p_agence_id := $1, p_contact_id := null, p_resultat := 'joint', p_issue := 'interesse', p_compte_nom := 'Mahdi')`, [b])
    await fusionner(a, b)
    expect(await lire(a)).toMatchObject({ etape: "interesse", joint_fois: 1 })
    const ecarts = await q<{ code: string }>(`select code from public.sante_demarchage() where code in ('interessee_sans_relance', 'relances_en_double')`)
    expect(ecarts).toEqual([])
  })
  it("une fiche gardée déjà travaillée garde son étape", async () => {
    const a = await fiche({ nom: "A", secteur: "75006" })
    const b = await fiche({ nom: "B", secteur: "75006" })
    await q(`update public.agences set etape = 'gestionnaire_joint' where id = $1`, [a])
    await q(`update public.agences set etape = 'pas_interesse', motif = 'autre' where id = $1`, [b])
    await fusionner(a, b)
    expect((await lire(a)).etape).toBe("gestionnaire_joint")
  })
})
