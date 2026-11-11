-- ════════════════════════════════════════════════════════════════════════════
-- ABSENT SANS DATE DE RETOUR : LA PAUSE SE RÈGLE DANS CHAQUE CAMPAGNE (Mahdi, 11/11/2026)
-- Avant : 7 jours pour toutes. Maintenant : Garde-fous › « Absent sans date de retour » (7 jours par défaut, 1 à 60).
-- À coller dans Baticom. Rejouable.
-- ════════════════════════════════════════════════════════════════════════════
do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cmp_inscriptions') then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans Baticom.';
  end if;
end $$;
create or replace function public.cmp_depuis_reponse()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare d record; v_ref text; v_retour text; v_reprise timestamptz;
begin
  v_ref := coalesce(new.agence_id::text, new.sous_traitant_id::text);
  if new.sens = 'entrant' and v_ref is not null and new.tri = 'absent' then
    v_retour := new.tri_detail ->> 'retour';
    v_reprise := case when coalesce(v_retour, '') ~ '^\d{4}-\d{2}-\d{2}$' and v_retour::date between current_date and current_date + 120
      then ((v_retour::date + 1)::timestamp + time '09:00') at time zone 'Europe/Paris'
      else null end;
    -- Sans date : la pause réglée dans chaque campagne (Garde-fous › Absent sans date de retour), 7 jours par défaut.
    update public.cmp_inscriptions i
       set prochaine_le = greatest(i.prochaine_le, coalesce(v_reprise, now() + make_interval(days => least(greatest(coalesce(case when (c.config #>> '{garde,pauseAbsentJours}') ~ '^\d+$' then (c.config #>> '{garde,pauseAbsentJours}')::int end, 7), 1), 60))))
      from public.cmp_campagnes c
     where c.id = i.campagne_id and i.contact_ref = v_ref and i.statut = 'en_cours';
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
