-- ════════════════════════════════════════════════════════════════════════════
-- LES CAMPAGNES D'AVIS (Mahdi, 10/11/2026). À coller AVANT de fusionner la PR. Se rejoue sans risque.
-- 1. Les contacts venant de STC Bâtiment (locataires, sous-traitants actuels).
-- 2. Les avis récoltés.
-- 3. Trois nouvelles bases dans les campagnes : locataires, gestionnaires clients, sous-traitants actuels.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.avis_contacts (
  id          uuid primary key default gen_random_uuid(),
  public      text not null check (public in ('locataires', 'sous_traitants_actifs')),
  nom         text not null default '',
  personne    text not null default '',
  email       text not null default '',
  mobile      text not null default '',
  source      text not null default '',
  desinscrit  boolean not null default false,
  cree_le     timestamptz not null default now()
);
alter table public.avis_contacts enable row level security;
drop policy if exists acces_connecte on public.avis_contacts;
create policy acces_connecte on public.avis_contacts for all to authenticated using (true) with check (true);

create table if not exists public.avis (
  id           uuid primary key default gen_random_uuid(),
  campagne_id  uuid references public.cmp_campagnes(id) on delete set null,
  contact_ref  text not null,
  public       text not null,
  note         integer not null check (note between 1 and 5),
  commentaire  text not null default '',
  nom_affiche  text not null default '',
  autorise     boolean not null default false,
  statut       text not null default 'a_valider' check (statut in ('a_valider', 'publie', 'refuse')),
  motif_refus  text not null default '',
  rappele_le   timestamptz,
  cree_le      timestamptz not null default now(),
  unique (campagne_id, contact_ref)
);
alter table public.avis enable row level security;
drop policy if exists acces_connecte on public.avis;
create policy acces_connecte on public.avis for all to authenticated using (true) with check (true);

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
    'enseigne', coalesce(nullif(a.enseigne, ''), 'Indépendante')) as champs,
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
    'statut', case st.statut when 'a_contacter' then 'À contacter' when 'en_sequence' then 'Déjà contacté' when 'termine' then 'Séquence finie' else st.statut end),
  case when st.statut = 'depose' then 'gagne'
       when st.statut in ('exclu', 'injoignable') or coalesce(st.suivi, '') = 'hors_cible' then 'exclu'
       when (st.bareme_vu_le is not null or st.candidature_clic_le is not null or coalesce(st.nb_clics, 0) > 0) and coalesce(st.suivi, '') = '' then 'lead'
       else 'libre' end,
  (st.statut = 'desinscrit' or exists (select 1 from public.st_exclusions x where lower(x.email) = lower(st.email) and coalesce(st.email, '') <> '')),
  null::uuid
from public.st_sous_traitants st
union all
-- Les gestionnaires déjà clients : ils peuvent donner leur avis.
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
-- Les sous-traitants actuels connus ici : contrats signés ou accès ouvert.
select st.id::text, 'sous_traitants_actifs', coalesce(st.entreprise, ''), coalesce(st.contact, ''),
  case when coalesce(st.email_invalide, false) then '' else coalesce(st.email, '') end,
  case when regexp_replace(coalesce(st.telephone, ''), '\D', '', 'g') ~ '^(33|0)[67]' and not coalesce(st.telephone_invalide, false) then st.telephone else '' end,
  case when coalesce(st.telephone_invalide, false) then '' else coalesce(st.telephone, '') end,
  '{}'::jsonb, 'libre', (st.statut = 'desinscrit'), null::uuid
from public.st_sous_traitants st
where st.contrat_statut = 'signe' or st.acces_ouvert_le is not null
union all
-- Les locataires et sous-traitants venus de STC Bâtiment.
select v.id::text, v.public, v.nom, v.personne, v.email,
  case when regexp_replace(v.mobile, '\D', '', 'g') ~ '^(33|0)[67]' then v.mobile else '' end,
  v.mobile, '{}'::jsonb, 'libre', v.desinscrit, null::uuid
from public.avis_contacts v;
grant select on public.cmp_contacts to authenticated;
