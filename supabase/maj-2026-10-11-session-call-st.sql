-- ============================================================================
--  À COLLER DANS LE PROJET **STCBATICOM** (ifvrmsiwlwppinfdmeao).
--
--  Session de call · Recrutement sous-traitants (11/10/2026).
--  Les artisans qui ont cliqué (barème, candidature) sans déposer leur dossier
--  sont des LEADS : on les appelle, et chaque appel laisse une trace
--  (combien de fois, quel retour, va-t-il déposer, pas intéressé). Les règles
--  (rappels, injoignable, arrêt de la séquence) vivent ICI, dans la base :
--  une seule définition, comme `appel_enregistrer` côté démarchage.
-- ============================================================================

-- 0) Garde-fou : mauvais projet = on s'arrête avant d'écrire quoi que ce soit.
do $$ begin
  if to_regclass('public.st_sous_traitants') is null then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans STCBATICOM (ifvrmsiwlwppinfdmeao).';
  end if;
end $$;

-- 1) Le journal des appels
create table if not exists public.st_appels (
  id                uuid primary key default gen_random_uuid(),
  sous_traitant_id  uuid not null references public.st_sous_traitants(id) on delete cascade,
  date              timestamptz not null default now(),
  compte_id         uuid,
  compte_nom        text not null default '',
  resultat          text not null check (resultat in ('pas_de_reponse', 'standard', 'joint', 'faux_numero')),
  issue             text not null default '' check (issue in ('', 'va_deposer', 'a_rappeler', 'pas_interesse', 'hors_cible')),
  motif             text not null default '',
  note              text not null default '',
  rappel_le         timestamptz,
  numero_utilise    text not null default '',
  duree_s           integer,
  call_id           text not null default '',
  sens              text not null default 'sortant' check (sens in ('sortant', 'entrant'))
);
create index if not exists st_appels_st_date_idx on public.st_appels (sous_traitant_id, date desc);
create index if not exists st_appels_date_idx on public.st_appels (date desc);
alter table public.st_appels enable row level security;
drop policy if exists "acces_connecte" on public.st_appels;
create policy "acces_connecte" on public.st_appels for all to authenticated using (true) with check (true);

-- 2) Le suivi téléphonique sur la fiche
alter table public.st_sous_traitants
  add column if not exists nb_appels          integer not null default 0,
  add column if not exists nb_joints          integer not null default 0,
  add column if not exists dernier_appel_le   timestamptz,
  add column if not exists dernier_resultat   text not null default '',
  add column if not exists rappel_le          timestamptz,            -- prochain appel prévu (rappel demandé, relance « va déposer », nouvel essai)
  add column if not exists suivi              text not null default '', -- '' | a_rappeler | va_deposer | pas_interesse | hors_cible | injoignable
  add column if not exists suivi_le           timestamptz,
  add column if not exists suivi_motif        text not null default '',
  add column if not exists telephone_invalide boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'st_sous_traitants_suivi_connu') then
    alter table public.st_sous_traitants add constraint st_sous_traitants_suivi_connu
      check (suivi in ('', 'a_rappeler', 'va_deposer', 'pas_interesse', 'hors_cible', 'injoignable'));
  end if;
end $$;
create index if not exists st_sous_traitants_rappel_idx on public.st_sous_traitants (rappel_le) where rappel_le is not null;

-- 3) Le prochain jour ouvré à 10 h (heure de Paris) : samedi et dimanche sautés.
create or replace function public.st_prochain_jour_ouvre(p_depuis timestamptz default now(), p_jours integer default 1)
returns timestamptz language sql immutable as $$
  with j as (
    select ((p_depuis at time zone 'Europe/Paris')::date + p_jours) as d
  ), o as (
    select case extract(isodow from d) when 6 then d + 2 when 7 then d + 1 else d end as d from j
  )
  select (o.d + time '10:00') at time zone 'Europe/Paris' from o
$$;

-- 4) Enregistrer un appel : la trace, les compteurs, et les règles.
--   · pas de réponse / standard : nouvel essai le prochain jour ouvré à 10 h ;
--     au 4e appel sans joindre personne → injoignable (sort des files).
--   · faux numéro : numéro invalide, injoignable.
--   · joint + « va déposer » : relance à J+7 (ouvré) si le dossier n'est pas arrivé.
--   · joint + « à rappeler le… » : le rappel à la date choisie.
--   · joint + « pas intéressé » / « hors cible » : la séquence s'arrête (statut terminé), plus d'appel.
create or replace function public.st_appel_enregistrer(
  p_sous_traitant_id uuid, p_resultat text, p_issue text default '', p_motif text default '', p_note text default '',
  p_rappel_le timestamptz default null, p_numero text default '', p_duree_s integer default null, p_call_id text default '', p_compte_nom text default ''
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_appel_id uuid;
  v_sans_reponse integer;
  v_rappel timestamptz := null;
  v_suivi text;
  v_suivi_motif text;
  v_statut text;
begin
  if p_resultat not in ('pas_de_reponse', 'standard', 'joint', 'faux_numero') then raise exception 'résultat inconnu : %', p_resultat; end if;
  if coalesce(p_issue, '') not in ('', 'va_deposer', 'a_rappeler', 'pas_interesse', 'hors_cible') then raise exception 'issue inconnue : %', p_issue; end if;
  if p_resultat <> 'joint' then p_issue := ''; end if;

  insert into public.st_appels (sous_traitant_id, compte_id, compte_nom, resultat, issue, motif, note, rappel_le, numero_utilise, duree_s, call_id)
  values (p_sous_traitant_id, auth.uid(), coalesce(p_compte_nom, ''), p_resultat, coalesce(p_issue, ''), coalesce(p_motif, ''), coalesce(p_note, ''), p_rappel_le, coalesce(p_numero, ''), p_duree_s, coalesce(p_call_id, ''))
  returning id into v_appel_id;

  select suivi, suivi_motif, statut into v_suivi, v_suivi_motif, v_statut from public.st_sous_traitants where id = p_sous_traitant_id for update;
  if not found then raise exception 'fiche inconnue'; end if;

  if p_resultat in ('pas_de_reponse', 'standard') then
    -- Les essais sans joindre personne depuis le dernier appel abouti.
    select count(*) into v_sans_reponse from public.st_appels a
     where a.sous_traitant_id = p_sous_traitant_id and a.resultat in ('pas_de_reponse', 'standard')
       and a.date > coalesce((select max(b.date) from public.st_appels b where b.sous_traitant_id = p_sous_traitant_id and b.resultat = 'joint'), '-infinity'::timestamptz);
    if v_sans_reponse >= 4 then
      v_suivi := 'injoignable'; v_suivi_motif := format('%s appels sans réponse', v_sans_reponse); v_rappel := null;
      update public.st_sous_traitants set injoignable_le = coalesce(injoignable_le, now()) where id = p_sous_traitant_id;
    else
      v_rappel := public.st_prochain_jour_ouvre(now(), 1);
    end if;
  elsif p_resultat = 'faux_numero' then
    v_suivi := 'injoignable'; v_suivi_motif := 'faux numéro'; v_rappel := null;
    update public.st_sous_traitants set telephone_invalide = true, injoignable_le = coalesce(injoignable_le, now()) where id = p_sous_traitant_id;
  else -- joint
    if p_issue = 'va_deposer' then
      v_suivi := 'va_deposer'; v_suivi_motif := ''; v_rappel := public.st_prochain_jour_ouvre(now(), 7);
    elsif p_issue = 'a_rappeler' then
      v_suivi := 'a_rappeler'; v_suivi_motif := ''; v_rappel := coalesce(p_rappel_le, public.st_prochain_jour_ouvre(now(), 1));
    elsif p_issue in ('pas_interesse', 'hors_cible') then
      v_suivi := p_issue; v_suivi_motif := coalesce(p_motif, ''); v_rappel := null;
      if v_statut in ('a_contacter', 'en_sequence') then
        update public.st_sous_traitants
           set statut = 'termine', statut_motif = case when p_issue = 'pas_interesse' then 'pas intéressé (au téléphone)' else 'hors cible (au téléphone)' end || case when coalesce(p_motif, '') <> '' then ' : ' || p_motif else '' end,
               termine_le = now(), pause_jusqu_au = null
         where id = p_sous_traitant_id;
      end if;
    else
      v_rappel := null; -- joint sans suite précisée : rien de prévu
    end if;
  end if;

  update public.st_sous_traitants
     set nb_appels = nb_appels + 1,
         nb_joints = nb_joints + case when p_resultat = 'joint' then 1 else 0 end,
         dernier_appel_le = now(), dernier_resultat = p_resultat,
         rappel_le = v_rappel,
         suivi = coalesce(v_suivi, ''), suivi_motif = coalesce(v_suivi_motif, ''),
         suivi_le = case when coalesce(v_suivi, '') is distinct from suivi then now() else suivi_le end
   where id = p_sous_traitant_id;

  return jsonb_build_object('appel_id', v_appel_id, 'suivi', coalesce(v_suivi, ''), 'rappel_le', v_rappel);
end $$;
revoke all on function public.st_appel_enregistrer(uuid, text, text, text, text, timestamptz, text, integer, text, text) from public;
grant execute on function public.st_appel_enregistrer(uuid, text, text, text, text, timestamptz, text, integer, text, text) to authenticated;

-- 5) Un dossier déposé clôt le suivi « va déposer » (la fiche sort des files d'appel d'elle-même : depose_le est posé).
create or replace function public.st_depot_clot_suivi() returns trigger language plpgsql as $$
begin
  if new.depose_le is not null and old.depose_le is null and new.suivi in ('va_deposer', 'a_rappeler') then
    new.suivi := ''; new.suivi_motif := ''; new.rappel_le := null; new.suivi_le := now();
  end if;
  return new;
end $$;
drop trigger if exists st_depot_clot_suivi on public.st_sous_traitants;
create trigger st_depot_clot_suivi before update of depose_le on public.st_sous_traitants for each row execute function public.st_depot_clot_suivi();

-- Contrôle : les leads à appeler aujourd'hui (ont cliqué, pas de dossier, joignables).
select count(*) as leads_a_appeler from public.st_sous_traitants
 where (bareme_vu_le is not null or candidature_clic_le is not null or nb_clics > 0)
   and depose_le is null and desinscrit_le is null and telephone <> '' and not telephone_invalide and suivi = '' and rappel_le is null;
