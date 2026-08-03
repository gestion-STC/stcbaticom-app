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

-- Accès réservé aux utilisateurs connectés. Le rôle anon n'a aucun droit :
-- la clé publiable est publique (dépôt public + bundle JS), elle ne doit donc
-- jamais suffire à lire ou écrire la base.
drop policy if exists "acces_prototype" on public.prospects;
drop policy if exists "acces_connecte"  on public.prospects;
create policy "acces_connecte" on public.prospects
  for all
  to authenticated
  using (true)
  with check (true);
