-- ═══════════════════════════════════════════════════════════════════════════
--  RÈGLES DU DÉMARCHAGE — fichier de référence (13/10/2026)
--
--  La logique de Mahdi, en base, au même endroit :
--    · « À prospecter » : jamais appelées d'abord, puis la plus anciennement appelée ;
--    · une agence appelée se repose N jours (Réglages, 5 par défaut), une fiche au même
--      standard aussi ; un même numéro n'est jamais recomposé le même jour, sauf rappel daté ;
--    · une intéressée sort de la prospection et revient dans « À rappeler aujourd'hui »
--      tous les N jours (Réglages, 10 par défaut) jusqu'à signature, pas intéressée ou
--      faux numéro, quel que soit le résultat de l'appel ;
--    · un appel noté ferme le rappel du jour ; tout est écrit sur la fiche.
--
--  Ce fichier est REJOUABLE (create or replace) et c'est lui que teste le banc d'essai
--  supabase/tests/regles-demarchage.test.ts : une modification qui casse la logique rend la
--  publication impossible. En prod, sante_demarchage() signale toute règle qui ne
--  correspond plus à ce fichier (« règle modifiée hors du fichier de référence »).
--
--  À coller en une fois dans l'éditeur SQL du projet Baticom.
--
--  14/10 : UN SEUL ENDROIT pour chaque réglage (reglages_demarchage) et pour chaque règle
--  de pile (demarchage_repos, pile_demarchage, compter_piles). L'écran ne calcule plus rien :
--  il affiche ce que la base lui donne, et les compteurs sont la longueur des listes.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Les réglages du démarchage : leur valeur par défaut et leurs bornes, écrites UNE fois ──
-- Une valeur absente ou hors bornes dans `parametres` (Réglages) = la valeur par défaut.
create or replace function public.reglages_demarchage()
returns table (cle text, valeur integer, defaut integer, mini integer, maxi integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  select d.cle,
         coalesce((select p.valeur::integer from public.parametres p
                    where p.cle = d.cle and p.valeur ~ '^[0-9]{1,6}$' and p.valeur::integer between d.mini and d.maxi), d.defaut),
         d.defaut, d.mini, d.maxi
    from (values
      ('relance_interesse_jours', 10, 1, 365),  -- une intéressée revient tous les N jours
      ('repos_appel_jours', 5, 1, 60),          -- une agence appelée se repose N jours
      ('repos_standard_jours', 15, 1, 90),      -- après un « standard » : repos plus long
      ('sommeil_apres_tentatives', 6, 2, 20),   -- N essais sans gestionnaire : elle s'endort
      ('sommeil_jours', 30, 1, 180),            -- … pour N jours
      ('heure_relance', 10, 7, 20),             -- l'heure des relances et des rappels sans heure
      ('quota_appels_jour', 100, 10, 500),      -- appels par jour et par numéro Ringover (anti-spam)
      ('sonnerie_secondes', 28, 12, 90),        -- sans décroché après N s : « pas de réponse » proposé
      ('cadence_auto_secondes', 5, 2, 120),     -- mode automatique : compte à rebours avant d'appeler
      ('rdv_rappel_avant_minutes', 5, 0, 60),   -- le rappel d'un RDV s'affiche N min avant…
      ('rdv_rappel_apres_minutes', 20, 0, 120), -- … et reste N min après
      ('a_completer_minutes', 5, 1, 120)        -- un appel sans résultat depuis N min est « à compléter »
    ) as d(cle, defaut, mini, maxi)
$$;
grant execute on function public.reglages_demarchage() to authenticated;
create or replace function public.reglage_demarchage(p_cle text) returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v integer;
begin
  select r.valeur into v from public.reglages_demarchage() r where r.cle = p_cle;
  if v is null then raise exception 'réglage inconnu : %', p_cle; end if;
  return v;
end $$;
grant execute on function public.reglage_demarchage(text) to authenticated;
-- La date d'une relance ou d'un rappel : dans N jours, à l'heure réglée, heure de Paris.
create or replace function public.demarchage_echeance(p_jours integer) returns timestamptz
language sql
stable
set search_path to 'public'
as $$
  select (date_trunc('day', now() at time zone 'Europe/Paris') + (p_jours || ' days')::interval
          + (public.reglage_demarchage('heure_relance') || ' hours')::interval) at time zone 'Europe/Paris'
$$;

-- ── La vue des listes (compteurs = appels SORTANTS) ──
create or replace view public.agences_liste with (security_invoker = true) as
select a.id, a.nom, a.adresse, a.arrondissement, a.cree_le, a.logo_url, a.nb_lots, a.enseigne, a.type, a.secteur, a.telephone, a.email, a.site,
       a.etape, a.etape_depuis, a.commercial_id, a.tentatives, a.joint_fois, a.reveil_le, a.motif, a.premier_os_le, a.source, a.numero_emission,
       a.prospect_id, a.nom_cle, a.derniere_activite_le, a.maj_le,
       s.libelle as secteur_libelle, s.zone as secteur_zone,
       (select count(*) from public.contacts c where c.agence_id = a.id and not c.parti) as nb_contacts,
       (select trim(both from (c.prenom || ' ') || c.nom) from public.contacts c where c.agence_id = a.id and not c.parti order by c.principal desc, c.cree_le limit 1) as contact_principal,
       (select c.ligne_directe from public.contacts c where c.agence_id = a.id and not c.parti order by c.principal desc, c.cree_le limit 1) as contact_ligne,
       (select min(t.echeance) from public.activites t where t.agence_id = a.id and t.type in ('tache', 'rdv') and t.fait_le is null) as prochaine_echeance,
       (select t.titre from public.activites t where t.agence_id = a.id and t.type in ('tache', 'rdv') and t.fait_le is null order by t.echeance limit 1) as prochaine_tache,
       (select count(*) from public.activites t where t.agence_id = a.id and t.type = 'appel' and t.sens <> 'entrant') as nb_appels,
       (select max(t.date) from public.activites t where t.agence_id = a.id and t.type = 'appel' and t.sens <> 'entrant') as dernier_appel_le,
       (select t.resultat from public.activites t where t.agence_id = a.id and t.type = 'appel' and t.sens <> 'entrant' order by t.date desc limit 1) as dernier_resultat
  from public.agences a
  left join public.secteurs s on s.code = a.secteur;

-- ── Journal des étapes, dernière activité ──
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
create trigger agences_etape_journal before update on public.agences for each row execute function public.agences_etape_journal();
create or replace function public.activites_touche_agence() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'etape' then return new; end if;
  update public.agences set derniere_activite_le = greatest(coalesce(derniere_activite_le, new.date), new.date), maj_le = now() where id = new.agence_id;
  return new;
end $$;
drop trigger if exists activites_touche_agence on public.activites;
create trigger activites_touche_agence after insert on public.activites for each row execute function public.activites_touche_agence();

-- ── Le secteur fait foi ──
create or replace function public.agence_suit_son_secteur() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.secteur is not null and new.type <> 'apporteur'
     and (tg_op = 'INSERT' or new.secteur is distinct from old.secteur) then
    new.commercial_id := (select s.commercial_id from public.secteurs s where s.code = new.secteur);
  end if;
  return new;
end $$;
drop trigger if exists agences_suit_son_secteur on public.agences;
create trigger agences_suit_son_secteur before insert or update of secteur on public.agences for each row execute function public.agence_suit_son_secteur();
create or replace function public.attribuer_secteur(p_secteur text, p_compte_id uuid, p_ecraser boolean default true)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n integer := 0;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'Réservé aux admins.';
  end if;
  if coalesce(p_secteur, '') <> '' then
    update public.secteurs set commercial_id = p_compte_id where code = p_secteur;
    update public.agences set commercial_id = p_compte_id
     where secteur = p_secteur and type <> 'apporteur' and commercial_id is distinct from p_compte_id;
  else
    update public.agences set commercial_id = p_compte_id
     where coalesce(secteur, '') = '' and type <> 'apporteur' and commercial_id is distinct from p_compte_id;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ── L'appel : lancé au clic, puis noté (les règles d'étape et de relance) ──
create or replace function public.appel_lancer(
  p_agence_id uuid,
  p_contact_id uuid default null,
  p_numero text default '',
  p_call_id text default '',
  p_compte_nom text default '',
  p_source text default 'session'
) returns uuid
language plpgsql
as $$
declare
  v_appel uuid;
begin
  if not exists (select 1 from public.agences where id = p_agence_id) then raise exception 'agence introuvable'; end if;
  insert into public.activites (agence_id, contact_id, type, date, compte_id, compte_nom, note, resultat, issue, motif, numero_utilise, call_id, source)
  values (p_agence_id, p_contact_id, 'appel', now(), auth.uid(), coalesce(p_compte_nom, ''), '', 'lance', '', '', coalesce(p_numero, ''), coalesce(p_call_id, ''), coalesce(p_source, 'session'))
  returning id into v_appel;
  return v_appel;
end $$;
grant execute on function public.appel_lancer(uuid, uuid, text, text, text, text) to authenticated;
create or replace function public.appel_enregistrer(
  p_agence_id uuid, p_contact_id uuid, p_resultat text, p_issue text default '', p_motif text default '', p_note text default '',
  p_numero text default '', p_duree_s integer default null, p_call_id text default '', p_rappel_le timestamptz default null,
  p_rdv_le timestamptz default null, p_rdv_type text default 'telephone', p_compte_nom text default '', p_source text default 'session',
  p_appel_id uuid default null
) returns jsonb
language plpgsql
as $$
declare
  a public.agences%rowtype;
  v_compte uuid := auth.uid();
  v_appel uuid;
  v_etape text;
  v_tache uuid;
  v_contact text := '';
  v_interessee boolean;
  v_fin_jour timestamptz := (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day') at time zone 'Europe/Paris';
  v_sommeil_apres integer := public.reglage_demarchage('sommeil_apres_tentatives');
  v_sommeil_jours integer := public.reglage_demarchage('sommeil_jours');
  v_relance_le timestamptz := public.demarchage_echeance(public.reglage_demarchage('relance_interesse_jours'));
begin
  select * into a from public.agences where id = p_agence_id for update;
  if not found then raise exception 'agence introuvable'; end if;
  if p_resultat not in ('pas_de_reponse','standard','joint','faux_numero') then raise exception 'résultat inconnu : %', p_resultat; end if;
  if p_resultat = 'joint' and p_issue not in ('interesse','rdv','a_rappeler','pas_interesse') then raise exception 'issue inconnue : %', p_issue; end if;
  if p_contact_id is not null then
    select trim(prenom || ' ' || nom) into v_contact from public.contacts where id = p_contact_id and agence_id = p_agence_id;
  end if;
  v_interessee := a.etape in ('interesse', 'rdv_planifie');
  perform set_config('app.appel_en_cours', '1', true);

  -- Déjà noté (double clic, ou réponse perdue puis nouvel essai) : on ne réécrit rien, on renvoie l'état.
  if p_appel_id is not null and exists (select 1 from public.activites where id = p_appel_id and agence_id = p_agence_id and type = 'appel' and resultat <> 'lance') then
    perform set_config('app.appel_en_cours', '', true);
    return jsonb_build_object('appel_id', p_appel_id, 'tache_id', null, 'etape', a.etape, 'tentatives', a.tentatives, 'joint_fois', a.joint_fois);
  end if;

  -- L'appel lancé au clic : on le complète (sa date reste celle du clic).
  if p_appel_id is not null then
    update public.activites set
      contact_id = coalesce(p_contact_id, contact_id), compte_nom = coalesce(nullif(p_compte_nom, ''), compte_nom),
      note = coalesce(p_note, ''), resultat = p_resultat, issue = coalesce(p_issue, ''), motif = coalesce(p_motif, ''),
      numero_utilise = coalesce(nullif(p_numero, ''), numero_utilise), duree_s = p_duree_s, call_id = coalesce(nullif(p_call_id, ''), call_id)
    where id = p_appel_id and agence_id = p_agence_id and type = 'appel' and resultat = 'lance'
    returning id into v_appel;
  end if;
  if v_appel is null then
    insert into public.activites (agence_id, contact_id, type, date, compte_id, compte_nom, note, resultat, issue, motif, numero_utilise, duree_s, call_id, source)
    values (p_agence_id, p_contact_id, 'appel', now(), v_compte, p_compte_nom, coalesce(p_note, ''), p_resultat, coalesce(p_issue, ''), coalesce(p_motif, ''),
            coalesce(p_numero, ''), p_duree_s, coalesce(p_call_id, ''), coalesce(p_source, 'session'))
    returning id into v_appel;
  end if;

  -- 1. L'appel a eu lieu : le rappel du jour (et ceux en retard) est fait.
  update public.activites set fait_le = now()
   where agence_id = p_agence_id and type in ('tache', 'rdv') and fait_le is null and echeance < v_fin_jour;
  -- 2. Une intéressée : ses relances à venir sont remplacées par la nouvelle (posée plus bas).
  if v_interessee then
    update public.activites set fait_le = now()
     where agence_id = p_agence_id and type = 'tache' and fait_le is null and titre like 'Relancer%';
  end if;

  v_etape := a.etape;
  perform set_config('app.source', coalesce(p_source, 'session'), true);

  if p_resultat in ('pas_de_reponse', 'standard') then
    a.tentatives := a.tentatives + 1;
    if a.tentatives >= v_sommeil_apres and a.etape in ('a_prospecter', 'gestionnaire_joint') then
      v_etape := 'endormie';
      a.reveil_le := (now() at time zone 'Europe/Paris')::date + v_sommeil_jours;
    elsif a.etape = 'endormie' then
      -- Réveillée, toujours personne : elle se rendort (sinon elle reviendrait tous les 5 jours).
      a.reveil_le := (now() at time zone 'Europe/Paris')::date + v_sommeil_jours;
    end if;
    if p_rappel_le is not null then
      insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, source)
      values (p_agence_id, p_contact_id, 'tache', now(), p_rappel_le, v_compte, p_compte_nom, 'Rappeler' || case when v_contact <> '' then ' ' || v_contact else '' end, coalesce(p_source, 'session'))
      returning id into v_tache;
    elsif v_interessee then
      -- Intéressée injoignable : on la relance au prochain tour (10 jours).
      insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, source)
      values (p_agence_id, p_contact_id, 'tache', now(), v_relance_le, v_compte, p_compte_nom, 'Relancer' || case when v_contact <> '' then ' ' || v_contact else '' end, coalesce(p_source, 'session'))
      returning id into v_tache;
    end if;
  elsif p_resultat = 'joint' then
    a.tentatives := 0;
    a.joint_fois := a.joint_fois + 1;
    if p_issue = 'interesse' then
      if a.etape in ('a_prospecter', 'gestionnaire_joint', 'pas_interesse', 'endormie', 'hors_cible') then v_etape := 'interesse'; end if;
      insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, source)
      values (p_agence_id, p_contact_id, 'tache', now(), v_relance_le, v_compte, p_compte_nom,
              'Relancer' || case when v_contact <> '' then ' ' || v_contact else '' end, coalesce(p_source, 'session'))
      returning id into v_tache;
    elsif p_issue = 'rdv' then
      if a.etape <> 'client' then v_etape := 'rdv_planifie'; end if;
      insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, rdv_type, source)
      values (p_agence_id, p_contact_id, 'rdv', now(), coalesce(p_rdv_le, public.demarchage_echeance(1)), v_compte, p_compte_nom,
              'RDV' || case when v_contact <> '' then ' avec ' || v_contact else '' end, coalesce(nullif(p_rdv_type, ''), 'telephone'), coalesce(p_source, 'session'))
      returning id into v_tache;
    elsif p_issue = 'a_rappeler' then
      -- Le gestionnaire demande à être rappelé : l'agence revient dans le circuit, même si elle était sortie.
      if a.etape in ('a_prospecter', 'endormie', 'pas_interesse', 'hors_cible') then v_etape := 'gestionnaire_joint'; end if;
      insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, source)
      values (p_agence_id, p_contact_id, 'tache', now(), coalesce(p_rappel_le, public.demarchage_echeance(1)), v_compte, p_compte_nom,
              'Rappeler' || case when v_contact <> '' then ' ' || v_contact else '' end, coalesce(p_source, 'session'))
      returning id into v_tache;
    elsif p_issue = 'pas_interesse' then
      if a.etape <> 'client' then v_etape := 'pas_interesse'; a.motif := coalesce(nullif(p_motif, ''), 'autre'); end if;
    end if;
  elsif p_resultat = 'faux_numero' then
    if a.etape <> 'client' then v_etape := 'hors_cible'; end if;
  end if;

  -- 3. Sortie du démarchage : plus rien de prévu.
  if v_etape in ('pas_interesse', 'hors_cible') then
    update public.activites set fait_le = now() where agence_id = p_agence_id and type in ('tache', 'rdv') and fait_le is null;
  end if;
  perform set_config('app.appel_en_cours', '', true);

  update public.agences set
    tentatives = a.tentatives, joint_fois = a.joint_fois, reveil_le = a.reveil_le,
    motif = case when v_etape = 'pas_interesse' then a.motif else motif end,
    etape = v_etape, derniere_activite_le = now()
  where id = p_agence_id;

  return jsonb_build_object('appel_id', v_appel, 'tache_id', v_tache, 'etape', v_etape, 'tentatives', a.tentatives, 'joint_fois', a.joint_fois);
end $$;
grant execute on function public.appel_enregistrer(uuid, uuid, text, text, text, text, text, integer, text, timestamptz, timestamptz, text, text, text, uuid) to authenticated;

-- ── Les relances : étape changée à la main, tâche faite ou supprimée ──
create or replace function public.agences_etape_relances() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Passée en apporteur d'affaires : elle sort du démarchage, plus aucune relance.
  if new.type = 'apporteur' and old.type is distinct from 'apporteur' then
    update public.activites set fait_le = now() where agence_id = new.id and type in ('tache', 'rdv') and fait_le is null;
    -- L'appel en cours est clos : « passée en apporteur », rien d'autre à noter (Mahdi, 13/10).
    update public.activites set resultat = 'apporteur' where agence_id = new.id and type = 'appel' and resultat = 'lance';
    return new;
  end if;
  if new.etape is not distinct from old.etape then return new; end if;
  if new.etape in ('interesse', 'rdv_planifie')
     and not exists (select 1 from public.activites t where t.agence_id = new.id and t.type in ('tache', 'rdv') and t.fait_le is null) then
    insert into public.activites (agence_id, type, date, echeance, compte_id, compte_nom, titre, source)
    values (new.id, 'tache', now(), public.demarchage_echeance(public.reglage_demarchage('relance_interesse_jours')),
            auth.uid(), coalesce(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'nom', ''), 'Relancer', 'fiche');
  elsif new.etape in ('pas_interesse', 'hors_cible', 'client') then
    update public.activites set fait_le = now() where agence_id = new.id and type in ('tache', 'rdv') and fait_le is null;
  end if;
  return new;
end $$;
drop trigger if exists agences_etape_relances on public.agences;
create trigger agences_etape_relances after update of etape, type on public.agences for each row execute function public.agences_etape_relances();
create or replace function public.activites_relance_continue() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_agence uuid := coalesce(new.agence_id, old.agence_id);
begin
  if coalesce(current_setting('app.appel_en_cours', true), '') = '1' then return null; end if;
  if old.type not in ('tache', 'rdv') or old.fait_le is not null then return null; end if;
  if tg_op = 'UPDATE' and new.fait_le is null then return null; end if;
  if exists (select 1 from public.agences where id = v_agence and etape in ('interesse', 'rdv_planifie') and type <> 'apporteur')
     and not exists (select 1 from public.activites t where t.agence_id = v_agence and t.type in ('tache', 'rdv') and t.fait_le is null) then
    insert into public.activites (agence_id, type, date, echeance, compte_id, compte_nom, titre, source)
    values (v_agence, 'tache', now(), public.demarchage_echeance(public.reglage_demarchage('relance_interesse_jours')),
            auth.uid(), coalesce(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'nom', ''), 'Relancer', 'fiche');
  end if;
  return null;
end $$;
drop trigger if exists activites_relance_continue on public.activites;
create trigger activites_relance_continue after update of fait_le or delete on public.activites for each row execute function public.activites_relance_continue();
create or replace function public.tache_terminer(p_id uuid, p_faite boolean default true) returns void
language plpgsql
as $$
begin
  if not p_faite and exists (select 1 from public.activites t join public.agences a on a.id = t.agence_id
                              where t.id = p_id and (a.etape in ('pas_interesse', 'hors_cible', 'client') or a.type = 'apporteur')) then
    raise exception 'Cette agence est sortie du démarchage : rien à remettre à faire.';
  end if;
  update public.activites set fait_le = case when p_faite then now() else null end where id = p_id and type in ('tache', 'rdv');
end $$;
grant execute on function public.tache_terminer(uuid, boolean) to authenticated;

-- ── Premier OS (client) : au jour de Paris ──
create or replace function public.agence_premier_os(p_agence_id uuid, p_date date default null, p_source text default 'fiche')
returns void
language plpgsql
as $$
begin
  perform set_config('app.source', coalesce(p_source, 'fiche'), true);
  update public.agences set etape = 'client', premier_os_le = coalesce(premier_os_le, p_date, (now() at time zone 'Europe/Paris')::date), derniere_activite_le = now() where id = p_agence_id;
end $$;

-- ── Les mails rangés sur leur agence ──
create or replace function public.messages_rattacher_agence() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_adresse text;
  v_agences uuid[];
begin
  if new.agence_id is not null or coalesce(new.espace, 'demarchage') <> 'demarchage' then return new; end if;
  -- L'adresse de l'autre côté : le destinataire pour un envoi, l'expéditeur pour une réponse.
  v_adresse := lower(trim(split_part(split_part(case when new.sens = 'sortant' then new.a else new.de end, ' · ', 1), ',', 1)));
  if v_adresse ~ '<.+>' then v_adresse := substring(v_adresse from '<([^>]+)>'); end if;
  if v_adresse is null or position('@' in v_adresse) = 0 then return new; end if;

  select array_agg(distinct c.agence_id) into v_agences from public.contacts c where lower(trim(c.email)) = v_adresse;
  if coalesce(array_length(v_agences, 1), 0) = 0 then
    select array_agg(distinct g.id) into v_agences from public.agences g
     where g.type <> 'apporteur' and position(v_adresse in lower(coalesce(g.email, ''))) > 0;
  end if;
  if array_length(v_agences, 1) = 1 then new.agence_id := v_agences[1]; end if;
  return new;
end $$;
drop trigger if exists messages_rattacher_agence on public.messages;
create trigger messages_rattacher_agence before insert on public.messages for each row execute function public.messages_rattacher_agence();

-- ── Le repos : QUI ne doit pas être rappelé, et pourquoi (14/10 : écrit une seule fois) ──
-- Une ligne par agence à laisser tranquille. Sert aux piles (elles la retirent) et à la garde
-- avant de composer (elle donne la raison). Vaut sur TOUTE la base : un standard composé depuis
-- une autre fiche, une autre étape ou par un collègue met au repos toutes les fiches qui le partagent.
--   du_jour = vrai : appelée aujourd'hui, ou son standard composé aujourd'hui. Un numéro, UN appel
--             par jour, sans exception (Mahdi, 14/10 : « si un rappel est vraiment urgent, on copie
--             le numéro »). La case « inclure les appelées » ne lève jamais ce repos-là.
--   du_jour = faux : le repos de N jours (Réglages), plus long après un « standard ». Il ne vaut ni
--             pour une agence qui a un rappel prévu aujourd'hui, ni pour une intéressée ou un RDV
--             (elles ont leur relance).
create or replace function public.demarchage_repos()
returns table (agence_id uuid, raison text, du_jour boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  with j as (
    select date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris' as debut_jour,
           (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day') at time zone 'Europe/Paris' as fin_jour,
           (date_trunc('day', now() at time zone 'Europe/Paris') - ((public.reglage_demarchage('repos_appel_jours') - 1) || ' days')::interval) at time zone 'Europe/Paris' as debut_repos,
           (date_trunc('day', now() at time zone 'Europe/Paris') - ((public.reglage_demarchage('repos_standard_jours') - 1) || ' days')::interval) at time zone 'Europe/Paris' as debut_standard,
           public.reglage_demarchage('repos_appel_jours') as n_repos,
           public.reglage_demarchage('repos_standard_jours') as n_standard
  ),
  -- Les appels passés depuis le début du plus long repos, avec le standard de la fiche appelée.
  ap as (
    select x.agence_id, x.date, x.resultat, regexp_replace(coalesce(g.telephone, ''), '\D', '', 'g') as tel
      from public.activites x join public.agences g on g.id = x.agence_id, j
     where x.type = 'appel' and x.sens <> 'entrant' and x.date >= least(j.debut_repos, j.debut_standard, j.debut_jour)
  ),
  dernier as (select distinct on (agence_id) agence_id, date, resultat from ap order by agence_id, date desc),
  tel_appele as (select tel, max(date) as le from ap, j where length(tel) >= 9 and ap.date >= j.debut_repos group by tel),
  tel_standard as (
    select ap.tel, max(d.date) as le from dernier d join ap on ap.agence_id = d.agence_id and ap.date = d.date, j
     where d.resultat = 'standard' and d.date >= j.debut_standard and length(ap.tel) >= 9 group by ap.tel
  ),
  g as (
    select a.id, regexp_replace(coalesce(a.telephone, ''), '\D', '', 'g') as tel,
           a.etape in ('interesse', 'rdv_planifie')
             or exists (select 1 from public.activites t, j where t.agence_id = a.id and t.type in ('tache', 'rdv') and t.fait_le is null and t.echeance < j.fin_jour) as exempte
      from public.agences a
  ),
  raisons as (
    -- 1. Aujourd'hui : la fiche elle-même, ou son standard composé sur une autre fiche.
    select g.id, 1 as ordre, true as du_jour,
           'Ce numéro a déjà été appelé aujourd''hui (par toi ou un collègue) : on ne le recompose pas.' as raison
      from g, j where exists (select 1 from ap where ap.agence_id = g.id and ap.date >= j.debut_jour)
                   or (length(g.tel) >= 9 and exists (select 1 from ap where ap.tel = g.tel and ap.date >= j.debut_jour))
    union all
    -- 2. « Standard » : l'accueil a décroché, pas le gestionnaire. On laisse reposer l'accueil plus longtemps.
    select g.id, 3, false,
           'Standard eu le ' || to_char(s.le at time zone 'Europe/Paris', 'DD/MM') || ' sans le gestionnaire : on laisse reposer l''accueil ' || j.n_standard || ' jours.'
      from g join tel_standard s on s.tel = g.tel, j where not g.exempte
    union all
    select g.id, 2, false,
           'Standard eu le ' || to_char(d.date at time zone 'Europe/Paris', 'DD/MM') || ' sans le gestionnaire : on laisse reposer l''accueil ' || j.n_standard || ' jours.'
      from g join dernier d on d.agence_id = g.id, j where not g.exempte and d.resultat = 'standard' and d.date >= j.debut_standard
    union all
    -- 3. Le repos de N jours : la fiche, ou son standard composé sur une autre fiche.
    select g.id, 4, false,
           'Agence au repos : appelée le ' || to_char(d.date at time zone 'Europe/Paris', 'DD/MM') || ', elle revient dans ' || j.n_repos || ' jours.'
      from g join dernier d on d.agence_id = g.id, j where not g.exempte and d.date >= j.debut_repos
    union all
    select g.id, 5, false,
           'Au repos : ce standard a été appelé le ' || to_char(t.le at time zone 'Europe/Paris', 'DD/MM') || ' (fiche au même numéro), il revient dans ' || j.n_repos || ' jours.'
      from g join tel_appele t on t.tel = g.tel, j where not g.exempte
  )
  -- La raison la plus forte d'abord : aujourd'hui, puis la fiche elle-même, puis une fiche au même standard.
  select distinct on (id) id, raison, du_jour from raisons order by id, ordre
$$;
grant execute on function public.demarchage_repos() to authenticated;

-- ── Les piles de la session (14/10) : CALCULÉES ICI, dans l'ordre où on les appelle ──
--   a_prospecter : jamais appelées d'abord (secteur du jour en tête, avec enseigne d'abord),
--                  puis la plus anciennement appelée ; les fiches sans aucun numéro en dernier ;
--   rappels      : un rappel ou une relance prévus aujourd'hui ou en retard, par heure ;
--   sans_nouvelle (« Intéressés ») : TOUTES les intéressées et RDV — c'est le portefeuille, il ne
--                  maigrit pas parce qu'on en a appelé une ce matin (la garde, elle, refuse de la
--                  recomposer) ; relance due d'abord, puis sans rien de prévu, puis à venir ;
--   a_reveiller  : endormies dont le réveil est arrivé, réveil le plus ancien d'abord ;
--   etape        : toutes les agences d'une étape (p_etape), même ordre qu'« À prospecter ».
-- Toutes retirent les agences au repos (demarchage_repos ; « inclure les appelées » ne garde que
-- le repos du jour), sauf « Intéressés ». Un même standard n'apparaît qu'une fois.
-- p_proprietaire : 'tous', 'non_attribuees' ou l'id d'un compte (la base de chacun).
create or replace function public.pile_demarchage(
  p_pile text,
  p_proprietaire text default 'tous',
  p_etape text default null,
  p_secteur text default null,
  p_sourcage text default '',
  p_inclure_appelees boolean default false
) returns table (rang integer, agence jsonb)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with j as (
    select (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day') at time zone 'Europe/Paris' as fin_jour,
           (now() at time zone 'Europe/Paris')::date as aujourdhui
  ),
  rep as (select * from public.demarchage_repos()),
  base as (
    select l.*, regexp_replace(coalesce(l.telephone, ''), '\D', '', 'g') as tel
      from public.agences_liste l, j
     where l.type <> 'apporteur'
       and (coalesce(p_proprietaire, 'tous') = 'tous'
            or (p_proprietaire = 'non_attribuees' and l.commercial_id is null)
            or l.commercial_id::text = p_proprietaire)
       and (coalesce(p_sourcage, '') = '' or (p_sourcage = 'sourcees') = (l.nb_contacts > 0))
       and case p_pile
             when 'a_prospecter' then l.etape in ('a_prospecter', 'gestionnaire_joint') and l.prochaine_echeance is null
             when 'rappels' then l.etape <> 'hors_cible' and l.prochaine_echeance < j.fin_jour
             when 'sans_nouvelle' then l.etape in ('interesse', 'rdv_planifie')
             when 'a_reveiller' then l.etape = 'endormie' and l.reveil_le <= j.aujourdhui
             when 'etape' then l.etape = p_etape and (coalesce(p_secteur, '') = '' or l.secteur = p_secteur)
             else false
           end
       and (p_pile = 'sans_nouvelle'
            or not exists (select 1 from rep r where r.agence_id = l.id and (r.du_jour or not coalesce(p_inclure_appelees, false))))
  ),
  ordonnee as (
    select b.*, row_number() over (order by
             -- sans aucun numéro (ni standard, ni contact) : en dernier
             case when p_pile in ('a_prospecter', 'etape') and b.tel = '' and b.nb_contacts = 0 then 1 else 0 end,
             -- jamais appelées d'abord
             case when p_pile in ('a_prospecter', 'etape') and b.dernier_appel_le is not null then 1 else 0 end,
             -- intéressés : relance due, puis rien de prévu, puis à venir
             case when p_pile = 'sans_nouvelle' then case when b.prochaine_echeance is null then 1 when b.prochaine_echeance < j.fin_jour then 0 else 2 end else 0 end,
             case p_pile
               when 'a_prospecter' then b.dernier_appel_le
               when 'etape' then b.dernier_appel_le
               when 'rappels' then b.prochaine_echeance
               when 'a_reveiller' then b.reveil_le::timestamptz
               when 'sans_nouvelle' then case when b.prochaine_echeance is null then b.derniere_activite_le else b.prochaine_echeance end
             end nulls first,
             -- jamais appelées : le secteur du jour en tête, les agences d'enseigne d'abord
             case when p_pile = 'a_prospecter' and b.dernier_appel_le is null and coalesce(p_secteur, '') <> '' and b.secteur = p_secteur then 0 else 1 end,
             case when b.enseigne <> '' then 0 else 1 end,
             b.nom, b.id) as o
      from base b, j
  ),
  unique_standard as (
    select o2.*, row_number() over (partition by case when length(o2.tel) >= 9 then o2.tel else o2.id::text end order by o2.o) as k
      from ordonnee o2
  )
  select (row_number() over (order by u.o))::integer,
         to_jsonb(u) - 'tel' - 'o' - 'k'
    from unique_standard u
   where u.k = 1
$$;
grant execute on function public.pile_demarchage(text, text, text, text, text, boolean) to authenticated;

-- Les compteurs des quatre piles : la longueur EXACTE des listes ci-dessus (jamais un autre calcul).
create or replace function public.compter_piles(p_proprietaire text default 'tous')
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  select jsonb_build_object(
    'a_prospecter', (select count(*) from public.pile_demarchage('a_prospecter', p_proprietaire)),
    'rappels', (select count(*) from public.pile_demarchage('rappels', p_proprietaire)),
    'sans_nouvelle', (select count(*) from public.pile_demarchage('sans_nouvelle', p_proprietaire)),
    'a_reveiller', (select count(*) from public.pile_demarchage('a_reveiller', p_proprietaire)))
$$;
grant execute on function public.compter_piles(text) to authenticated;

-- ── La garde AVANT de composer : la règle « on ne tue pas les numéros », en base ──
-- Renvoie NULL si l'appel est permis, sinon la raison (affichée telle quelle).
-- Elle vaut pour tout le monde, quel que soit l'onglet ou la version de l'écran.
--   1. un appel lancé sur cette agence attend encore son résultat ;
--   2. ce numéro (le standard de n'importe quelle fiche) a déjà été composé aujourd'hui — sans
--      exception (Mahdi, 14/10) ; la ligne directe d'un gestionnaire reste appelable ;
--   3. hors appel direct : agence sortie du démarchage, ou au repos (demarchage_repos).
-- « Copier le numéro » n'est jamais bloqué : on peut toujours appeler à la main et noter
-- l'appel ensuite.
create or replace function public.appel_verifier(p_agence_id uuid, p_numero text, p_direct boolean default false)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  a public.agences%rowtype;
  v_tel text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
  v_debut_jour timestamptz := date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  v_lance timestamptz;
  v_raison text;
begin
  select * into a from public.agences where id = p_agence_id;
  if not found then return 'Agence introuvable.'; end if;

  select max(date) into v_lance from public.activites where agence_id = p_agence_id and type = 'appel' and resultat = 'lance';
  if v_lance is not null then
    return 'Note d''abord le résultat de l''appel du ' || to_char(v_lance at time zone 'Europe/Paris', 'DD/MM à HH24"h"MI') || '.';
  end if;

  if length(v_tel) >= 9 and exists (
       select 1 from public.activites x join public.agences g on g.id = x.agence_id
        where x.type = 'appel' and x.sens <> 'entrant' and x.date >= v_debut_jour
          and regexp_replace(coalesce(g.telephone, ''), '\D', '', 'g') = v_tel) then
    return 'Ce numéro a déjà été appelé aujourd''hui (par toi ou un collègue) : on ne le recompose pas.';
  end if;

  if not coalesce(p_direct, false) then
    if a.type = 'apporteur' or a.etape in ('pas_interesse', 'hors_cible', 'client') then
      return 'Cette agence est sortie du démarchage.';
    end if;
    select r.raison into v_raison from public.demarchage_repos() r where r.agence_id = p_agence_id and not r.du_jour;
    return v_raison;
  end if;
  return null;
end $$;
grant execute on function public.appel_verifier(uuid, text, boolean) to authenticated;

-- ── La santé du démarchage (affichée sur « Aujourd'hui ») ──
create or replace function public.sante_demarchage()
returns table (code text, libelle text, nombre integer, exemples text)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with b as (select * from public.agences_liste where type <> 'apporteur'),
  ouv as (select agence_id, count(*) n, count(*) filter (where titre like 'Relancer%') nr
            from public.activites where type in ('tache', 'rdv') and fait_le is null group by 1),
  ecarts as (
    select 'interessee_sans_relance' code, 'Intéressée ou RDV sans relance prévue (elle ne reviendrait plus)' libelle, b.nom
      from b where b.etape in ('interesse', 'rdv_planifie') and b.prochaine_echeance is null
    union all
    select 'relance_sur_sortie', 'Relance ouverte sur une agence pas intéressée, hors cible ou cliente', b.nom
      from b join ouv on ouv.agence_id = b.id where b.etape in ('pas_interesse', 'hors_cible', 'client')
    union all
    select 'relances_en_double', 'Plusieurs relances ouvertes sur la même agence', a.nom
      from public.agences a join ouv on ouv.agence_id = a.id where ouv.nr > 1
    union all
    select 'tache_apporteur', 'Tâche ouverte sur un apporteur d''affaires', a.nom
      from public.agences a join ouv on ouv.agence_id = a.id where a.type = 'apporteur'
    union all
    select 'appel_non_note', 'Appel lancé sans résultat noté (« À compléter »)', a.nom || ' (' || coalesce(nullif(x.compte_nom, ''), '?') || ', ' || to_char(x.date at time zone 'Europe/Paris', 'DD/MM HH24:MI') || ')'
      from public.activites x join public.agences a on a.id = x.agence_id
     where x.type = 'appel' and x.resultat = 'lance'
       and x.date < now() - (public.reglage_demarchage('a_completer_minutes') || ' minutes')::interval
    union all
    select 'compteurs_faux', 'Tentatives ou joints différents de l''historique de la fiche', a.nom
      from public.agences a
     where a.joint_fois <> (select count(*) from public.activites x where x.agence_id = a.id and x.type = 'appel' and x.sens <> 'entrant' and x.resultat = 'joint')
        or a.tentatives <> (select count(*) from public.activites x where x.agence_id = a.id and x.type = 'appel' and x.sens <> 'entrant'
                              and x.resultat in ('pas_de_reponse', 'standard')
                              and x.date > coalesce((select max(y.date) from public.activites y where y.agence_id = a.id and y.type = 'appel' and y.sens <> 'entrant' and y.resultat = 'joint'), '-infinity'::timestamptz))
    union all
    select 'proprietaire_hors_secteur', 'Agence attribuée à quelqu''un d''autre que le démarcheur de son secteur', a.nom
      from public.agences a join public.secteurs s on s.code = a.secteur
     where a.type <> 'apporteur' and a.commercial_id is distinct from s.commercial_id
    union all
    select 'mail_sans_agence', 'E-mail de démarchage envoyé sans agence (invisible sur les fiches)', m.a
      from public.messages m where m.espace = 'demarchage' and m.sens = 'sortant' and m.agence_id is null and m.created_at >= '2026-10-09'
    union all
    select 'endormie_sans_reveil', 'Endormie sans date de réveil (elle ne reviendrait jamais)', b.nom
      from b where b.etape = 'endormie' and b.reveil_le is null
    union all
    select 'client_sans_os', 'Cliente sans date de premier OS (absente de l''objectif du mois)', b.nom
      from b where b.etape = 'client' and b.premier_os_le is null
    union all
    -- Le verrou : chaque règle en base doit être EXACTEMENT celle du fichier de référence
    -- (supabase/regles-demarchage.sql, testé avant chaque mise en ligne).
    select 'regle_modifiee', 'Règle d''appel modifiée ou absente en base (ne correspond plus au fichier de référence testé)', e.nom
      from (values
-- empreintes:debut
      ('activites_relance_continue', '277f6b48012f23a8b1b17e557dd191cf'),
      ('activites_touche_agence', '9d1cd0ea5bd09eac1ad897a706b74b1c'),
      ('agence_premier_os', 'ec639a4844d765424b15d87f25eb2bb8'),
      ('agence_suit_son_secteur', '6e7ba90b69d6e285a6ced23b0152f01a'),
      ('agences_etape_journal', 'fc6f7ba67ce22c7dc068d2559317e3db'),
      ('agences_etape_relances', '8d48310d52142575ba5bf13577d055e5'),
      ('appel_enregistrer', '4643e64638e09b991293bdf459f60179'),
      ('appel_lancer', '1a7719fcc50f051173c9dc47b44fabe4'),
      ('appel_verifier', '4a43fb962df39012cb0b46f3c659c2d2'),
      ('attribuer_secteur', '36fed4398857d71bcd61cf41c66c8b23'),
      ('compter_piles', '39d8a4494285f07bac32bcee6230b5c8'),
      ('demarchage_echeance', 'a2efbf4b3e0b715a9fb230baadb6729f'),
      ('demarchage_repos', '3b158381ab900dc40ff7c5c4c1a42e8d'),
      ('messages_rattacher_agence', '706c38b5a6e088b688311d7f13ebb60a'),
      ('pile_demarchage', '3cd1e7b0ac2229e590c044c06e88774b'),
      ('reglage_demarchage', '13b69e49ccdcad93f543dc2abfd032bb'),
      ('reglages_demarchage', '61528ab1c7f260c7eec551e6497bf952'),
      ('tache_terminer', '301665f092e9fd0a8928dcbf693e4aa2')
    -- empreintes:fin
      ) as e(nom, empreinte)
     where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = e.nom and md5(replace(p.prosrc, chr(13), '')) = e.empreinte)
    union all
    select 'declencheur_absent', 'Déclencheur des règles absent ou désactivé', d.nom
      from (values ('agences_etape_journal'), ('agences_etape_relances'), ('agences_suit_son_secteur'), ('activites_touche_agence'),
                   ('activites_relance_continue'), ('messages_rattacher_agence')) as d(nom)
     where not exists (select 1 from pg_trigger t where t.tgname = d.nom and t.tgenabled <> 'D')
  )
  select code, min(libelle), count(*)::integer, string_agg(nom, ' · ' order by nom) filter (where nom is not null)
    from ecarts group by code
$$;
grant execute on function public.sante_demarchage() to authenticated;

-- Les appels lancés sur des agences DÉJÀ passées en apporteur : clos de la même façon.
update public.activites x set resultat = 'apporteur'
  from public.agences a where a.id = x.agence_id and a.type = 'apporteur' and x.type = 'appel' and x.resultat = 'lance';

-- Contrôle : doit lister au plus les appels à compléter (appel_non_note), et RIEN d'autre — surtout pas regle_modifiee.
select code, nombre, left(exemples, 200) as exemples from public.sante_demarchage();
