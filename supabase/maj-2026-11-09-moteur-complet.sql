-- ════════════════════════════════════════════════════════════════════════════
-- LE MOTEUR DE CAMPAGNES, ÉTAPE 4 (Mahdi, 09/11/2026). À coller AVANT de fusionner la PR.
-- 1. Un lead peut naître d'un formulaire ou d'une règle de campagne (le formulaire était refusé en silence).
-- 2. Les ouvertures et les rebonds des mails d'agences arrivent dans la campagne qui a envoyé le mail.
-- 3. Une agence touchée par une campagne réglée suit les critères d'intérêt de CETTE campagne.
-- 4. Un nouveau lead va à la personne prévue par sa campagne.
-- Tant qu'une campagne n'a pas été enregistrée, rien ne change pour ses contacts. Se rejoue sans risque.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Les origines d'un lead ──
do $$
declare n text;
begin
  select conname into n from pg_constraint
   where conrelid = 'public.leads_demarchage'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%page_compte%';
  if n is not null then execute format('alter table public.leads_demarchage drop constraint %I', n); end if;
end $$;
alter table public.leads_demarchage add constraint leads_demarchage_source_check
  check (source in ('compte', 'page_compte', 'mail', 'plaquette', 'manuel', 'formulaire', 'campagne'));

-- ── 2. Ouvertures et rebonds : rattachés par l'identifiant du mail, jamais au hasard ──
create or replace function public.cmp_depuis_signal_site() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare d record;
begin
  if new.type <> 'note' or coalesce(new.source, '') <> 'site' or new.agence_id is null then return new; end if;
  if coalesce(new.compte_nom, '') = 'Resend' then
    if new.titre not in ('E-mail ouvert', 'E-mail rebondi (adresse injoignable)') or new.message_id is null then return new; end if;
    select e.id as envoi_id, e.campagne_id into d
      from public.messages m join public.cmp_envois e on e.fournisseur_id = m.message_id
     where m.id = new.message_id and e.statut = 'envoye' and not e.test limit 1;
    if d.envoi_id is not null then
      insert into public.cmp_evenements (campagne_id, envoi_id, contact_ref, type, le)
      values (d.campagne_id, d.envoi_id, new.agence_id::text, case when new.titre = 'E-mail ouvert' then 'ouvert' else 'rebond' end, new.date);
    end if;
    return new;
  end if;
  if coalesce(new.compte_nom, '') <> 'Site STC Bâtiment' then return new; end if;
  if new.titre ilike 'Désinscrit%' then return new; end if;
  select * into d from public.cmp_dernier_envoi(new.agence_id::text, new.date);
  if d.envoi_id is not null then
    insert into public.cmp_evenements (campagne_id, envoi_id, contact_ref, type, le, lien)
    values (d.campagne_id, d.envoi_id, new.agence_id::text, 'clic', new.date,
      case when new.titre ilike '%compte%' then 'principal' when new.titre ilike '%plaquette%' then 'plaquette' else 'site' end);
  end if;
  return new;
end $function$;

-- ── 3. Les critères d'intérêt de la campagne ──
-- La campagne réglée qui a écrit à ce contact dans les 30 jours. Aucune : les règles générales s'appliquent.
create or replace function public.cmp_campagne_qui_decide(p_ref text) returns uuid
language sql stable security definer set search_path to 'public' as $function$
  select c.id from public.cmp_dernier_envoi(p_ref, now()) d
  join public.cmp_campagnes c on c.id = d.campagne_id
  where c.config ->> 'v' = '1' and c.origine is distinct from 'tracabilite'
  limit 1
$function$;
revoke execute on function public.cmp_campagne_qui_decide(text) from anon, public;

-- Les règles générales (la traçabilité), sauf si une campagne décide pour cette agence.
create or replace function public.cmp_regle_interet(p_evenement text, p_fois int, p_jours int, p_agence uuid)
returns table (fois int, jours int) language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if public.cmp_campagne_qui_decide(p_agence::text) is not null then return; end if;
  select config -> 'qualification' -> 'interet' into v from public.cmp_campagnes where origine = 'tracabilite' limit 1;
  if v is null then return query select p_fois, p_jours; return; end if;
  return query select greatest(coalesce((r ->> 'fois')::int, 1), 1), greatest(coalesce((r ->> 'jours')::int, 1), 1)
    from jsonb_array_elements(v) r where r ->> 'evenement' = p_evenement limit 1;
end $$;
revoke execute on function public.cmp_regle_interet(text, int, int, uuid) from anon, public;

create or replace function public.lead_depuis_note(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $function$
declare
  s record;
  n integer;
  r record;
begin
  select * into s from public.activites where id = p_id;
  if not found or s.type <> 'note' or s.source <> 'site' then return; end if;
  if s.titre = 'Compte ouvert sur STC Bâtiment' then
    perform public.lead_poser(s.agence_id, s.contact_id, 'compte', 'A ouvert son compte STC Bâtiment', s.note, s.date);
  elsif s.titre = 'Page « Créer un compte » ouverte' then
    select * into r from public.cmp_regle_interet('A ouvert la page « Créer un compte »', 1, 7, s.agence_id);
    if not found then return; end if;
    select count(*) into n from public.activites
     where agence_id = s.agence_id and type = 'note' and source = 'site' and titre = s.titre and date > s.date - make_interval(days => r.jours) and date <= s.date;
    if n >= r.fois then
      perform public.lead_poser(s.agence_id, s.contact_id, 'page_compte', 'A ouvert la page « Créer un compte »', 'Depuis notre e-mail', s.date);
    end if;
  elsif s.titre = 'Plaquette ouverte' then
    select * into r from public.cmp_regle_interet('A ouvert la plaquette', 2, 7, s.agence_id);
    if not found then return; end if;
    select count(*) into n from public.activites
     where agence_id = s.agence_id and type = 'note' and source = 'site' and titre = 'Plaquette ouverte' and date > s.date - make_interval(days => r.jours) and date <= s.date;
    if n >= r.fois then
      perform public.lead_poser(s.agence_id, s.contact_id, 'plaquette', 'A ouvert la plaquette ' || n || ' fois', s.note, s.date);
    end if;
  end if;
end $function$;

create or replace function public.lead_depuis_message(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $function$
declare
  m record;
begin
  select * into m from public.messages where id = p_id;
  if not found or m.sens <> 'entrant' or m.espace <> 'demarchage' or m.agence_id is null or not public.lead_mail_est_humain(m.objet) then return; end if;
  if not exists (select 1 from public.cmp_regle_interet('A répondu au mail', 1, 7, m.agence_id)) then return; end if;
  perform public.lead_poser(m.agence_id, m.contact_id, 'mail', 'A répondu à un mail', left('« ' || coalesce(nullif(m.objet, ''), '(sans objet)') || ' »', 160), m.created_at);
end $function$;

drop function if exists public.cmp_regle_interet(text, int, int);

-- Une règle de la campagne reconnaît-elle cet événement ?
create or replace function public.cmp_evenement_correspond(p_regle text, p_type text, p_lien text, p_canal text) returns boolean
language sql immutable as $function$
  select case p_regle
    when 'A cliqué un lien' then p_type = 'clic'
    when 'A cliqué le lien principal' then p_type = 'clic' and p_lien = 'principal'
    when 'A ouvert la page « Créer un compte »' then p_type = 'clic' and p_lien = 'principal'
    when 'A ouvert la plaquette' then p_type = 'clic' and p_lien = 'plaquette'
    when 'A cliqué le SMS' then p_type = 'clic' and p_canal = 'sms'
    when 'A regardé la vidéo' then p_type = 'clic' and p_lien = 'video'
    when 'A ouvert le mail' then p_type = 'ouvert'
    when 'A répondu au mail' then p_type = 'reponse'
    else false end
$function$;

-- À chaque événement d'une agence, les règles de sa campagne. Une erreur ici ne bloque jamais le signal.
create or replace function public.cmp_lead_depuis_evenement() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare
  c record;
  r jsonb;
  v_canal text;
  n integer;
begin
  select id, base_id, origine, config into c from public.cmp_campagnes where id = new.campagne_id;
  if not found or c.base_id <> 'agences' or coalesce(c.config ->> 'v', '') <> '1' or c.origine is not distinct from 'tracabilite' then return new; end if;
  if new.type = 'reponse' and not exists (
    select 1 from public.messages m where m.agence_id::text = new.contact_ref and m.created_at = new.le and m.sens = 'entrant' and m.espace = 'demarchage' and public.lead_mail_est_humain(m.objet)
  ) then return new; end if;
  select canal into v_canal from public.cmp_envois where id = new.envoi_id;
  for r in select * from jsonb_array_elements(coalesce(c.config #> '{qualification,interet}', '[]'::jsonb)) loop
    if not coalesce(public.cmp_evenement_correspond(r ->> 'evenement', new.type, new.lien, v_canal), false) then continue; end if;
    select count(*) into n from public.cmp_evenements e left join public.cmp_envois x on x.id = e.envoi_id
     where e.campagne_id = new.campagne_id and e.contact_ref = new.contact_ref
       and e.le > new.le - make_interval(days => greatest(coalesce((r ->> 'jours')::int, 7), 1)) and e.le <= new.le
       and coalesce(public.cmp_evenement_correspond(r ->> 'evenement', e.type, e.lien, x.canal), false);
    if n >= greatest(coalesce((r ->> 'fois')::int, 1), 1) then
      perform public.lead_poser(new.contact_ref::uuid, null, case when new.type = 'reponse' then 'mail' when new.lien = 'plaquette' then 'plaquette' when new.lien = 'principal' then 'page_compte' else 'campagne' end,
        r ->> 'evenement', case when n > 1 then n || ' fois' else '' end, new.le);
      return new;
    end if;
  end loop;
  return new;
exception when others then
  raise warning 'cmp_lead_depuis_evenement : %', sqlerrm;
  return new;
end $function$;
drop trigger if exists cmp_lead_evenement on public.cmp_evenements;
create trigger cmp_lead_evenement after insert on public.cmp_evenements for each row execute function public.cmp_lead_depuis_evenement();

-- ── 4. L'attribution du nouveau lead ──
create or replace function public.cmp_attribuer_lead() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare
  q jsonb;
  ids jsonb;
  v_attr text;
  v_qui uuid;
begin
  select config -> 'qualification' into q from public.cmp_campagnes
   where id = coalesce(public.cmp_campagne_qui_decide(new.agence_id::text), (select id from public.cmp_campagnes where origine = 'tracabilite' limit 1));
  if q is null then return new; end if;
  v_attr := q ->> 'attribution';
  ids := coalesce(q -> 'attributionIds', '[]'::jsonb);
  if v_attr = 'Le commercial du secteur' then
    select s.commercial_id into v_qui from public.agences a join public.secteurs s on s.code = a.secteur where a.id = new.agence_id;
  elsif v_attr = 'Une personne précise' then
    v_qui := nullif(ids ->> 0, '')::uuid;
  elsif v_attr = 'Chacun son tour' and jsonb_array_length(ids) > 0 then
    select t.x::uuid into v_qui from jsonb_array_elements_text(ids) with ordinality t(x, o)
     order by (select count(*) from public.leads_demarchage l join public.agences a on a.id = l.agence_id where a.commercial_id = t.x::uuid and l.cree_le > now() - interval '30 days'), t.o
     limit 1;
  end if;
  if v_qui is not null then update public.agences set commercial_id = v_qui where id = new.agence_id and commercial_id is distinct from v_qui; end if;
  return new;
exception when others then
  raise warning 'cmp_attribuer_lead : %', sqlerrm;
  return new;
end $function$;
drop trigger if exists cmp_attribuer_lead on public.leads_demarchage;
create trigger cmp_attribuer_lead after insert on public.leads_demarchage for each row execute function public.cmp_attribuer_lead();

revoke execute on function public.cmp_lead_depuis_evenement() from anon, public;
revoke execute on function public.cmp_attribuer_lead() from anon, public;
