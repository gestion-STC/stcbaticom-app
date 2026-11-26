// ════════════════════════════════════════════════════════════════════════════
// BANC D'ESSAI DU LOT 1 « sécurité et droits » (27/11/2026) : supabase/maj-2026-11-27-f1.sql rejoué dans une base
// Postgres locale (PGlite), sur les tables qu'il touche telles qu'elles sont en production (colonnes utiles seulement),
// avec les mêmes règles d'accès (acces_connecte, messages_*, pj_suppr) et un compte qui se connecte comme PostgREST
// (rôle authenticated + jeton). On vérifie le geste refusé ET le geste de l'écran qui doit rester possible.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { beforeAll, describe, expect, it } from "vitest"

const lot1 = readFileSync(join(process.cwd(), "supabase/maj-2026-11-27-f1.sql"), "utf8")

const ADMIN = "00000000-0000-0000-0000-00000000000a"
const TELEPRO = "00000000-0000-0000-0000-00000000000b" // fonction « commercial » : les agences seulement
const AUTRE = "00000000-0000-0000-0000-00000000000c" // un autre téléprospecteur, fonction pas posée : les deux bases
const RECRUTEUR = "00000000-0000-0000-0000-00000000000d" // fonction « recrutement »
const AG_MOI = "00000000-0000-0000-0000-0000000000a1" // agence du téléprospecteur
const AG_AUTRE = "00000000-0000-0000-0000-0000000000a2" // agence d'un collègue

const SOCLE = `
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create table auth.users (id uuid primary key, raw_app_meta_data jsonb);
grant usage on schema auth to authenticated, anon;
create function public.est_admin() returns boolean language sql stable set search_path = '' as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin' $$;
create function public.est_membre() returns boolean language sql stable set search_path = '' as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'telepro') $$;
create table public.parametres (cle text primary key, valeur text not null);
create function public.mes_espaces() returns text[] language sql stable security definer set search_path = public as $$
  select case
    when coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'telepro' then array['demarchage', 'recrutement']
    else case (select (valeur::jsonb) ->> (auth.uid()::text) from parametres where cle = 'fonctions_comptes')
      when 'commercial' then array['demarchage'] when 'recrutement' then array['recrutement'] else array['demarchage', 'recrutement'] end
  end $$;

create table public.secteurs (code text primary key, libelle text not null default '', commercial_id uuid);
create table public.agences (id uuid primary key default gen_random_uuid(), nom text not null default '', secteur text, type text not null default 'agence', commercial_id uuid);
create function public.agence_suit_son_secteur() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.secteur is not null and new.type <> 'apporteur'
     and (tg_op = 'INSERT' or new.secteur is distinct from old.secteur)
     and (tg_op = 'INSERT' or new.commercial_id is not distinct from old.commercial_id) then
    new.commercial_id := (select s.commercial_id from public.secteurs s where s.code = new.secteur);
  end if;
  return new;
end $$;
create trigger agences_suit_son_secteur before insert or update of secteur on public.agences for each row execute function public.agence_suit_son_secteur();
create function public.attribuer_secteur(p_secteur text, p_compte_id uuid) returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then raise exception 'Réservé aux admins.'; end if;
  update public.secteurs set commercial_id = p_compte_id where code = p_secteur;
  update public.agences set commercial_id = p_compte_id where secteur = p_secteur and commercial_id is distinct from p_compte_id;
  get diagnostics v_n = row_count; return v_n;
end $$;
create table public.activites (id uuid primary key default gen_random_uuid(), agence_id uuid not null references public.agences(id), type text not null,
  compte_id uuid default auth.uid(), echeance timestamptz, fait_le timestamptz);
create table public.messages (id uuid primary key default gen_random_uuid(), sens text not null check (sens in ('entrant', 'sortant')),
  espace text not null default 'demarchage', agence_id uuid, compte_id uuid, lu boolean not null default false,
  objet text not null default '', corps_html text not null default '', message_id text);
create table public.cmp_campagnes (id uuid primary key default gen_random_uuid(), nom text not null default '', statut text not null default 'brouillon');
create table public.avis (id uuid primary key default gen_random_uuid(), nom text not null default '');
create table public.avis_contacts (id uuid primary key default gen_random_uuid(), nom text not null default '', mobile text not null default '');
create table public.st_sous_traitants (id uuid primary key default gen_random_uuid(), entreprise text not null default '');
create table public.st_envois (id uuid primary key default gen_random_uuid());
create table public.st_pilotage (id integer primary key, actif boolean not null default false);
create table public.st_contrats_modeles (id uuid primary key default gen_random_uuid(), nom text not null default '');
create table public.st_exclusions (id uuid primary key default gen_random_uuid(), email text);
create table public.st_qualifications (sous_traitant_id uuid primary key, reponses jsonb);

do $$ declare t text; begin
  foreach t in array array['secteurs', 'agences', 'activites', 'cmp_campagnes', 'avis', 'avis_contacts', 'st_sous_traitants', 'st_envois',
                           'st_pilotage', 'st_contrats_modeles', 'st_exclusions', 'st_qualifications'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy acces_connecte on public.%I for all to authenticated using (est_membre() and true) with check (est_membre() and true)', t);
  end loop;
end $$;
alter table public.messages enable row level security;
create policy messages_lecture on public.messages for select to authenticated using (est_membre() and coalesce(espace, 'demarchage') = any (mes_espaces())
  and (coalesce(espace, 'demarchage') <> 'demarchage' or (select est_admin()) or compte_id = (select auth.uid()) or agence_id in (select g.id from agences g where g.commercial_id = (select auth.uid()))));
create policy messages_ajout on public.messages for insert to authenticated with check (est_membre() and coalesce(espace, 'demarchage') = any (mes_espaces())
  and (coalesce(espace, 'demarchage') <> 'demarchage' or (select est_admin()) or compte_id = (select auth.uid())));
create policy messages_modification on public.messages for update to authenticated using (est_membre() and coalesce(espace, 'demarchage') = any (mes_espaces())
  and (coalesce(espace, 'demarchage') <> 'demarchage' or (select est_admin()) or compte_id = (select auth.uid()) or agence_id in (select g.id from agences g where g.commercial_id = (select auth.uid()))))
  with check (est_membre());
create policy messages_suppression on public.messages for delete to authenticated using (false);

create function public.lead_poser(p_agence uuid, p_contact uuid, p_source text, p_signal text, p_detail text, p_quand timestamptz) returns void
  language plpgsql security definer set search_path = public as $$ begin null; end $$;
create function public.lead_depuis_note(p_id uuid) returns void language plpgsql security definer set search_path = public as $$ begin null; end $$;
grant execute on function public.lead_poser(uuid, uuid, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.lead_depuis_note(uuid) to authenticated, service_role;

create schema storage;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null);
alter table storage.objects enable row level security;
create policy pj_lecture on storage.objects for select to authenticated using (est_membre() and bucket_id = 'pieces-jointes');
create policy pj_suppr on storage.objects for delete to authenticated using (est_membre() and bucket_id = 'pieces-jointes');
grant usage on schema storage to authenticated;
grant all on all tables in schema storage to authenticated;

grant usage on schema public to authenticated, anon;
grant all on all tables in schema public to authenticated, anon;
`

let db: PGlite

const jeton = (uid: string, role: string) => JSON.stringify({ sub: uid, role: "authenticated", app_metadata: { role } })

/** Une requête faite par un compte, comme PostgREST : rôle authenticated et jeton de la session. */
async function en(uid: string, role: "admin" | "telepro", sql: string): Promise<{ lignes: Record<string, unknown>[]; n: number }> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '${jeton(uid, role)}', false);`)
  try {
    const r = await db.query<Record<string, unknown>>(sql)
    return { lignes: r.rows, n: r.affectedRows ?? 0 }
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`)
  }
}
const telepro = (sql: string) => en(TELEPRO, "telepro", sql)
const admin = (sql: string) => en(ADMIN, "admin", sql)
const valeur = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0] ?? {})[0]

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SOCLE)
  await db.exec(`
    insert into auth.users values ('${ADMIN}', '{"role":"admin"}');
    insert into public.parametres values ('fonctions_comptes', '{"${TELEPRO}":"commercial","${RECRUTEUR}":"recrutement"}');
    insert into public.secteurs (code, commercial_id) values ('75001', '${TELEPRO}'), ('92110', '${AUTRE}');
    insert into public.agences (id, nom, secteur, commercial_id) values ('${AG_MOI}', 'Mon agence', null, '${TELEPRO}'), ('${AG_AUTRE}', 'Agence du collègue', null, '${AUTRE}');
    update public.agences set secteur = '75001' where id = '${AG_MOI}';
    update public.agences set secteur = '92110' where id = '${AG_AUTRE}';
    insert into public.cmp_campagnes (nom) values ('histoires');
    insert into public.avis (nom) values ('Mme Locataire');
    insert into public.avis_contacts (nom, mobile) values ('Mme Locataire', '0600000000');
    insert into public.st_sous_traitants (entreprise) values ('ELEC');
    insert into public.st_pilotage (id) values (1);
    insert into storage.objects (bucket_id, name) values ('pieces-jointes', 'plaquette.pdf');
  `)
  await db.exec(lot1)
})

describe("lot 1 : le SQL", () => {
  it("se rejoue sans erreur ni doublon", async () => {
    await db.exec(lot1)
    expect(await valeur(`select count(*)::int from pg_trigger where tgname in ('agences_garde_commercial', 'secteurs_garde_commercial', 'messages_garde_rattachement')`)).toBe(3)
    expect(await valeur(`select count(*)::int from pg_policies where policyname = 'garde_espace_recrutement'`)).toBe(6)
  })
})

describe("D3 : le chargé d'affaires (agences, secteurs)", () => {
  it("un téléprospecteur ne s'attribue pas l'agence d'un collègue", async () => {
    await expect(telepro(`update public.agences set commercial_id = '${TELEPRO}' where id = '${AG_AUTRE}'`)).rejects.toThrow(/administrateur/)
    expect(await valeur(`select commercial_id::text from public.agences where id = '${AG_AUTRE}'`)).toBe(AUTRE)
  })
  it("ni un secteur (les futures agences du 92110)", async () => {
    await expect(telepro(`update public.secteurs set commercial_id = '${TELEPRO}' where code = '92110'`)).rejects.toThrow(/administrateur/)
    await expect(telepro(`insert into public.secteurs (code, commercial_id) values ('92200', '${TELEPRO}')`)).rejects.toThrow(/administrateur/)
  })
  it("ni une agence créée à son nom", async () => {
    await expect(telepro(`insert into public.agences (nom, commercial_id) values ('Nouvelle', '${TELEPRO}')`)).rejects.toThrow(/administrateur/)
  })
  it("l'écran reste possible : créer une agence, corriger sa fiche, son secteur (le chargé d'affaires suit le secteur), ajouter ou renommer un secteur", async () => {
    const r = await telepro(`insert into public.agences (nom, secteur) values ('Saisie à la main', '92110') returning commercial_id::text as c`)
    expect(r.lignes[0].c).toBe(AUTRE)
    expect((await telepro(`update public.agences set nom = 'Mon agence (corrigée)', commercial_id = '${TELEPRO}' where id = '${AG_MOI}'`)).n).toBe(1)
    expect((await telepro(`update public.agences set secteur = '92110' where id = '${AG_MOI}'`)).n).toBe(1)
    expect(await valeur(`select commercial_id::text from public.agences where id = '${AG_MOI}'`)).toBe(AUTRE)
    await db.exec(`update public.agences set secteur = '75001', commercial_id = '${TELEPRO}' where id = '${AG_MOI}'`)
    expect((await telepro(`insert into public.secteurs (code, libelle) values ('93100', 'Montreuil')`)).n).toBe(1)
    expect((await telepro(`update public.secteurs set libelle = 'Montreuil (93)' where code = '93100'`)).n).toBe(1)
  })
  it("un admin attribue, à la main ou par secteur", async () => {
    expect((await admin(`update public.agences set commercial_id = '${ADMIN}' where id = '${AG_AUTRE}'`)).n).toBe(1)
    await admin(`select public.attribuer_secteur('92110', '${AUTRE}')`)
    expect(await valeur(`select commercial_id::text from public.agences where id = '${AG_AUTRE}'`)).toBe(AUTRE)
  })
  it("suppression d'une agence ou d'un secteur : admins seulement", async () => {
    expect((await telepro(`delete from public.secteurs where code = '93100'`)).n).toBe(0)
    expect((await admin(`delete from public.secteurs where code = '93100'`)).n).toBe(1)
    const id = (await admin(`insert into public.agences (nom) values ('À retirer') returning id::text as id`)).lignes[0].id
    expect((await telepro(`delete from public.agences where id = '${id}'`)).n).toBe(0)
    expect((await admin(`delete from public.agences where id = '${id}'`)).n).toBe(1)
  })
})

describe("D3 : le fil d'une agence (activites)", () => {
  it("un téléprospecteur supprime ses tâches et celles de ses agences, pas celles des autres ni les appels", async () => {
    await db.exec(`
      insert into public.activites (id, agence_id, type, compte_id) values
        ('00000000-0000-0000-0000-0000000000f1', '${AG_AUTRE}', 'tache', '${TELEPRO}'),
        ('00000000-0000-0000-0000-0000000000f2', '${AG_MOI}', 'rdv', '${AUTRE}'),
        ('00000000-0000-0000-0000-0000000000f3', '${AG_AUTRE}', 'tache', '${AUTRE}'),
        ('00000000-0000-0000-0000-0000000000f4', '${AG_MOI}', 'appel', '${TELEPRO}'),
        ('00000000-0000-0000-0000-0000000000f5', '${AG_MOI}', 'note', '${TELEPRO}');`)
    expect((await telepro(`delete from public.activites where id = '00000000-0000-0000-0000-0000000000f1'`)).n).toBe(1)
    expect((await telepro(`delete from public.activites where id = '00000000-0000-0000-0000-0000000000f2'`)).n).toBe(1)
    expect((await telepro(`delete from public.activites where id = '00000000-0000-0000-0000-0000000000f3'`)).n).toBe(0)
    expect((await telepro(`delete from public.activites where id in ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f5')`)).n).toBe(0)
    expect((await admin(`delete from public.activites where id = '00000000-0000-0000-0000-0000000000f4'`)).n).toBe(1)
  })
  it("reporter ou marquer fait une tâche reste possible depuis n'importe quelle fiche (offert par la fiche agence)", async () => {
    expect((await telepro(`update public.activites set echeance = now() + interval '1 day' where id = '00000000-0000-0000-0000-0000000000f3'`)).n).toBe(1)
    expect((await telepro(`update public.activites set fait_le = now() where id = '00000000-0000-0000-0000-0000000000f3'`)).n).toBe(1)
  })
})

describe("D3 : campagnes, machine des artisans, avis, base artisans", () => {
  it("cmp_campagnes : un téléprospecteur la lit, ne la lance pas", async () => {
    expect((await telepro(`select id from public.cmp_campagnes`)).lignes.length).toBe(1)
    expect((await telepro(`update public.cmp_campagnes set statut = 'active'`)).n).toBe(0)
    await expect(telepro(`insert into public.cmp_campagnes (nom) values ('pirate')`)).rejects.toThrow(/row-level security/)
    expect((await admin(`update public.cmp_campagnes set statut = 'active'`)).n).toBe(1)
  })
  it("st_pilotage et st_contrats_modeles : écriture admins seulement", async () => {
    expect((await en(RECRUTEUR, "telepro", `update public.st_pilotage set actif = true`)).n).toBe(0)
    await expect(en(RECRUTEUR, "telepro", `insert into public.st_contrats_modeles (nom) values ('x')`)).rejects.toThrow(/row-level security/)
    expect((await admin(`insert into public.st_contrats_modeles (nom) values ('Contrat cadre')`)).n).toBe(1)
    expect((await en(RECRUTEUR, "telepro", `select id from public.st_contrats_modeles`)).lignes.length).toBe(1)
  })
  it("avis et contacts des locataires : invisibles pour un téléprospecteur", async () => {
    expect((await telepro(`select id from public.avis`)).lignes.length).toBe(0)
    expect((await telepro(`select id from public.avis_contacts`)).lignes.length).toBe(0)
    expect((await admin(`select id from public.avis_contacts`)).lignes.length).toBe(1)
  })
  it("base artisans : rien pour un « Commercial », tout pour le recrutement", async () => {
    expect((await telepro(`select id from public.st_sous_traitants`)).lignes.length).toBe(0)
    await expect(telepro(`insert into public.st_sous_traitants (entreprise) values ('x')`)).rejects.toThrow(/row-level security/)
    expect((await en(RECRUTEUR, "telepro", `select id from public.st_sous_traitants`)).lignes.length).toBe(1)
    expect((await en(AUTRE, "telepro", `select id from public.st_sous_traitants`)).lignes.length).toBe(1)
    expect((await en(RECRUTEUR, "telepro", `insert into public.st_exclusions (email) values ('a@b.fr')`)).n).toBe(1)
    expect((await en(RECRUTEUR, "telepro", `insert into public.st_qualifications (sous_traitant_id, reponses) select id, '{}' from public.st_sous_traitants`)).n).toBe(1)
  })
})

describe("D4 : le journal des mails", () => {
  it("lu / non lu et rattacher son envoi à la fiche : possible", async () => {
    await db.exec(`insert into public.messages (id, sens, agence_id, compte_id, corps_html) values
      ('00000000-0000-0000-0000-0000000000e1', 'sortant', null, '${TELEPRO}', 'Bonjour'),
      ('00000000-0000-0000-0000-0000000000e2', 'entrant', '${AG_MOI}', null, 'Réponse');`)
    expect((await telepro(`update public.messages set lu = true where id = '00000000-0000-0000-0000-0000000000e2'`)).n).toBe(1)
    expect((await telepro(`update public.messages set agence_id = '${AG_MOI}' where id = '00000000-0000-0000-0000-0000000000e1'`)).n).toBe(1)
    expect((await telepro(`insert into public.messages (sens, agence_id, compte_id, objet) values ('sortant', '${AG_MOI}', '${TELEPRO}', 'Envoi')`)).n).toBe(1)
  })
  it("vider un mail, le réécrire, fabriquer un « reçu » ou déplacer un reçu : refusé", async () => {
    await expect(telepro(`update public.messages set corps_html = '' where id = '00000000-0000-0000-0000-0000000000e2'`)).rejects.toThrow(/permission denied/)
    await expect(telepro(`insert into public.messages (sens, agence_id, compte_id, objet) values ('entrant', '${AG_MOI}', '${TELEPRO}', 'Re: faux')`)).rejects.toThrow(/row-level security/)
    await expect(telepro(`update public.messages set agence_id = '${AG_AUTRE}' where id = '00000000-0000-0000-0000-0000000000e2'`)).rejects.toThrow(/reçu/)
    expect(await valeur(`select corps_html from public.messages where id = '00000000-0000-0000-0000-0000000000e2'`)).toBe("Réponse")
  })
})

describe("D5 et D2", () => {
  it("lead_poser et lead_depuis_note : plus appelables par un compte, toujours par le serveur", async () => {
    await expect(telepro(`select public.lead_poser('${AG_AUTRE}', null, 'compte', 'faux', '', now())`)).rejects.toThrow(/permission denied/)
    await expect(telepro(`select public.lead_depuis_note('${AG_AUTRE}')`)).rejects.toThrow(/permission denied/)
    expect(await valeur(`select has_function_privilege('service_role', 'public.lead_poser(uuid, uuid, text, text, text, timestamptz)', 'execute')`)).toBe(true)
  })
  it("aucun fichier de pièce jointe ne s'efface depuis le logiciel", async () => {
    expect((await admin(`delete from storage.objects where name = 'plaquette.pdf'`)).n).toBe(0)
    expect((await admin(`select id from storage.objects`)).lignes.length).toBe(1)
  })
})
