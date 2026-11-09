-- ════════════════════════════════════════════════════════════════════════════
-- LE MOTEUR DE CAMPAGNES, ÉTAPE 1 (Mahdi, 09/11/2026) : à coller AVANT de fusionner la PR.
-- 1. Le réglage complet d'une campagne (colonne config).
-- 2. Le code postal des agences dans la vue des contacts (le ciblage sur la carte).
-- 3. La campagne « Gestionnaires · traçabilité des intérêts » apparaît dans Campagnes.
--    Elle est en statut « pause » en base : le moteur ne la touche JAMAIS, rien ne part.
--    Elle ne fait que montrer les critères qui tournent aujourd'hui.
-- Aucune campagne existante n'est modifiée. Se rejoue sans risque.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.cmp_campagnes add column if not exists config jsonb;

-- La vue : seul ajout, 'cp' dans les champs des agences (le reste est identique).
create or replace view public.cmp_contacts with (security_invoker = true) as
select a.id::text as id, 'agences'::text as base_id, a.nom,
  coalesce(nullif(trim(coalesce(pc.prenom, '') || ' ' || coalesce(pc.nom, '')), ''), '') as personne,
  coalesce(nullif(pc.email, ''), nullif(a.email, ''), '') as email,
  coalesce(case when regexp_replace(coalesce(pc.mobile, ''), '\D', '', 'g') ~ '^(33|0)[67]' then pc.mobile end, '') as mobile,
  coalesce(nullif(pc.ligne_directe, ''), nullif(pc.mobile, ''), nullif(a.telephone, ''), '') as telephone,
  jsonb_build_object(
    'secteur', coalesce(s.libelle, a.secteur, ''),
    'cp', coalesce(a.secteur, ''),
    'etape', case a.etape when 'a_prospecter' then 'À prospecter' when 'gestionnaire_joint' then 'Gestionnaire joint' when 'interesse' then 'Intéressé'
      when 'rdv_planifie' then 'RDV planifié' when 'pas_interesse' then 'Pas intéressé' when 'endormie' then 'Endormie' when 'client' then 'Client'
      when 'hors_cible' then 'Hors cible' else a.etape end,
    'enseigne', coalesce(nullif(a.enseigne, ''), 'Indépendante')) as champs,
  case when a.etape = 'client' or a.premier_os_le is not null then 'gagne'
       when a.etape in ('hors_cible', 'apporteur') then 'exclu'
       when exists (select 1 from public.leads_demarchage l where l.agence_id = a.id and l.statut = 'a_traiter') then 'lead'
       else 'libre' end as statut,
  (a.ne_plus_ecrire_le is not null) as desinscrit,
  a.commercial_id as proprietaire_id
from public.agences a
left join public.secteurs s on s.code = a.secteur
left join lateral (
  select c.prenom, c.nom, c.email, c.mobile, c.ligne_directe from public.contacts c
  where c.agence_id = a.id and not c.parti order by c.principal desc, (coalesce(c.email, '') <> '') desc, c.cree_le limit 1
) pc on true
union all
select st.id::text, 'artisans', coalesce(st.entreprise, ''), coalesce(st.contact, ''),
  case when coalesce(st.email_invalide, false) then '' else coalesce(st.email, '') end,
  case when regexp_replace(coalesce(st.telephone, ''), '\D', '', 'g') ~ '^(33|0)[67]' and not coalesce(st.telephone_invalide, false) then st.telephone else '' end,
  case when coalesce(st.telephone_invalide, false) then '' else coalesce(st.telephone, '') end,
  jsonb_build_object('metier', coalesce(st.metier, ''), 'zone', coalesce(st.zone, ''),
    'statut', case st.statut when 'a_contacter' then 'À contacter' when 'en_sequence' then 'Déjà contacté' when 'termine' then 'Séquence finie' else st.statut end),
  case when st.statut = 'depose' then 'gagne'
       when st.statut in ('exclu', 'injoignable') then 'exclu'
       when (st.bareme_vu_le is not null or st.candidature_clic_le is not null or coalesce(st.nb_clics, 0) > 0) and coalesce(st.suivi, '') = '' then 'lead'
       else 'libre' end,
  (st.statut = 'desinscrit' or exists (select 1 from public.st_exclusions x where lower(x.email) = lower(st.email) and coalesce(st.email, '') <> '')),
  null::uuid
from public.st_sous_traitants st;
grant select on public.cmp_contacts to authenticated;

insert into public.cmp_campagnes (nom, base_id, objectif, statut, etapes, signaux, mode_test, origine)
select 'Gestionnaires · traçabilité des intérêts', 'agences', 'Détecter les agences intéressées', 'pause', '[]'::jsonb, '{}', false, 'tracabilite'
where not exists (select 1 from public.cmp_campagnes where origine = 'tracabilite');
