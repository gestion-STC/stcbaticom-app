-- ============================================================================
--  Planification du moteur de recrutement (sequenceur-st) via pg_cron.
--  À exécuter APRÈS avoir déployé la fonction Edge « sequenceur-st ».
--
--  ⚠️ Remplace <CLE_SERVICE_ROLE> par ta clé service_role
--     (Supabase → Project Settings → API → « service_role secret »).
--     Cette clé reste dans ta base (table cron.job), elle n'est jamais exposée au web.
-- ============================================================================

-- Extensions nécessaires (sans effet si déjà activées).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Supprime une éventuelle planification précédente du même nom, puis (re)crée-la.
select cron.unschedule('sequenceur-st') where exists (select 1 from cron.job where jobname = 'sequenceur-st');

select cron.schedule(
  'sequenceur-st',
  '*/10 * * * *',   -- toutes les 10 minutes
  $$
  select net.http_post(
    url     := 'https://ifvrmsiwlwppinfdmeao.supabase.co/functions/v1/sequenceur-st',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <CLE_SERVICE_ROLE>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Pour vérifier plus tard : select * from cron.job;
-- Pour arrêter complètement : select cron.unschedule('sequenceur-st');
-- (Le bouton « Arrêter » de l'écran Pilotage suffit au quotidien : le moteur
--  tourne mais ne fait rien tant que le pilotage est sur « inactif ».)
