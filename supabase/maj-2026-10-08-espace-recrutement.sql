-- ============================================================================
--  Recrutement sous-traitants — l'ESPACE et la MACHINE (08/10/2026)
--
--  Ce que ça pose, sans rien casser (tout est additif et ré-exécutable) :
--   1. la fiche artisan sait POURQUOI et QUAND elle s'est arrêtée (terminé,
--      déposé, désinscrit, injoignable, exclu), ce qu'elle a reçu, sa dernière
--      erreur ;
--   2. le journal des envois sait REJOUER une erreur (tentative, « rejouer
--      après ») et garde la trace Resend (délivré, ouvert) ;
--   3. les réglages de la machine : cadence et plafond PAR CANAL, plage SMS,
--      délai minimum entre deux touches, relances, alertes, adresse d'envoi ;
--   4. le journal des passages du moteur (ce qu'il a fait, quand) ;
--   5. la liste d'exclusion (e-mails et téléphones à ne plus jamais contacter) ;
--   6. les dossiers déposés sur le site deviennent visibles dans le CRM et se
--      rattachent à la fiche (par jeton ou par e-mail) ;
--   7. la boîte de réception se cloisonne : chaque message appartient à un
--      ESPACE (démarchage ou recrutement) ;
--   8. remise à plat des données d'août : ceux qui ont tout reçu passent en
--      « terminé », les dépôts manqués sont rattachés, les erreurs d'août
--      seront rejouées proprement au redémarrage.
-- ============================================================================

-- 1) La fiche artisan ---------------------------------------------------------
alter table public.st_sous_traitants
  add column if not exists statut_le          timestamptz,
  add column if not exists statut_motif       text not null default '',
  add column if not exists termine_le         timestamptz,
  add column if not exists desinscrit_le      timestamptz,
  add column if not exists desinscrit_canal   text not null default '',   -- lien | reponse_email | plainte | ecran | sms
  add column if not exists injoignable_le     timestamptz,
  add column if not exists pause_jusqu_au     timestamptz,
  add column if not exists dernier_envoi_le   timestamptz,
  add column if not exists derniere_erreur    text not null default '',
  add column if not exists nb_envois_ok       integer not null default 0,
  add column if not exists nb_envois_erreur   integer not null default 0,
  add column if not exists email_invalide     boolean not null default false,
  add column if not exists recale_le          timestamptz;

-- La date du statut suit le statut, toujours (posée par la base, pas par l'écran).
create or replace function public.st_statut_date() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.statut is distinct from old.statut then
    new.statut_le := now();
  end if;
  return new;
end $$;
drop trigger if exists st_statut_date on public.st_sous_traitants;
create trigger st_statut_date before insert or update of statut on public.st_sous_traitants
  for each row execute function public.st_statut_date();

-- 2) Le journal des envois ----------------------------------------------------
alter table public.st_envois
  add column if not exists tentative      integer not null default 1,
  add column if not exists rejouer_apres  timestamptz,            -- erreur à rejouer à partir de…
  add column if not exists cause          text not null default '', -- famille d'erreur lisible
  add column if not exists resend_id      text,
  add column if not exists delivre_le     timestamptz,
  add column if not exists ouvert_le      timestamptz;
create index if not exists st_envois_rejouer_idx on public.st_envois(rejouer_apres) where statut = 'erreur';
create index if not exists st_envois_resend_idx on public.st_envois(resend_id) where resend_id is not null;
create index if not exists st_envois_date_idx on public.st_envois(envoye_le desc);

-- 3) Les réglages de la machine (une seule ligne, id = 1) ---------------------
alter table public.st_pilotage
  add column if not exists plafond_sms_jour      integer not null default 40,
  add column if not exists cadence_email_ms      integer not null default 700,
  add column if not exists cadence_sms_ms        integer not null default 3000,
  add column if not exists heure_min_sms         time not null default '10:00',
  add column if not exists heure_max_sms         time not null default '17:00',
  add column if not exists delai_min_touches_h   integer not null default 48,
  add column if not exists tentatives_max        integer not null default 3,
  add column if not exists abandon_apres_jours   integer not null default 21,
  add column if not exists alerte_email          text not null default 'gestion@stcbatiment.fr',
  add column if not exists seuil_erreurs_pct     integer not null default 20,
  add column if not exists email_test            text not null default '',
  add column if not exists adresse_envoi         text not null default 'recrutement@crm.stcbatiment.fr',
  add column if not exists recaler_au_demarrage  boolean not null default true,
  add column if not exists actif_depuis          timestamptz,
  add column if not exists arrete_le             timestamptz,
  add column if not exists recale_le             timestamptz;

-- Marche / arrêt : la base note quand, l'écran n'a rien à faire.
create or replace function public.st_pilotage_dates() returns trigger
language plpgsql as $$
begin
  if new.actif is distinct from old.actif then
    if new.actif then new.actif_depuis := now(); else new.arrete_le := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists st_pilotage_dates on public.st_pilotage;
create trigger st_pilotage_dates before update of actif on public.st_pilotage
  for each row execute function public.st_pilotage_dates();
update public.st_pilotage set arrete_le = coalesce(arrete_le, maj_le) where id = 1 and actif = false and arrete_le is null;

-- 4) Le journal des passages du moteur ----------------------------------------
create table if not exists public.st_passages (
  id      uuid primary key default gen_random_uuid(),
  debut   timestamptz not null default now(),
  fin     timestamptz,
  bilan   jsonb not null default '{}'::jsonb,   -- {conversions, demarrages, envois, erreurs, rejoues, saut}
  erreur  text not null default ''
);
create index if not exists st_passages_debut_idx on public.st_passages(debut desc);

-- Les alertes envoyées (pour n'en envoyer qu'une par jour et par motif).
create table if not exists public.st_alertes (
  id         uuid primary key default gen_random_uuid(),
  cle        text not null unique,              -- ex. erreurs:2026-10-09, dossier:<id>
  envoye_le  timestamptz not null default now(),
  detail     text not null default ''
);

-- 5) La liste d'exclusion -----------------------------------------------------
-- `email` est NULL quand il n'y en a pas (jamais '') : la contrainte d'unicité
-- laisse passer plusieurs NULL, et les fonctions peuvent écrire « sauf si déjà
-- là » (upsert sur la colonne). Les adresses sont toujours écrites en minuscules.
create table if not exists public.st_exclusions (
  id         uuid primary key default gen_random_uuid(),
  email      text,
  telephone  text,
  motif      text not null default '',
  cree_le    timestamptz not null default now(),
  constraint st_exclusions_email_unique unique (email)
);
create index if not exists st_exclusions_tel_idx on public.st_exclusions(telephone) where telephone is not null;

-- 6) Les dossiers déposés, visibles et rattachés -------------------------------
alter table public.dossiers_st
  add column if not exists token_ref         text,
  add column if not exists sous_traitant_id  uuid references public.st_sous_traitants(id) on delete set null,
  add column if not exists vu_le             timestamptz,
  add column if not exists traite_le         timestamptz,
  add column if not exists notifie_le        timestamptz;
create index if not exists dossiers_st_st_idx on public.dossiers_st(sous_traitant_id);

-- 7) La boîte de réception cloisonnée ------------------------------------------
alter table public.messages
  add column if not exists espace            text not null default 'demarchage',
  add column if not exists sous_traitant_id  uuid references public.st_sous_traitants(id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'messages_espace_connu') then
    alter table public.messages add constraint messages_espace_connu check (espace in ('demarchage', 'recrutement'));
  end if;
end $$;
create index if not exists messages_espace_idx on public.messages(espace, created_at desc);

-- Les messages déjà échangés avec un artisan de la base passent côté recrutement.
with st as (select id, lower(trim(email)) as email from public.st_sous_traitants where email <> '')
update public.messages m
   set espace = 'recrutement', sous_traitant_id = st.id
  from st
 where m.espace = 'demarchage'
   and (lower(trim(m.de)) = st.email or lower(trim(m.a)) = st.email);

-- 8) Sécurité : les nouvelles tables se lisent connecté, comme le reste --------
do $$
declare t text;
begin
  foreach t in array array['st_passages', 'st_alertes', 'st_exclusions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "acces_connecte" on public.%I', t);
    execute format('create policy "acces_connecte" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
-- Les dossiers déposés : lecture et mise à jour (vu, traité, rattaché) pour le
-- compte connecté ; l'insertion reste réservée à la fonction du site.
drop policy if exists "dossiers_lecture_connecte" on public.dossiers_st;
create policy "dossiers_lecture_connecte" on public.dossiers_st for select to authenticated using (true);
drop policy if exists "dossiers_maj_connecte" on public.dossiers_st;
create policy "dossiers_maj_connecte" on public.dossiers_st for update to authenticated using (true) with check (true);

-- 9) Remise à plat des données d'août ---------------------------------------
-- a) Compteurs et dernière erreur, depuis le journal.
update public.st_sous_traitants s
   set nb_envois_ok = c.ok, nb_envois_erreur = c.err, dernier_envoi_le = c.dernier,
       derniere_erreur = coalesce(c.derniere_erreur, '')
  from (
    select e.sous_traitant_id,
           count(*) filter (where e.statut = 'envoye') as ok,
           count(*) filter (where e.statut = 'erreur') as err,
           max(e.envoye_le) filter (where e.statut = 'envoye') as dernier,
           (array_agg(e.erreur order by e.envoye_le desc) filter (where e.statut = 'erreur'))[1] as derniere_erreur
      from public.st_envois e group by e.sous_traitant_id
  ) c
 where c.sous_traitant_id = s.id;

-- b) Les familles d'erreur, lisibles.
update public.st_envois set cause = case
    when erreur like 'RateLimitError%' then 'limite de débit (plateforme)'
    when erreur like 'Trop de SMS%' then 'Ringover : SMS trop rapprochés'
    when erreur like 'Trop d''envois%' then 'Resend : envois trop rapprochés'
    when erreur = 'pas d''e-mail' then 'fiche sans e-mail'
    when erreur = 'pas de téléphone' then 'fiche sans téléphone'
    when erreur like 'numéro non mobile%' then 'numéro non mobile'
    when erreur = '' then ''
    else left(erreur, 60) end
  where cause = '';

-- c) Les erreurs d'août n'ont jamais été rejouées : elles le seront au
--    redémarrage, au rythme de la machine (une par artisan, 48 h entre deux).
update public.st_envois set rejouer_apres = now(), tentative = 1
 where statut = 'erreur' and rejouer_apres is null
   and cause not in ('fiche sans e-mail', 'fiche sans téléphone', 'numéro non mobile');

-- d) Ceux qui ont reçu toutes les étapes actives de leur séquence sont terminés.
with attendu as (
  select e.sequence_id, count(*) as n from public.st_etapes e where e.actif group by e.sequence_id
), recu as (
  select s.id, count(distinct v.etape_id) as n
    from public.st_sous_traitants s
    join public.st_envois v on v.sous_traitant_id = s.id and v.statut in ('envoye', 'saute')
    join public.st_etapes e on e.id = v.etape_id and e.actif
   where s.statut = 'en_sequence'
   group by s.id
)
update public.st_sous_traitants s
   set statut = 'termine', termine_le = s.dernier_envoi_le, statut_motif = 'toutes les étapes reçues'
  from recu, attendu
 where recu.id = s.id and attendu.sequence_id = s.sequence_id and recu.n >= attendu.n and s.statut = 'en_sequence';

-- e) Les dépôts manqués (la machine était à l'arrêt) : rattachés par e-mail.
update public.dossiers_st d
   set sous_traitant_id = s.id
  from public.st_sous_traitants s
 where d.sous_traitant_id is null and d.email <> '' and lower(trim(d.email)) = lower(trim(s.email));
update public.st_sous_traitants s
   set statut = 'depose', depose_le = coalesce(s.depose_le, d.created_at), dossier_id = coalesce(s.dossier_id, d.id),
       statut_motif = 'dossier déposé sur le site'
  from public.dossiers_st d
 where d.sous_traitant_id = s.id and s.statut <> 'depose';

-- 10) Les SMS de la séquence promettaient « Répondez STOP » — impossible à
--     recevoir (l'offre Ringover ne reçoit pas les SMS). Place au lien de
--     désinscription, le même que dans les e-mails : un clic, c'est fait.
update public.st_etapes
   set contenu = replace(contenu, 'Repondez STOP pour vous desinscrire.', 'Pour ne plus recevoir : {{lien_desinscription}}')
 where canal = 'sms' and contenu like '%Repondez STOP pour vous desinscrire.%';

-- 11) Les dossiers déjà déposés ont déjà été signalés (e-mail à service-travaux@
--     au moment du dépôt) : on ne les re-signale pas au premier passage.
update public.dossiers_st set notifie_le = coalesce(notifie_le, created_at) where notifie_le is null;
