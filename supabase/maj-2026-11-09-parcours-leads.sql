-- ════════════════════════════════════════════════════════════════════════════
-- LE MOTEUR DE CAMPAGNES, ÉTAPE 2 (Mahdi, 09/11/2026) : la campagne décide. À coller AVANT de fusionner la PR.
-- 1. Les étapes du parcours validées à la main.
-- 2. Les critères d'intérêt des agences se lisent dans la campagne « traçabilité » au lieu d'être écrits en dur.
--    Tant que cette campagne n'a pas été enregistrée, les règles restent exactement celles d'aujourd'hui.
-- Se rejoue sans risque.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.cmp_progression (
  campagne_id uuid not null references public.cmp_campagnes(id) on delete cascade,
  contact_ref text not null,
  etape_id    text not null,
  valide_par  text not null default '',
  valide_le   timestamptz not null default now(),
  primary key (campagne_id, contact_ref, etape_id)
);
alter table public.cmp_progression enable row level security;
drop policy if exists acces_connecte on public.cmp_progression;
create policy acces_connecte on public.cmp_progression for all to authenticated using (true) with check (true);

-- La règle d'intérêt de la traçabilité pour un événement. Pas de réglage enregistré : la valeur d'aujourd'hui.
-- Réglage enregistré sans cette règle : aucune ligne, l'événement ne crée plus de lead.
create or replace function public.cmp_regle_interet(p_evenement text, p_fois int, p_jours int)
returns table (fois int, jours int) language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select config -> 'qualification' -> 'interet' into v from public.cmp_campagnes where origine = 'tracabilite' limit 1;
  if v is null then return query select p_fois, p_jours; return; end if;
  return query select greatest(coalesce((r ->> 'fois')::int, 1), 1), greatest(coalesce((r ->> 'jours')::int, 1), 1)
    from jsonb_array_elements(v) r where r ->> 'evenement' = p_evenement limit 1;
end $$;
revoke execute on function public.cmp_regle_interet(text, int, int) from anon, public;

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
    select * into r from public.cmp_regle_interet('A ouvert la page « Créer un compte »', 1, 7);
    if not found then return; end if;
    select count(*) into n from public.activites
     where agence_id = s.agence_id and type = 'note' and source = 'site' and titre = s.titre and date > s.date - make_interval(days => r.jours) and date <= s.date;
    if n >= r.fois then
      perform public.lead_poser(s.agence_id, s.contact_id, 'page_compte', 'A ouvert la page « Créer un compte »', 'Depuis notre e-mail', s.date);
    end if;
  elsif s.titre = 'Plaquette ouverte' then
    select * into r from public.cmp_regle_interet('A ouvert la plaquette', 2, 7);
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
  if not exists (select 1 from public.cmp_regle_interet('A répondu au mail', 1, 7)) then return; end if;
  perform public.lead_poser(m.agence_id, m.contact_id, 'mail', 'A répondu à un mail', left('« ' || coalesce(nullif(m.objet, ''), '(sans objet)') || ' »', 160), m.created_at);
end $function$;
