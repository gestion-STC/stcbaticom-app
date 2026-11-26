// ════════════════════════════════════════════════════════════════════════════
// BANC D'ESSAI DU LOT 6 (26/11/2026) : le SQL supabase/maj-2026-11-26-lot6.sql rejoué dans une base Postgres locale
// (PGlite), sur les tables qu'il touche telles qu'elles sont en production (colonnes utiles seulement).
//   · « a cliqué » côté recrutement : un autre lien du même artisan ouvert à 5 s près, ou le lien stop vu à 5 s près,
//     est un robot ; la fiche et les événements de campagne suivent ; le rattrapage applique la même règle ;
//   · les sous-traitants de STC Bâtiment quittent chiffres_stc pour chiffres_stc_st ;
//   · le fichier est rejouable.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { beforeAll, describe, expect, it } from "vitest"

const lot6 = readFileSync(join(process.cwd(), "supabase/maj-2026-11-26-lot6.sql"), "utf8")
const SOCLE = `
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
create function public.est_membre() returns boolean language sql stable as $$ select true $$;
create table public.parametres (cle text primary key, valeur text not null, maj_le timestamptz not null default now());
alter table public.parametres enable row level security;
create policy parametres_lecture_membres on public.parametres for select to authenticated
  using (est_membre() and cle not in ('analyse_passage_cle', 'ringover_webhook_cle'));
create table public.agences (id uuid primary key default gen_random_uuid(), nom text not null default '');
create table public.activites (id uuid primary key default gen_random_uuid(), agence_id uuid references public.agences(id));
create table public.appels_ia (id uuid primary key default gen_random_uuid(), agence_id uuid, statut text, resume text, analyse_detail jsonb, cree_le timestamptz default now());
create table public.st_sous_traitants (
  id uuid primary key default gen_random_uuid(), entreprise text not null default '', nb_clics integer not null default 0,
  dernier_clic_le timestamptz, candidature_clic_le timestamptz, bareme_vu_le timestamptz, suivi text not null default ''
);
create table public.st_clics (
  id uuid primary key default gen_random_uuid(), sous_traitant_id uuid not null references public.st_sous_traitants(id) on delete cascade,
  clique_le timestamptz not null default now(), user_agent text not null default '', destination text not null default 'candidature'
);
create table public.cmp_evenements (
  id uuid primary key default gen_random_uuid(), campagne_id uuid, envoi_id uuid, contact_ref text not null, type text not null,
  le timestamptz not null default now(), lien text, robot boolean not null default false
);
-- Le dernier envoi d'une campagne au contact : ici, toujours le même (la vraie fonction lit cmp_envois).
create function public.cmp_dernier_envoi(p_contact text, p_avant timestamptz) returns table (envoi_id uuid, campagne_id uuid)
  language sql stable as $$ select '00000000-0000-0000-0000-0000000000e1'::uuid, '00000000-0000-0000-0000-0000000000c1'::uuid $$;
-- Les déclencheurs d'avant le lot 6 (copiés de la base).
create function public.st_clic_vers_fiche() returns trigger language plpgsql as $$
begin
  if new.destination = 'stop' then return new; end if;
  update public.st_sous_traitants s set nb_clics = (select count(*) from public.st_clics c where c.sous_traitant_id = new.sous_traitant_id and c.destination <> 'stop'),
    dernier_clic_le = greatest(coalesce(s.dernier_clic_le, new.clique_le), new.clique_le) where s.id = new.sous_traitant_id;
  return new;
end $$;
create trigger st_clics_vers_fiche after insert on public.st_clics for each row execute function public.st_clic_vers_fiche();
create function public.cmp_depuis_clic_st() returns trigger language plpgsql as $$
declare d record;
begin
  select * into d from public.cmp_dernier_envoi(new.sous_traitant_id::text, new.clique_le);
  insert into public.cmp_evenements (campagne_id, envoi_id, contact_ref, type, le, lien)
  values (d.campagne_id, d.envoi_id, new.sous_traitant_id::text, case when new.destination = 'stop' then 'desinscription' else 'clic' end, new.clique_le,
    case when new.destination = 'bareme' then 'bareme' when new.destination = 'stop' then null else 'principal' end);
  return new;
end $$;
create trigger cmp_clic_st after insert on public.st_clics for each row execute function public.cmp_depuis_clic_st();
`

let db: PGlite
type Ligne = Record<string, unknown>
const q = async <T = Ligne>(texte: string, params: unknown[] = []) => (await db.query<T>(texte, params)).rows
const un = async <T = Ligne>(texte: string, params: unknown[] = []) => (await q<T>(texte, params))[0]
const artisan = async (nom: string) => (await un<{ id: string }>(`insert into public.st_sous_traitants (entreprise) values ($1) returning id`, [nom])).id
const clic = (st: string, quand: string, destination = "candidature") => q(`insert into public.st_clics (sous_traitant_id, clique_le, destination) values ($1, $2, $3)`, [st, quand, destination])
const fiche = (st: string) => un<{ nb_clics: number; candidature: string | null; bareme: string | null; dernier: string | null }>(
  `select nb_clics, to_char(candidature_clic_le at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as candidature, to_char(bareme_vu_le at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as bareme,
     to_char(dernier_clic_le at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as dernier from public.st_sous_traitants where id = $1`, [st])
const robots = async (st: string) => (await q<{ destination: string; robot: boolean }>(`select destination, robot from public.st_clics where sous_traitant_id = $1 order by clique_le, destination`, [st])).map((x) => `${x.destination}:${x.robot ? "robot" : "vrai"}`)
const evRobots = async (st: string) => (await q<{ type: string; robot: boolean }>(`select type, robot from public.cmp_evenements where contact_ref = $1 order by le, type`, [st])).map((x) => `${x.type}:${x.robot ? "robot" : "vrai"}`)

// Avant le lot : l'historique (un robot de rafale, un vrai clic, un robot qui ouvre aussi le lien stop à l'ancienne).
let ancienRobot = "", ancienVrai = "", ancienStop = ""
beforeAll(async () => {
  db = new PGlite()
  await db.exec(SOCLE)
  ancienRobot = await artisan("Ancien robot")
  await clic(ancienRobot, "2026-10-19T08:00:00Z", "candidature"); await clic(ancienRobot, "2026-10-19T08:00:01Z", "bareme")
  ancienVrai = await artisan("Ancien vrai")
  await clic(ancienVrai, "2026-10-20T08:00:00Z", "candidature"); await clic(ancienVrai, "2026-10-20T08:00:03Z", "candidature") // double clic : pas un autre lien
  ancienStop = await artisan("Ancien stop")
  await clic(ancienStop, "2026-10-23T08:00:00Z", "candidature"); await clic(ancienStop, "2026-10-23T08:00:00.400Z", "stop"); await clic(ancienStop, "2026-10-25T09:00:00Z", "candidature")
  await db.exec(`insert into public.parametres (cle, valeur) values ('chiffres_stc', '{"version":2,"agences":[],"sous_traitants":[{"nom":"X","email":"x@y.fr"}]}')`)
  await db.exec(lot6)
}, 60_000)

describe("lot 6 : le rattrapage des clics existants (même règle, 5 s)", () => {
  it("deux liens différents ouverts dans la même seconde : robots, la fiche n'a plus de clic", async () => {
    expect(await robots(ancienRobot)).toEqual(["candidature:robot", "bareme:robot"])
    expect(await fiche(ancienRobot)).toEqual({ nb_clics: 0, candidature: null, bareme: null, dernier: null })
    expect(await evRobots(ancienRobot)).toEqual(["clic:robot", "clic:robot"])
  })
  it("le même lien ouvert deux fois : un vrai clic (comme un lien d'agence ouvert deux fois)", async () => {
    expect(await robots(ancienVrai)).toEqual(["candidature:vrai", "candidature:vrai"])
    expect((await fiche(ancienVrai)).nb_clics).toBe(2)
  })
  it("un lien ouvert avec le lien stop : robot ; son vrai clic deux jours plus tard reste", async () => {
    expect(await robots(ancienStop)).toEqual(["candidature:robot", "stop:robot", "candidature:vrai"])
    const f = await fiche(ancienStop)
    expect(f.nb_clics).toBe(1)
    expect(f.candidature?.slice(0, 10)).toBe("2026-10-25")
  })
})

describe("lot 6 : le clic qui arrive est jugé à l'écriture", () => {
  it("un robot ouvre la candidature puis le barème dans la seconde : les deux sont robots, la fiche reste vide", async () => {
    const st = await artisan("Robot en direct")
    await clic(st, "2026-11-26T10:00:00Z", "candidature")
    expect((await fiche(st)).nb_clics).toBe(1) // vu seul pour l'instant
    await clic(st, "2026-11-26T10:00:00.700Z", "bareme")
    expect(await robots(st)).toEqual(["candidature:robot", "bareme:robot"])
    expect(await fiche(st)).toEqual({ nb_clics: 0, candidature: null, bareme: null, dernier: null })
    expect(await evRobots(st)).toEqual(["clic:robot", "clic:robot"])
  })
  it("le lien stop ouvert (sans confirmer) juste après : le clic d'avant devient robot", async () => {
    const st = await artisan("Robot et stop")
    await q(`insert into public.st_clics (sous_traitant_id, destination) values ($1, 'candidature')`, [st])
    await q(`select public.st_noter_stop_vu($1)`, [st])
    expect(await robots(st)).toEqual(["candidature:robot"])
    expect((await fiche(st)).nb_clics).toBe(0)
  })
  it("un vrai clic, puis le barème une minute plus tard : deux vrais clics, dates sur la fiche", async () => {
    const st = await artisan("Humain")
    await clic(st, "2026-11-26T11:00:00Z", "candidature")
    await clic(st, "2026-11-26T11:01:00Z", "bareme")
    expect(await robots(st)).toEqual(["candidature:vrai", "bareme:vrai"])
    const f = await fiche(st)
    expect(f.nb_clics).toBe(2)
    expect([f.candidature, f.bareme, f.dernier]).toEqual(["2026-11-26T11:00:00", "2026-11-26T11:01:00", "2026-11-26T11:01:00"])
    expect(await evRobots(st)).toEqual(["clic:vrai", "clic:vrai"])
  })
  it("une désinscription confirmée (POST) n'est jamais jugée robot", async () => {
    const st = await artisan("Désinscrit")
    await clic(st, "2026-11-26T12:00:00Z", "stop")
    expect(await robots(st)).toEqual(["stop:vrai"])
  })
})

describe("lot 6 : les sous-traitants de STC Bâtiment à part, et le fichier rejouable", () => {
  it("chiffres_stc n'a plus le bloc ; chiffres_stc_st le garde ; la règle de lecture des membres l'exclut", async () => {
    const p = await q<{ cle: string; valeur: string }>(`select cle, valeur from public.parametres order by cle`)
    expect(JSON.parse(p.find((x) => x.cle === "chiffres_stc")!.valeur)).toEqual({ version: 2, agences: [] })
    expect(JSON.parse(p.find((x) => x.cle === "chiffres_stc_st")!.valeur)).toEqual([{ nom: "X", email: "x@y.fr" }])
    expect((await un<{ q: string }>(`select qual as q from pg_policies where policyname = 'parametres_lecture_membres'`)).q).toContain("chiffres_stc_st")
  })
  it("rejoué une seconde fois : aucune erreur, rien ne bouge", async () => {
    const avant = await q(`select id, robot from public.st_clics order by id`)
    await db.exec(lot6)
    expect(await q(`select id, robot from public.st_clics order by id`)).toEqual(avant)
    expect(JSON.parse((await un<{ valeur: string }>(`select valeur from public.parametres where cle = 'chiffres_stc_st'`)).valeur)).toEqual([{ nom: "X", email: "x@y.fr" }])
  })
})
