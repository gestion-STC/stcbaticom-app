-- AUDIT RLS — lecture seule, ne modifie rien.
-- But : connaitre l'etat REEL de la base avant de corriger quoi que ce soit.
-- Les fichiers maj-*.sql du depot sont joues a la main : ils ne prouvent pas
-- ce qui est reellement applique en production.
--
-- UNE SEULE requete : l'editeur SQL de Supabase n'affiche que le dernier
-- resultat d'un script, donc tout est regroupe ici en un seul tableau.
--
-- A executer dans Supabase : SQL Editor -> coller -> Run.
-- Passer la limite d'affichage a 500 lignes (menu "Limite de 100 lignes").
--
-- Lecture du resultat :
--   A. = table sans RLS         -> ouverte a tout porteur de la cle publiable
--   B. = policy ouverte a anon  -> accessible sans etre connecte
--   C. = fonction appelable par anon (SECURITY DEFINER = ignore la RLS)
-- Apres correction, il ne doit plus rester AUCUNE ligne A. ni B.

select 'A. table sans RLS'::text as controle,
       c.relname::text           as objet,
       'RLS desactivee'::text    as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false

union all

select 'B. policy ouverte a anon'::text,
       (p.tablename || ' / ' || p.policyname)::text,
       ('commande ' || p.cmd)::text
from pg_policies p
where p.schemaname = 'public'
  and 'anon' = any (p.roles)

union all

select 'C. fonction appelable par anon'::text,
       f.proname::text,
       case when f.prosecdef then 'SECURITY DEFINER — ignore la RLS'
            else 'invoker — RLS appliquee' end::text
from pg_proc f
join pg_namespace n2 on n2.oid = f.pronamespace
where n2.nspname = 'public'
  and has_function_privilege('anon', f.oid, 'execute')

order by 1, 2;
