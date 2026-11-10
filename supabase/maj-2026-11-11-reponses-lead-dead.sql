-- ════════════════════════════════════════════════════════════════════════════
-- RÉPONSES AU MAIL : LEAD OU DEAD (Mahdi, 11/11/2026)
--
-- « Une réponse, ça peut être un lead comme ça peut être un dead. » Toute réponse sort déjà le contact de sa séquence
-- (le moteur), sauf une réponse automatique d'absence. Ce qui change :
--   · chaque type de réponse trié par l'IA fait ce que dit la Qualification de la campagne (lead, dead ou rien) ;
--     par défaut : intéressé = lead, pas intéressé = dead, mauvaise personne et pas clair = lead ;
--   · un dead passe l'agence en « Pas intéressé » (son lead ouvert part dans les Perdus, comme à la main) ;
--   · le commercial corrige depuis la boîte de réception : « C'est un lead » / « C'est un dead ».
-- À coller en entier dans l'éditeur SQL de Supabase. Rejouable.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Ce que fait une réponse, selon son tri et le réglage de la campagne.
--    Sans tri de l'IA : une réponse visiblement négative ne devient pas un lead, mais n'est pas déclarée dead
--    (le commercial tranche) ; les autres deviennent des leads.
create or replace function public.cmp_action_reponse(p_config jsonb, p_tri text, p_texte text)
returns text language sql immutable set search_path to 'public' as $$
  select case
    when p_tri is null then case when public.reponse_est_negative(p_texte) then 'rien' else 'lead' end
    when p_tri = 'absent' then 'rien'
    else coalesce(
      nullif(p_config #>> array['qualification', 'reponses', p_tri], ''),
      case p_tri when 'pas_interesse' then 'dead' else 'lead' end)
  end
$$;

-- 2. Le dead : l'agence passe en « Pas intéressé », avec le motif que la réponse donne.
create or replace function public.cmp_poser_dead(p_agence uuid, p_texte text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.agences
     set etape = 'pas_interesse',
         motif = case when left(coalesce(p_texte, ''), 500) ~* 'd[ée]j[àa] (un|une|des|nos|notre|mes|mon) (prestataire|artisan|partenaire|entreprise)' then 'deja_prestataire' else 'pas_de_besoin' end
   where id = p_agence and coalesce(etape, '') not in ('client', 'hors_cible', 'pas_interesse');
end $$;
revoke all on function public.cmp_poser_dead(uuid, text) from public, anon, authenticated;

-- 3. Les campagnes : une réponse fait ce que dit la Qualification (les autres événements ne changent pas).
create or replace function public.cmp_lead_depuis_evenement()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  c record;
  r jsonb;
  m record;
  v_canal text;
  v_action text;
  n integer;
begin
  select id, base_id, origine, config into c from public.cmp_campagnes where id = new.campagne_id;
  if not found or c.base_id not in ('agences', 'apporteurs') or coalesce(c.config ->> 'v', '') <> '1' or c.origine is not distinct from 'tracabilite' then return new; end if;
  if new.type = 'reponse' then
    select x.tri, x.corps_text, x.contact_id, x.objet into m from public.messages x
     where x.agence_id::text = new.contact_ref and x.created_at = new.le and x.sens = 'entrant' and x.espace = 'demarchage' and public.lead_mail_est_humain(x.objet)
     limit 1;
    if not found then return new; end if;
    v_action := public.cmp_action_reponse(c.config, m.tri, m.corps_text);
    if v_action = 'dead' then
      perform public.cmp_poser_dead(new.contact_ref::uuid, m.corps_text);
    elsif v_action = 'lead' then
      perform public.lead_poser(new.contact_ref::uuid, m.contact_id, 'mail', 'A répondu au mail', left('« ' || coalesce(nullif(m.objet, ''), '(sans objet)') || ' »', 160), new.le);
    end if;
    return new;
  end if;
  select canal into v_canal from public.cmp_envois where id = new.envoi_id;
  for r in select * from jsonb_array_elements(coalesce(c.config #> '{qualification,interet}', '[]'::jsonb)) loop
    if not coalesce(public.cmp_evenement_correspond(r ->> 'evenement', new.type, new.lien, v_canal), false) then continue; end if;
    select count(*) into n from public.cmp_evenements e left join public.cmp_envois x on x.id = e.envoi_id
     where e.campagne_id = new.campagne_id and e.contact_ref = new.contact_ref
       and e.le > new.le - make_interval(days => greatest(coalesce((r ->> 'jours')::int, 7), 1)) and e.le <= new.le
       and coalesce(public.cmp_evenement_correspond(r ->> 'evenement', e.type, e.lien, x.canal), false);
    if n >= greatest(coalesce((r ->> 'fois')::int, 1), 1) then
      perform public.lead_poser(new.contact_ref::uuid, null, case when new.lien = 'plaquette' then 'plaquette' when new.lien = 'principal' then 'page_compte' else 'campagne' end,
        r ->> 'evenement', case when n > 1 then n || ' fois' else '' end, new.le);
      return new;
    end if;
  end loop;
  return new;
exception when others then
  raise warning 'cmp_lead_depuis_evenement : %', sqlerrm;
  return new;
end $function$;

-- 4. La campagne des gestionnaires (traçabilité) : même tri, réglage par défaut.
create or replace function public.lead_depuis_message(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  m record;
  v_action text;
begin
  select * into m from public.messages where id = p_id;
  if not found or m.sens <> 'entrant' or m.espace <> 'demarchage' or m.agence_id is null or not public.lead_mail_est_humain(m.objet) then return; end if;
  if not exists (select 1 from public.cmp_regle_interet('A répondu au mail', 1, 7, m.agence_id)) then return; end if;
  v_action := public.cmp_action_reponse('{}'::jsonb, m.tri, m.corps_text);
  if v_action = 'dead' then
    perform public.cmp_poser_dead(m.agence_id, m.corps_text);
  elsif v_action = 'lead' then
    perform public.lead_poser(m.agence_id, m.contact_id, 'mail', 'A répondu à un mail', left('« ' || coalesce(nullif(m.objet, ''), '(sans objet)') || ' »', 160), m.created_at);
  end if;
end $function$;

-- 5. Le commercial tranche depuis la boîte de réception.
create or replace function public.cmp_decider_reponse(p_message uuid, p_decision text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  m record;
  v uuid;
begin
  if not ('demarchage' = any (public.mes_espaces())) then raise exception 'Accès refusé.'; end if;
  if p_decision not in ('lead', 'dead') then raise exception 'Décision inconnue.'; end if;
  select * into m from public.messages where id = p_message and sens = 'entrant' and espace = 'demarchage';
  if not found then raise exception 'Réponse introuvable.'; end if;
  if m.agence_id is null then raise exception 'Cette réponse n''est rattachée à aucune agence.'; end if;
  update public.messages set tri = case p_decision when 'lead' then 'interesse' else 'pas_interesse' end where id = p_message;
  if p_decision = 'dead' then
    perform public.cmp_poser_dead(m.agence_id, m.corps_text);
    return;
  end if;
  -- Un lead : on défait un dead posé à tort, puis on rouvre son lead (ou on en crée un).
  update public.agences set etape = 'interesse' where id = m.agence_id and etape = 'pas_interesse';
  if exists (select 1 from public.leads_demarchage where agence_id = m.agence_id and statut = 'a_traiter') then return; end if;
  select id into v from public.leads_demarchage where agence_id = m.agence_id and statut = 'traite' and resultat = 'pas_interesse' order by traite_le desc nulls last limit 1;
  if v is not null then
    update public.leads_demarchage set statut = 'a_traiter', traite_le = null, resultat = null, dernier_signal_le = now() where id = v;
  else
    perform public.lead_poser(m.agence_id, m.contact_id, 'mail', 'A répondu au mail', left('« ' || coalesce(nullif(m.objet, ''), '(sans objet)') || ' »', 160), now());
  end if;
end $function$;
revoke all on function public.cmp_decider_reponse(uuid, text) from public, anon;
grant execute on function public.cmp_decider_reponse(uuid, text) to authenticated;
