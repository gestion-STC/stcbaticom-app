-- Mise à jour consolidée : table des états + colonnes adresse/arrondissement/commentaire.
-- À exécuter une fois dans Supabase : SQL Editor → coller → Run.

-- 1) Table des états (états configurables)
create table if not exists public.statuts (
  id             uuid primary key default gen_random_uuid(),
  libelle        text not null,
  couleur        text not null default 'slate',
  ordre          int  not null default 0,
  est_objectif   boolean not null default false,
  categorie      text default '',
  email_rattache text default '',
  relance_jours  int,
  cree_le        timestamptz not null default now()
);
-- (si la table existait déjà, on s'assure que les colonnes sont là)
alter table public.statuts add column if not exists categorie text default '';
alter table public.statuts add column if not exists email_rattache text default '';
alter table public.statuts add column if not exists relance_jours int;
alter table public.statuts enable row level security;
drop policy if exists "acces_prototype_statuts" on public.statuts;
create policy "acces_prototype_statuts" on public.statuts
  for all to anon, authenticated using (true) with check (true);

insert into public.statuts (libelle, couleur, ordre)
select * from (values
  ('Nouveau prospect','slate',1),('À rappeler','blue',2),('Contacté','cyan',3),
  ('Intéressé','violet',4),('RDV pris','orange',5),('Relance','pink',6),
  ('Client signé','emerald',7),('Injoignable','slate',8),('Perdu','red',9)
) as v(libelle,couleur,ordre)
where not exists (select 1 from public.statuts);

-- 2) Nouvelles colonnes sur les prospects
alter table public.prospects add column if not exists adresse text default '';
alter table public.prospects add column if not exists arrondissement text default '';
alter table public.prospects add column if not exists commentaire text default '';

-- 3) Migration : l'ancienne "ville" contenait la rue -> on la met dans adresse,
--    et on renseigne l'arrondissement (fichier d'origine 75001).
update public.prospects
  set adresse = ville
  where (adresse is null or adresse = '') and ville is not null;
update public.prospects
  set arrondissement = '75001'
  where arrondissement is null or arrondissement = '';

-- 4) On retire l'ancienne colonne "ville" (devenue inutile)
alter table public.prospects drop column if exists ville;
