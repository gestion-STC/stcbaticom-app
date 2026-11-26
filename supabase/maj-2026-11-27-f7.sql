-- ════════════════════════════════════════════════════════════════════════════
-- Lot 7 de l'audit du 26/11 : la boîte mail (D71, D75). À coller dans l'éditeur SQL Supabase, en entier.
-- Peut passer AVANT ou APRÈS la fusion : rien côté écran n'en dépend pour fonctionner.
-- Rejouable sans risque. Rien n'est supprimé, aucun mail n'est modifié dans son contenu.
--
--  A. D71 — Une réponse envoyée AVANT que le mail reçu soit rattaché à son agence suit ce mail quand il est rattaché
--     (déclencheur messages_reponses_suivent), + rattrapage des réponses déjà dans ce cas (Human Location, 159439e1).
--  B. D75 — La demande d'un anti-spam (Mailinblack : « prouvez que vous êtes humain ») n'est ni une réponse de
--     campagne ni un lead (tri « anti_spam », posé par recevoir-email) ; elle est rangée sur l'agence du mail retenu
--     (déclencheur messages_anti_spam_agence) et arrive non lue chez son chargé d'affaires. Rattrapage du cas
--     Diderot Immobilier du 20/11.
--  Aucune règle suivie par sante_demarchage n'est modifiée (messages_rattacher_agence est inchangée) : pas
--  d'empreinte à mettre à jour.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── A. Les réponses suivent le mail reçu quand il reçoit son agence ──
create or replace function public.messages_reponses_suivent()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.sens <> 'entrant' or new.agence_id is null or old.agence_id is not null
     or coalesce(new.espace, 'demarchage') <> 'demarchage' or coalesce(trim(new.message_id), '') = '' then
    return new;
  end if;
  update public.messages s
     set agence_id = new.agence_id
   where s.sens = 'sortant' and s.agence_id is null and coalesce(s.espace, 'demarchage') = 'demarchage'
     and trim(both '<>' from trim(s.in_reply_to)) = trim(both '<>' from trim(new.message_id));
  return new;
end $function$;

drop trigger if exists messages_reponses_suivent on public.messages;
create trigger messages_reponses_suivent after update of agence_id on public.messages
  for each row when (old.agence_id is null and new.agence_id is not null)
  execute function public.messages_reponses_suivent();

-- ── B. L'anti-spam d'une agence ──
-- Ni réponse de campagne, ni lead : « anti_spam » rejoint « absent » dans l'action d'une réponse…
create or replace function public.cmp_action_reponse(p_config jsonb, p_tri text, p_texte text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
    when p_tri is null then case when public.reponse_est_negative(p_texte) then 'rien' else 'lead' end
    when p_tri in ('absent', 'anti_spam') then 'rien'
    else coalesce(
      nullif(p_config #>> array['qualification', 'reponses', p_tri], ''),
      case p_tri when 'pas_interesse' then 'dead' else 'lead' end)
  end
$function$;

-- … et n'est pas un événement « réponse » de la campagne (la séquence continue, le Suivi ne la compte pas).
create or replace function public.cmp_depuis_reponse()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare d record; v_ref text; v_retour text; v_reprise timestamptz;
begin
  v_ref := coalesce(new.agence_id::text, new.sous_traitant_id::text);
  if new.sens = 'entrant' and v_ref is not null and new.tri = 'absent' then
    v_retour := new.tri_detail ->> 'retour';
    v_reprise := case when coalesce(v_retour, '') ~ '^\d{4}-\d{2}-\d{2}$' and v_retour::date between current_date and current_date + 120
      then ((v_retour::date + 1)::timestamp + time '09:00') at time zone 'Europe/Paris'
      else null end;
    update public.cmp_inscriptions i
       set prochaine_le = greatest(i.prochaine_le, coalesce(v_reprise, now() + make_interval(days => least(greatest(coalesce(case when (c.config #>> '{garde,pauseAbsentJours}') ~ '^\d+$' then (c.config #>> '{garde,pauseAbsentJours}')::int end, 7), 1), 60))))
      from public.cmp_campagnes c
     where c.id = i.campagne_id and i.contact_ref = v_ref and i.statut = 'en_cours';
    return new;
  end if;
  -- 27/11/2026 (audit D75) : une demande d'anti-spam n'est pas une réponse.
  if new.sens <> 'entrant' or not public.lead_mail_est_humain(new.objet) or new.tri is not distinct from 'absent' or new.tri is not distinct from 'anti_spam' then return new; end if;
  if v_ref is null then return new; end if;
  select * into d from public.cmp_dernier_envoi(v_ref, coalesce(new.created_at, now()));
  if d.envoi_id is not null then
    insert into public.cmp_evenements (campagne_id, envoi_id, contact_ref, type, le) values (d.campagne_id, d.envoi_id, v_ref, 'reponse', coalesce(new.created_at, now()));
  end if;
  return new;
end $function$;

-- L'agence du mail retenu : notre dernier envoi de même objet, depuis la boîte qui reçoit la demande, dans les 2 jours
-- avant. Mailinblack écrit depuis « nom_de_l_agence@invitations.mailinblack.com » : ce nom désigne l'envoi quand il
-- se lit dans l'adresse ou le nom de l'agence. Sinon, seul un envoi unique dans les 15 minutes avant est retenu ;
-- dans le doute, aucune agence (jamais deviner).
create or replace function public.message_anti_spam_agence(p_de text, p_a text, p_objet text, p_avant timestamptz default now())
 returns uuid
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_objet text := regexp_replace(lower(trim(coalesce(p_objet, ''))), '^((re|tr|fw|fwd|rep|rép|réf)\s*:\s*)+', '');
  v_indice text := regexp_replace(lower(split_part(coalesce(p_de, ''), '@', 1)), '[^a-z0-9]', '', 'g');
  v uuid;
  v_n int;
begin
  if v_objet = '' then return null; end if;
  select m.agence_id into v
    from public.messages m join public.agences g on g.id = m.agence_id
   where m.sens = 'sortant' and m.espace = 'demarchage' and m.agence_id is not null
     and m.created_at between coalesce(p_avant, now()) - interval '2 days' and coalesce(p_avant, now())
     and regexp_replace(lower(trim(m.objet)), '^((re|tr|fw|fwd|rep|rép|réf)\s*:\s*)+', '') = v_objet
     and position(lower(m.de) in lower(coalesce(p_a, ''))) > 0
     and length(v_indice) >= 4
     and (position(v_indice in regexp_replace(lower(m.a), '[^a-z0-9]', '', 'g')) > 0
          or position(v_indice in regexp_replace(lower(g.nom), '[^a-z0-9]', '', 'g')) > 0)
   order by m.created_at desc limit 1;
  if v is not null then return v; end if;
  select count(distinct m.agence_id), min(m.agence_id::text)::uuid into v_n, v
    from public.messages m
   where m.sens = 'sortant' and m.espace = 'demarchage' and m.agence_id is not null
     and m.created_at between coalesce(p_avant, now()) - interval '15 minutes' and coalesce(p_avant, now())
     and regexp_replace(lower(trim(m.objet)), '^((re|tr|fw|fwd|rep|rép|réf)\s*:\s*)+', '') = v_objet
     and position(lower(m.de) in lower(coalesce(p_a, ''))) > 0;
  return case when v_n = 1 then v else null end;
end $function$;
revoke all on function public.message_anti_spam_agence(text, text, text, timestamptz) from public, anon;

-- Avant messages_rattacher_agence (ordre alphabétique des déclencheurs) : une demande d'anti-spam n'est jamais
-- rangée « par l'adresse » (celle de Mailinblack n'est sur aucune fiche), seulement sur l'agence du mail retenu.
create or replace function public.messages_anti_spam_agence()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.sens <> 'entrant' or new.agence_id is not null or new.tri is distinct from 'anti_spam'
     or coalesce(new.espace, 'demarchage') <> 'demarchage' then
    return new;
  end if;
  new.agence_id := public.message_anti_spam_agence(new.de, new.a, new.objet, coalesce(new.created_at, now()));
  return new;
end $function$;

drop trigger if exists messages_anti_spam_agence on public.messages;
create trigger messages_anti_spam_agence before insert on public.messages
  for each row execute function public.messages_anti_spam_agence();

-- ── Rattrapages ──
-- D75 : les demandes Mailinblack déjà reçues (1 au 26/11 : Diderot Immobilier, 20/11). Le tri passe en « anti_spam »
-- dans la même mise à jour que l'agence : ni lead, ni réponse de campagne. « lu » n'est pas touché.
update public.messages m
   set tri = 'anti_spam',
       agence_id = coalesce(m.agence_id, public.message_anti_spam_agence(m.de, m.a, m.objet, m.created_at))
 where m.sens = 'entrant' and coalesce(m.espace, 'demarchage') = 'demarchage'
   and (lower(m.de) like '%@mailinblack.com' or lower(m.de) like '%.mailinblack.com')
   and m.tri is distinct from 'anti_spam';

-- D71 : les réponses envoyées sans agence dont le mail reçu a, lui, son agence (1 au 26/11 : Human Location, 159439e1).
update public.messages s
   set agence_id = e.agence_id
  from public.messages e
 where s.sens = 'sortant' and s.agence_id is null and coalesce(s.espace, 'demarchage') = 'demarchage'
   and e.sens = 'entrant' and e.agence_id is not null and coalesce(trim(e.message_id), '') <> ''
   and trim(both '<>' from trim(e.message_id)) = trim(both '<>' from trim(s.in_reply_to));

commit;

-- ── Contrôle (chiffres attendus au 27/11/2026) ──
select 'Réponse Human Location 159439e1 sur son agence (attendu : oui)' as quoi,
       case when (select agence_id from public.messages where id = '159439e1-0ddd-4b23-bfb8-75ac491b4329') = 'c64a1432-e0c7-437a-a234-c6b9fefbfa4d' then 'oui' else 'NON' end as valeur
union all
select 'Réponses sans agence dont le mail reçu a une agence (attendu : 0 ; 1 avant)',
       (select count(*) from public.messages s join public.messages e on e.sens = 'entrant' and e.agence_id is not null and coalesce(trim(e.message_id), '') <> ''
          and trim(both '<>' from trim(e.message_id)) = trim(both '<>' from trim(s.in_reply_to))
         where s.sens = 'sortant' and s.agence_id is null and coalesce(s.espace, 'demarchage') = 'demarchage')::text
union all
select 'Contrôle de santé « e-mail envoyé sans agence » (attendu : 2, les transferts internes ; 3 avant)',
       coalesce((select nombre from public.sante_demarchage() where code = 'mail_sans_agence'), 0)::text
union all
select 'Demande Mailinblack de Diderot Immobilier : tri et agence (attendu : anti_spam · ba14f4e5…)',
       (select coalesce(tri, '?') || ' · ' || coalesce(left(agence_id::text, 8) || '…', 'sans agence') from public.messages where id = '840b89a2-a519-480a-856f-af1a2aa8d789')
union all
select 'Diderot Immobilier : réponse de campagne ou lead créés par la demande (attendu : 0)',
       ((select count(*) from public.cmp_evenements where type = 'reponse' and contact_ref = 'ba14f4e5-093e-4942-b279-c7519b401510')
        + (select count(*) from public.leads_demarchage where agence_id = 'ba14f4e5-093e-4942-b279-c7519b401510'))::text
union all
select 'Déclencheurs posés (attendu : 2)',
       (select count(*) from pg_trigger where tgrelid = 'public.messages'::regclass and tgname in ('messages_reponses_suivent', 'messages_anti_spam_agence') and tgenabled <> 'D')::text
union all
select 'Contrôle de santé à jour (attendu : oui)',
       case when exists (select 1 from public.sante_demarchage() s where s.code = 'regle_modifiee') then 'NON : règle signalée modifiée' else 'oui' end;
