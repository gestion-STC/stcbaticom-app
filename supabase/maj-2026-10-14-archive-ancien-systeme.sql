-- ═══════════════════════════════════════════════════════════════════════════
--  14/10/2026 — Rangement de l'ancien système (avant la refonte du 09/10)
--
--  Vérifié avant de toucher : AUCUN écran, AUCUNE fonction serveur déployée (22 relues),
--  AUCUNE fonction ou vue de la base ne lit ou n'écrit ces tables. Leurs données sont
--  déjà reprises dans le nouveau modèle (activites, agences, contacts).
--  On ne SUPPRIME rien : les tables passent dans un schéma « archive », hors du logiciel
--  (et hors de l'alerte de sécurité sur prospects_conversion). Récupérables à tout moment :
--      alter table archive.<table> set schema public;
--
--  Restent en place, car encore lus par les fonctions mail en ligne (envoyer-email,
--  recevoir-email) et l'écran des campagnes : prospects, emails_envoyes.
--
--  À coller en une fois dans l'éditeur SQL du projet Baticom.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists archive;
revoke all on schema archive from anon, authenticated;

-- Le moteur de règles d'envoi de l'ancien système : 0 règle, il tournait à vide toutes les 10 minutes.
select cron.unschedule('executer-regles-envoi') where exists (select 1 from cron.job where jobname = 'executer-regles-envoi');

do $$
declare t text;
begin
  foreach t in array array['appels', 'prospects_conversion', 'creneaux', 'prospect_agence', 'statuts', 'regles_envoi', 'rdv'] loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      execute format('alter table public.%I set schema archive', t);
    end if;
  end loop;
end $$;

do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'fusionner_prospects') then
    alter function public.fusionner_prospects(uuid, uuid[], jsonb) set schema archive;
  end if;
end $$;

-- Contrôle : 7 tables et 1 fonction dans « archive », plus de tâche planifiée « executer-regles-envoi ».
select (select string_agg(tablename, ', ' order by tablename) from pg_tables where schemaname = 'archive') as tables_archivees,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'archive') as fonctions_archivees,
       (select count(*) from cron.job where jobname = 'executer-regles-envoi') as cron_restant;
