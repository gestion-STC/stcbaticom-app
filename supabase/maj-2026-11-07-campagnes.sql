-- ════════════════════════════════════════════════════════════════════════════
-- LES CAMPAGNES, UNE SEULE MACHINE POUR TOUTES LES BASES (07/11/2026, Mahdi : « adapte vraiment le truc à
-- ce qui existe ; la campagne qui est éteinte, retranscris-la dans la nouvelle version, proprement »).
--
-- Rien d'existant n'est déplacé : les contacts restent dans `agences`/`contacts` et `st_sous_traitants` ;
-- la vue `cmp_contacts` les présente au moteur sous une seule forme. Les envois passent par les mêmes
-- relais (envoyer-email, envoyer-sms) ; les leads naissent comme aujourd'hui (leads_demarchage côté
-- agences, clic sur la candidature côté artisans) et arrivent dans les sessions de call actuelles.
-- Des déclencheurs rattachent à la campagne ce que les mécanismes actuels voient déjà (clic sur un lien
-- suivi, clic d'artisan, réponse dans la boîte, désinscription).
--
-- 1. Tables · 2. Vue des contacts · 3. Rattachement des signaux · 4. Désinscription des agences
-- 5. Le passage toutes les 10 min · 6. La campagne sous-traitants reprise (en PAUSE) avec son historique
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Les tables ──
create table if not exists public.cmp_campagnes (
  id           uuid primary key default gen_random_uuid(),
  nom          text not null,
  base_id      text not null check (base_id in ('agences', 'artisans')),
  objectif     text not null default '',
  statut       text not null default 'brouillon' check (statut in ('brouillon', 'active', 'pause', 'terminee')),
  audience     jsonb not null default '{"filtres": {}, "doitAvoir": ["email", "telephone"]}',
  rythme       jsonb not null default '{"parJour": 20, "jours": [1,2,3,4,5], "heureMin": 9, "heureMax": 18, "ecartMinH": 48}',
  etapes       jsonb not null default '[]',
  signaux      text[] not null default '{clic_lien_principal,reponse}',
  cout_sms     numeric not null default 0.06,
  -- Mode test (Mahdi, 07/11 : « on teste d'abord sur une adresse à moi ») : tout part vers ces coordonnées.
  mode_test    boolean not null default true,
  test_email   text not null default 'gestion@stcbatiment.fr',
  test_mobile  text not null default '',
  origine      text not null default '',          -- 'st' : la machine sous-traitants reprise
  cree_par     uuid,
  cree_le      timestamptz not null default now(),
  lancee_le    timestamptz,
  maj_le       timestamptz not null default now()
);

create table if not exists public.cmp_inscriptions (
  id            uuid primary key default gen_random_uuid(),
  campagne_id   uuid not null references public.cmp_campagnes(id) on delete cascade,
  contact_ref   text not null,                    -- agences.id ou st_sous_traitants.id, en texte
  entree_le     timestamptz not null default now(),
  etape_index   integer not null default 0,
  prochaine_le  timestamptz not null default now(),
  statut        text not null default 'en_cours' check (statut in ('en_cours', 'lead', 'terminee', 'desinscrit', 'rebond')),
  sortie_le     timestamptz,
  unique (campagne_id, contact_ref)
);
create index if not exists cmp_inscriptions_dues on public.cmp_inscriptions (campagne_id, prochaine_le) where statut = 'en_cours';
create index if not exists cmp_inscriptions_contact on public.cmp_inscriptions (contact_ref);

create table if not exists public.cmp_envois (
  id              uuid primary key default gen_random_uuid(),
  campagne_id     uuid not null references public.cmp_campagnes(id) on delete cascade,
  inscription_id  uuid references public.cmp_inscriptions(id) on delete cascade,
  contact_ref     text not null,
  etape_id        text not null,
  variante_id     text,
  canal           text not null check (canal in ('mail', 'sms', 'linkedin', 'newsletter')),
  le              timestamptz not null default now(),
  statut          text not null check (statut in ('en_cours', 'envoye', 'erreur', 'saute')),
  cause           text not null default '',
  tentative       integer not null default 1,
  fournisseur_id  text,                           -- l'identifiant Resend (ouvertures, rebonds)
  test            boolean not null default false
);
create index if not exists cmp_envois_campagne on public.cmp_envois (campagne_id, le);
create index if not exists cmp_envois_contact on public.cmp_envois (contact_ref, le desc);
create index if not exists cmp_envois_fournisseur on public.cmp_envois (fournisseur_id) where fournisseur_id is not null;

create table if not exists public.cmp_evenements (
  id           uuid primary key default gen_random_uuid(),
  campagne_id  uuid not null references public.cmp_campagnes(id) on delete cascade,
  envoi_id     uuid references public.cmp_envois(id) on delete set null,
  contact_ref  text not null,
  type         text not null check (type in ('delivre', 'ouvert', 'clic', 'reponse', 'desinscription', 'rebond')),
  le           timestamptz not null default now(),
  lien         text
);
create index if not exists cmp_evenements_campagne on public.cmp_evenements (campagne_id, le);
create index if not exists cmp_evenements_contact on public.cmp_evenements (contact_ref);

create table if not exists public.cmp_taches (
  id           uuid primary key default gen_random_uuid(),
  campagne_id  uuid not null references public.cmp_campagnes(id) on delete cascade,
  contact_ref  text not null,
  etape_id     text not null,
  type         text not null check (type in ('appel', 'linkedin')),
  consigne     text not null default '',
  cree_le      timestamptz not null default now(),
  faite_le     timestamptz
);

-- Les droits : comme les autres tables du logiciel (comptes connectés). Le moteur écrit avec la clé de service.
do $$ declare t text; begin
  foreach t in array array['cmp_campagnes', 'cmp_inscriptions', 'cmp_envois', 'cmp_evenements', 'cmp_taches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "acces_connecte" on public.%I', t);
    execute format('create policy "acces_connecte" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ── 4 (avant la vue). Désinscription des agences : un clic sur le lien de désinscription d'un mail de campagne ──
alter table public.agences add column if not exists ne_plus_ecrire_le timestamptz;

-- ── 2. La vue des contacts : agences et artisans sous une seule forme ──
-- Une agence : son meilleur contact (principal, avec un mail) pour l'adresse et la ligne ; « complète » = mail ET téléphone.
create or replace view public.cmp_contacts with (security_invoker = true) as
select a.id::text as id, 'agences'::text as base_id, a.nom,
  coalesce(nullif(trim(coalesce(pc.prenom, '') || ' ' || coalesce(pc.nom, '')), ''), '') as personne,
  coalesce(nullif(pc.email, ''), nullif(a.email, ''), '') as email,
  coalesce(case when regexp_replace(coalesce(pc.mobile, ''), '\D', '', 'g') ~ '^(33|0)[67]' then pc.mobile end, '') as mobile,
  coalesce(nullif(pc.ligne_directe, ''), nullif(pc.mobile, ''), nullif(a.telephone, ''), '') as telephone,
  jsonb_build_object(
    'secteur', coalesce(s.libelle, a.secteur, ''),
    'etape', case a.etape when 'a_prospecter' then 'À prospecter' when 'gestionnaire_joint' then 'Gestionnaire joint' when 'interesse' then 'Intéressé'
      when 'rdv_planifie' then 'RDV planifié' when 'pas_interesse' then 'Pas intéressé' when 'endormie' then 'Endormie' when 'client' then 'Client'
      when 'hors_cible' then 'Hors cible' else a.etape end,
    'enseigne', coalesce(nullif(a.enseigne, ''), 'Indépendante')) as champs,
  case when a.etape = 'client' or a.premier_os_le is not null then 'gagne'
       when a.etape in ('hors_cible', 'apporteur') then 'exclu'
       when exists (select 1 from public.leads_demarchage l where l.agence_id = a.id and l.statut = 'a_traiter') then 'lead'
       else 'libre' end as statut,
  (a.ne_plus_ecrire_le is not null) as desinscrit,
  a.commercial_id as proprietaire_id
from public.agences a
left join public.secteurs s on s.code = a.secteur
left join lateral (
  select c.prenom, c.nom, c.email, c.mobile, c.ligne_directe from public.contacts c
  where c.agence_id = a.id and not c.parti order by c.principal desc, (coalesce(c.email, '') <> '') desc, c.cree_le limit 1
) pc on true
union all
select st.id::text, 'artisans', coalesce(st.entreprise, ''), coalesce(st.contact, ''),
  case when coalesce(st.email_invalide, false) then '' else coalesce(st.email, '') end,
  case when regexp_replace(coalesce(st.telephone, ''), '\D', '', 'g') ~ '^(33|0)[67]' and not coalesce(st.telephone_invalide, false) then st.telephone else '' end,
  case when coalesce(st.telephone_invalide, false) then '' else coalesce(st.telephone, '') end,
  jsonb_build_object('metier', coalesce(st.metier, ''), 'zone', coalesce(st.zone, ''),
    'statut', case st.statut when 'a_contacter' then 'À contacter' when 'en_sequence' then 'Déjà contacté' when 'termine' then 'Séquence finie' else st.statut end),
  case when st.statut = 'depose' then 'gagne'
       when st.statut in ('exclu', 'injoignable') then 'exclu'
       when (st.bareme_vu_le is not null or st.candidature_clic_le is not null or coalesce(st.nb_clics, 0) > 0) and coalesce(st.suivi, '') = '' then 'lead'
       else 'libre' end,
  (st.statut = 'desinscrit' or exists (select 1 from public.st_exclusions x where lower(x.email) = lower(st.email) and coalesce(st.email, '') <> '')),
  null::uuid
from public.st_sous_traitants st;
grant select on public.cmp_contacts to authenticated;

-- ── 3. Rattacher les signaux à la campagne : le DERNIER envoi parti au contact dans les 30 jours ──
create or replace function public.cmp_dernier_envoi(p_contact text, p_avant timestamptz)
returns table (envoi_id uuid, campagne_id uuid) language sql stable security definer set search_path = public as $$
  select e.id, e.campagne_id from public.cmp_envois e
  where e.contact_ref = p_contact and e.statut = 'envoye' and not e.test and e.le <= p_avant and e.le > p_avant - interval '30 days'
  order by e.le desc limit 1
$$;
revoke execute on function public.cmp_dernier_envoi(text, timestamptz) from anon, public;

-- Un clic d'artisan (lien-st) : candidature → lien principal, barème, ou désinscription.
create or replace function public.cmp_depuis_clic_st() returns trigger language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select * into d from public.cmp_dernier_envoi(new.sous_traitant_id::text, new.clique_le);
  if d.envoi_id is not null then
    insert into public.cmp_evenements (campagne_id, envoi_id, contact_ref, type, le, lien)
    values (d.campagne_id, d.envoi_id, new.sous_traitant_id::text,
      case when new.destination = 'stop' then 'desinscription' else 'clic' end, new.clique_le,
      case when new.destination = 'bareme' then 'bareme' when new.destination = 'stop' then null else 'principal' end);
  end if;
  return new;
end $$;
drop trigger if exists cmp_clic_st on public.st_clics;
create trigger cmp_clic_st after insert on public.st_clics for each row execute function public.cmp_depuis_clic_st();

-- Un lien suivi d'agence cliqué (evenements-site écrit une note « site ») : « Créer un compte » = lien principal.
create or replace function public.cmp_depuis_signal_site() returns trigger language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if new.type <> 'note' or coalesce(new.source, '') <> 'site' or new.agence_id is null then return new; end if;
  -- Seuls les signaux du site (pas les « E-mail ouvert » que Resend range aussi en note « site »).
  if coalesce(new.compte_nom, '') <> 'Site STC Bâtiment' then return new; end if;
  if new.titre ilike 'Désinscrit%' then return new; end if;
  select * into d from public.cmp_dernier_envoi(new.agence_id::text, new.date);
  if d.envoi_id is not null then
    insert into public.cmp_evenements (campagne_id, envoi_id, contact_ref, type, le, lien)
    values (d.campagne_id, d.envoi_id, new.agence_id::text, 'clic', new.date,
      case when new.titre ilike '%compte%' then 'principal' when new.titre ilike '%plaquette%' then 'plaquette' else 'site' end);
  end if;
  return new;
end $$;
drop trigger if exists cmp_signal_site on public.activites;
create trigger cmp_signal_site after insert on public.activites for each row execute function public.cmp_depuis_signal_site();

-- Une réponse arrivée dans la boîte (agence ou artisan).
create or replace function public.cmp_depuis_reponse() returns trigger language plpgsql security definer set search_path = public as $$
declare d record; v_ref text;
begin
  if new.sens <> 'entrant' then return new; end if;
  v_ref := coalesce(new.agence_id::text, new.sous_traitant_id::text);
  if v_ref is null then return new; end if;
  select * into d from public.cmp_dernier_envoi(v_ref, coalesce(new.created_at, now()));
  if d.envoi_id is not null then
    insert into public.cmp_evenements (campagne_id, envoi_id, contact_ref, type, le) values (d.campagne_id, d.envoi_id, v_ref, 'reponse', coalesce(new.created_at, now()));
  end if;
  return new;
end $$;
drop trigger if exists cmp_reponse on public.messages;
create trigger cmp_reponse after insert on public.messages for each row execute function public.cmp_depuis_reponse();
-- Une agence rattachée APRÈS coup (le déclencheur messages_rattacher_agence pose agence_id plus tard).
drop trigger if exists cmp_reponse_rattachee on public.messages;
create trigger cmp_reponse_rattachee after update of agence_id on public.messages for each row
  when (old.agence_id is null and new.agence_id is not null) execute function public.cmp_depuis_reponse();

-- ── 5. Le passage toutes les 10 minutes (même clé que le passage de l'analyse des appels) ──
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('campagnes-moteur') where exists (select 1 from cron.job where jobname = 'campagnes-moteur');
select cron.schedule('campagnes-moteur', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://ifvrmsiwlwppinfdmeao.supabase.co/functions/v1/campagnes-moteur',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-passage-cle', (select valeur from public.parametres where cle = 'analyse_passage_cle')),
    body := '{}'::jsonb, timeout_milliseconds := 5000)
$cron$);

-- ── 6. La machine sous-traitants, reprise en campagne (EN PAUSE), avec tout son historique ──
-- Ses 5 étapes (J0, J+3, J+6, J+10, J+13) deviennent : envoi, attendre, envoi… ; les identifiants des
-- étapes d'envoi sont ceux de st_etapes, pour que l'historique s'y rattache. L'ancien moteur reste arrêté.
do $$
declare
  v_seq uuid; v_camp uuid; v_etapes jsonb := '[]'; e record; v_prec int := 0; v_index int[] := '{}'; i int := 0;
begin
  if exists (select 1 from public.cmp_campagnes where origine = 'st') then return; end if;
  select coalesce(p.sequence_id, (select id from public.st_sequences where actif order by cree_le limit 1)) into v_seq from public.st_pilotage p where p.id = 1;
  if v_seq is null then return; end if;
  for e in select * from public.st_etapes where sequence_id = v_seq and actif order by ordre loop
    if e.delai_jours - v_prec > 0 and jsonb_array_length(v_etapes) > 0 then
      v_etapes := v_etapes || jsonb_build_object('id', 'attente-' || e.ordre, 'type', 'attendre', 'jours', e.delai_jours - v_prec);
    end if;
    v_index := v_index || jsonb_array_length(v_etapes);
    v_etapes := v_etapes || jsonb_build_object('id', e.id::text, 'type', case when e.canal = 'sms' then 'sms' else 'mail' end,
      'variantes', jsonb_build_array(jsonb_build_object('id', e.id::text, 'nom', case when e.canal = 'sms' then 'SMS J+' else 'Mail J+' end || e.delai_jours, 'objet', coalesce(e.objet, ''), 'corps', coalesce(e.contenu, ''))));
    v_prec := e.delai_jours;
  end loop;
  v_etapes := v_etapes || jsonb_build_object('id', 'fin', 'type', 'fin');

  insert into public.cmp_campagnes (nom, base_id, objectif, statut, audience, rythme, etapes, signaux, mode_test, origine, cree_le, lancee_le)
  select 'Recrutement · machine sous-traitants', 'artisans', 'Faire déposer un dossier', 'pause',
    jsonb_build_object('filtres', jsonb_build_object('metier', coalesce((select jsonb_agg(o.metier) from public.st_objectifs o where o.actif), '[]'::jsonb)), 'doitAvoir', jsonb_build_array('email', 'mobile')),
    jsonb_build_object('parJour', 25, 'jours', coalesce(to_jsonb(p.jours), '[1,2,3,4,5]'::jsonb), 'heureMin', extract(hour from coalesce(p.heure_min::time, '09:00'::time)), 'heureMax', extract(hour from coalesce(p.heure_max::time, '18:00'::time)), 'ecartMinH', coalesce(p.delai_min_touches_h, 48)),
    -- Mode test ACTIF (Mahdi, 07/11) : à la reprise, les premiers envois partent vers gestion@stcbatiment.fr.
    v_etapes, '{clic_lien_principal,reponse}', true, 'st', (select min(envoye_le) from public.st_envois), p.actif_depuis
  from public.st_pilotage p where p.id = 1
  returning id into v_camp;

  -- Les artisans déjà entrés : où ils en sont (etape_courante = nombre d'envois faits).
  insert into public.cmp_inscriptions (campagne_id, contact_ref, entree_le, etape_index, prochaine_le, statut, sortie_le)
  select v_camp, st.id::text, coalesce(st.demarre_le, st.cree_le),
    case when coalesce(st.etape_courante, 0) >= array_length(v_index, 1) then jsonb_array_length(v_etapes) - 1 else v_index[coalesce(st.etape_courante, 0) + 1] end,
    coalesce(st.demarre_le, now()) + make_interval(days => coalesce((select x.delai_jours from public.st_etapes x where x.sequence_id = v_seq and x.actif order by x.ordre offset coalesce(st.etape_courante, 0) limit 1), 0)),
    case st.statut when 'en_sequence' then 'en_cours' when 'desinscrit' then 'desinscrit' when 'injoignable' then 'rebond' else 'terminee' end,
    case when st.statut = 'en_sequence' then null else coalesce(st.termine_le, st.depose_le, st.desinscrit_le, st.injoignable_le, st.statut_le) end
  from public.st_sous_traitants st
  where st.sequence_id = v_seq or exists (select 1 from public.st_envois v where v.sous_traitant_id = st.id)
  on conflict do nothing;

  -- Les envois (« abandonné » = une erreur définitive).
  insert into public.cmp_envois (id, campagne_id, inscription_id, contact_ref, etape_id, variante_id, canal, le, statut, cause, tentative, fournisseur_id)
  select v.id, v_camp, i2.id, v.sous_traitant_id::text, v.etape_id::text, v.etape_id::text, case when v.canal = 'sms' then 'sms' else 'mail' end,
    coalesce(v.envoye_le, now()), case v.statut when 'envoye' then 'envoye' when 'saute' then 'saute' else 'erreur' end,
    coalesce(nullif(v.cause, ''), case when v.statut = 'abandonne' then 'abandonné après 3 essais' else '' end), coalesce(v.tentative, 1), v.resend_id
  from public.st_envois v join public.cmp_inscriptions i2 on i2.campagne_id = v_camp and i2.contact_ref = v.sous_traitant_id::text
  on conflict do nothing;

  -- Les événements : délivré, ouvert (suivis depuis octobre), clics (rattachés au dernier envoi avant le clic).
  insert into public.cmp_evenements (campagne_id, envoi_id, contact_ref, type, le)
  select v_camp, v.id, v.sous_traitant_id::text, 'delivre', v.delivre_le from public.st_envois v where v.delivre_le is not null and exists (select 1 from public.cmp_envois c where c.id = v.id)
  union all
  select v_camp, v.id, v.sous_traitant_id::text, 'ouvert', v.ouvert_le from public.st_envois v where v.ouvert_le is not null and exists (select 1 from public.cmp_envois c where c.id = v.id);
  insert into public.cmp_evenements (campagne_id, envoi_id, contact_ref, type, le, lien)
  select v_camp, (select c.id from public.cmp_envois c where c.campagne_id = v_camp and c.contact_ref = k.sous_traitant_id::text and c.statut = 'envoye' and c.le <= k.clique_le order by c.le desc limit 1),
    k.sous_traitant_id::text, case when k.destination = 'stop' then 'desinscription' else 'clic' end, k.clique_le,
    case when k.destination = 'bareme' then 'bareme' when k.destination = 'stop' then null else 'principal' end
  from public.st_clics k where exists (select 1 from public.cmp_inscriptions i3 where i3.campagne_id = v_camp and i3.contact_ref = k.sous_traitant_id::text);
end $$;
