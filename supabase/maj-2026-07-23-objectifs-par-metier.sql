-- ============================================================================
--  Objectifs de recrutement PAR MÉTIER (ex. 2 plombiers/sem, 1 peintre/sem).
--  Le moteur (sequenceur-st) démarre, pour chaque métier actif, juste ce qu'il
--  faut de sous-traitants de CE métier (colonne st_sous_traitants.metier).
--  Une seule séquence commune sert tout le monde ({{metier}} personnalise).
--
--  À exécuter UNE FOIS dans Supabase → SQL Editor. Ré-exécutable sans risque.
-- ============================================================================

create table if not exists public.st_objectifs (
  id             uuid primary key default gen_random_uuid(),
  metier         text not null,
  objectif_hebdo integer not null default 1,   -- nb à recruter par semaine pour ce métier
  actif          boolean not null default true,
  cree_le        timestamptz not null default now()
);

-- Un seul objectif par métier (insensible à la casse : "Plombier" = "plombier").
create unique index if not exists st_objectifs_metier_idx
  on public.st_objectifs(lower(metier));

-- Sécurité : réservé à l'utilisateur connecté (comme le reste).
alter table public.st_objectifs enable row level security;
drop policy if exists "acces_connecte" on public.st_objectifs;
create policy "acces_connecte" on public.st_objectifs
  for all to authenticated using (true) with check (true);
