-- Banc d'essai du démarchage : les tables telles qu'elles sont en production (13/10/2026),
-- sans les tables étrangères au démarchage. Chargé par supabase/tests/regles-demarchage.test.ts
-- dans une base Postgres locale (PGlite), avant supabase/regles-demarchage.sql.
-- N'est JAMAIS collé en prod.

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;

create table public.secteurs (
  code text primary key, libelle text not null, zone text not null, ordre integer not null default 0, commercial_id uuid
);
create table public.parametres (cle text primary key, valeur text not null default '', maj_le timestamptz not null default now());
create table public.agences (
  id uuid primary key default gen_random_uuid(), nom text not null, adresse text default '', arrondissement text default '',
  cree_le timestamptz not null default now(), logo_url text default '', nb_lots integer not null default 0, enseigne text not null default '',
  type text not null default 'agence' check (type in ('agence','syndic','administrateur','bailleur','apporteur','autre')),
  secteur text references public.secteurs(code), telephone text not null default '', email text not null default '', site text not null default '',
  etape text not null default 'a_prospecter' check (etape in ('a_prospecter','gestionnaire_joint','interesse','rdv_planifie','client','pas_interesse','endormie','hors_cible')),
  etape_depuis timestamptz not null default now(), commercial_id uuid, tentatives integer not null default 0, joint_fois integer not null default 0,
  reveil_le date, motif text not null default '', premier_os_le date, source text not null default '', numero_emission text not null default '',
  prospect_id uuid, nom_cle text, derniere_activite_le timestamptz, maj_le timestamptz not null default now(),
  dernier_signal_le timestamptz, dernier_signal text not null default '', compte_ouvert_le timestamptz, compte_email text not null default ''
);
create table public.contacts (
  id uuid primary key default gen_random_uuid(), agence_id uuid not null references public.agences(id) on delete cascade,
  prenom text not null default '', nom text not null default '', role text not null default 'gestionnaire', ligne_directe text not null default '',
  mobile text not null default '', email text not null default '', principal boolean not null default false, parti boolean not null default false,
  note text not null default '', prospect_id uuid, cree_le timestamptz not null default now(), maj_le timestamptz not null default now()
);
create table public.activites (
  id uuid primary key default gen_random_uuid(), agence_id uuid not null references public.agences(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  type text not null check (type in ('appel','email','rdv','tache','note','etape')),
  date timestamptz not null default now(), echeance timestamptz, fait_le timestamptz, compte_id uuid default auth.uid(),
  compte_nom text not null default '', titre text not null default '', note text not null default '', resultat text not null default '',
  issue text not null default '', motif text not null default '', numero_utilise text not null default '', duree_s integer,
  call_id text not null default '', sens text not null default 'sortant', rdv_type text not null default '', message_id uuid,
  etape_de text not null default '', etape_vers text not null default '', source text not null default '', cree_le timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  sens text not null check (sens in ('entrant','sortant')), de text not null default '', a text not null default '', objet text not null default '',
  corps_text text not null default '', corps_html text not null default '', message_id text, in_reply_to text, prospect_id uuid,
  lu boolean not null default false, brut jsonb, pieces_jointes jsonb not null default '[]',
  espace text not null default 'demarchage' check (espace in ('demarchage','recrutement')), sous_traitant_id uuid,
  agence_id uuid references public.agences(id) on delete set null, contact_id uuid references public.contacts(id) on delete set null
);
grant usage on schema public, auth to authenticated;
grant all on all tables in schema public to authenticated;
