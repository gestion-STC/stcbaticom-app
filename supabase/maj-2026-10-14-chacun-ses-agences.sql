-- ═══════════════════════════════════════════════════════════════════════════
--  CHACUN SES AGENCES (14/10/2026) — le rattrapage, une seule fois
--
--  À coller APRÈS supabase/regles-demarchage.sql (qui pose la règle).
--  La règle : le SECTEUR décide pour la prospection ; une agence TRAVAILLÉE (joint,
--  intéressée, RDV, rappel prévu) reste à celui qui l'a travaillée.
--  Ce rattrapage rend à chacun les agences qu'il a déjà travaillées :
--    · intéressée / RDV → celui qui a obtenu le premier « intéressé » ou « RDV » ;
--    · joint ou rappel prévu → celui qui a posé le rappel, sinon celui qui a eu le gestionnaire.
--  Une agence dont l'historique ne dit pas qui l'a travaillée garde son propriétaire actuel.
--  Les 23 rappels remis en place le 13/10 (gestionnaire joint qui avait demandé à être rappelé)
--  reprennent l'étape « gestionnaire joint » qu'ils auraient dû garder.
-- ═══════════════════════════════════════════════════════════════════════════

-- Les noms des comptes, pour les appels de l'ancien logiciel qui n'ont que le nom de l'auteur.
create temporary table _comptes as
  select id, lower(coalesce(raw_user_meta_data->>'nom', '')) nom from auth.users where coalesce(raw_user_meta_data->>'nom', '') <> '';

-- 1. Les gestionnaires joints remis à « à prospecter » par erreur (rappel ouvert, dernier appel = joint).
select set_config('app.proprietaire_gere', '1', true);
select set_config('app.source', 'reprise 14/10', true);
update public.agences a set etape = 'gestionnaire_joint'
 where a.type <> 'apporteur' and a.etape = 'a_prospecter'
   and exists (select 1 from public.activites t where t.agence_id = a.id and t.type in ('tache', 'rdv') and t.fait_le is null and t.titre like 'Rappeler%')
   and (select x.resultat from public.activites x where x.agence_id = a.id and x.type = 'appel' and x.sens <> 'entrant' and x.resultat <> 'lance' order by x.date desc limit 1) = 'joint';

-- 2. Qui a travaillé chaque agence.
create temporary table _qui as
with t as (
  select a.id, a.etape, a.commercial_id,
    case when a.etape in ('interesse', 'rdv_planifie') then
           (select coalesce(x.compte_id, (select c.id from _comptes c where c.nom = lower(x.compte_nom) limit 1))
              from public.activites x where x.agence_id = a.id and x.type = 'appel' and x.issue in ('interesse', 'rdv')
               and (x.compte_id is not null or x.compte_nom <> '') order by x.date limit 1)
         else coalesce(
           (select coalesce(t.compte_id, (select c.id from _comptes c where c.nom = lower(t.compte_nom) limit 1))
              from public.activites t where t.agence_id = a.id and t.type in ('tache', 'rdv') and t.fait_le is null
               and (t.compte_id is not null or t.compte_nom <> '') order by t.date limit 1),
           (select coalesce(x.compte_id, (select c.id from _comptes c where c.nom = lower(x.compte_nom) limit 1))
              from public.activites x where x.agence_id = a.id and x.type = 'appel' and x.resultat = 'joint'
               and (x.compte_id is not null or x.compte_nom <> '') order by x.date limit 1)) end qui
  from public.agences a
  where a.type <> 'apporteur' and a.etape <> 'client' and public.agence_travaillee(a.etape, a.id))
select * from t where qui is not null and qui is distinct from commercial_id;

-- 3. Chacun récupère ses agences.
update public.agences a set commercial_id = q.qui from _qui q where q.id = a.id;
select set_config('app.proprietaire_gere', '', true);

-- Contrôle : combien d'agences ont changé de main, et la santé (doit rester vide, sauf appels à compléter).
select 'agences rendues à celui qui les a travaillées' as quoi, count(*)::text as n from _qui
union all
select code, nombre::text from public.sante_demarchage() where code <> 'appel_non_note';

drop table _qui;
drop table _comptes;
