-- Robots, suite (25/11/2026). Le lien de désinscription porte le même jeton que le lien « Créer un compte » : un robot
-- qui ouvrait ces deux liens-là n'était pas repéré (même ligne de liens_suivis). L'ouverture du lien de désinscription
-- est désormais notée à part (stop_vu_le) et site_noter_clic la regarde, sur toutes les lignes de l'agence.
alter table public.liens_suivis add column if not exists stop_vu_le timestamptz;

create or replace function public.site_noter_clic(p_lien uuid, p_quand timestamptz, p_titre text, p_note text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  l record;
  d record;
begin
  select id, agence_id, contact_id into l from public.liens_suivis where id = p_lien;
  if l.agence_id is null then return 'sans_agence'; end if;
  perform pg_advisory_xact_lock(hashtext('clic:' || l.agence_id::text));
  -- Robot : un AUTRE lien du même contact ouvert dans les 5 secondes, ou le lien de désinscription ouvert dans les 5 secondes.
  if exists (select 1 from public.liens_suivis x
              where x.agence_id = l.agence_id
                and ((x.id <> l.id and x.dernier_clic_le between p_quand - interval '5 seconds' and p_quand + interval '5 seconds')
                  or x.stop_vu_le between p_quand - interval '5 seconds' and p_quand + interval '5 seconds')) then
    if not exists (select 1 from public.cmp_evenements e where e.contact_ref = l.agence_id::text and e.robot and e.le > p_quand - interval '30 seconds') then
      select * into d from public.cmp_dernier_envoi(l.agence_id::text, p_quand);
      if d.envoi_id is not null then
        insert into public.cmp_evenements (campagne_id, envoi_id, contact_ref, type, le, robot)
        values (d.campagne_id, d.envoi_id, l.agence_id::text, 'clic', p_quand, true);
      end if;
    end if;
    return 'robot';
  end if;
  if exists (select 1 from public.activites a
              where a.agence_id = l.agence_id and a.type = 'note' and a.source = 'site' and a.titre = p_titre
                and a.date between p_quand - interval '30 seconds' and p_quand + interval '30 seconds') then
    return 'doublon';
  end if;
  insert into public.activites (agence_id, contact_id, type, titre, note, date, compte_nom, source)
  values (l.agence_id, l.contact_id, 'note', p_titre, p_note, p_quand, 'Site STC Bâtiment', 'site');
  update public.agences set dernier_signal_le = p_quand, dernier_signal = p_titre where id = l.agence_id;
  return 'ok';
end $function$;
revoke all on function public.site_noter_clic(uuid, timestamptz, text, text) from public, anon, authenticated;

select 'robots, suite : en place' as etat,
  (select count(*) from information_schema.columns where table_name = 'liens_suivis' and column_name = 'stop_vu_le') as colonne_stop_vu_le,
  (select count(*) from pg_proc where proname = 'site_noter_clic' and prosrc like '%stop_vu_le%') as fonction_a_jour;
