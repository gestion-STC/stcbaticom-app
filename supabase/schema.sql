-- Table des prospects pour le module commercial STC.
-- À exécuter dans Supabase : SQL Editor → coller ce script → Run.

create table if not exists public.prospects (
  id                uuid primary key default gen_random_uuid(),
  entreprise        text not null default '',
  contact           text not null default '',
  telephone         text not null default '',
  email             text not null default '',
  ville             text not null default '',
  type              text not null default 'Gestionnaire locatif',
  statut            text not null default 'Nouveau lead',
  priorite          text not null default '—',
  prochaine_relance text not null default '—',
  cree_le           timestamptz not null default now()
);

-- Sécurité au niveau des lignes (RLS)
alter table public.prospects enable row level security;

-- Prototype : on autorise l'accès complet (lecture/écriture) sans authentification.
-- À remplacer par des règles liées à l'utilisateur connecté quand on ajoutera l'auth.
drop policy if exists "acces_prototype" on public.prospects;
create policy "acces_prototype" on public.prospects
  for all
  to anon, authenticated
  using (true)
  with check (true);
