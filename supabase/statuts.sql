-- Table des états (statuts) configurables + données de départ.
-- À exécuter dans Supabase : SQL Editor → coller → Run.

create table if not exists public.statuts (
  id           uuid primary key default gen_random_uuid(),
  libelle      text not null,
  couleur      text not null default 'slate',
  ordre        int  not null default 0,
  est_objectif boolean not null default false,
  cree_le      timestamptz not null default now()
);

alter table public.statuts enable row level security;

drop policy if exists "acces_prototype_statuts" on public.statuts;
create policy "acces_prototype_statuts" on public.statuts
  for all to anon, authenticated
  using (true) with check (true);

-- États de départ (vous pourrez tout modifier ensuite dans l'appli)
insert into public.statuts (libelle, couleur, ordre, est_objectif) values
  ('Nouveau prospect', 'slate',   1, false),
  ('À rappeler',       'blue',    2, false),
  ('Contacté',         'cyan',    3, false),
  ('Intéressé',        'violet',  4, false),
  ('RDV pris',         'orange',  5, false),
  ('Relance',          'pink',    6, false),
  ('Client signé',     'emerald', 7, false),
  ('Injoignable',      'slate',   8, false),
  ('Perdu',            'red',     9, false);

-- Renomme les prospects déjà importés : « Nouveau lead » -> « Nouveau prospect »
update public.prospects set statut = 'Nouveau prospect' where statut = 'Nouveau lead';
