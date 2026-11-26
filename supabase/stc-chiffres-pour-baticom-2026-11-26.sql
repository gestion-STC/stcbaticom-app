-- ════════════════════════════════════════════════════════════════════════════
-- ⚠⚠ À COLLER DANS STC BÂTIMENT (projet yytpxonzlhdevddpkjzy), PAS DANS BATICOM ⚠⚠
--
-- LA PASSERELLE DES CHIFFRES, version 2 ÉTENDUE (26/11/2026) pour les tableaux de bord « Cockpit » de Baticom.
-- Tout ce qui existait reste identique (version 2, mois, particuliers, agences.os_30/os_30_60/dernier_os_le/
-- facture_30/mois) : Baticom ne casse pas tant que ce SQL n'est pas collé, et l'ancien Baticom lit encore ceci.
-- AJOUTS seulement (heure de Paris pour tous les nouveaux champs) :
--   · ca_annee        : facturé HT net de chaque mois de l'année, mois en cours compris (partiel) ;
--   · ca_jours        : facturé HT net jour par jour, depuis le 1er janvier (ou le 1er du mois d'avant en janvier),
--                       pour comparer le mois en cours au mois d'avant À JOURS ÉGAUX ;
--   · historique_depuis : le 1er jour couvert par agences[].os et agences[].factures (le 1er du mois, 8 mois avant) ;
--   · agences[].os    : l'heure de chaque OS de l'agence depuis historique_depuis (statut à chaque fin de mois,
--                       rythme, OS par mois) ;
--   · agences[].factures : le facturé HT net de l'agence jour par jour depuis historique_depuis ;
--   · os_recents      : l'heure de chaque OS reçu (toutes agences, avec ou sans gestionnaire) sur 100 jours :
--                       OS par semaine, OS du jour, semaine comparée à la précédente à la même heure ;
--   · sous_traitants  : chaque compte sous-traitant de STC (sauf le compte d'essai « Adan », and@gmail.com) : nom,
--                       e-mail (lien avec le recrutement de Baticom), compte ouvert ou fermé, métier, secteurs, création,
--                       chacune de ses missions [jour d'envoi, montant convenu] (demandes hors brouillon / retirée /
--                       refusée), ce qui lui a été versé sur 30 jours et sur les 30 jours d'avant.
-- CA = montant_ht_net, factures hors « Brouillon » ; les agences de test sont écartées. Rien n'est écrit ici. Rejouable.
-- ════════════════════════════════════════════════════════════════════════════
do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ordres_service') then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans STC Bâtiment, pas dans Baticom.';
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.chiffres_pour_baticom(p_cle text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
  with ok as (select 1 from public.passerelle_cles k where k.nom = 'baticom' and k.cle = p_cle),
  mois as (select generate_series(date_trunc('month', now()) - interval '6 months', date_trunc('month', now()) - interval '1 month', interval '1 month') as m),
  annee as (select generate_series(date_trunc('year', now() at time zone 'Europe/Paris'), date_trunc('month', now() at time zone 'Europe/Paris'), interval '1 month') as m),
  bornes as (select (date_trunc('month', now() at time zone 'Europe/Paris') - interval '8 months')::date as hist,
                    least(date_trunc('year', now() at time zone 'Europe/Paris'), date_trunc('month', now() at time zone 'Europe/Paris') - interval '1 month')::date as jours),
  cle_g as (
    select g.id, coalesce(g.agence_id::text, nullif(lower(trim(g.societe)), ''), g.id::text) as cle,
           coalesce(a.nom, nullif(trim(g.societe), ''), g.nom) as nom
      from public.gestionnaires g left join public.agences a on a.id = g.agence_id),
  test_g as (select k.id from cle_g k where coalesce(k.nom, '') ~* '\mtest\M'),
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
  os_hist as (
    select k.cle, o.created_at
      from public.ordres_service o join cle_g k on k.id = o.gestionnaire_id
     where coalesce(o.archive, false) = false and o.created_at >= ((select hist from bornes)::timestamp at time zone 'Europe/Paris')),
  fact_hist as (
    select k.cle, f.date_emission as jour, sum(f.montant_ht_net) as ht
      from public.factures f join cle_g k on k.id = f.gestionnaire_id
     where f.statut <> 'Brouillon' and f.date_emission >= (select hist from bornes)
     group by k.cle, f.date_emission),
  agences as (
    select c.cle, (select max(k.nom) from cle_g k where k.cle = c.cle) as nom
      from (select cle from os union select cle from fact where cle is not null
            union select cle from os_hist union select cle from fact_hist) c),
  missions as (
    select d.sous_traitant_id as st, (coalesce(d.date_envoi, d.created_at) at time zone 'Europe/Paris')::date as jour,
           coalesce(d.montant, d.montant_propose, 0) as montant
      from public.demandes d
     where d.sous_traitant_id is not null and coalesce(d.statut, '') not in ('Brouillon', 'Retirée', 'Refusée', 'Refusé')),
  verse as (
    select l.sous_traitant_id as st,
           sum(v.montant) filter (where v.date_versement > (now() at time zone 'Europe/Paris')::date - 30) as paye_30,
           sum(v.montant) filter (where v.date_versement <= (now() at time zone 'Europe/Paris')::date - 30
                                    and v.date_versement > (now() at time zone 'Europe/Paris')::date - 60) as paye_30_60
      from public.st_versements v join public.st_paiement_lignes l on l.id = v.ligne_id
     group by l.sous_traitant_id)
  select case when not exists (select 1 from ok) then null else jsonb_build_object(
    'version', 2, 'calcule_le', now(),
    'mois', (select jsonb_agg(to_char(m, 'YYYY-MM') order by m) from mois),
    'particuliers', (select jsonb_agg(round(coalesce((select sum(f.montant_ht_net) from fact f where f.gestionnaire_id is null and f.date_emission >= m and f.date_emission < m + interval '1 month'), 0), 2) order by m) from mois),
    'ca_annee', (select jsonb_agg(jsonb_build_object('mois', to_char(a.m, 'YYYY-MM'),
        'ht', round(coalesce((select sum(f.montant_ht_net) from public.factures f
                               where f.statut <> 'Brouillon'
                                 and (f.gestionnaire_id is null or f.gestionnaire_id not in (select id from test_g))
                                 and f.date_emission >= a.m::date and f.date_emission < (a.m + interval '1 month')::date), 0), 2)) order by a.m) from annee a),
    'ca_jours', (select coalesce(jsonb_agg(jsonb_build_array(x.jour, x.ht) order by x.jour), '[]'::jsonb) from (
        select to_char(f.date_emission, 'YYYY-MM-DD') as jour, round(sum(f.montant_ht_net), 2) as ht
          from public.factures f
         where f.statut <> 'Brouillon' and (f.gestionnaire_id is null or f.gestionnaire_id not in (select id from test_g))
           and f.date_emission >= (select jours from bornes)
         group by f.date_emission) x),
    'historique_depuis', (select to_char(hist, 'YYYY-MM-DD') from bornes),
    'os_recents', (select coalesce(jsonb_agg(to_char(o.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') order by o.created_at), '[]'::jsonb)
        from public.ordres_service o
       where coalesce(o.archive, false) = false and o.created_at >= now() - interval '100 days'
         and (o.gestionnaire_id is null or o.gestionnaire_id not in (select id from test_g))),
    'agences', (select coalesce(jsonb_agg(jsonb_build_object(
        'nom', a.nom,
        'os_30', coalesce(o.os_30, 0), 'os_30_60', coalesce(o.os_30_60, 0), 'dernier_os_le', o.dernier_os_le,
        'facture_30', round(coalesce((select sum(f.montant_ht_net) from fact f where f.cle = a.cle and f.date_emission >= now() - interval '30 days'), 0), 2),
        'mois', (select jsonb_agg(round(coalesce((select sum(f.montant_ht_net) from fact f where f.cle = a.cle and f.date_emission >= m and f.date_emission < m + interval '1 month'), 0), 2) order by m) from mois),
        'os', (select coalesce(jsonb_agg(to_char(h.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') order by h.created_at), '[]'::jsonb) from os_hist h where h.cle = a.cle),
        'factures', (select coalesce(jsonb_agg(jsonb_build_array(to_char(h.jour, 'YYYY-MM-DD'), round(h.ht, 2)) order by h.jour), '[]'::jsonb) from fact_hist h where h.cle = a.cle)
      ) order by coalesce(o.os_30, 0) desc, a.nom), '[]'::jsonb)
      from agences a left join os o on o.cle = a.cle
     where coalesce(a.nom, '') !~* '\mtest\M'),
    'sous_traitants', (select coalesce(jsonb_agg(jsonb_build_object(
        'nom', trim(s.nom), 'email', lower(trim(coalesce(s.email, ''))), 'compte_actif', coalesce(s.actif, false),
        'metier', coalesce(nullif(trim(s.specialite), ''), (select c.nom from public.corps_metier c where c.id = s.corps_metier_id)),
        'secteurs', (select coalesce(jsonb_agg(x.nom order by x.nom), '[]'::jsonb) from public.sous_traitant_secteurs ss join public.secteurs x on x.id = ss.secteur_id where ss.sous_traitant_id = s.id),
        'cree_le', to_char(s.created_at at time zone 'Europe/Paris', 'YYYY-MM-DD'),
        'missions', (select coalesce(jsonb_agg(jsonb_build_array(to_char(m.jour, 'YYYY-MM-DD'), round(m.montant, 2)) order by m.jour), '[]'::jsonb) from missions m where m.st = s.id),
        'paye_30', round(coalesce(v.paye_30, 0), 2), 'paye_30_60', round(coalesce(v.paye_30_60, 0), 2)
      ) order by trim(s.nom)), '[]'::jsonb)
      from public.sous_traitants s left join verse v on v.st = s.id
     where coalesce(s.nom, '') !~* '\mtest\M' and lower(trim(coalesce(s.email, ''))) <> 'and@gmail.com')
  ) end
$function$;

revoke all on function public.chiffres_pour_baticom(text) from public;
grant execute on function public.chiffres_pour_baticom(text) to anon, authenticated;

-- ── Contrôles (lecture seule) ──
-- 1. Doit répondre NULL (mauvaise clé).
select public.chiffres_pour_baticom('mauvaise-cle') as doit_etre_vide;
-- 2. Les nouveaux champs, avec la vraie clé : ca_annee de janvier au mois en cours, ca_jours, os_recents sur 100 jours,
--    les agences avec leurs os / factures, les sous-traitants avec leurs missions.
select jsonb_array_length(x -> 'ca_annee') as mois_ca_annee, jsonb_array_length(x -> 'ca_jours') as jours_ca,
       jsonb_array_length(x -> 'os_recents') as os_100_jours, jsonb_array_length(x -> 'agences') as agences,
       jsonb_array_length(x -> 'sous_traitants') as sous_traitants, x ->> 'historique_depuis' as historique_depuis
  from (select public.chiffres_pour_baticom((select cle from public.passerelle_cles where nom = 'baticom' limit 1)) as x) t;
