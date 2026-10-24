-- ════════════════════════════════════════════════════════════════════════════
-- LES APPELS ANALYSÉS PAR L'IA (24/10/2026, Mahdi)
--
-- « À la fin de l'appel, avoir tout de suite le mail personnalisé généré par l'IA,
--   et un onglet qui analyse les meilleurs argumentaires : ce qui tape. »
--
-- Le chemin :
--   1. le commercial note le résultat d'un appel où quelqu'un a décroché (joint,
--      standard) → le déclencheur ci-dessous inscrit l'appel dans `appels_ia` ;
--   2. l'écran appelle aussitôt la fonction `analyser-appel` (et le webhook Ringover
--      aussi, quand il arrive) : enregistrement Ringover → transcription → résumé,
--      brouillon de mail, analyse (arguments, objections, intérêt) ;
--   3. si l'enregistrement n'est pas encore prêt chez Ringover, le passage de
--      secours (toutes les 2 minutes) réessaie.
-- Le mail n'est JAMAIS envoyé tout seul : le commercial le relit et l'envoie.
--
-- À coller dans l'éditeur SQL de Supabase (projet Baticom). Rejouable, rien à remplacer.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. La table ──
create table if not exists public.appels_ia (
  id               uuid primary key default gen_random_uuid(),
  activite_id      uuid not null unique references public.activites(id) on delete cascade,
  agence_id        uuid references public.agences(id) on delete cascade,
  contact_id       uuid,
  compte_id        uuid,
  compte_nom       text,
  call_id          text not null,                 -- TEXTE : dépasse 2^53
  resultat         text,                          -- joint / standard (au moment de l'analyse)
  statut           text not null default 'en_attente'
                   check (statut in ('en_attente', 'en_cours', 'pret', 'sans_enregistrement', 'trop_court', 'erreur')),
  tentatives       integer not null default 0,
  prochain_essai   timestamptz not null default now(),
  verrou_le        timestamptz,
  duree_s          integer,
  enregistrement_url text,
  transcription    text,
  resume           text,
  interet          text check (interet in ('nul', 'faible', 'moyen', 'fort')),
  analyse_detail   jsonb,                         -- arguments, objections, points forts (« analyse » est un mot réservé de PostgreSQL)
  mail_pertinent   boolean,
  mail_objet       text,
  mail_corps       text,
  mail_envoye_le   timestamptz,
  mail_ecarte_le   timestamptz,
  erreur           text,
  cree_le          timestamptz not null default now(),
  maj_le           timestamptz not null default now()
);
create index if not exists appels_ia_a_traiter on public.appels_ia (prochain_essai) where statut in ('en_attente', 'en_cours', 'erreur');
create index if not exists appels_ia_compte on public.appels_ia (compte_id, cree_le desc);
create index if not exists appels_ia_agence on public.appels_ia (agence_id, cree_le desc);
create index if not exists appels_ia_call on public.appels_ia (call_id);

alter table public.appels_ia enable row level security;
drop policy if exists "acces_connecte" on public.appels_ia;
create policy "acces_connecte" on public.appels_ia for all to authenticated using (true) with check (true);

-- ── 2. Le déclencheur : un appel noté « joint » ou « standard », avec son identifiant Ringover ──
create or replace function public.appels_ia_inscrire()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'appel'
     and coalesce(new.sens, 'sortant') = 'sortant'
     and new.resultat in ('joint', 'standard')
     and coalesce(new.call_id, '') <> '' then
    insert into public.appels_ia (activite_id, agence_id, contact_id, compte_id, compte_nom, call_id, resultat)
    values (new.id, new.agence_id, new.contact_id, new.compte_id, new.compte_nom, new.call_id, new.resultat)
    on conflict (activite_id) do update set resultat = excluded.resultat, maj_le = now();
  end if;
  return new;
end $$;

drop trigger if exists activites_appels_ia on public.activites;
create trigger activites_appels_ia
  after insert or update of resultat on public.activites
  for each row execute function public.appels_ia_inscrire();

-- ── 3. Le passage de secours, toutes les 2 minutes (enregistrement pas encore prêt, erreur passagère) ──
-- Sa clé est tirée au hasard ici et rangée en base : la fonction la relit, aucun secret à saisir.
insert into public.parametres (cle, valeur) values ('analyse_passage_cle', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (cle) do nothing;
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('analyser-appels') where exists (select 1 from cron.job where jobname = 'analyser-appels');
select cron.schedule(
  'analyser-appels',
  '*/2 * * * *',
  $cron$
  select net.http_post(
    url     := 'https://ifvrmsiwlwppinfdmeao.supabase.co/functions/v1/analyser-appel',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-passage-cle', (select valeur from public.parametres where cle = 'analyse_passage_cle')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5000
  )
  where exists (select 1 from public.appels_ia where statut in ('en_attente', 'erreur', 'en_cours') and prochain_essai <= now() and tentatives < 12);
  $cron$
);

-- ── 4. Les appels lancés sans résultat noté (Mahdi, 24/10) : « ils auraient dû rentrer les états ;
--      les dossiers sans information, tu les repasses dans À prospecter. »
-- On ne supprime rien : l'appel devient une NOTE sur la fiche (la trace reste), l'agence
-- redevient « jamais appelée » et revient en tête de À prospecter. Une agence qui a d'autres
-- appels notés (une information réelle) garde son étape.
update public.activites
set type = 'note',
    resultat = '',   -- colonnes NOT NULL (défaut '')
    issue = '',
    note = trim(both from coalesce(nullif(note, ''), '') || ' Appel du ' || to_char(date at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24:MI')
           || ' lancé par ' || coalesce(compte_nom, '?') || ', résultat jamais noté : remis à prospecter le 24/10/2026.')
where type = 'appel' and resultat = 'lance';

update public.agences a
set etape = 'a_prospecter'
where a.etape <> 'a_prospecter'
  and not exists (select 1 from public.activites x where x.agence_id = a.id and x.type = 'appel')
  and exists (select 1 from public.activites x where x.agence_id = a.id and x.type = 'note' and x.note like '%résultat jamais noté : remis à prospecter le 24/10/2026.%');
