-- ============================================================================
--  À COLLER DANS LE PROJET **STC BATICOM** (ifvrmsiwlwppinfdmeao).
--
--  Les clients signés, venus de STC Bâtiment (10/10/2026). Toutes les heures,
--  la fonction serveur `synchro-clients` lit les gestionnaires qui ont envoyé
--  un ordre de service dans STC Bâtiment, cherche l'agence correspondante ici
--  et dépose une PROPOSITION. Rien ne devient client tout seul : c'est un
--  humain qui confirme sur la page Aujourd'hui (Mahdi, 10/10).
-- ============================================================================

create table if not exists public.clients_signales (
  id                 uuid primary key default gen_random_uuid(),
  gestionnaire_id    uuid not null unique,               -- l'identifiant du gestionnaire côté STC Bâtiment
  societe            text not null default '',
  nom                text not null default '',
  email              text not null default '',
  telephones         text[] not null default '{}',
  premier_os_le      timestamptz,
  premier_os_numero  text not null default '',
  dernier_os_le      timestamptz,
  nb_os              integer not null default 0,
  noms_agence        text not null default '',           -- les noms d'agence écrits sur les OS
  codes_postaux      text not null default '',
  candidats          jsonb not null default '[]'::jsonb, -- [{agenceId, nom, secteur, score, raisons[]}]
  statut             text not null default 'a_confirmer' check (statut in ('a_confirmer', 'confirme', 'ignore', 'deja_client')),
  agence_id          uuid references public.agences(id) on delete set null,
  decide_par         text not null default '',
  decide_le          timestamptz,
  cree_le            timestamptz not null default now(),
  maj_le             timestamptz not null default now()
);
create index if not exists clients_signales_statut_idx on public.clients_signales(statut);
alter table public.clients_signales enable row level security;
drop policy if exists "acces_connecte" on public.clients_signales;
create policy "acces_connecte" on public.clients_signales for all to authenticated using (true) with check (true);

-- Le passage horaire (à la 17e minute). On réutilise mot pour mot l'appel du
-- séquenceur du recrutement (même clé serveur), en changeant juste le nom de la fonction.
do $$
begin
  perform cron.unschedule('synchro-clients');
exception when others then null;
end $$;
select cron.schedule(
  'synchro-clients',
  '17 * * * *',
  replace(command, '/functions/v1/sequenceur-st', '/functions/v1/synchro-clients')
) from cron.job where jobname = 'sequenceur-st';

-- Contrôle : une ligne « synchro-clients », active ; premier passage à la prochaine 17e minute.
select jobname, schedule, active from cron.job where jobname = 'synchro-clients';
