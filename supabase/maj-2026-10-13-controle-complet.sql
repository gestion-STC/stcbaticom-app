-- ═══════════════════════════════════════════════════════════════════════════
--  13/10/2026 — Contrôle complet du démarchage : corrections
--
--  1. Sommeil : 6 tentatives sans gestionnaire → l'agence dort 30 jours (60 avant).
--     Les agences déjà endormies se réveillent 30 jours après leur endormissement.
--  2. Matrice jouée (43 cas) : deux écarts corrigés ici même —
--     · « pas intéressée » qui redemande à être rappelée : le rappel était effacé → elle repasse « gestionnaire joint » ;
--     · réveillée, appelée sans réponse : elle se rendort 30 jours (avant : elle revenait tous les 5 jours).
--  3. Un résultat noté deux fois (double clic, réseau qui coupe puis nouvel essai) ne crée plus
--     de deuxième appel ni de deuxième tâche.
--  4. Le cycle des intéressées ne casse plus : dernière tâche / RDV fait ou supprimé → relance posée ;
--     les RDV échus sont fermés par l'appel ; sortie = tâches ET RDV fermés ; délai par défaut 10 jours.
--  5. « Agences sans secteur → démarchées par » remarche.
--  6. Une agence passée en apporteur d'affaires sort du démarchage : ses tâches
--     ouvertes sont fermées (1 cas : La Porte de Paris).
--
--  À coller en une fois dans l'éditeur SQL du projet Baticom. Rejouable.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Sommeil à 30 jours (le reste de la règle d'appel est inchangé).
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
  v_sommeil_apres constant integer := 6;
  v_sommeil_jours constant integer := 30; -- Mahdi, 13/10 : 30 jours (60 avant)
  v_relance_jours integer := coalesce((select valeur::integer from public.parametres where cle = 'relance_interesse_jours' and valeur ~ '^[0-9]+$' and valeur::integer between 1 and 365), 10);
  v_relance_le timestamptz;
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
  v_relance_le := (date_trunc('day', now() at time zone 'Europe/Paris') + (v_relance_jours || ' days')::interval + interval '10 hours') at time zone 'Europe/Paris';

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
      values (p_agence_id, p_contact_id, 'rdv', now(), coalesce(p_rdv_le, now() + interval '1 day'), v_compte, p_compte_nom,
              'RDV' || case when v_contact <> '' then ' avec ' || v_contact else '' end, coalesce(nullif(p_rdv_type, ''), 'telephone'), coalesce(p_source, 'session'))
      returning id into v_tache;
    elsif p_issue = 'a_rappeler' then
      -- Le gestionnaire demande à être rappelé : l'agence revient dans le circuit, même si elle était sortie.
      if a.etape in ('a_prospecter', 'endormie', 'pas_interesse', 'hors_cible') then v_etape := 'gestionnaire_joint'; end if;
      insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, source)
      values (p_agence_id, p_contact_id, 'tache', now(), coalesce(p_rappel_le, (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day 10 hours') at time zone 'Europe/Paris'), v_compte, p_compte_nom,
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

-- 2. Apporteur = sortie du démarchage.
create or replace function public.agences_etape_relances() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_relance_jours integer := coalesce((select valeur::integer from public.parametres where cle = 'relance_interesse_jours' and valeur ~ '^[0-9]+$' and valeur::integer between 1 and 365), 10);
begin
  -- Passée en apporteur d'affaires : elle sort du démarchage, plus aucune relance.
  if new.type = 'apporteur' and old.type is distinct from 'apporteur' then
    update public.activites set fait_le = now() where agence_id = new.id and type in ('tache', 'rdv') and fait_le is null;
    return new;
  end if;
  if new.etape is not distinct from old.etape then return new; end if;
  if new.etape in ('interesse', 'rdv_planifie')
     and not exists (select 1 from public.activites t where t.agence_id = new.id and t.type in ('tache', 'rdv') and t.fait_le is null) then
    insert into public.activites (agence_id, type, date, echeance, compte_id, compte_nom, titre, source)
    values (new.id, 'tache', now(),
            (date_trunc('day', now() at time zone 'Europe/Paris') + (v_relance_jours || ' days')::interval + interval '10 hours') at time zone 'Europe/Paris',
            auth.uid(), coalesce(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'nom', ''), 'Relancer', 'fiche');
  elsif new.etape in ('pas_interesse', 'hors_cible', 'client') then
    update public.activites set fait_le = now() where agence_id = new.id and type in ('tache', 'rdv') and fait_le is null;
  end if;
  return new;
end $$;
drop trigger if exists agences_etape_relances on public.agences;
create trigger agences_etape_relances after update of etape, type on public.agences
  for each row execute function public.agences_etape_relances();


-- 4. Le cycle des intéressées ne se casse plus : quand la dernière tâche ou le dernier RDV
--    d'une intéressée est fait ou supprimé (Fait coché à la main, Agenda, Aujourd'hui, rappel
--    de RDV), la relance suivante est posée à J + délai. Les fermetures faites par
--    appel_enregistrer ne comptent pas (il pose lui-même la suivante).
create or replace function public.activites_relance_continue() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_agence uuid := coalesce(new.agence_id, old.agence_id);
  v_relance_jours integer := coalesce((select valeur::integer from public.parametres where cle = 'relance_interesse_jours' and valeur ~ '^[0-9]+$' and valeur::integer between 1 and 365), 10);
begin
  if coalesce(current_setting('app.appel_en_cours', true), '') = '1' then return null; end if;
  if old.type not in ('tache', 'rdv') or old.fait_le is not null then return null; end if;
  if tg_op = 'UPDATE' and new.fait_le is null then return null; end if;
  if exists (select 1 from public.agences where id = v_agence and etape in ('interesse', 'rdv_planifie') and type <> 'apporteur')
     and not exists (select 1 from public.activites t where t.agence_id = v_agence and t.type in ('tache', 'rdv') and t.fait_le is null) then
    insert into public.activites (agence_id, type, date, echeance, compte_id, compte_nom, titre, source)
    values (v_agence, 'tache', now(),
            (date_trunc('day', now() at time zone 'Europe/Paris') + (v_relance_jours || ' days')::interval + interval '10 hours') at time zone 'Europe/Paris',
            auth.uid(), coalesce(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'nom', ''), 'Relancer', 'fiche');
  end if;
  return null;
end $$;
drop trigger if exists activites_relance_continue on public.activites;
create trigger activites_relance_continue after update of fait_le or delete on public.activites
  for each row execute function public.activites_relance_continue();

-- 4b. « Remettre à faire » ne rouvre rien sur une agence sortie (pas intéressée, hors cible, cliente, apporteur).
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

-- 5. « Agences sans secteur → démarchées par » (Réglages › Secteurs) : remarchait le 11/10,
--    cassé par la version du 13/10 (0 agence attribuée). Le secteur fait toujours foi.
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

-- 1b. Les endormies : réveil ramené à 30 jours après la date où elles se sont endormies.
update public.agences set reveil_le = least(reveil_le, (etape_depuis at time zone 'Europe/Paris')::date + 30)
 where etape = 'endormie' and reveil_le is not null and etape_depuis is not null;

-- 2b. Le cas existant.
update public.activites t set fait_le = now()
  from public.agences a
 where a.id = t.agence_id and a.type = 'apporteur' and t.type = 'tache' and t.fait_le is null;

-- Contrôle : endormies qui dorment plus de 30 jours (doit être 0) ; tâches ouvertes d'apporteurs (0).
select
  (select count(*) from public.agences where etape = 'endormie' and reveil_le > (etape_depuis at time zone 'Europe/Paris')::date + 30) as sommeil_trop_long,
  (select count(*) from public.agences a join public.activites t on t.agence_id = a.id where a.type = 'apporteur' and t.type = 'tache' and t.fait_le is null) as taches_apporteurs;
