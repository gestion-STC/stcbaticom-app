// ════════════════════════════════════════════════════════════════════════════
// BANC D'ESSAI DU LOT 4 DE L'AUDIT (27/11/2026) : le SQL supabase/maj-2026-11-27-f4.sql rejoué dans une base Postgres
// locale (PGlite), sur les tables qu'il touche telles qu'elles sont en production (colonnes utiles seulement).
//   · robots : un clic moins d'une minute après le mail ; la page « Créer un compte » jugée sur les liens ;
//   · leads : garde des 3 jours (signaux faibles, hors « robot »/« désinscrit »), désinscription, seuil sans robots ;
//   · premier OS recalé sur STC Bâtiment, même empreinte que le fichier de référence ;
//   · liste d'exclusion complétée par le numéro ; le fichier rejouable.
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { beforeAll, describe, expect, it } from "vitest"

const lot = readFileSync(join(process.cwd(), "supabase/maj-2026-11-27-f4.sql"), "utf8")
const reference = readFileSync(join(process.cwd(), "supabase/regles-demarchage.sql"), "utf8")
const SOCLE = `
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table public.agences (
  id uuid primary key default gen_random_uuid(), nom text not null default '', type text not null default 'agence', etape text not null default 'a_prospecter',
  ne_plus_ecrire_le timestamptz, premier_os_le date, derniere_activite_le timestamptz, dernier_signal_le timestamptz, dernier_signal text
);
create table public.leads_demarchage (
  id uuid primary key default gen_random_uuid(), agence_id uuid not null references public.agences(id) on delete cascade, contact_id uuid,
  source text not null, signal text not null, detail text not null default '', cree_le timestamptz not null default now(),
  dernier_signal_le timestamptz not null default now(), statut text not null default 'a_traiter', traite_le timestamptz, resultat text not null default ''
);
create unique index leads_demarchage_un_ouvert on public.leads_demarchage (agence_id) where statut = 'a_traiter';
create table public.liens_suivis (id uuid primary key default gen_random_uuid(), agence_id uuid, contact_id uuid, cible text, dernier_clic_le timestamptz, stop_vu_le timestamptz);
create table public.messages (
  id uuid primary key default gen_random_uuid(), agence_id uuid, contact_id uuid, sens text not null, espace text not null default 'demarchage',
  objet text, corps_text text, tri text, tri_detail jsonb, created_at timestamptz not null default now()
);
create table public.activites (
  id uuid primary key default gen_random_uuid(), agence_id uuid, contact_id uuid, type text, titre text, note text, date timestamptz, compte_nom text, source text
);
create table public.cmp_campagnes (id uuid primary key default gen_random_uuid(), base_id text, origine text, config jsonb);
create table public.cmp_envois (id uuid primary key default gen_random_uuid(), campagne_id uuid, contact_ref text, canal text, statut text default 'envoye', test boolean default false, le timestamptz default now());
create table public.cmp_evenements (
  id uuid primary key default gen_random_uuid(), campagne_id uuid, envoi_id uuid, contact_ref text not null, type text not null,
  le timestamptz not null default now(), lien text, robot boolean not null default false
);
create table public.cmp_inscriptions (
  id uuid primary key default gen_random_uuid(), campagne_id uuid not null, contact_ref text not null, etape_index integer not null default 0,
  statut text not null default 'en_cours', sortie_le timestamptz, unique (campagne_id, contact_ref)
);
create table public.clients_signales (id uuid primary key default gen_random_uuid(), agence_id uuid, statut text, premier_os_le timestamptz);
create table public.st_sous_traitants (id uuid primary key default gen_random_uuid(), email text, telephone text, desinscrit_canal text);
create table public.st_exclusions (id uuid primary key default gen_random_uuid(), email text, telephone text, motif text not null default '', cree_le timestamptz not null default now());
alter table public.st_exclusions add constraint st_exclusions_email_unique unique (email);
-- Les fonctions voisines, réduites à ce que le lot utilise.
create function public.lead_force(p_source text) returns integer language sql immutable as $$
  select case p_source when 'compte' then 5 when 'mail' then 4 when 'formulaire' then 4 when 'manuel' then 4 when 'page_compte' then 3 else 1 end $$;
create function public.cmp_campagne_qui_decide(p text) returns uuid language sql as $$ select null::uuid $$;
create function public.cmp_dernier_envoi(p_contact text, p_avant timestamptz) returns table (envoi_id uuid, campagne_id uuid) language sql stable as $$
  select e.id, e.campagne_id from public.cmp_envois e where e.contact_ref = p_contact and e.le <= p_avant order by e.le desc limit 1 $$;
create function public.cmp_evenement_correspond(p_evt text, p_type text, p_lien text, p_canal text) returns boolean language sql as $$
  select p_type = 'clic' and p_lien = 'plaquette' $$;
create function public.lead_mail_est_humain(p_objet text) returns boolean language sql as $$ select true $$;
create function public.cmp_action_reponse(p_config jsonb, p_tri text, p_texte text) returns text language sql as $$ select 'lead' $$;
create function public.cmp_poser_dead(p uuid, t text) returns void language sql as $$ select $$;
-- Le contrôle de santé, réduit à sa liste d'empreintes (forme de la base).
create function public.sante_demarchage() returns table (code text, nombre integer) language sql stable as $$
  select 'regle_modifiee', count(*)::integer from (values
      ('agence_premier_os', 'ec639a4844d765424b15d87f25eb2bb8')
      ) as e(nom, empreinte)
   where not exists (select 1 from pg_proc p where p.proname = e.nom and md5(replace(p.prosrc, chr(13), '')) = e.empreinte)
$$;
-- Les déclencheurs de la base sur ce que le lot redéfinit.
create function public.leads_fermer_si_desinscrit() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger leads_fermer_si_desinscrit after update of ne_plus_ecrire_le on public.agences for each row execute function public.leads_fermer_si_desinscrit();
create function public.cmp_lead_depuis_evenement() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger cmp_lead_evenement after insert on public.cmp_evenements for each row when (not new.robot) execute function public.cmp_lead_depuis_evenement();
create function public.agence_premier_os(p_agence_id uuid, p_date date default null, p_source text default 'fiche') returns void language plpgsql as $$
begin
  update public.agences set etape = 'client', premier_os_le = coalesce(premier_os_le, p_date, (now() at time zone 'Europe/Paris')::date) where id = p_agence_id;
end $$;
`

let db: PGlite
type Ligne = Record<string, unknown>
const q = async <T = Ligne>(texte: string, params: unknown[] = []) => (await db.query<T>(texte, params)).rows
const un = async <T = Ligne>(texte: string, params: unknown[] = []) => (await q<T>(texte, params))[0]
const agence = async (extra = "") => (await un<{ id: string }>(`insert into public.agences (nom${extra ? ", " + extra.split("=")[0] : ""}) values ('Agence'${extra ? ", " + extra.split("=")[1] : ""}) returning id`)).id
const lien = async (a: string, cible = "plaquette") => (await un<{ id: string }>(`insert into public.liens_suivis (agence_id, cible) values ($1, $2) returning id`, [a, cible])).id
const mailEnvoye = (a: string, quand: string) => q(`insert into public.messages (agence_id, sens, created_at) values ($1, 'sortant', $2)`, [a, quand])
// Un clic : le lien noté ouvert à l'instant (comme evenements-site), puis le verdict de la base.
async function clic(l: string, quand: string): Promise<string> {
  await q(`update public.liens_suivis set dernier_clic_le = $2 where id = $1`, [l, quand])
  return (await un<{ v: string }>(`select public.site_noter_clic($1, $2, 'Plaquette ouverte', '') as v`, [l, quand])).v
}
const leads = (a: string) => q<{ statut: string; source: string; resultat: string }>(`select statut, source, resultat from public.leads_demarchage where agence_id = $1 order by cree_le`, [a])
const poser = (a: string, source: string, quand = "now()") =>
  un<{ id: string | null }>(`select public.lead_poser($1, null, $2, 'signal', '', ${quand === "now()" ? "now()" : `'${quand}'::timestamptz`}) as id`, [a, source])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(SOCLE)
  await db.exec(lot)
}, 60_000)

describe("lot 4 : les robots", () => {
  it("un clic 2 s après le mail (Paris Autrement) : robot, ni note ni signal", async () => {
    const a = await agence(), l = await lien(a, "creer_compte")
    await mailEnvoye(a, "2026-11-05T14:11:01Z")
    expect(await clic(l, "2026-11-05T14:11:04Z")).toBe("robot")
    expect((await un<{ n: number }>(`select count(*)::int as n from public.activites where agence_id = $1`, [a])).n).toBe(0)
  })
  it("un seul lien ouvert 3 minutes après le mail : un vrai clic", async () => {
    const a = await agence(), l = await lien(a)
    await mailEnvoye(a, "2026-11-05T14:00:00Z")
    expect(await clic(l, "2026-11-05T14:03:00Z")).toBe("ok")
  })
  it("une rafale jugée après coup : le lead faible né du 1er clic est fermé « robot », un lead plus ancien reste", async () => {
    const a = await agence()
    const l1 = await lien(a), l2 = await lien(a, "site")
    await q(`insert into public.leads_demarchage (agence_id, source, signal, cree_le) values ($1, 'plaquette', 'A ouvert la plaquette', '2026-11-23T07:04:23Z')`, [a])
    await q(`update public.liens_suivis set dernier_clic_le = '2026-11-23T07:04:23Z' where id = $1`, [l1])
    expect(await clic(l2, "2026-11-23T07:04:24Z")).toBe("robot")
    expect(await leads(a)).toEqual([{ statut: "traite", source: "plaquette", resultat: "robot" }])
    const b = await agence(), m1 = await lien(b), m2 = await lien(b, "site")
    await q(`insert into public.leads_demarchage (agence_id, source, signal, cree_le) values ($1, 'mail', 'A répondu', '2026-11-20T09:00:00Z')`, [b])
    await q(`update public.liens_suivis set dernier_clic_le = '2026-11-23T08:00:00Z' where id = $1`, [m1])
    expect(await clic(m2, "2026-11-23T08:00:01Z")).toBe("robot")
    expect(await leads(b)).toEqual([{ statut: "a_traiter", source: "mail", resultat: "" }])
  })
  it("la page « Créer un compte » : robot après une rafale, un clic trop tôt ou le lien stop ; personne sinon", async () => {
    const robot = (a: string, quand: string) => un<{ r: boolean }>(`select public.site_robot_recent($1, $2) as r`, [a, quand]).then((x) => x.r)
    const a = await agence(), x1 = await lien(a, "creer_compte"), x2 = await lien(a)
    await q(`update public.liens_suivis set dernier_clic_le = '2026-10-27T14:09:50Z' where id in ($1, $2)`, [x1, x2])
    expect(await robot(a, "2026-10-27T14:09:57.4Z")).toBe(true)
    const b = await agence(), y = await lien(b, "creer_compte")
    await mailEnvoye(b, "2026-11-05T14:11:01Z")
    await q(`update public.liens_suivis set dernier_clic_le = '2026-11-05T14:11:04Z' where id = $1`, [y])
    expect(await robot(b, "2026-11-05T14:11:12Z")).toBe(true)
    const c = await agence(), z = await lien(c, "creer_compte")
    await q(`update public.liens_suivis set stop_vu_le = '2026-11-25T10:00:00Z' where id = $1`, [z])
    expect(await robot(c, "2026-11-25T10:00:09Z")).toBe(true)
    const d = await agence(), w = await lien(d, "creer_compte")
    await mailEnvoye(d, "2026-11-05T09:00:00Z")
    await q(`update public.liens_suivis set dernier_clic_le = '2026-11-05T11:00:00Z' where id = $1`, [w])
    expect(await robot(d, "2026-11-05T11:00:05Z")).toBe(false)
  })
})

describe("lot 4 : les leads (décision 2)", () => {
  it("après une fermeture « robot » ou « désinscrit » : un signal faible refait un lead", async () => {
    const a = await agence()
    await q(`insert into public.leads_demarchage (agence_id, source, signal, statut, traite_le, resultat) values ($1, 'plaquette', 's', 'traite', now(), 'robot')`, [a])
    expect((await poser(a, "plaquette")).id).not.toBeNull()
  })
  it("après un appel (lead traité) : 3 jours sans lead sur un clic, mais un formulaire ou une réponse en font un", async () => {
    const a = await agence()
    await q(`insert into public.leads_demarchage (agence_id, source, signal, statut, traite_le, resultat) values ($1, 'plaquette', 's', 'traite', now(), 'a_rappeler')`, [a])
    expect((await poser(a, "plaquette")).id).toBeNull()
    expect((await poser(a, "page_compte")).id).toBeNull()
    expect((await poser(a, "formulaire")).id).not.toBeNull()
  })
  it("la désinscription ferme un lead de plaquette, pas un lead né d'une réponse écrite", async () => {
    const a = await agence(), b = await agence()
    await poser(a, "plaquette")
    await poser(b, "mail")
    await q(`update public.agences set ne_plus_ecrire_le = now() where id in ($1, $2)`, [a, b])
    expect(await leads(a)).toEqual([{ statut: "traite", source: "plaquette", resultat: "desinscrit" }])
    expect(await leads(b)).toEqual([{ statut: "a_traiter", source: "mail", resultat: "" }])
  })
  it("« la plaquette 2 fois » : un clic de robot + un vrai clic ne suffisent pas, deux vrais clics oui", async () => {
    const c = await un<{ id: string }>(`insert into public.cmp_campagnes (base_id, config) values ('agences', '{"v":"1","qualification":{"interet":[{"evenement":"A ouvert la plaquette","fois":2,"jours":7}]}}') returning id`)
    const a = await agence(), b = await agence()
    const ev = (x: string, le: string, robot: boolean) => q(`insert into public.cmp_evenements (campagne_id, contact_ref, type, le, lien, robot) values ($1, $2, 'clic', $3, 'plaquette', $4)`, [c.id, x, le, robot])
    await ev(a, "2026-11-24T08:00:00Z", true); await ev(a, "2026-11-25T08:00:00Z", false)
    expect(await leads(a)).toEqual([])
    await ev(b, "2026-11-24T08:00:00Z", false); await ev(b, "2026-11-25T08:00:00Z", false)
    expect((await leads(b)).map((l) => l.source)).toEqual(["plaquette"])
  })
})

describe("lot 4 : premier OS, liste d'exclusion, données", () => {
  it("STC Bâtiment connaît un OS plus ancien : la fiche est recalée ; la fiche ne recule jamais d'elle-même", async () => {
    const a = await agence("etape='client'")
    await q(`update public.agences set premier_os_le = '2026-05-12' where id = $1`, [a])
    await q(`select public.agence_premier_os($1, '2026-06-01', 'fiche')`, [a])
    expect((await un<{ d: string }>(`select premier_os_le::text as d from public.agences where id = $1`, [a])).d).toBe("2026-05-12")
    await q(`select public.agence_premier_os($1, '2026-06-01', 'stc_batiment')`, [a])
    expect((await un<{ d: string }>(`select premier_os_le::text as d from public.agences where id = $1`, [a])).d).toBe("2026-05-12")
    await q(`select public.agence_premier_os($1, '2026-04-14', 'stc_batiment')`, [a])
    expect((await un<{ d: string }>(`select premier_os_le::text as d from public.agences where id = $1`, [a])).d).toBe("2026-04-14")
  })
  it("le texte d'agence_premier_os est celui du fichier de référence (empreinte), et le contrôle de santé la connaît", async () => {
    const attendue = /\('agence_premier_os', '([0-9a-f]{32})'\)/.exec(reference)![1]
    const r = await un<{ e: string }>(`select md5(replace(prosrc, chr(13), '')) as e from pg_proc where proname = 'agence_premier_os'`)
    expect(r.e).toBe(attendue)
    expect((await un<{ n: number }>(`select nombre as n from public.sante_demarchage()`)).n).toBe(0)
  })
  it("st_exclure : l'adresse déjà exclue reçoit le numéro ; un numéro déjà exclu n'est pas doublé", async () => {
    await q(`insert into public.st_exclusions (email, motif) values ('casaloje@hotmail.com', 'signalé comme indésirable')`)
    await q(`select public.st_exclure(' Casaloje@Hotmail.com ', '06 99 41 11 00', 'x')`)
    await q(`select public.st_exclure('', '0699411100', 'x')`)
    await q(`select public.st_exclure('autre@exemple.fr', '', 'x')`)
    expect(await q(`select email, telephone from public.st_exclusions order by email nulls last`)).toEqual([
      { email: "autre@exemple.fr", telephone: null }, { email: "casaloje@hotmail.com", telephone: "06 99 41 11 00" },
    ])
  })
  it("rejoué une seconde fois : aucune erreur, rien ne bouge", async () => {
    const avant = await q(`select id, statut, resultat from public.leads_demarchage order by id`)
    await db.exec(lot)
    expect(await q(`select id, statut, resultat from public.leads_demarchage order by id`)).toEqual(avant)
  })
})
