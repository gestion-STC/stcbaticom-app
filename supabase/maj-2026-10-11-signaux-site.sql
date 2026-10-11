-- ============================================================================
--  À COLLER DANS LE PROJET **STCBATICOM** (ifvrmsiwlwppinfdmeao).
--
--  Les signaux du site (11/10/2026) : ce qu'une agence fait après notre mail —
--  lien ouvert, plaquette ouverte, page « Créer un compte » ouverte, compte
--  ouvert sur STC Bâtiment. Chaque mail porte des liens propres à l'agence
--  (liens_suivis) ; STC Bâtiment prévient quand un compte s'ouvre.
-- ============================================================================
do $$ begin
  if to_regclass('public.agences') is null or to_regclass('public.activites') is null then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans STCBATICOM (ifvrmsiwlwppinfdmeao).';
  end if;
end $$;

-- 1) Les liens suivis : un jeton par (agence, contact, cible)
create table if not exists public.liens_suivis (
  id          uuid primary key default gen_random_uuid(),
  jeton       text not null unique,
  agence_id   uuid references public.agences(id) on delete cascade,
  contact_id  uuid references public.contacts(id) on delete set null,
  cible       text not null default 'creer_compte',   -- creer_compte | plaquette | site | barème…
  url         text not null default '',               -- l'adresse finale (pour plaquette / site)
  cree_le     timestamptz not null default now(),
  nb_clics    integer not null default 0,
  dernier_clic_le timestamptz
);
create index if not exists liens_suivis_agence_idx on public.liens_suivis (agence_id);
alter table public.liens_suivis enable row level security;
drop policy if exists "acces_connecte" on public.liens_suivis;
create policy "acces_connecte" on public.liens_suivis for all to authenticated using (true) with check (true);

-- 2) Sur l'agence : les signaux qui comptent, lisibles d'un coup
alter table public.agences
  add column if not exists dernier_signal_le timestamptz,                 -- le dernier geste de l'agence (clic, page, compte)
  add column if not exists dernier_signal    text not null default '',    -- « plaquette ouverte », « page Créer un compte ouverte », « compte ouvert »
  add column if not exists compte_ouvert_le  timestamptz,                 -- un compte STC Bâtiment a été ouvert
  add column if not exists compte_email      text not null default '';

-- 3) Les activités portent une source « site » (le type « note » reste : c'est une trace, pas un appel)
-- (aucune contrainte à toucher : activites.source est un texte libre)

-- Contrôle
select count(*) as liens_suivis from public.liens_suivis;
