-- ============================================================================
--  À COLLER DANS LE PROJET **STCBATICOM** (ifvrmsiwlwppinfdmeao).
--
--  Lecture des pièces des dossiers sous-traitants (11/10/2026) : « Object not found »
--  en ouvrant un contrat signé depuis un dossier. Le bucket privé `dossiers-st`
--  n'autorisait que le dépôt (site) ; un utilisateur connecté à Baticom ne pouvait
--  pas lire ses pièces. On ouvre la LECTURE aux utilisateurs connectés, sur les
--  deux buckets des contrats. Ré-exécutable sans danger.
-- ============================================================================
do $$ begin
  if to_regclass('public.dossiers_st') is null or to_regclass('public.st_contrats') is null then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans STCBATICOM (ifvrmsiwlwppinfdmeao).';
  end if;
end $$;

-- 1) Les pièces des dossiers (bucket dossiers-st) : lecture par les utilisateurs connectés
drop policy if exists "dossiers_st_lecture_connecte" on storage.objects;
create policy "dossiers_st_lecture_connecte" on storage.objects
  for select to authenticated using (bucket_id = 'dossiers-st');

-- 2) Les contrats signés (bucket contrats) : lecture par les utilisateurs connectés (ré-affirmée)
drop policy if exists "contrats_lecture_connecte" on storage.objects;
create policy "contrats_lecture_connecte" on storage.objects
  for select to authenticated using (bucket_id = 'contrats');

-- Contrôle : les politiques de lecture posées sur ces deux buckets
select policyname, cmd, roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (qual like '%dossiers-st%' or qual like '%''contrats''%')
order by policyname;
