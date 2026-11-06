-- ============================================================================
--  À COLLER DANS LE PROJET **STCBATICOM** (ifvrmsiwlwppinfdmeao).
--
--  LES LEADS DU DÉMARCHAGE (Mahdi, 06/11/2026). En prospection, c'est nous qui
--  allons vers l'agence ; un LEAD, c'est l'agence qui s'est manifestée. La base
--  le crée toute seule à partir des signaux qu'elle reçoit déjà :
--    · tout de suite : un compte ouvert sur STC Bâtiment, la page « Créer un
--      compte » ouverte, une réponse à nos mails (sauf réponse automatique) ;
--    · en s'additionnant : la plaquette ouverte 2 fois en 7 jours.
--  Un lead se ferme tout seul au premier appel abouti (joint, standard,
--  apporteur) ; après 3 appels sans réponse, il RETOMBE en prospection. Une
--  agence a au plus un lead ouvert ; un lead fermé depuis moins de 3 jours
--  n'est pas recréé par un nouveau clic.
--  Ré-exécutable sans danger. Ne touche à aucune règle existante.
-- ============================================================================
do $$ begin
  if to_regclass('public.agences') is null or to_regclass('public.activites') is null then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans STCBATICOM (ifvrmsiwlwppinfdmeao).';
  end if;
end $$;

create table if not exists public.leads_demarchage (
  id uuid primary key default gen_random_uuid(),
  agence_id uuid not null references public.agences(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  source text not null check (source in ('compte', 'page_compte', 'mail', 'plaquette', 'manuel')),
  signal text not null,
  detail text not null default '',
  cree_le timestamptz not null default now(),
  dernier_signal_le timestamptz not null default now(),
  statut text not null default 'a_traiter' check (statut in ('a_traiter', 'traite', 'retombe')),
  traite_le timestamptz,
  traite_par uuid,
  resultat text not null default '',
  tentatives integer not null default 0
);
create unique index if not exists leads_demarchage_un_ouvert on public.leads_demarchage (agence_id) where statut = 'a_traiter';
create index if not exists leads_demarchage_agence on public.leads_demarchage (agence_id, cree_le desc);
alter table public.leads_demarchage enable row level security;
drop policy if exists "lecture_connecte" on public.leads_demarchage;
create policy "lecture_connecte" on public.leads_demarchage for select to authenticated using (true);
-- Les écritures passent par les fonctions ci-dessous (security definer) : jamais à la main.

-- Poser un lead (ou rafraîchir le lead ouvert de l'agence).
create or replace function public.lead_poser(p_agence uuid, p_contact uuid, p_source text, p_signal text, p_detail text, p_quand timestamptz default now())
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a record;
  v uuid;
begin
  select type, etape into a from public.agences where id = p_agence;
  if not found or a.type = 'apporteur' or a.etape in ('client', 'hors_cible') then return null; end if;
  update public.leads_demarchage set dernier_signal_le = greatest(dernier_signal_le, p_quand), contact_id = coalesce(contact_id, p_contact)
   where agence_id = p_agence and statut = 'a_traiter' returning id into v;
  if v is not null then return v; end if;
  -- Un lead qu'on vient de traiter ne renaît pas au clic suivant.
  if exists (select 1 from public.leads_demarchage where agence_id = p_agence and statut = 'traite' and traite_le > p_quand - interval '3 days') then return null; end if;
  insert into public.leads_demarchage (agence_id, contact_id, source, signal, detail, cree_le, dernier_signal_le)
  values (p_agence, p_contact, p_source, p_signal, coalesce(p_detail, ''), p_quand, p_quand)
  on conflict (agence_id) where statut = 'a_traiter' do update set dernier_signal_le = excluded.dernier_signal_le
  returning id into v;
  return v;
end $$;
revoke execute on function public.lead_poser(uuid, uuid, text, text, text, timestamptz) from public;
do $$ begin revoke execute on function public.lead_poser(uuid, uuid, text, text, text, timestamptz) from anon; exception when undefined_object then null; end $$;
grant execute on function public.lead_poser(uuid, uuid, text, text, text, timestamptz) to authenticated;

-- Les signaux du site (fonction evenements-site) : une ligne « note » source « site ».
create or replace function public.lead_depuis_note(p_id uuid) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s record;
  n integer;
begin
  select * into s from public.activites where id = p_id;
  if not found or s.type <> 'note' or s.source <> 'site' then return; end if;
  if s.titre = 'Compte ouvert sur STC Bâtiment' then
    perform public.lead_poser(s.agence_id, s.contact_id, 'compte', 'A ouvert son compte STC Bâtiment', s.note, s.date);
  elsif s.titre = 'Page « Créer un compte » ouverte' then
    perform public.lead_poser(s.agence_id, s.contact_id, 'page_compte', 'A ouvert la page « Créer un compte »', 'Depuis notre e-mail', s.date);
  elsif s.titre = 'Plaquette ouverte' then
    select count(*) into n from public.activites
     where agence_id = s.agence_id and type = 'note' and source = 'site' and titre = 'Plaquette ouverte' and date > s.date - interval '7 days' and date <= s.date;
    if n >= 2 then
      perform public.lead_poser(s.agence_id, s.contact_id, 'plaquette', 'A ouvert la plaquette ' || n || ' fois', s.note, s.date);
    end if;
  end if;
end $$;
create or replace function public.leads_depuis_signal() returns trigger
language plpgsql security definer set search_path to 'public'
as $$ begin perform public.lead_depuis_note(new.id); return new; end $$;
drop trigger if exists leads_depuis_signal on public.activites;
create trigger leads_depuis_signal after insert on public.activites for each row execute function public.leads_depuis_signal();

-- Une réponse à nos mails (boîte du démarchage), sauf les réponses automatiques et les désinscriptions.
create or replace function public.lead_mail_est_humain(p_objet text) returns boolean
language sql immutable
as $$
  select coalesce(p_objet, '') !~* '(r[ée]ponse automatique|automatic reply|auto[- ]?reply|autoreply|out of office|absen|cong[ée]|d[ée]sinscri|unsubscribe|undeliverable|non remis|delivery status|mail delivery|accus[ée] de r[ée]ception)'
$$;
create or replace function public.lead_depuis_message(p_id uuid) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  m record;
begin
  select * into m from public.messages where id = p_id;
  if not found or m.sens <> 'entrant' or m.espace <> 'demarchage' or m.agence_id is null or not public.lead_mail_est_humain(m.objet) then return; end if;
  perform public.lead_poser(m.agence_id, m.contact_id, 'mail', 'A répondu à un mail', left('« ' || coalesce(nullif(m.objet, ''), '(sans objet)') || ' »', 160), m.created_at);
end $$;
create or replace function public.leads_depuis_mail() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' and old.agence_id is not distinct from new.agence_id then return new; end if;
  perform public.lead_depuis_message(new.id);
  return new;
end $$;
drop trigger if exists leads_depuis_mail on public.messages;
create trigger leads_depuis_mail after insert or update of agence_id on public.messages for each row execute function public.leads_depuis_mail();

-- La fermeture : le premier appel abouti après le lead le ferme ; 3 appels sans réponse le font retomber.
create or replace function public.leads_suivre_appel() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  l record;
begin
  if new.type <> 'appel' or new.sens <> 'sortant' or new.resultat in ('', 'lance') then return new; end if;
  if tg_op = 'UPDATE' and old.resultat is not distinct from new.resultat and old.issue is not distinct from new.issue then return new; end if;
  select * into l from public.leads_demarchage where agence_id = new.agence_id and statut = 'a_traiter';
  if not found or new.date < l.cree_le - interval '2 minutes' then return new; end if;
  if new.resultat in ('pas_de_reponse', 'faux_numero') then
    update public.leads_demarchage
       set tentatives = l.tentatives + 1,
           statut = case when l.tentatives + 1 >= 3 then 'retombe' else 'a_traiter' end,
           traite_le = case when l.tentatives + 1 >= 3 then now() end,
           resultat = case when l.tentatives + 1 >= 3 then 'injoignable' else '' end
     where id = l.id;
  else
    update public.leads_demarchage
       set statut = 'traite', traite_le = now(), traite_par = new.compte_id, resultat = coalesce(nullif(new.issue, ''), new.resultat)
     where id = l.id;
  end if;
  return new;
end $$;
drop trigger if exists leads_suivre_appel on public.activites;
create trigger leads_suivre_appel after insert or update of resultat, issue on public.activites for each row execute function public.leads_suivre_appel();

-- Une agence sortie du démarchage (apporteur, cliente, hors cible, pas intéressée) : son lead est fermé.
create or replace function public.leads_suivre_agence() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if (new.type = 'apporteur' and old.type is distinct from 'apporteur') or (new.etape in ('client', 'hors_cible', 'pas_interesse') and old.etape is distinct from new.etape) then
    update public.leads_demarchage set statut = 'traite', traite_le = now(), resultat = case when new.type = 'apporteur' then 'apporteur' else new.etape end
     where agence_id = new.id and statut = 'a_traiter';
  end if;
  return new;
end $$;
drop trigger if exists leads_suivre_agence on public.agences;
create trigger leads_suivre_agence after update of type, etape on public.agences for each row execute function public.leads_suivre_agence();

-- La file des leads : les leads ouverts de la base choisie, le plus ancien d'abord (même règle
-- de « base de chacun » que pile_demarchage). Chaque ligne porte le lead et l'agence.
create or replace function public.leads_a_traiter(p_proprietaire text default 'tous')
returns table (rang integer, lead jsonb, agence jsonb)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select (row_number() over (order by d.cree_le, d.id))::integer,
         jsonb_build_object('id', d.id, 'source', d.source, 'signal', d.signal, 'detail', d.detail, 'cree_le', d.cree_le,
                            'dernier_signal_le', d.dernier_signal_le, 'tentatives', d.tentatives, 'contact_id', d.contact_id),
         to_jsonb(l)
    from public.leads_demarchage d
    join public.agences_liste l on l.id = d.agence_id
   where d.statut = 'a_traiter'
     and (coalesce(p_proprietaire, 'tous') = 'tous'
          or (p_proprietaire = 'non_attribuees' and l.commercial_id is null)
          or l.commercial_id::text = p_proprietaire)
$$;
grant execute on function public.leads_a_traiter(text) to authenticated;

-- Le dernier lead d'une agence (ouvert ou non), pour la fiche.
create or replace function public.lead_de_agence(p_agence uuid) returns jsonb
language sql stable security invoker set search_path to 'public'
as $$
  select to_jsonb(d) from public.leads_demarchage d where d.agence_id = p_agence order by (d.statut = 'a_traiter') desc, d.cree_le desc limit 1
$$;
grant execute on function public.lead_de_agence(uuid) to authenticated;

-- Les signaux reçus ces 7 derniers jours deviennent des leads tout de suite, par les mêmes règles.
-- (Ré-exécuter ce fichier ne crée rien de plus : un lead ouvert est seulement rafraîchi.)
do $$
declare r record;
begin
  for r in (select id, date as quand, 'note' as k from public.activites where type = 'note' and source = 'site' and date > now() - interval '7 days'
            union all
            select id, created_at, 'mail' from public.messages where sens = 'entrant' and espace = 'demarchage' and created_at > now() - interval '7 days')
           order by quand loop
    if r.k = 'note' then perform public.lead_depuis_note(r.id); else perform public.lead_depuis_message(r.id); end if;
  end loop;
end $$;
