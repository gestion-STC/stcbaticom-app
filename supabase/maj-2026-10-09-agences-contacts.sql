-- ============================================================================
--  DÉMARCHAGE : la fiche, c'est l'AGENCE (09/10/2026)
--
--  Validé par Mahdi le 09/10 : un standard = une agence ; une personne = un
--  contact rattaché à l'agence ; un appel / e-mail / RDV / tâche / note = une
--  activité dans un seul fil. Cinq étapes + trois sorties, posées par les
--  résultats d'appel (quatre boutons), plus jamais à la main pendant l'appel.
--
--  Ce script est ADDITIF : il ne touche pas à `prospects`, `appels`, `rdv`,
--  `emails_envoyes`, `statuts` (qui restent en archive, lecture seule), et il
--  est ré-exécutable : la conversion des données ne tourne qu'une fois
--  (verrou `parametres.conversion_agences`).
--
--  Plan : 1) secteurs · 2) agences (table existante, étendue) · 3) contacts ·
--  4) activites · 5) messages rattachés · 6) sécurité · 7) journal d'étapes ·
--  8) la fonction appel_enregistrer (les règles, à UN seul endroit) ·
--  9) la vue agences_liste · 10) conversion des 2 789 fiches.
-- ============================================================================

-- 1) Les secteurs : une liste fermée, clé = code postal --------------------------
create table if not exists public.secteurs (
  code     text primary key,
  libelle  text not null,
  zone     text not null,            -- Paris | 78 | 92 | 93 | 94 | 95
  ordre    integer not null default 0
);
insert into public.secteurs (code, libelle, zone, ordre)
select '750' || lpad(i::text, 2, '0'), 'Paris ' || i, 'Paris', i from generate_series(1, 20) i
on conflict (code) do nothing;
insert into public.secteurs (code, libelle, zone, ordre) values
  ('92100','Boulogne-Billancourt','92',100),('92200','Neuilly-sur-Seine','92',101),('92000','Nanterre','92',102),('92300','Levallois-Perret','92',103),
  ('92800','Puteaux','92',104),('92270','Bois-Colombes','92',105),('92700','Colombes','92',106),('92150','Suresnes','92',107),('92400','Courbevoie','92',108),
  ('92500','Rueil-Malmaison','92',109),('92600','Asnières-sur-Seine','92',110),('92250','La Garenne-Colombes','92',111),('92310','Sèvres','92',112),
  ('93100','Montreuil','93',130),('93200','Saint-Denis','93',131),('93400','Saint-Ouen-sur-Seine','93',132),
  ('95100','Argenteuil','95',150),('95300','Pontoise','95',151),('95000','Cergy','95',152),('95120','Ermont','95',153),('95130','Franconville','95',154),
  ('95290','L''Isle-Adam','95',155),('95220','Herblay-sur-Seine','95',156),('95240','Cormeilles-en-Parisis','95',157),('95500','Gonesse','95',158),
  ('95160','Montmorency','95',159),('95600','Eaubonne','95',160),('95170','Deuil-la-Barre','95',161),('95870','Bezons','95',162),('95880','Enghien-les-Bains','95',163),
  ('95110','Sannois','95',164),('95150','Taverny','95',165),('95200','Sarcelles','95',166),('95260','Beaumont-sur-Oise','95',167),('95270','Asnières-sur-Oise','95',168),
  ('95310','Saint-Ouen-l''Aumône','95',169),('95190','Goussainville','95',170),('95210','Saint-Gratien','95',171),('95250','Beauchamp','95',172),('95400','Villiers-le-Bel','95',173),
  ('95280','Jouy-le-Moutier','95',174),('95330','Domont','95',175),('95350','Saint-Brice-sous-Forêt','95',176),('95430','Auvers-sur-Oise','95',177),('95440','Écouen','95',178),
  ('95470','Fosses','95',179),('95480','Pierrelaye','95',180),('95520','Osny','95',181),('95540','Méry-sur-Oise','95',182),('95550','Bessancourt','95',183),('95610','Éragny','95',184),
  ('95140','Garges-lès-Gonesse','95',185),('95340','Persan','95',186),('95380','Louvres','95',187),('95460','Ézanville','95',188),('95490','Vauréal','95',189),('95620','Parmain','95',190),('95690','Nesles-la-Vallée','95',191),
  ('78300','Poissy','78',200),('78500','Sartrouville','78',201),('78700','Conflans-Sainte-Honorine','78',202),('78800','Houilles','78',203),('78600','Maisons-Laffitte','78',204),
  ('78260','Achères','78',205),('78100','Saint-Germain-en-Laye','78',206),('78240','Chambourcy','78',207),('78420','Carrières-sur-Seine','78',208),('78160','Marly-le-Roi','78',209),
  ('78360','Montesson','78',210),('78570','Andrésy','78',211),('78630','Orgeval','78',212)
on conflict (code) do nothing;

-- 2) L'agence : la table existante (106 lignes), étendue ---------------------------
alter table public.agences
  add column if not exists enseigne             text not null default '',
  add column if not exists type                 text not null default 'agence',
  add column if not exists secteur              text references public.secteurs(code),
  add column if not exists telephone            text not null default '',
  add column if not exists email                text not null default '',
  add column if not exists site                 text not null default '',
  add column if not exists etape                text not null default 'a_prospecter',
  add column if not exists etape_depuis         timestamptz not null default now(),
  add column if not exists commercial_id        uuid,
  add column if not exists tentatives           integer not null default 0,   -- appels sans gestionnaire depuis le dernier « joint »
  add column if not exists joint_fois           integer not null default 0,
  add column if not exists reveil_le            date,                         -- endormie : date de réveil
  add column if not exists motif                text not null default '',     -- pas_interesse : deja_prestataire | pas_de_besoin | hors_zone | autre
  add column if not exists premier_os_le        date,
  add column if not exists source               text not null default '',
  add column if not exists numero_emission      text not null default '',
  add column if not exists prospect_id          uuid,                         -- la fiche d'origine (archive)
  add column if not exists nom_cle              text,                         -- nom normalisé, pour les doublons
  add column if not exists derniere_activite_le timestamptz,
  add column if not exists maj_le               timestamptz not null default now();
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agences_etape_connue') then
    alter table public.agences add constraint agences_etape_connue
      check (etape in ('a_prospecter','gestionnaire_joint','interesse','rdv_planifie','client','pas_interesse','endormie','hors_cible'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agences_type_connu') then
    alter table public.agences add constraint agences_type_connu
      check (type in ('agence','syndic','administrateur','bailleur','apporteur','autre'));
  end if;
end $$;
create index if not exists agences_etape_idx on public.agences(etape);
create index if not exists agences_secteur_idx on public.agences(secteur);
create index if not exists agences_nom_cle_idx on public.agences(nom_cle, coalesce(secteur, ''));
create index if not exists agences_tel_idx on public.agences(regexp_replace(telephone, '\D', '', 'g'));

-- 3) Les contacts : les personnes, rattachées à leur agence ----------------------
create table if not exists public.contacts (
  id             uuid primary key default gen_random_uuid(),
  agence_id      uuid not null references public.agences(id) on delete cascade,
  prenom         text not null default '',
  nom            text not null default '',
  role           text not null default 'gestionnaire',  -- gestionnaire | responsable | directeur | assistant | syndic | apporteur | autre
  ligne_directe  text not null default '',
  mobile         text not null default '',
  email          text not null default '',
  principal      boolean not null default false,
  parti          boolean not null default false,
  note           text not null default '',
  prospect_id    uuid,
  cree_le        timestamptz not null default now(),
  maj_le         timestamptz not null default now()
);
create index if not exists contacts_agence_idx on public.contacts(agence_id);
create index if not exists contacts_email_idx on public.contacts(lower(email)) where email <> '';

-- 4) Les activités : le fil ---------------------------------------------------------
create table if not exists public.activites (
  id             uuid primary key default gen_random_uuid(),
  agence_id      uuid not null references public.agences(id) on delete cascade,
  contact_id     uuid references public.contacts(id) on delete set null,
  type           text not null check (type in ('appel','email','rdv','tache','note','etape')),
  date           timestamptz not null default now(),   -- quand ça s'est passé (ou la création, pour une tâche / un RDV)
  echeance       timestamptz,                           -- tâche / RDV : quand c'est prévu
  fait_le        timestamptz,                           -- tâche / RDV : quand c'est fait
  compte_id      uuid,
  compte_nom     text not null default '',
  titre          text not null default '',              -- tâche / RDV : libellé ; e-mail : objet ; étape : « A → B »
  note           text not null default '',
  resultat       text not null default '',              -- appel : pas_de_reponse | standard | joint | faux_numero
  issue          text not null default '',              -- appel joint : interesse | rdv | a_rappeler | pas_interesse
  motif          text not null default '',
  numero_utilise text not null default '',
  duree_s        integer,
  call_id        text not null default '',
  sens           text not null default 'sortant',       -- appel : sortant | entrant
  rdv_type       text not null default '',              -- telephone | visio | sur_place
  message_id     uuid,                                  -- e-mail : la ligne de `messages`
  etape_de       text not null default '',
  etape_vers     text not null default '',
  source         text not null default '',              -- session | fiche | conversion | import | moteur
  cree_le        timestamptz not null default now()
);
create index if not exists activites_agence_date_idx on public.activites(agence_id, date desc);
create index if not exists activites_taches_idx on public.activites(echeance) where type in ('tache','rdv') and fait_le is null;
create index if not exists activites_compte_idx on public.activites(compte_id, date desc);
create index if not exists activites_type_date_idx on public.activites(type, date desc);

-- 5) La boîte de réception connaît l'agence ----------------------------------------
alter table public.messages
  add column if not exists agence_id   uuid references public.agences(id) on delete set null,
  add column if not exists contact_id  uuid references public.contacts(id) on delete set null;
create index if not exists messages_agence_idx on public.messages(agence_id, created_at desc);

-- 6) Sécurité : connecté = accès, comme le reste ------------------------------------
do $$
declare t text;
begin
  foreach t in array array['secteurs', 'agences', 'contacts', 'activites'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "acces_connecte" on public.%I', t);
    execute format('create policy "acces_connecte" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- 7) Le journal d'étapes : chaque changement est tracé, d'où qu'il vienne ----------
create or replace function public.agences_etape_journal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_compte uuid := auth.uid();
  v_nom text := coalesce(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'nom', '');
begin
  if tg_op = 'UPDATE' and new.etape is distinct from old.etape then
    new.etape_depuis := now();
    if new.etape <> 'endormie' then new.reveil_le := null; end if;
    if new.etape <> 'pas_interesse' then new.motif := ''; end if;
    insert into public.activites (agence_id, type, date, compte_id, compte_nom, titre, etape_de, etape_vers, source)
    values (new.id, 'etape', now(), v_compte, v_nom, old.etape || ' → ' || new.etape, old.etape, new.etape,
            coalesce(nullif(current_setting('app.source', true), ''), 'fiche'));
  end if;
  new.maj_le := now();
  return new;
end $$;
drop trigger if exists agences_etape_journal on public.agences;
create trigger agences_etape_journal before update on public.agences
  for each row execute function public.agences_etape_journal();

-- 8) Après l'appel : LA fonction qui applique les règles -----------------------------
--  resultat : pas_de_reponse | standard | joint | faux_numero
--  issue (si joint) : interesse | rdv | a_rappeler | pas_interesse
--  Elle écrit l'appel, met à jour l'agence (tentatives, étape, sommeil), crée la
--  tâche ou le RDV qui en découle, et renvoie l'état de l'agence.
create or replace function public.appel_enregistrer(
  p_agence_id uuid, p_contact_id uuid, p_resultat text, p_issue text default '', p_motif text default '',
  p_note text default '', p_numero text default '', p_duree_s integer default null, p_call_id text default '',
  p_rappel_le timestamptz default null, p_rdv_le timestamptz default null, p_rdv_type text default 'telephone',
  p_compte_nom text default '', p_source text default 'session'
) returns jsonb
language plpgsql security invoker as $$
declare
  a public.agences%rowtype;
  v_compte uuid := auth.uid();
  v_appel uuid;
  v_etape text;
  v_tache uuid;
  v_contact text := '';
  v_sommeil_apres constant integer := 6;
  v_sommeil_jours constant integer := 60;
  v_relance_jours constant integer := 7;
begin
  select * into a from public.agences where id = p_agence_id for update;
  if not found then raise exception 'agence introuvable'; end if;
  if p_resultat not in ('pas_de_reponse','standard','joint','faux_numero') then raise exception 'résultat inconnu : %', p_resultat; end if;
  if p_resultat = 'joint' and p_issue not in ('interesse','rdv','a_rappeler','pas_interesse') then raise exception 'issue inconnue : %', p_issue; end if;
  if p_contact_id is not null then
    select trim(prenom || ' ' || nom) into v_contact from public.contacts where id = p_contact_id and agence_id = p_agence_id;
  end if;

  insert into public.activites (agence_id, contact_id, type, date, compte_id, compte_nom, note, resultat, issue, motif, numero_utilise, duree_s, call_id, source)
  values (p_agence_id, p_contact_id, 'appel', now(), v_compte, p_compte_nom, coalesce(p_note, ''), p_resultat, coalesce(p_issue, ''), coalesce(p_motif, ''),
          coalesce(p_numero, ''), p_duree_s, coalesce(p_call_id, ''), coalesce(p_source, 'session'))
  returning id into v_appel;

  v_etape := a.etape;
  perform set_config('app.source', coalesce(p_source, 'session'), true);

  if p_resultat in ('pas_de_reponse', 'standard') then
    a.tentatives := a.tentatives + 1;
    if a.tentatives >= v_sommeil_apres and a.etape in ('a_prospecter', 'gestionnaire_joint') then
      v_etape := 'endormie';
      a.reveil_le := current_date + v_sommeil_jours;
    end if;
    if p_rappel_le is not null then
      insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, source)
      values (p_agence_id, p_contact_id, 'tache', now(), p_rappel_le, v_compte, p_compte_nom, 'Rappeler' || case when v_contact <> '' then ' ' || v_contact else '' end, coalesce(p_source, 'session'))
      returning id into v_tache;
    end if;
  elsif p_resultat = 'joint' then
    a.tentatives := 0;
    a.joint_fois := a.joint_fois + 1;
    if p_issue = 'interesse' then
      if a.etape in ('a_prospecter', 'gestionnaire_joint', 'pas_interesse', 'endormie', 'hors_cible') then v_etape := 'interesse'; end if;
      insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, source)
      values (p_agence_id, p_contact_id, 'tache', now(), date_trunc('day', now()) + (v_relance_jours || ' days')::interval + interval '10 hours', v_compte, p_compte_nom,
              'Relancer' || case when v_contact <> '' then ' ' || v_contact else '' end, coalesce(p_source, 'session'))
      returning id into v_tache;
    elsif p_issue = 'rdv' then
      if a.etape <> 'client' then v_etape := 'rdv_planifie'; end if;
      insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, rdv_type, source)
      values (p_agence_id, p_contact_id, 'rdv', now(), coalesce(p_rdv_le, now() + interval '1 day'), v_compte, p_compte_nom,
              'RDV' || case when v_contact <> '' then ' avec ' || v_contact else '' end, coalesce(nullif(p_rdv_type, ''), 'telephone'), coalesce(p_source, 'session'))
      returning id into v_tache;
    elsif p_issue = 'a_rappeler' then
      if a.etape in ('a_prospecter', 'endormie') then v_etape := 'gestionnaire_joint'; end if;
      insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, source)
      values (p_agence_id, p_contact_id, 'tache', now(), coalesce(p_rappel_le, date_trunc('day', now()) + interval '1 day 10 hours'), v_compte, p_compte_nom,
              'Rappeler' || case when v_contact <> '' then ' ' || v_contact else '' end, coalesce(p_source, 'session'))
      returning id into v_tache;
    elsif p_issue = 'pas_interesse' then
      if a.etape <> 'client' then v_etape := 'pas_interesse'; a.motif := coalesce(nullif(p_motif, ''), 'autre'); end if;
    end if;
  elsif p_resultat = 'faux_numero' then
    if a.etape <> 'client' then v_etape := 'hors_cible'; end if;
  end if;

  update public.agences set
    tentatives = a.tentatives, joint_fois = a.joint_fois, reveil_le = a.reveil_le,
    motif = case when v_etape = 'pas_interesse' then a.motif else motif end,
    etape = v_etape, derniere_activite_le = now()
  where id = p_agence_id;

  return jsonb_build_object('appel_id', v_appel, 'tache_id', v_tache, 'etape', v_etape, 'tentatives', a.tentatives, 'joint_fois', a.joint_fois);
end $$;

-- Le premier ordre de service : l'objectif, compté une fois, à sa date.
create or replace function public.agence_premier_os(p_agence_id uuid, p_date date default current_date, p_source text default 'fiche') returns void
language plpgsql security invoker as $$
begin
  perform set_config('app.source', coalesce(p_source, 'fiche'), true);
  update public.agences set etape = 'client', premier_os_le = coalesce(premier_os_le, p_date), derniere_activite_le = now() where id = p_agence_id;
end $$;

-- Terminer une tâche, ou la remettre à plus tard.
create or replace function public.tache_terminer(p_id uuid, p_faite boolean default true) returns void
language sql security invoker as $$
  update public.activites set fait_le = case when p_faite then now() else null end where id = p_id and type in ('tache','rdv');
$$;

-- Une activité marque l'agence comme touchée (sauf la ligne du journal d'étapes :
-- elle naît d'une mise à jour de l'agence déjà en cours, et n'est pas un contact réel).
create or replace function public.activites_touche_agence() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'etape' then return new; end if;
  update public.agences set derniere_activite_le = greatest(coalesce(derniere_activite_le, new.date), new.date), maj_le = now() where id = new.agence_id;
  return new;
end $$;
drop trigger if exists activites_touche_agence on public.activites;
create trigger activites_touche_agence after insert on public.activites for each row execute function public.activites_touche_agence();

-- 9) La vue des listes : une agence avec ce qu'il faut pour la ligne ------------------
create or replace view public.agences_liste with (security_invoker = true) as
select a.*,
       s.libelle as secteur_libelle, s.zone as secteur_zone,
       (select count(*) from public.contacts c where c.agence_id = a.id and not c.parti) as nb_contacts,
       (select trim(c.prenom || ' ' || c.nom) from public.contacts c where c.agence_id = a.id and not c.parti order by c.principal desc, c.cree_le limit 1) as contact_principal,
       (select c.ligne_directe from public.contacts c where c.agence_id = a.id and not c.parti order by c.principal desc, c.cree_le limit 1) as contact_ligne,
       (select min(t.echeance) from public.activites t where t.agence_id = a.id and t.type in ('tache','rdv') and t.fait_le is null) as prochaine_echeance,
       (select t.titre from public.activites t where t.agence_id = a.id and t.type in ('tache','rdv') and t.fait_le is null order by t.echeance limit 1) as prochaine_tache,
       (select count(*) from public.activites t where t.agence_id = a.id and t.type = 'appel') as nb_appels,
       (select max(t.date) from public.activites t where t.agence_id = a.id and t.type = 'appel') as dernier_appel_le,
       (select t.resultat from public.activites t where t.agence_id = a.id and t.type = 'appel' order by t.date desc limit 1) as dernier_resultat
  from public.agences a left join public.secteurs s on s.code = a.secteur;

-- 10) LA CONVERSION des 2 789 fiches (une seule fois) ----------------------------------
do $$
declare
  deja text;
  n_agences integer; n_contacts integer; n_activites integer;
begin
  select valeur into deja from public.parametres where cle = 'conversion_agences';
  if deja is not null and deja <> '' then
    raise notice 'Conversion déjà faite le % : rien à refaire.', deja;
    return;
  end if;

  -- Pendant la conversion, les déclencheurs se taisent : le journal d'étapes est
  -- écrit à la main (étape l) et la dernière activité est recalculée à la fin.
  alter table public.agences disable trigger agences_etape_journal;
  alter table public.activites disable trigger activites_touche_agence;

  -- a) Les secteurs qui manquent (codes postaux présents dans les fiches, inconnus de la liste).
  insert into public.secteurs (code, libelle, zone, ordre)
  select distinct trim(arrondissement), trim(arrondissement), left(trim(arrondissement), 2), 900
    from public.prospects
   where trim(coalesce(arrondissement, '')) ~ '^\d{5}$'
     and not exists (select 1 from public.secteurs s where s.code = trim(prospects.arrondissement));

  -- b) La clé de chaque fiche : nom normalisé + secteur.
  create temp table conv on commit drop as
  select p.id as prospect_id,
         lower(regexp_replace(trim(p.entreprise), '\s+', ' ', 'g')) as nom_cle,
         case when trim(coalesce(p.arrondissement, '')) ~ '^\d{5}$' then trim(p.arrondissement) else null end as secteur,
         p.cree_le, p.statut, p.statut_depuis, p.type, p.entreprise, p.contact, p.telephone, p.email, p.adresse, p.commentaire, p.numero_emission,
         (select count(*) from public.appels x where x.prospect_id = p.id) as nb_appels,
         null::uuid as agence_id
    from public.prospects p
   where coalesce(trim(p.entreprise), '') <> '';
  create index conv_cle_idx on conv(nom_cle, secteur);

  -- c) Les 106 agences déjà saisies : on les rapproche par nom + code postal.
  update public.agences a
     set nom_cle = lower(regexp_replace(trim(a.nom), '\s+', ' ', 'g')),
         secteur = case when trim(coalesce(a.arrondissement, '')) ~ '^\d{5}$' and exists (select 1 from public.secteurs s where s.code = trim(a.arrondissement)) then trim(a.arrondissement) else a.secteur end
   where a.nom_cle is null;

  -- d) Une agence par (nom, secteur) : la fiche la plus récente du groupe sert de base.
  with groupes as (
    select distinct on (nom_cle, secteur) nom_cle, secteur, prospect_id, entreprise, telephone, email, adresse, type, statut, statut_depuis, numero_emission, cree_le
      from conv order by nom_cle, secteur, cree_le desc
  ), existantes as (
    update public.agences a
       set prospect_id = g.prospect_id,
           telephone = coalesce(nullif(a.telephone, ''), g.telephone, ''),
           email = coalesce(nullif(a.email, ''), g.email, ''),
           adresse = coalesce(nullif(a.adresse, ''), g.adresse, ''),
           source = 'conversion'
      from groupes g
     where a.nom_cle = g.nom_cle and coalesce(a.secteur, '') = coalesce(g.secteur, '') and a.prospect_id is null
    returning a.id, a.nom_cle, a.secteur
  )
  insert into public.agences (nom, nom_cle, secteur, arrondissement, telephone, email, adresse, type, prospect_id, numero_emission, source, cree_le)
  select g.entreprise, g.nom_cle, g.secteur, coalesce(g.secteur, ''), coalesce(g.telephone, ''), coalesce(g.email, ''), coalesce(g.adresse, ''),
         case when g.type = 'Apporteur d''affaires' then 'apporteur' else 'agence' end,
         g.prospect_id, coalesce(g.numero_emission, ''), 'conversion', g.cree_le
    from groupes g
   where not exists (select 1 from public.agences a where a.nom_cle = g.nom_cle and coalesce(a.secteur, '') = coalesce(g.secteur, ''));

  update conv c set agence_id = a.id from public.agences a where a.nom_cle = c.nom_cle and coalesce(a.secteur, '') = coalesce(c.secteur, '');

  -- e) L'enseigne, lue dans le nom.
  update public.agences set enseigne = case
      when nom ~* 'century\s*21' then 'Century 21'
      when nom ~* '\morpi\M' then 'Orpi'
      when nom ~* 'foncia' then 'Foncia'
      when nom ~* 'lafor[eê]t' then 'Laforêt'
      when nom ~* 'guy hoquet' then 'Guy Hoquet'
      when nom ~* 'nexity' then 'Nexity'
      when nom ~* 'citya' then 'Citya'
      when nom ~* 'st[ée]phane plaza' then 'Stéphane Plaza'
      when nom ~* '\mera\M' then 'ERA'
      when nom ~* 'square habitat' then 'Square Habitat'
      when nom ~* 'sotheby' then 'Sotheby''s'
      when nom ~* 'lamy' then 'Lamy'
      when nom ~* 'emile garcin' then 'Émile Garcin'
      when nom ~* 'barnes' then 'Barnes'
      when nom ~* 'engel' then 'Engel & Völkers'
      when nom ~* 'iad\M' then 'IAD'
      when nom ~* 'safti' then 'Safti'
      else enseigne end
   where source = 'conversion' and enseigne = '';

  -- f) L'étape, depuis l'état de la fiche de base (la plus récente du groupe).
  update public.agences a set
    etape = case p.statut
      when 'Intéressé' then 'interesse'
      when 'RDV pris' then 'rdv_planifie'
      when 'Client signé' then 'client'
      when 'Premier OS reçu' then 'client'
      when 'Injoignable' then 'endormie'
      when 'Perdu' then 'pas_interesse'
      when 'En attente ' then 'gestionnaire_joint'
      when 'En attente' then 'gestionnaire_joint'
      else 'a_prospecter' end,
    etape_depuis = coalesce(p.statut_depuis, p.cree_le, now()),
    reveil_le = case when p.statut = 'Injoignable' then current_date + 60 else null end,
    motif = case when p.statut = 'Perdu' then 'autre' else '' end,
    premier_os_le = case when p.statut in ('Client signé', 'Premier OS reçu') then coalesce(p.statut_depuis, p.cree_le)::date else null end,
    tentatives = least(6, (select count(*) from public.appels x join conv c2 on c2.prospect_id = x.prospect_id where c2.agence_id = a.id
                            and (x.resultat in ('Répondeur','Pas de réponse','Occupé','Annulé','Appel passé','Numéro invalide') or (x.resultat = 'Décroché' and x.nouvel_etat = 'Injoignable')))),
    joint_fois = (select count(*) from public.appels x join conv c2 on c2.prospect_id = x.prospect_id where c2.agence_id = a.id
                   and x.resultat = 'Décroché' and coalesce(x.nouvel_etat, '') not in ('Injoignable', 'Nouveau prospect', ''))
  from public.prospects p
  where p.id = a.prospect_id and a.source = 'conversion';

  -- g) La table de passage fiche → agence (gardée, pour s'y retrouver).
  create table if not exists public.prospects_conversion (prospect_id uuid primary key, agence_id uuid not null references public.agences(id) on delete cascade, converti_le timestamptz not null default now());
  insert into public.prospects_conversion (prospect_id, agence_id) select prospect_id, agence_id from conv where agence_id is not null on conflict do nothing;

  -- h) Les contacts : une fiche avec un nom de gestionnaire = un contact (sans doublon de nom par agence).
  insert into public.contacts (agence_id, nom, role, email, principal, prospect_id, cree_le)
  select c.agence_id, trim(c.contact), case when c.type = 'Apporteur d''affaires' then 'apporteur' else 'gestionnaire' end, coalesce(c.email, ''), false, c.prospect_id, c.cree_le
    from (select distinct on (agence_id, lower(trim(contact))) * from conv
           where agence_id is not null and coalesce(trim(contact), '') not in ('', '—', '-', '–')
           order by agence_id, lower(trim(contact)), cree_le desc) c;
  update public.contacts k set principal = true
   where k.id = (select k2.id from public.contacts k2 where k2.agence_id = k.agence_id order by k2.cree_le limit 1)
     and not exists (select 1 from public.contacts k3 where k3.agence_id = k.agence_id and k3.principal);

  -- i) Les appels : un résultat propre, une issue si joint.
  insert into public.activites (agence_id, contact_id, type, date, resultat, issue, motif, sens, note, source)
  select c.agence_id,
         (select k.id from public.contacts k where k.prospect_id = x.prospect_id limit 1),
         'appel', x.horodatage,
         case
           when x.resultat = 'Faux numéro' then 'faux_numero'
           when x.resultat = 'Appel entrant' then 'joint'
           when x.resultat = 'Décroché' and coalesce(x.nouvel_etat, '') = 'Injoignable' then 'pas_de_reponse'
           when x.resultat = 'Décroché' and coalesce(x.nouvel_etat, '') in ('', 'Nouveau prospect') then 'standard'
           when x.resultat = 'Décroché' then 'joint'
           else 'pas_de_reponse' end,
         case
           when x.resultat = 'Décroché' and x.nouvel_etat = 'Perdu' then 'pas_interesse'
           when x.resultat = 'Décroché' and x.nouvel_etat in ('À rappeler', 'En attente ', 'En attente', 'à rappeler  septembre') then 'a_rappeler'
           when x.resultat = 'Décroché' and x.nouvel_etat = 'Intéressé' then 'interesse'
           when x.resultat = 'Décroché' and x.nouvel_etat = 'RDV pris' then 'rdv'
           when x.resultat = 'Décroché' and x.nouvel_etat in ('Client signé', 'Premier OS reçu') then 'interesse'
           else '' end,
         case when x.resultat = 'Décroché' and x.nouvel_etat = 'Perdu' then 'autre' else '' end,
         case when x.sens = 'entrant' or x.resultat = 'Appel entrant' then 'entrant' else 'sortant' end,
         'Résultat d''origine : ' || coalesce(x.resultat, '') || case when coalesce(x.nouvel_etat, '') <> '' then ' → ' || x.nouvel_etat else '' end,
         'conversion'
    from public.appels x join conv c on c.prospect_id = x.prospect_id
   where c.agence_id is not null;

  -- j) Les RDV, les e-mails de campagne, les notes d'import, la boîte.
  insert into public.activites (agence_id, type, date, echeance, fait_le, titre, note, rdv_type, source)
  select c.agence_id, 'rdv', r.cree_le, (r.date::text || ' ' || case when r.heure ~ '^\d{1,2}:\d{2}$' then r.heure else '10:00' end)::timestamp at time zone 'Europe/Paris',
         case when r.fait then r.cree_le else null end, coalesce(nullif(r.titre, ''), 'RDV'), coalesce(r.note, ''),
         case lower(coalesce(r.type, '')) when 'visio' then 'visio' when 'sur place' then 'sur_place' else 'telephone' end, 'conversion'
    from public.rdv r join conv c on c.prospect_id = r.prospect_id where c.agence_id is not null;

  insert into public.activites (agence_id, type, date, titre, note, source)
  select c.agence_id, 'email', e.envoye_le, coalesce(e.objet, ''), 'Campagne · modèle « ' || coalesce(e.modele_nom, '') || ' »' || case when e.a_repondu then ' · a répondu' else '' end, 'conversion'
    from public.emails_envoyes e join conv c on c.prospect_id = e.prospect_id where c.agence_id is not null;

  insert into public.activites (agence_id, type, date, titre, note, source)
  select c.agence_id, 'note', c.cree_le, 'Note d''import', trim(c.commentaire), 'conversion'
    from conv c where c.agence_id is not null and coalesce(trim(c.commentaire), '') not in ('', '—', '-');

  update public.messages m set agence_id = c.agence_id from conv c where m.prospect_id = c.prospect_id and m.agence_id is null;

  -- k) Les anciens « à rappeler » et « en attente » deviennent des tâches datées.
  insert into public.activites (agence_id, type, date, echeance, titre, note, source)
  select a.id, 'tache', now(),
         case when p.statut in ('Intéressé', 'En attente ', 'En attente') then date_trunc('day', now()) + interval '7 days 10 hours' else date_trunc('day', now()) + interval '1 day 10 hours' end,
         case when p.statut in ('Intéressé', 'En attente ', 'En attente') then 'Relancer' else 'Rappeler' end,
         'Issu de l''ancien état « ' || trim(p.statut) || ' »', 'conversion'
    from public.agences a join public.prospects p on p.id = a.prospect_id
   where a.source = 'conversion' and p.statut in ('À rappeler', 'à rappeler  septembre', 'En attente ', 'En attente', 'Intéressé');

  -- l) La première ligne du journal d'étapes, et la dernière activité.
  insert into public.activites (agence_id, type, date, titre, etape_de, etape_vers, source)
  select id, 'etape', etape_depuis, 'conversion → ' || etape, '', etape, 'conversion' from public.agences where source = 'conversion';
  update public.agences a set derniere_activite_le = (select max(date) from public.activites t where t.agence_id = a.id and t.type in ('appel','email','rdv','note'));

  alter table public.agences enable trigger agences_etape_journal;
  alter table public.activites enable trigger activites_touche_agence;

  select count(*) into n_agences from public.agences;
  select count(*) into n_contacts from public.contacts;
  select count(*) into n_activites from public.activites;
  insert into public.parametres (cle, valeur) values ('conversion_agences', now()::text) on conflict (cle) do update set valeur = excluded.valeur;
  raise notice 'Conversion faite : % agences, % contacts, % activités.', n_agences, n_contacts, n_activites;
end $$;

-- Contrôle : à coller après, pour vérifier.
-- select etape, count(*) from public.agences group by 1 order by 2 desc;
-- select type, count(*) from public.activites group by 1;
-- select count(*) from public.contacts;
