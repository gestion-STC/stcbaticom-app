-- ============================================================================
--  À COLLER DANS LE PROJET **STCBATICOM** (ifvrmsiwlwppinfdmeao).
--
--  La relance des intéressés devient RÉGLABLE (Mahdi, 12/10/2026) : « les prospects
--  arrivent dans 7 jours dans À rappeler aujourd'hui ; je veux pouvoir mettre 15 jours,
--  un mois ». Le délai se lit dans Réglages › Objectifs et script (clé
--  `relance_interesse_jours` de la table parametres) ; sans réglage, 7 jours comme avant.
--  La fonction appel_enregistrer est reposée à l'identique, à cette ligne près.
--  Ré-exécutable sans danger.
-- ============================================================================
do $$ begin
  if to_regclass('public.agences') is null or to_regclass('public.parametres') is null then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans STCBATICOM (ifvrmsiwlwppinfdmeao).';
  end if;
end $$;

insert into public.parametres (cle, valeur) select 'relance_interesse_jours', '7' where not exists (select 1 from public.parametres where cle = 'relance_interesse_jours');

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
  -- Réglable (12/10/2026) : Réglages › Objectifs et script ; 7 jours si rien n'est réglé.
  v_relance_jours integer := coalesce((select valeur::integer from public.parametres where cle = 'relance_interesse_jours' and valeur ~ '^[0-9]+$' and valeur::integer between 1 and 365), 7);
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
      values (p_agence_id, p_contact_id, 'tache', now(), (date_trunc('day', now() at time zone 'Europe/Paris') + (v_relance_jours || ' days')::interval + interval '10 hours') at time zone 'Europe/Paris', v_compte, p_compte_nom,
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
      values (p_agence_id, p_contact_id, 'tache', now(), coalesce(p_rappel_le, (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day 10 hours') at time zone 'Europe/Paris'), v_compte, p_compte_nom,
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

-- Contrôle
select cle, valeur from public.parametres where cle = 'relance_interesse_jours';
