-- ════════════════════════════════════════════════════════════════════════════
-- SÉCURITÉ (Mahdi, 11/11/2026 : « fermer tout ça pour que le logiciel soit bien sécurisé »)
--   1. Seuls les MEMBRES de l'équipe (compte admin ou télépro) lisent et écrivent : un compte sans rôle
--      (par exemple créé par l'inscription publique) ne voit plus rien, ni dans les tables, ni dans les fichiers.
--   2. La clé interne (parametres.analyse_passage_cle) n'est plus lisible depuis le logiciel : seul le serveur la lit.
--   3. Les fonctions de la base ne s'appellent plus sans être connecté.
--   4. Les fonctions sans chemin de recherche fixé en reçoivent un.
-- À coller dans Baticom. Rejouable.
-- ════════════════════════════════════════════════════════════════════════════
do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cmp_campagnes') then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans Baticom.';
  end if;
end $$;

-- Qui est membre : le rôle posé par le serveur sur le compte (jamais modifiable par l'utilisateur lui-même).
create or replace function public.est_membre()
returns boolean language sql stable set search_path to '' as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'telepro')
$$;

-- 1. Toutes les règles « tout compte connecté » deviennent « membres seulement ».
do $$
declare p record; q text; c text;
begin
  for p in select schemaname, tablename, policyname, cmd, qual, with_check from pg_policies
            where schemaname = 'public' and 'authenticated' = any(roles) loop
    if coalesce(p.qual, '') like '%est_membre()%' or coalesce(p.with_check, '') like '%est_membre()%' then continue; end if;
    q := 'public.est_membre() and (' || coalesce(p.qual, 'true') || ')';
    c := 'public.est_membre() and (' || coalesce(p.with_check, p.qual, 'true') || ')';
    if p.cmd in ('SELECT', 'DELETE') then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, q);
    elsif p.cmd = 'INSERT' then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, c);
    else
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', p.policyname, p.schemaname, p.tablename, q, c);
    end if;
  end loop;
end $$;

-- Les fichiers (pièces jointes, contrats, dossiers, mails reçus) : pareil.
do $$
declare p record; q text; c text;
begin
  for p in select schemaname, tablename, policyname, cmd, qual, with_check from pg_policies
            where schemaname = 'storage' and tablename = 'objects' and 'authenticated' = any(roles) loop
    if coalesce(p.qual, '') like '%est_membre()%' or coalesce(p.with_check, '') like '%est_membre()%' then continue; end if;
    q := 'public.est_membre() and (' || coalesce(p.qual, 'true') || ')';
    c := 'public.est_membre() and (' || coalesce(p.with_check, p.qual, 'true') || ')';
    if p.cmd in ('SELECT', 'DELETE') then
      execute format('alter policy %I on storage.objects using (%s)', p.policyname, q);
    elsif p.cmd = 'INSERT' then
      execute format('alter policy %I on storage.objects with check (%s)', p.policyname, c);
    else
      execute format('alter policy %I on storage.objects using (%s) with check (%s)', p.policyname, q, c);
    end if;
  end loop;
exception when insufficient_privilege then
  raise notice 'Fichiers : droits insuffisants pour modifier les règles du stockage (à faire depuis Storage › Policies).';
end $$;

-- 2. La clé interne : invisible depuis le logiciel (le serveur la lit avec sa clé de service).
alter policy acces_connecte on public.parametres
  using (public.est_membre() and cle <> 'analyse_passage_cle')
  with check (public.est_membre() and cle <> 'analyse_passage_cle');

-- 3. Les fonctions de la base : plus d'appel sans être connecté (les déclencheurs et le serveur ne sont pas concernés).
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- 4. Un chemin de recherche fixé pour les fonctions qui n'en ont pas.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'archive') and p.proconfig is null and p.prokind = 'f'
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    execute format('alter function %s set search_path to public, extensions, pg_temp', f.sig);
  end loop;
end $$;

-- Contrôle : doit afficher 0 règle « tout connecté » restante, et la clé interne invisible.
select (select count(*) from pg_policies where schemaname = 'public' and 'authenticated' = any(roles) and coalesce(qual, with_check, '') not like '%est_membre()%') as regles_restantes,
       (select count(*) from pg_policies where schemaname = 'storage' and 'authenticated' = any(roles) and coalesce(qual, with_check, '') not like '%est_membre()%') as fichiers_restants;
