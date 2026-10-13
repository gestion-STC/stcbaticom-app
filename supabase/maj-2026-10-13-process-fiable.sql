-- ═══════════════════════════════════════════════════════════════════════════
--  13/10/2026 — Le process de Mahdi, écrit dans la base
--
--  « À prospecter : jamais appelées d'abord. Dès qu'elles sont intéressées, elles
--    sortent de la prospection et reviennent dans « À rappeler aujourd'hui » tous
--    les 10 jours jusqu'à la signature. »
--
--  1. Un appel noté FERME le rappel du jour (avant : la tâche restait ouverte,
--     l'agence restait dans « À rappeler aujourd'hui » et serait rappelée tous les
--     jours). Règle : à chaque résultat noté, les tâches échues (aujourd'hui ou en
--     retard) sont faites.
--  2. Une agence INTÉRESSÉE (ou RDV planifié) appelée, quel que soit le résultat
--     (pas de réponse, standard, joint) : sa relance est reposée à J + le délai
--     de Réglages (10 jours), toutes ses anciennes relances sont fermées. Elle
--     revient donc dans « À rappeler aujourd'hui » tous les 10 jours, jusqu'à
--     « Pas intéressé », « Faux numéro » ou client.
--  3. Pas intéressé / faux numéro : toutes les tâches ouvertes sont fermées.
--  4. Les compteurs : « N appels » et « dernier appel » ne comptent que les appels
--     SORTANTS (comme la fiche) ; les tentatives sont recalculées depuis le fil
--     (12 agences portaient un chiffre de l'ancien logiciel).
--
--  À coller en une fois dans l'éditeur SQL du projet Baticom. Rejouable.
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_sommeil_jours constant integer := 60;
  v_relance_jours integer := coalesce((select valeur::integer from public.parametres where cle = 'relance_interesse_jours' and valeur ~ '^[0-9]+$' and valeur::integer between 1 and 365), 7);
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
  v_relance_le := (date_trunc('day', now() at time zone 'Europe/Paris') + (v_relance_jours || ' days')::interval + interval '10 hours') at time zone 'Europe/Paris';

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
   where agence_id = p_agence_id and type = 'tache' and fait_le is null and echeance < v_fin_jour;
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
      a.reveil_le := current_date + v_sommeil_jours;
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

  -- 3. Sortie du démarchage : plus rien de prévu.
  if v_etape in ('pas_interesse', 'hors_cible') then
    update public.activites set fait_le = now() where agence_id = p_agence_id and type = 'tache' and fait_le is null;
  end if;

  update public.agences set
    tentatives = a.tentatives, joint_fois = a.joint_fois, reveil_le = a.reveil_le,
    motif = case when v_etape = 'pas_interesse' then a.motif else motif end,
    etape = v_etape, derniere_activite_le = now()
  where id = p_agence_id;

  return jsonb_build_object('appel_id', v_appel, 'tache_id', v_tache, 'etape', v_etape, 'tentatives', a.tentatives, 'joint_fois', a.joint_fois);
end $$;
grant execute on function public.appel_enregistrer(uuid, uuid, text, text, text, text, text, integer, text, timestamptz, timestamptz, text, text, text, uuid) to authenticated;

-- 4a. Les compteurs de la vue : appels SORTANTS seulement (comme l'en-tête de la fiche).
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

-- 4b. Les tentatives recalculées depuis le fil : appels sans gestionnaire depuis le dernier « joint ».
update public.agences a set tentatives = r.t
  from (select g.id,
               (select count(*) from public.activites x where x.agence_id = g.id and x.type = 'appel' and x.sens <> 'entrant'
                   and x.resultat in ('pas_de_reponse', 'standard')
                   and x.date > coalesce((select max(y.date) from public.activites y where y.agence_id = g.id and y.type = 'appel' and y.sens <> 'entrant' and y.resultat = 'joint'), '-infinity'::timestamptz)) as t
          from public.agences g) r
 where r.id = a.id and a.tentatives is distinct from r.t;

-- 5. Un changement d'étape À LA MAIN suit le même process :
--    → Intéressé / RDV planifié sans rien de prévu : relance posée à J + délai (10 jours) ;
--    → Pas intéressé / Hors cible / Client : plus aucune relance ouverte.
create or replace function public.agences_etape_relances() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_relance_jours integer := coalesce((select valeur::integer from public.parametres where cle = 'relance_interesse_jours' and valeur ~ '^[0-9]+$' and valeur::integer between 1 and 365), 7);
begin
  if new.etape is not distinct from old.etape then return new; end if;
  if new.etape in ('interesse', 'rdv_planifie')
     and not exists (select 1 from public.activites t where t.agence_id = new.id and t.type in ('tache', 'rdv') and t.fait_le is null) then
    insert into public.activites (agence_id, type, date, echeance, compte_id, compte_nom, titre, source)
    values (new.id, 'tache', now(),
            (date_trunc('day', now() at time zone 'Europe/Paris') + (v_relance_jours || ' days')::interval + interval '10 hours') at time zone 'Europe/Paris',
            auth.uid(), coalesce(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'nom', ''), 'Relancer', 'fiche');
  elsif new.etape in ('pas_interesse', 'hors_cible', 'client') then
    update public.activites set fait_le = now() where agence_id = new.id and type = 'tache' and fait_le is null;
  end if;
  return new;
end $$;
drop trigger if exists agences_etape_relances on public.agences;
create trigger agences_etape_relances after update of etape on public.agences
  for each row execute function public.agences_etape_relances();

-- Contrôle : 0 et 0.
select
  (select count(*) from public.agences a where a.tentatives <> (select count(*) from public.activites x where x.agence_id = a.id and x.type = 'appel' and x.sens <> 'entrant' and x.resultat in ('pas_de_reponse', 'standard') and x.date > coalesce((select max(y.date) from public.activites y where y.agence_id = a.id and y.type = 'appel' and y.sens <> 'entrant' and y.resultat = 'joint'), '-infinity'::timestamptz))) as tentatives_fausses,
  (select count(*) from public.agences a where a.joint_fois <> (select count(*) from public.activites x where x.agence_id = a.id and x.type = 'appel' and x.sens <> 'entrant' and x.resultat = 'joint')) as joints_faux;
