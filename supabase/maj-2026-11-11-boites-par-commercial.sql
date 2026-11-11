-- ════════════════════════════════════════════════════════════════════════════
-- BOÎTES MAIL : UNE ADRESSE PAR COMMERCIAL, ET CHAQUE MAIL DANS LA BONNE BOÎTE (Mahdi, 11/11/2026)
--
-- À coller dans l'éditeur SQL de Supabase, projet STC BATICOM (ifvrmsiwlwppinfdmeao), AVANT de fusionner.
-- Rejouable : chaque bloc vérifie ce qui existe déjà.
--
--   1. est_admin()                    : « ce compte est administrateur » (lu dans le jeton, comme est_membre()).
--   2. table equipe (email_reception) : l'adresse dédiée de chaque compte, prenom@crm.stcbatiment.fr — le même
--                                       nom de champ que admins.email_reception dans STC Bâtiment. Lue par
--                                       l'équipe, écrite par les administrateurs seulement.
--   3. messages.compte_id             : le propriétaire d'un mail du démarchage (= l'identifiant du compte, comme
--                                       agences.commercial_id).
--   4. déclencheur messages_vers_proprietaire : la BASE donne chaque mail à son propriétaire (pas l'écran).
--   5. les mails déjà là reçoivent leur propriétaire (adresse dédiée, sinon le commercial de l'agence).
--   6. les mails du recrutement rangés par erreur au démarchage passent au recrutement (9 lignes, listées).
--   7. la règle de lecture : un commercial (télépro) ne voit au démarchage QUE ses mails (et ceux de ses
--      agences) ; un administrateur voit tout ; le recrutement reste commun.
--   8. vérification.
--
-- Ce qui lit « messages », vérifié le 11/11/2026 :
--   · fonctions serveur (envoyer-email, recevoir-email, instantly-*, linkedin, resend-evenements) : clé de
--     service, la règle de lecture ne les touche pas ;
--   · fonctions SQL en SECURITY DEFINER (cmp_decider_reponse, lead_depuis_message, cmp_lead_depuis_evenement,
--     cmp_depuis_signal_site, messages_rattacher_agence) : non touchées ;
--   · sante_demarchage() (lecture « mail sans agence ») : lit avec les droits de l'appelant ; un télépro n'y
--     compte que ses propres mails, un administrateur tout (inchangé pour lui) ;
--   · aucune vue, aucune autre règle de table ne lit messages ;
--   · messages_rattacher_agence n'est PAS modifiée (son empreinte est contrôlée par sante_demarchage).
-- ════════════════════════════════════════════════════════════════════════════

-- 0. LE BON PROJET ─────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.ordres_service') is not null then
    raise exception 'MAUVAIS PROJET : ce fichier est pour STC Baticom, pas pour STC Bâtiment.';
  end if;
  if to_regclass('public.messages') is null or to_regclass('public.agences') is null or to_regclass('public.st_sous_traitants') is null then
    raise exception 'MAUVAIS PROJET : les tables de STC Baticom (messages, agences, st_sous_traitants) sont absentes.';
  end if;
end $$;

-- 1. EST ADMINISTRATEUR ────────────────────────────────────────────────────────
create or replace function public.est_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

revoke execute on function public.est_admin() from public, anon;
grant execute on function public.est_admin() to authenticated, service_role;

-- 2. L'ADRESSE DÉDIÉE DE CHAQUE COMPTE ───────────────────────────────────────────
-- Au passage dans STC Bâtiment : cette colonne devient admins.email_reception ; seul le domaine change
-- (ici dans le contrôle, et DOMAINES_RECEPTION dans src/lib/boitesMail.ts + supabase/functions/_shared/boitesMail.ts).
create table if not exists public.equipe (
  compte_id uuid primary key references auth.users (id) on delete cascade,
  email_reception text,
  maj_le timestamptz not null default now()
);
alter table public.equipe add column if not exists email_reception text;
alter table public.equipe add column if not exists maj_le timestamptz not null default now();
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'equipe_email_reception_forme') then
    alter table public.equipe add constraint equipe_email_reception_forme
      check (email_reception is null or email_reception ~ '^[a-z0-9][a-z0-9._-]{0,63}@crm\.stcbatiment\.fr$');
  end if;
end $$;
create unique index if not exists equipe_email_reception_unique on public.equipe (email_reception) where email_reception is not null;

alter table public.equipe enable row level security;
revoke all on public.equipe from anon;
grant select, insert, update, delete on public.equipe to authenticated;
grant all on public.equipe to service_role;
drop policy if exists equipe_lecture on public.equipe;
create policy equipe_lecture on public.equipe for select to authenticated using (public.est_membre());
drop policy if exists equipe_ecriture on public.equipe;
create policy equipe_ecriture on public.equipe for all to authenticated using (public.est_admin()) with check (public.est_admin());

-- 3. LE PROPRIÉTAIRE D'UN MAIL ─────────────────────────────────────────────────
alter table public.messages add column if not exists compte_id uuid references auth.users (id) on delete set null;
create index if not exists messages_compte_id_idx on public.messages (compte_id);
create index if not exists messages_agence_id_idx on public.messages (agence_id);

-- 4. LA BASE DONNE CHAQUE MAIL À SON PROPRIÉTAIRE ────────────────────────────────
-- Démarchage seulement (le recrutement est commun : compte_id vide).
--   · reçu   : le compte dont l'adresse dédiée est parmi les destinataires ; sinon le commercial de l'agence ;
--              sinon personne (l'adresse générale contact@ : les administrateurs) ;
--   · envoyé : le compte connecté ; sinon le compte dont l'adresse dédiée a envoyé ; sinon le commercial de
--              l'agence. Le serveur (envoyer-email) donne lui-même compte_id : il est gardé.
--   · une agence posée plus tard sur un mail sans propriétaire lui donne son commercial.
-- Nommé « messages_vers_… » : les déclencheurs BEFORE passent par ordre alphabétique, celui-ci passe donc
-- APRÈS messages_rattacher_agence (qui pose agence_id) et voit l'agence trouvée.
create or replace function public.messages_vers_proprietaire()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compte uuid;
  v_adresses text[];
begin
  if coalesce(new.espace, 'demarchage') <> 'demarchage' then
    if tg_op = 'INSERT' then new.compte_id := null; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.compte_id is null and new.agence_id is not null and new.agence_id is distinct from old.agence_id then
      select g.commercial_id into new.compte_id from public.agences g where g.id = new.agence_id;
    end if;
    return new;
  end if;

  -- Un télépro ne range pas un mail dans la boîte d'un autre.
  if new.compte_id is not null and auth.uid() is not null and new.compte_id <> auth.uid() and not public.est_admin() then
    new.compte_id := null;
  end if;
  if new.compte_id is not null then return new; end if;

  if new.sens = 'entrant' then
    select array_agg(lower(m[1])) into v_adresses
      from regexp_matches(coalesce(new.a, ''), '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)', 'g') as m;
    select e.compte_id into v_compte from public.equipe e where e.email_reception = any (v_adresses) limit 1;
  else
    if auth.uid() is not null and public.est_membre() then v_compte := auth.uid(); end if;
    if v_compte is null then
      select e.compte_id into v_compte from public.equipe e
       where e.email_reception = lower(substring(coalesce(new.de, '') from '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)')) limit 1;
    end if;
  end if;
  if v_compte is null and new.agence_id is not null then
    select g.commercial_id into v_compte from public.agences g where g.id = new.agence_id;
  end if;
  new.compte_id := v_compte;
  return new;
end $$;

drop trigger if exists messages_vers_proprietaire on public.messages;
create trigger messages_vers_proprietaire
  before insert or update of agence_id on public.messages
  for each row execute function public.messages_vers_proprietaire();

-- 5. LES MAILS DÉJÀ LÀ ─────────────────────────────────────────────────────────
-- (UPDATE sans toucher agence_id : les déclencheurs « update of agence_id » des leads et des campagnes ne partent pas.)
-- 5a. Reçus à une adresse dédiée (0 ligne le 11/11 : aucune adresse posée ; utile si on rejoue après les avoir posées).
update public.messages m set compte_id = e.compte_id
  from public.equipe e
 where m.compte_id is null and coalesce(m.espace, 'demarchage') = 'demarchage' and m.sens = 'entrant'
   and e.email_reception is not null and position(e.email_reception in lower(coalesce(m.a, ''))) > 0;
-- 5b. Le commercial de l'agence du mail : 283 lignes le 11/11/2026 (sur 322 mails du démarchage ;
--     10 sont sur une agence sans commercial, 29 sans agence : ils restent aux administrateurs).
update public.messages m set compte_id = g.commercial_id
  from public.agences g
 where g.id = m.agence_id and m.compte_id is null and coalesce(m.espace, 'demarchage') = 'demarchage' and g.commercial_id is not null;

-- 6. LE RECRUTEMENT RANGÉ PAR ERREUR AU DÉMARCHAGE ───────────────────────────────
-- Avant le 08/10, le recrutement écrivait depuis contact@ (espace démarchage). Relevé le 11/11/2026 parmi les
-- 29 mails du démarchage sans agence, un par un : 9 lignes, toutes sans agence.
--   · 6 envois « [TEST] » des mails de recrutement (artisans partenaires / un vrai partenaire / rejoignez le réseau) ;
--   · 2 envois « STC Bâtiment recherche des artisans partenaires » (août) ;
--   · 1 mail reçu « Contrat de sous traitance » (un artisan renvoie son contrat signé).
-- Contrôlés aussi : 0 réponse à ces 9 mails, 0 mail du démarchage venant d'une adresse d'artisan de la base,
-- 0 mail du démarchage avec un sous-traitant rattaché. Laissé au démarchage : une agence qui DEMANDE notre Kbis
-- (STC Bâtiment est prestataire des agences), et les essais internes.
update public.messages
   set espace = 'recrutement', compte_id = null
 where espace = 'demarchage' and agence_id is null
   and id in (
     '21f8bf18-62cc-4b60-8d89-98f3f6cf3b93', '3a2836db-f0cf-4de0-a243-ed0c9e99f26b', '84e0b308-460c-47a1-abab-2ae5c336ab99',
     '60d352b4-29f5-45e3-a9a0-e596b8023e2d', '4c648072-1998-4593-b7fe-b697363a4aba', '5e1eb59c-c2f1-4f93-92e1-acdbba826778',
     '1e43c7eb-9e6e-4aa6-a034-ac69a7283371', '8ee31d1a-9495-4413-b838-2b4252306f81',
     'ae1947cc-28b7-414a-a584-8991176a3caa'
   );

-- 7. QUI VOIT QUOI (même règle que les courtiers de STC Bâtiment) ─────────────────
-- Inchangé : être membre (admin ou télépro) et avoir l'espace (mes_espaces()). En plus, au démarchage : un
-- administrateur voit tout ; un télépro voit ses mails (compte_id = lui) et ceux des agences dont il est le commercial.
drop policy if exists messages_lecture on public.messages;
create policy messages_lecture on public.messages for select to authenticated using (
  public.est_membre()
  and coalesce(espace, 'demarchage') = any (public.mes_espaces())
  and (coalesce(espace, 'demarchage') <> 'demarchage'
       or (select public.est_admin())
       or compte_id = (select auth.uid())
       or agence_id in (select g.id from public.agences g where g.commercial_id = (select auth.uid())))
);
drop policy if exists messages_modification on public.messages;
create policy messages_modification on public.messages for update to authenticated using (
  public.est_membre()
  and coalesce(espace, 'demarchage') = any (public.mes_espaces())
  and (coalesce(espace, 'demarchage') <> 'demarchage'
       or (select public.est_admin())
       or compte_id = (select auth.uid())
       or agence_id in (select g.id from public.agences g where g.commercial_id = (select auth.uid())))
) with check (
  public.est_membre()
  and coalesce(espace, 'demarchage') = any (public.mes_espaces())
  and (coalesce(espace, 'demarchage') <> 'demarchage'
       or (select public.est_admin())
       or compte_id = (select auth.uid())
       or agence_id in (select g.id from public.agences g where g.commercial_id = (select auth.uid())))
);
drop policy if exists messages_suppression on public.messages;
create policy messages_suppression on public.messages for delete to authenticated using (
  public.est_membre()
  and coalesce(espace, 'demarchage') = any (public.mes_espaces())
  and (coalesce(espace, 'demarchage') <> 'demarchage'
       or (select public.est_admin())
       or compte_id = (select auth.uid()))
);
drop policy if exists messages_ajout on public.messages;
create policy messages_ajout on public.messages for insert to authenticated with check (
  public.est_membre()
  and coalesce(espace, 'demarchage') = any (public.mes_espaces())
  and (coalesce(espace, 'demarchage') <> 'demarchage'
       or (select public.est_admin())
       or compte_id = (select auth.uid()))
);

-- 8. VÉRIFICATION ──────────────────────────────────────────────────────────────
-- Attendu le 11/11/2026 : equipe = true, colonne = true, declencheur = true, lecture_cloisonnee = true,
-- recrutement_refile = 9, demarchage_avec_proprietaire = 283 (ou plus si de nouveaux mails sont arrivés).
select
  to_regclass('public.equipe') is not null                                                            as equipe,
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'messages' and column_name = 'compte_id') as colonne,
  exists (select 1 from pg_trigger where tgname = 'messages_vers_proprietaire' and tgenabled <> 'D')    as declencheur,
  exists (select 1 from pg_policies where tablename = 'messages' and policyname = 'messages_lecture' and qual like '%est_admin%') as lecture_cloisonnee,
  (select count(*) from public.messages where espace = 'recrutement' and id in (
     '21f8bf18-62cc-4b60-8d89-98f3f6cf3b93', '3a2836db-f0cf-4de0-a243-ed0c9e99f26b', '84e0b308-460c-47a1-abab-2ae5c336ab99',
     '60d352b4-29f5-45e3-a9a0-e596b8023e2d', '4c648072-1998-4593-b7fe-b697363a4aba', '5e1eb59c-c2f1-4f93-92e1-acdbba826778',
     '1e43c7eb-9e6e-4aa6-a034-ac69a7283371', '8ee31d1a-9495-4413-b838-2b4252306f81', 'ae1947cc-28b7-414a-a584-8991176a3caa')) as recrutement_refile,
  (select count(*) from public.messages where coalesce(espace, 'demarchage') = 'demarchage' and compte_id is not null)   as demarchage_avec_proprietaire,
  (select count(*) from public.messages where coalesce(espace, 'demarchage') = 'demarchage' and compte_id is null)       as demarchage_sans_proprietaire,
  (select count(*) from public.equipe where email_reception is not null)                                                  as adresses_dediees;
