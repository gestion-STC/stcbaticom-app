-- ============================================================================
--  À COLLER DANS LE PROJET **STCBATICOM** (ifvrmsiwlwppinfdmeao).
--
--  Contrats sous-traitants par DocuSign (11/10/2026). Depuis la fiche artisan,
--  « Envoyer les contrats » : l'artisan signe, puis STC signe, et le PDF signé
--  revient dans la fiche. Les modèles de contrat (PDF) vivent dans le bucket
--  privé `contrats` ; les envois dans `st_contrats` ; le dernier état sur la fiche.
-- ============================================================================

do $$ begin
  if to_regclass('public.st_sous_traitants') is null then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans STCBATICOM (ifvrmsiwlwppinfdmeao).';
  end if;
end $$;

-- 1) Le bucket privé des contrats : modeles/<fichier>.pdf et signes/<artisan>/<enveloppe>.pdf
insert into storage.buckets (id, name, public) values ('contrats', 'contrats', false) on conflict (id) do nothing;
drop policy if exists "contrats_lecture_connecte" on storage.objects;
create policy "contrats_lecture_connecte" on storage.objects for select to authenticated using (bucket_id = 'contrats');
drop policy if exists "contrats_depot_connecte" on storage.objects;
create policy "contrats_depot_connecte" on storage.objects for insert to authenticated with check (bucket_id = 'contrats' and (storage.foldername(name))[1] = 'modeles');
drop policy if exists "contrats_maj_connecte" on storage.objects;
create policy "contrats_maj_connecte" on storage.objects for update to authenticated using (bucket_id = 'contrats' and (storage.foldername(name))[1] = 'modeles');
drop policy if exists "contrats_suppr_connecte" on storage.objects;
create policy "contrats_suppr_connecte" on storage.objects for delete to authenticated using (bucket_id = 'contrats' and (storage.foldername(name))[1] = 'modeles');

-- 2) Les modèles : quels PDF partent, dans quel ordre.
create table if not exists public.st_contrats_modeles (
  id        uuid primary key default gen_random_uuid(),
  nom       text not null,
  chemin    text not null unique,         -- dans le bucket `contrats`, ex. modeles/contrat-cadre.pdf
  ordre     integer not null default 1,
  actif     boolean not null default true,
  cree_le   timestamptz not null default now()
);
alter table public.st_contrats_modeles enable row level security;
drop policy if exists "acces_connecte" on public.st_contrats_modeles;
create policy "acces_connecte" on public.st_contrats_modeles for all to authenticated using (true) with check (true);

-- 3) Les envois (une enveloppe DocuSign = un envoi, tous les contrats dedans).
create table if not exists public.st_contrats (
  id                 uuid primary key default gen_random_uuid(),
  sous_traitant_id   uuid not null references public.st_sous_traitants(id) on delete cascade,
  envelope_id        text not null unique,
  statut             text not null default 'envoye' check (statut in ('envoye', 'livre', 'signe_artisan', 'signe', 'refuse', 'annule', 'erreur')),
  envoye_le          timestamptz not null default now(),
  signe_artisan_le   timestamptz,
  signe_le           timestamptz,
  pdf_path           text not null default '',           -- signes/<artisan>/<enveloppe>.pdf une fois signé
  documents          jsonb not null default '[]'::jsonb, -- [{nom, chemin}]
  compte_nom         text not null default '',
  erreur             text not null default '',
  maj_le             timestamptz not null default now()
);
create index if not exists st_contrats_st_idx on public.st_contrats (sous_traitant_id, envoye_le desc);
alter table public.st_contrats enable row level security;
drop policy if exists "acces_connecte" on public.st_contrats;
create policy "acces_connecte" on public.st_contrats for all to authenticated using (true) with check (true);

-- 4) Le dernier état sur la fiche, tenu par déclencheur.
alter table public.st_sous_traitants
  add column if not exists contrat_statut text not null default '',   -- '' | envoye | livre | signe_artisan | signe | refuse | annule | erreur
  add column if not exists contrat_le     timestamptz,
  add column if not exists contrat_signe_le timestamptz;
create or replace function public.st_contrats_vers_fiche() returns trigger language plpgsql as $$
begin
  update public.st_sous_traitants
     set contrat_statut = new.statut, contrat_le = coalesce(new.maj_le, now()), contrat_signe_le = coalesce(new.signe_le, contrat_signe_le)
   where id = new.sous_traitant_id;
  return new;
end $$;
drop trigger if exists st_contrats_vers_fiche on public.st_contrats;
create trigger st_contrats_vers_fiche after insert or update on public.st_contrats for each row execute function public.st_contrats_vers_fiche();

-- Contrôle
select count(*) as modeles from public.st_contrats_modeles;
