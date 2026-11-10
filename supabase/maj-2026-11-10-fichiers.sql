-- ════════════════════════════════════════════════════════════════════════════
-- LES FICHIERS (Mahdi, 10/11/2026). À coller AVANT de fusionner la PR. Se rejoue sans risque.
-- 1. Chaque import devient un fichier, ciblable dans une campagne et dans une session de call.
-- 2. Une étape Appel peut viser le standard plutôt que le contact.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.cmp_fichiers (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null,
  base_id    text not null check (base_id in ('agences', 'apporteurs', 'artisans')),
  source     text not null default '',
  zone       text not null default '',
  lignes     integer not null default 0,
  importes   integer not null default 0,
  deja       integer not null default 0,
  ignores    integer not null default 0,
  en_session boolean not null default false,
  attribue_a uuid[] not null default '{}',
  archive_le timestamptz,
  cree_par   text not null default '',
  cree_le    timestamptz not null default now()
);
alter table public.cmp_fichiers enable row level security;
drop policy if exists acces_connecte on public.cmp_fichiers;
create policy acces_connecte on public.cmp_fichiers for all to authenticated using (true) with check (true);

alter table public.agences add column if not exists fichier_id uuid references public.cmp_fichiers(id) on delete set null;
alter table public.st_sous_traitants add column if not exists fichier_id uuid references public.cmp_fichiers(id) on delete set null;
create index if not exists agences_fichier on public.agences (fichier_id) where fichier_id is not null;
create index if not exists st_sous_traitants_fichier on public.st_sous_traitants (fichier_id) where fichier_id is not null;
alter table public.cmp_taches add column if not exists cible text not null default 'contact';

create or replace view public.cmp_contacts with (security_invoker = true) as
select a.id::text as id,
  case when a.type = 'apporteur' or a.etape = 'apporteur' then 'apporteurs' else 'agences' end::text as base_id,
  a.nom,
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
    'enseigne', coalesce(nullif(a.enseigne, ''), 'Indépendante'),
    'fichier', coalesce(a.fichier_id::text, ''),
    'standard', coalesce(a.telephone, '')) as champs,
  case when a.etape = 'client' or a.premier_os_le is not null then 'gagne'
       when a.etape = 'hors_cible' then 'exclu'
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
    'statut', case st.statut when 'a_contacter' then 'À contacter' when 'en_sequence' then 'Déjà contacté' when 'termine' then 'Séquence finie' else st.statut end,
    'fichier', coalesce(st.fichier_id::text, '')),
  case when st.statut = 'depose' then 'gagne'
       when st.statut in ('exclu', 'injoignable') or coalesce(st.suivi, '') = 'hors_cible' then 'exclu'
       when (st.bareme_vu_le is not null or st.candidature_clic_le is not null or coalesce(st.nb_clics, 0) > 0) and coalesce(st.suivi, '') = '' then 'lead'
       else 'libre' end,
  (st.statut = 'desinscrit' or exists (select 1 from public.st_exclusions x where lower(x.email) = lower(st.email) and coalesce(st.email, '') <> '')),
  null::uuid
from public.st_sous_traitants st
union all
select a.id::text, 'clients_gestionnaires', a.nom,
  coalesce(nullif(trim(coalesce(pc.prenom, '') || ' ' || coalesce(pc.nom, '')), ''), ''),
  coalesce(nullif(pc.email, ''), nullif(a.email, ''), ''),
  coalesce(case when regexp_replace(coalesce(pc.mobile, ''), '\D', '', 'g') ~ '^(33|0)[67]' then pc.mobile end, ''),
  coalesce(nullif(pc.ligne_directe, ''), nullif(pc.mobile, ''), nullif(a.telephone, ''), ''),
  '{}'::jsonb, 'libre', (a.ne_plus_ecrire_le is not null), a.commercial_id
from public.agences a
left join lateral (
  select c.prenom, c.nom, c.email, c.mobile, c.ligne_directe from public.contacts c
  where c.agence_id = a.id and not c.parti order by c.principal desc, (coalesce(c.email, '') <> '') desc, c.cree_le limit 1
) pc on true
where (a.etape = 'client' or a.premier_os_le is not null) and a.type <> 'apporteur'
union all
select st.id::text, 'sous_traitants_actifs', coalesce(st.entreprise, ''), coalesce(st.contact, ''),
  case when coalesce(st.email_invalide, false) then '' else coalesce(st.email, '') end,
  case when regexp_replace(coalesce(st.telephone, ''), '\D', '', 'g') ~ '^(33|0)[67]' and not coalesce(st.telephone_invalide, false) then st.telephone else '' end,
  case when coalesce(st.telephone_invalide, false) then '' else coalesce(st.telephone, '') end,
  '{}'::jsonb, 'libre', (st.statut = 'desinscrit'), null::uuid
from public.st_sous_traitants st
where st.contrat_statut = 'signe' or st.acces_ouvert_le is not null
union all
select v.id::text, v.public, v.nom, v.personne, v.email,
  case when regexp_replace(v.mobile, '\D', '', 'g') ~ '^(33|0)[67]' then v.mobile else '' end,
  v.mobile, '{}'::jsonb, 'libre', v.desinscrit, null::uuid
from public.avis_contacts v;
grant select on public.cmp_contacts to authenticated;

-- Ce que chaque fichier contient et rapporte.
create or replace view public.cmp_fichiers_stats with (security_invoker = true) as
with membres as (
  select a.fichier_id, a.id::text as ref, coalesce(a.joint_fois, 0) as joints, coalesce(a.tentatives, 0) as appels from public.agences a where a.fichier_id is not null
  union all
  select s.fichier_id, s.id::text, coalesce(s.nb_joints, 0), coalesce(s.nb_appels, 0) from public.st_sous_traitants s where s.fichier_id is not null
)
select f.*,
  coalesce(m.contacts, 0) as contacts, coalesce(m.mails, 0) as mails, coalesce(m.mobiles, 0) as mobiles,
  coalesce(m.leads, 0) as leads, coalesce(m.gagnes, 0) as gagnes, coalesce(m.appels, 0) as appels, coalesce(m.joints, 0) as joints,
  coalesce((select count(distinct e.contact_ref) from public.cmp_envois e join membres x on x.ref = e.contact_ref where x.fichier_id = f.id and e.statut = 'envoye' and not e.test), 0)::int as touches,
  coalesce((select count(distinct e.contact_ref) from public.cmp_evenements e join membres x on x.ref = e.contact_ref where x.fichier_id = f.id and e.type = 'reponse'), 0)::int as reponses,
  coalesce((select array_agg(distinct c.nom) from public.cmp_inscriptions i join membres x on x.ref = i.contact_ref join public.cmp_campagnes c on c.id = i.campagne_id where x.fichier_id = f.id), '{}') as campagnes,
  coalesce((select count(*) from public.cmp_inscriptions i join membres x on x.ref = i.contact_ref where x.fichier_id = f.id and i.statut = 'en_cours'), 0)::int as en_cours
from public.cmp_fichiers f
left join lateral (
  select count(*)::int as contacts,
    count(*) filter (where k.email <> '')::int as mails,
    count(*) filter (where k.mobile <> '')::int as mobiles,
    count(*) filter (where k.statut = 'lead')::int as leads,
    count(*) filter (where k.statut = 'gagne')::int as gagnes,
    sum(x.appels)::int as appels, sum(x.joints)::int as joints
  from membres x join public.cmp_contacts k on k.id = x.ref and k.base_id in ('agences', 'apporteurs', 'artisans')
  where x.fichier_id = f.id
) m on true;
grant select on public.cmp_fichiers_stats to authenticated;
