-- ════════════════════════════════════════════════════════════════════════════
-- ⚠⚠ À COLLER DANS STC BÂTIMENT (projet yytpxonzlhdevddpkjzy), PAS DANS BATICOM ⚠⚠
--
-- LES VRAIS CHIFFRES DU COCKPIT (Mahdi, 11/11/2026) : « que l'agence cliente compte seulement les actives sur le
-- logiciel, et que le chiffre d'affaires soit le vrai ». Baticom vient lire ici, en lecture seule :
--   · les agences ACTIVES = au moins un ordre de service (non archivé) reçu dans les 90 derniers jours ;
--     une agence = sa fiche agence, sinon la société du gestionnaire ; les agences de test sont écartées ;
--   · le chiffre d'affaires FACTURÉ HT (net des acomptes, avoirs déduits, brouillons exclus) des 3 derniers mois
--     complets, mois par mois, séparé agences / particuliers ; et celui de chaque agence active.
-- Même clé que les autres passerelles (passerelle_cles, nom = 'baticom'). Rien n'est écrit ici. Rejouable.
-- ════════════════════════════════════════════════════════════════════════════
do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ordres_service') then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans STC Bâtiment, pas dans Baticom.';
  end if;
end $$;

create or replace function public.chiffres_pour_baticom(p_cle text)
returns jsonb
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with ok as (select 1 from public.passerelle_cles k where k.nom = 'baticom' and k.cle = p_cle),
  bornes as (select date_trunc('month', now()) - interval '3 months' as de, date_trunc('month', now()) as a),
  cle_g as (
    select g.id, coalesce(g.agence_id::text, nullif(lower(trim(g.societe)), ''), g.id::text) as cle,
           coalesce(a.nom, nullif(trim(g.societe), ''), g.nom) as nom
      from public.gestionnaires g left join public.agences a on a.id = g.agence_id),
  actives as (
    select k.cle, max(k.nom) as nom, count(o.id) as os_90j, max(o.created_at) as dernier_os_le
      from public.ordres_service o join cle_g k on k.id = o.gestionnaire_id
     where coalesce(o.archive, false) = false and o.created_at >= now() - interval '90 days'
     group by k.cle
    having coalesce(max(k.nom), '') !~* '\mtest\M'),
  fact as (
    select f.gestionnaire_id, f.date_emission, f.montant_ht_net, k.cle
      from public.factures f cross join bornes b left join cle_g k on k.id = f.gestionnaire_id
     where f.statut <> 'Brouillon' and f.date_emission >= b.de and f.date_emission < b.a),
  par_mois as (
    select to_char(m, 'YYYY-MM') as mois,
           coalesce(sum(f.montant_ht_net) filter (where f.gestionnaire_id is not null), 0) as ca_agences,
           coalesce(sum(f.montant_ht_net) filter (where f.gestionnaire_id is null), 0) as ca_particuliers
      from bornes b cross join generate_series(b.de, b.a - interval '1 month', interval '1 month') m
      left join fact f on f.date_emission >= m and f.date_emission < m + interval '1 month'
     group by m)
  select case when not exists (select 1 from ok) then null else jsonb_build_object(
    'calcule_le', now(), 'fenetre_jours', 90,
    'agences_actives', (select count(*) from actives),
    'mois', (select coalesce(jsonb_agg(to_jsonb(p) order by p.mois), '[]'::jsonb) from par_mois p),
    'agences', (select coalesce(jsonb_agg(jsonb_build_object('nom', x.nom, 'os_90j', x.os_90j, 'dernier_os_le', x.dernier_os_le,
                   'ca_3_mois', (select coalesce(sum(f.montant_ht_net), 0) from fact f where f.cle = x.cle)) order by x.os_90j desc), '[]'::jsonb)
                from actives x)) end
$$;

revoke all on function public.chiffres_pour_baticom(text) from public;
grant execute on function public.chiffres_pour_baticom(text) to anon, authenticated;

-- Contrôle : doit répondre NULL (mauvaise clé).
select public.chiffres_pour_baticom('mauvaise-cle') as doit_etre_vide;
