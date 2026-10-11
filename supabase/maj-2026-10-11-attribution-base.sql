-- ============================================================================
--  À COLLER DANS LE PROJET **STCBATICOM** (ifvrmsiwlwppinfdmeao).
--
--  L'attribution de la base (Mahdi, 11/10/2026) : chaque agence a UN propriétaire
--  (agences.commercial_id = le compte Baticom qui la démarche). Chacun appelle sa
--  base dans sa session ; deux personnes ne tombent plus sur le même numéro ; les
--  statistiques restent communes, sur la base générale.
--    1) les agences déjà appelées passent à celui qui les a appelées (Horlann garde
--       tout ce qu'il a commencé, même si Mahdi a appelé aussi) ;
--    2) filet : une agence sans propriétaire appelée depuis une session devient
--       celle de l'appelant (déclencheur) ;
--    3) attribution par secteur (Réglages › Secteurs) : secteurs.commercial_id +
--       fonction attribuer_secteur, réservée aux admins.
--  Ré-exécutable sans danger.
-- ============================================================================
do $$ begin
  if to_regclass('public.agences') is null or to_regclass('public.secteurs') is null or to_regclass('public.activites') is null then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans STCBATICOM (ifvrmsiwlwppinfdmeao).';
  end if;
end $$;

-- 1) Le secteur porte la personne qui le démarche (réglage)
alter table public.secteurs add column if not exists commercial_id uuid;

-- 2) L'historique : les agences déjà appelées → celui qui les a appelées.
--    Horlann (compte 46fd93e4…) garde tout ce qu'il a touché ; sinon le dernier appelant.
with appels as (
  select agence_id, compte_id, date
  from public.activites
  where type = 'appel' and compte_id is not null and agence_id is not null
), choix as (
  select agence_id,
         case when bool_or(compte_id = '46fd93e4-fcd0-4b5e-bac0-5ba1f92babdd') then '46fd93e4-fcd0-4b5e-bac0-5ba1f92babdd'::uuid
              else (array_agg(compte_id order by date desc))[1] end as compte_id
  from appels
  group by agence_id
)
update public.agences a
   set commercial_id = c.compte_id
  from choix c
 where a.id = c.agence_id and a.commercial_id is null;

-- 3) Filet : une agence sans propriétaire appelée depuis une session devient celle de l'appelant
create or replace function public.agence_attribuer_au_premier_appelant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'appel' and new.compte_id is not null and new.agence_id is not null then
    update public.agences set commercial_id = new.compte_id
     where id = new.agence_id and commercial_id is null;
  end if;
  return new;
end $$;
drop trigger if exists activites_attribuer_agence on public.activites;
create trigger activites_attribuer_agence
  after insert on public.activites
  for each row execute function public.agence_attribuer_au_premier_appelant();

-- 4) Attribuer un secteur à une personne (admins seulement) : le réglage est mémorisé sur le
--    secteur, et les agences NON attribuées du secteur passent à cette personne (p_ecraser = true
--    pour reprendre aussi celles déjà attribuées). p_secteur = '' vise les agences SANS secteur.
--    Renvoie le nombre d'agences attribuées.
create or replace function public.attribuer_secteur(p_secteur text, p_compte_id uuid, p_ecraser boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer := 0;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Réservé aux admins.';
  end if;
  if p_secteur <> '' then
    update public.secteurs set commercial_id = p_compte_id where code = p_secteur;
  end if;
  if p_compte_id is null then return 0; end if;
  update public.agences
     set commercial_id = p_compte_id
   where type <> 'apporteur'
     and ((p_secteur <> '' and secteur = p_secteur) or (p_secteur = '' and coalesce(secteur, '') = ''))
     and (commercial_id is null or p_ecraser);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.attribuer_secteur(text, uuid, boolean) from public, anon;
grant execute on function public.attribuer_secteur(text, uuid, boolean) to authenticated;

-- Contrôle : la base par propriétaire
select coalesce(commercial_id::text, '(non attribuée)') as proprietaire, count(*) as agences
from public.agences where type <> 'apporteur'
group by 1 order by 2 desc;
