-- ════════════════════════════════════════════════════════════════════════════
-- ⚠⚠ À COLLER DANS STC BÂTIMENT (projet yytpxonzlhdevddpkjzy), PAS DANS BATICOM ⚠⚠
--
-- LES VRAIS CHIFFRES DU COCKPIT, version 2 (Mahdi, 11/11/2026 : « propose-moi un algorithme », validé).
-- Baticom vient lire ici, en lecture seule, les chiffres BRUTS de chaque agence ; les règles (qui est active, ce que
-- rapporte une agence active) sont appliquées dans Baticom, où leurs seuils se règlent :
--   · OS reçus (non archivés) sur les 30 derniers jours et sur les 30 jours d'avant ;
--   · facturé HT net (acomptes déduits, avoirs déduits, brouillons exclus) sur les 30 derniers jours ;
--   · facturé HT net de chacun des 6 derniers mois complets ;
--   · le facturé des particuliers (factures sans gestionnaire), mois par mois.
-- Une agence = sa fiche agence, sinon la société du gestionnaire ; les agences de test sont écartées.
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
  mois as (select generate_series(date_trunc('month', now()) - interval '6 months', date_trunc('month', now()) - interval '1 month', interval '1 month') as m),
  cle_g as (
    select g.id, coalesce(g.agence_id::text, nullif(lower(trim(g.societe)), ''), g.id::text) as cle,
           coalesce(a.nom, nullif(trim(g.societe), ''), g.nom) as nom
      from public.gestionnaires g left join public.agences a on a.id = g.agence_id),
  os as (
    select k.cle, count(*) filter (where o.created_at >= now() - interval '30 days') as os_30,
           count(*) filter (where o.created_at >= now() - interval '60 days' and o.created_at < now() - interval '30 days') as os_30_60,
           max(o.created_at) as dernier_os_le
      from public.ordres_service o join cle_g k on k.id = o.gestionnaire_id
     where coalesce(o.archive, false) = false and o.created_at >= date_trunc('month', now()) - interval '6 months'
     group by k.cle),
  fact as (
    select k.cle, f.gestionnaire_id, f.date_emission, f.montant_ht_net
      from public.factures f left join cle_g k on k.id = f.gestionnaire_id
     where f.statut <> 'Brouillon' and f.date_emission >= date_trunc('month', now()) - interval '6 months'),
  agences as (
    select c.cle, (select max(k.nom) from cle_g k where k.cle = c.cle) as nom
      from (select cle from os union select cle from fact where cle is not null) c)
  select case when not exists (select 1 from ok) then null else jsonb_build_object(
    'version', 2, 'calcule_le', now(),
    'mois', (select jsonb_agg(to_char(m, 'YYYY-MM') order by m) from mois),
    'particuliers', (select jsonb_agg(round(coalesce((select sum(f.montant_ht_net) from fact f where f.gestionnaire_id is null and f.date_emission >= m and f.date_emission < m + interval '1 month'), 0), 2) order by m) from mois),
    'agences', (select coalesce(jsonb_agg(jsonb_build_object(
        'nom', a.nom,
        'os_30', coalesce(o.os_30, 0), 'os_30_60', coalesce(o.os_30_60, 0), 'dernier_os_le', o.dernier_os_le,
        'facture_30', round(coalesce((select sum(f.montant_ht_net) from fact f where f.cle = a.cle and f.date_emission >= now() - interval '30 days'), 0), 2),
        'mois', (select jsonb_agg(round(coalesce((select sum(f.montant_ht_net) from fact f where f.cle = a.cle and f.date_emission >= m and f.date_emission < m + interval '1 month'), 0), 2) order by m) from mois)
      ) order by coalesce(o.os_30, 0) desc, a.nom), '[]'::jsonb)
      from agences a left join os o on o.cle = a.cle
     where coalesce(a.nom, '') !~* '\mtest\M')) end
$$;

revoke all on function public.chiffres_pour_baticom(text) from public;
grant execute on function public.chiffres_pour_baticom(text) to anon, authenticated;

-- Contrôle : doit répondre NULL (mauvaise clé).
select public.chiffres_pour_baticom('mauvaise-cle') as doit_etre_vide;
