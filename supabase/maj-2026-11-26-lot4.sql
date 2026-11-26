-- LOT 4 (26/11/2026) : recherche, doublons, compteurs du démarchage. Rien n'est supprimé. Rejouable sans effet.
--   A. Recherche d'agences sans accents et par numéro en chiffres seuls : « 0140211515 » trouve « 01 40 21 15 15 »,
--      « societe » trouve « Société ». Une vue dédiée, agences_recherche (agences_liste + trois colonnes à plat),
--      lue par l'écran seulement pour une recherche et pour les doublons : les files (pile_demarchage) ne paient rien.
--      La même vue sert la détection de doublons par téléphone (les 9 derniers chiffres).
--   B. Fiche agence : changer le secteur ET choisir « Attribuée à » dans le même enregistrement garde le choix.
--      (agence_suit_son_secteur : le secteur ne décide que si le chargé d'affaires n'a pas été changé en même temps.)
--      L'empreinte de la règle est mise à jour dans sante_demarchage.
--   C. Contact principal : chaque agence qui a des contacts présents mais aucun principal reçoit le plus ancien.
--   D. Appels entrants écrits deux ou trois fois (deux onglets ou deux collègues) : les doubles restent en base,
--      marqués doublon_de (l'identifiant de la première ligne), hors du fil de la fiche ; un index unique empêche
--      désormais d'écrire deux fois le même appel (identifiant Ringover).
-- À COLLER AVANT DE FUSIONNER LA PR (l'écran lit agences_recherche et activites.doublon_de).
begin;

-- ── A. Recherche ──
create extension if not exists unaccent with schema extensions;

-- Le texte « à plat » : minuscules, sans accents (œ → oe), espaces réduits. Le même calcul que textePlat (modele.ts).
create or replace function public.texte_plat(t text) returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))), '\s+', ' ', 'g')
$$;

-- Un numéro en chiffres seuls, au format national (+33 / 0033 → 0). Le même calcul que numeroCherche (modele.ts).
create or replace function public.chiffres_telephone(t text) returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select case when d ~ '^(33|0033)[1-9][0-9]{8}$' then '0' || right(d, 9) else d end
    from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) x
$$;

create or replace view public.agences_recherche with (security_invoker = true) as
select l.*,
       public.texte_plat(concat_ws(' ', l.nom, l.enseigne, l.email, l.adresse, l.secteur_libelle, l.contact_principal)) as recherche_plat,
       public.chiffres_telephone(l.telephone) as telephone_chiffres,
       public.chiffres_telephone(l.contact_ligne) as contact_ligne_chiffres
  from public.agences_liste l;
revoke all on public.agences_recherche from anon;
grant select on public.agences_recherche to authenticated;

-- ── B. Le secteur fait foi, sauf choix explicite du chargé d'affaires dans le même enregistrement ──
create or replace function public.agence_suit_son_secteur() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.secteur is not null and new.type <> 'apporteur'
     and (tg_op = 'INSERT' or new.secteur is distinct from old.secteur)
     -- « Attribuée à » changé dans le même enregistrement que le secteur (fiche agence) : ce choix l'emporte.
     and (tg_op = 'INSERT' or new.commercial_id is not distinct from old.commercial_id) then
    new.commercial_id := (select s.commercial_id from public.secteurs s where s.code = new.secteur);
  end if;
  return new;
end $$;

-- L'empreinte de la règle redéfinie, dans le contrôle de santé (sinon « règle modifiée »).
do $do$
declare
  v_def text;
  v_nom text;
  v_nouvelle text;
begin
  v_def := pg_get_functiondef('public.sante_demarchage()'::regprocedure);
  foreach v_nom in array array['agence_suit_son_secteur'] loop
    select md5(replace(p.prosrc, chr(13), '')) into v_nouvelle from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = v_nom;
    if v_def !~ ('\(''' || v_nom || ''', ''[0-9a-f]{32}''\)') then
      raise notice 'sante_demarchage : pas d''empreinte pour %, rien changé pour elle.', v_nom;
    end if;
    v_def := regexp_replace(v_def, '\(''' || v_nom || ''', ''[0-9a-f]{32}''\)', '(''' || v_nom || ''', ''' || v_nouvelle || ''')');
  end loop;
  execute v_def;
end $do$;

-- ── C. Un contact principal pour chaque agence qui a des contacts présents ──
update public.contacts c
   set principal = true, maj_le = now()
 where c.id in (
   select distinct on (k.agence_id) k.id
     from public.contacts k
    where not k.parti
      and not exists (select 1 from public.contacts p where p.agence_id = k.agence_id and p.principal and not p.parti)
    order by k.agence_id, k.cree_le, k.id);

-- ── D. Un appel entrant = une ligne ──
alter table public.activites add column if not exists doublon_de uuid references public.activites(id) on delete set null;
comment on column public.activites.doublon_de is 'Appel entrant écrit en double (même identifiant Ringover) : la première ligne. Gardé en base, hors du fil.';

update public.activites d
   set doublon_de = o.premier
  from (select id, first_value(id) over (partition by call_id order by cree_le, id) as premier
          from public.activites
         where type = 'appel' and sens = 'entrant' and call_id <> '') o
 where d.id = o.id and o.id <> o.premier and d.doublon_de is null;

create unique index if not exists activites_appel_entrant_unique on public.activites (call_id)
 where type = 'appel' and sens = 'entrant' and call_id <> '' and doublon_de is null;

commit;

-- ── Contrôle (chiffres attendus au 26/11/2026) ──
select 'Recherche « 0140211515 » (attendu : 1)' as quoi,
       (select count(*) from public.agences_recherche where telephone_chiffres like '%0140211515%' or contact_ligne_chiffres like '%0140211515%')::text as valeur
union all
select 'Recherche « societe » (attendu : 8 ; avant, 0 sans accent et 6 avec)',
       (select count(*) from public.agences_recherche where recherche_plat like '%societe%')::text
union all
select 'Fiches dont le standard est aussi celui d''une autre fiche (attendu : 3 ; avant, 0 détectable)',
       (select count(*) from public.agences_recherche r where length(r.telephone_chiffres) >= 9
           and exists (select 1 from public.agences_recherche x where x.id <> r.id and right(x.telephone_chiffres, 9) = right(r.telephone_chiffres, 9)))::text
union all
select 'Le choix « Attribuée à » l''emporte sur le secteur (attendu : oui)',
       case when exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'agence_suit_son_secteur' and prosrc like '%is not distinct from old.commercial_id%') then 'oui' else 'NON' end
union all
select 'Contrôle de santé à jour (attendu : oui)',
       case when exists (select 1 from public.sante_demarchage() s where s.code = 'regle_modifiee') then 'NON : règle signalée modifiée' else 'oui' end
union all
select 'Agences avec contacts présents sans principal (attendu : 0 ; 12 avant)',
       (select count(*) from (select agence_id from public.contacts where not parti group by agence_id having not bool_or(principal)) x)::text
union all
select 'Appels entrants marqués doublon (attendu : 17)',
       (select count(*) from public.activites where type = 'appel' and sens = 'entrant' and doublon_de is not null)::text
union all
select 'Appels entrants visibles dans les fils (attendu : 45 = 33 appels + 12 sans identifiant)',
       (select count(*) from public.activites where type = 'appel' and sens = 'entrant' and doublon_de is null)::text
union all
select 'Index unique des appels entrants (attendu : en place)',
       case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'activites_appel_entrant_unique') then 'en place' else 'ABSENT' end;
