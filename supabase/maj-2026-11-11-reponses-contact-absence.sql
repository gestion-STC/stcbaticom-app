-- ════════════════════════════════════════════════════════════════════════════
-- LES RÉPONSES, LOT B (Mahdi, 11/11/2026)
--   · l'IA lit dans chaque réponse la date de retour d'un absent et le bon contact cité (« voyez avec Mme X ») : tri_detail ;
--   · un absent : la séquence se met en pause et reprend le lendemain de son retour, à 9 h (sans date : 7 jours plus tard) ;
--   · un renvoi vers quelqu'un d'autre reste un lead ; le lead dit vers qui (« Renvoie vers Mme X · mail · téléphone »).
-- À coller en entier dans l'éditeur SQL de Supabase. Rejouable.
-- ════════════════════════════════════════════════════════════════════════════
alter table public.messages add column if not exists tri_detail jsonb;

-- 1. La réponse d'un absent met la séquence en pause jusqu'à son retour.
create or replace function public.cmp_depuis_reponse()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare d record; v_ref text; v_retour text; v_reprise timestamptz;
begin
  v_ref := coalesce(new.agence_id::text, new.sous_traitant_id::text);
  if new.sens = 'entrant' and v_ref is not null and new.tri = 'absent' then
    v_retour := new.tri_detail ->> 'retour';
    v_reprise := case when coalesce(v_retour, '') ~ '^\d{4}-\d{2}-\d{2}$' and v_retour::date between current_date and current_date + 120
      then ((v_retour::date + 1)::timestamp + time '09:00') at time zone 'Europe/Paris'
      else now() + interval '7 days' end;
    update public.cmp_inscriptions set prochaine_le = greatest(prochaine_le, v_reprise) where contact_ref = v_ref and statut = 'en_cours';
    return new;
  end if;
  if new.sens <> 'entrant' or not public.lead_mail_est_humain(new.objet) or new.tri is not distinct from 'absent' then return new; end if;
  if v_ref is null then return new; end if;
  select * into d from public.cmp_dernier_envoi(v_ref, coalesce(new.created_at, now()));
  if d.envoi_id is not null then
    insert into public.cmp_evenements (campagne_id, envoi_id, contact_ref, type, le) values (d.campagne_id, d.envoi_id, v_ref, 'reponse', coalesce(new.created_at, now()));
  end if;
  return new;
end $function$;

-- 2. Le lead dit vers qui la réponse renvoie.
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
    select x.tri, x.tri_detail, x.corps_text, x.contact_id, x.objet into m from public.messages x
     where x.agence_id::text = new.contact_ref and x.created_at = new.le and x.sens = 'entrant' and x.espace = 'demarchage' and public.lead_mail_est_humain(x.objet)
     limit 1;
    if not found then return new; end if;
    v_action := public.cmp_action_reponse(c.config, m.tri, m.corps_text);
    if v_action = 'dead' then
      perform public.cmp_poser_dead(new.contact_ref::uuid, m.corps_text);
    elsif v_action = 'lead' then
      perform public.lead_poser(new.contact_ref::uuid, m.contact_id, 'mail', 'A répondu au mail', case when coalesce(m.tri_detail ->> 'contact_nom', '') <> '' or coalesce(m.tri_detail ->> 'contact_email', '') <> '' then left('Renvoie vers ' || concat_ws(' · ', nullif(m.tri_detail ->> 'contact_nom', ''), nullif(m.tri_detail ->> 'contact_email', ''), nullif(m.tri_detail ->> 'contact_telephone', '')), 160) else left('« ' || coalesce(nullif(m.objet, ''), '(sans objet)') || ' »', 160) end, new.le);
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
    perform public.lead_poser(m.agence_id, m.contact_id, 'mail', 'A répondu à un mail', case when coalesce(m.tri_detail ->> 'contact_nom', '') <> '' or coalesce(m.tri_detail ->> 'contact_email', '') <> '' then left('Renvoie vers ' || concat_ws(' · ', nullif(m.tri_detail ->> 'contact_nom', ''), nullif(m.tri_detail ->> 'contact_email', ''), nullif(m.tri_detail ->> 'contact_telephone', '')), 160) else left('« ' || coalesce(nullif(m.objet, ''), '(sans objet)') || ' »', 160) end, m.created_at);
  end if;
end $function$;
