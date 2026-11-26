-- LOT F5 (27/11/2026) — démarchage : rappels, fusion d'agences, jours ouvrés, lead du jour même.
-- Rien n'est supprimé. Rejouable sans effet (idempotent). Une seule transaction.
-- À COLLER AVANT LA FUSION DE LA PR : l'écran de la fusion annonce les champs repris, et la barre de résultat
-- compte sur la base pour reposer le rappel (sans ce SQL, rien ne casse, mais le rappel disparaît comme avant).
--   A. D52 (décision 6) : jour_ferie() + demarchage_echeance() : une relance ou un rappel calculés par la base
--      passent au jour ouvré suivant (samedi, dimanche, fériés). Une date tapée à la main reste telle quelle.
--   B. D41 (décision 3) : appel_enregistrer : un « pas de réponse » ou un « standard » sur un rappel échu
--      repose ce rappel au jour ouvré suivant, à l'heure des relances (sauf agence qui s'endort).
--      Un RDV n'était déjà fermé que s'il est passé (correctif du 25/11, inchangé).
--   C. D42 (décision 4) : appel_verifier et demarchage_repos : un lead ouvert né après le dernier appel de la
--      fiche peut être appelé le jour même (les deux règles disent la même chose).
--   D. D48 (décision 5) : agences_fusionner reporte les champs de la fiche qui disparaît sur la fiche gardée.
--   E. Rattrapage D41 : les 23 agences dont le rappel a été fermé par un « pas de réponse » ou un « standard »
--      depuis le 15/10, sans aucune suite (ni tâche ouverte, ni appel depuis) : leur rappel est reposé au
--      prochain jour ouvré, à l'heure des relances. Rien n'est supprimé ni modifié sur l'ancien rappel.
--   F. Rattrapage D52 : les relances automatiques à venir tombant un week-end ou un jour férié passent au
--      jour ouvré suivant (même heure).
--   G. sante_demarchage : empreintes des règles redéfinies mises à jour (sinon « règle modifiée »).
-- Le fichier de référence supabase/regles-demarchage.sql contient les mêmes définitions (A, B, C).
begin;

-- ── A. Jours ouvrés (D52) ──────────────────────────────────────────────────────────────────────────────
create or replace function public.jour_ferie(p_jour date) returns boolean
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  y integer := extract(year from p_jour)::integer;
  a integer := y % 19;
  b integer := y / 100;
  c integer := y % 100;
  d integer := b / 4;
  e integer := b % 4;
  f integer := (b + 8) / 25;
  g integer := (b - f + 1) / 3;
  h integer := (19 * a + b - d - g + 15) % 30;
  i integer := c / 4;
  k integer := c % 4;
  l integer := (32 + 2 * e + 2 * i - h - k) % 7;
  m integer := (a + 11 * h + 22 * l) / 451;
  v_paques date;
begin
  if to_char(p_jour, 'MM-DD') in ('01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25') then return true; end if;
  v_paques := make_date(y, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
  -- Lundi de Pâques, Ascension, lundi de Pentecôte.
  return p_jour in (v_paques + 1, v_paques + 39, v_paques + 50);
end $$;
grant execute on function public.jour_ferie(date) to authenticated;

create or replace function public.demarchage_echeance(p_jours integer) returns timestamptz
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_jour date := (now() at time zone 'Europe/Paris')::date + p_jours;
begin
  while extract(isodow from v_jour) in (6, 7) or public.jour_ferie(v_jour) loop
    v_jour := v_jour + 1;
  end loop;
  return (v_jour + make_interval(hours => public.reglage_demarchage('heure_relance'))) at time zone 'Europe/Paris';
end $$;

-- ── B. Le rappel sans réponse est reposé (D41) ─────────────────────────────────────────────────────────
create or replace function public.appel_enregistrer(p_agence_id uuid, p_contact_id uuid, p_resultat text, p_issue text default ''::text, p_motif text default ''::text, p_note text default ''::text, p_numero text default ''::text, p_duree_s integer default null::integer, p_call_id text default ''::text, p_rappel_le timestamp with time zone default null::timestamp with time zone, p_rdv_le timestamp with time zone default null::timestamp with time zone, p_rdv_type text default 'telephone'::text, p_compte_nom text default ''::text, p_source text default 'session'::text, p_appel_id uuid default null::uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
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
  v_rappel_titre text;
  v_rappel_contact uuid;
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

  -- Le rappel échu que cet appel vient honorer (le plus récent), avant qu'il ne soit marqué fait.
  select t.titre, t.contact_id into v_rappel_titre, v_rappel_contact from public.activites t
   where t.agence_id = p_agence_id and t.type = 'tache' and t.fait_le is null and t.echeance <= now() and t.titre like 'Rappeler%'
   order by t.echeance desc limit 1;

  -- 1. L'appel a eu lieu : ce qui est échu (rappel passé, en retard) est fait. Jamais un RDV ou un rappel à venir,
  --    même plus tard dans la journée (25/11/2026 : un RDV de 16 h était fermé par un appel de 14 h 58).
  update public.activites set fait_le = now()
   where agence_id = p_agence_id and type in ('tache', 'rdv') and fait_le is null and echeance <= now();
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
    elsif v_rappel_titre is not null and v_etape <> 'endormie' then
      -- 27/11/2026 (décision 3) : le rappel demandé par le gestionnaire tombe sur personne ou sur le standard :
      -- il est reposé au jour ouvré suivant, à l'heure des relances (avant, il disparaissait et l'agence
      -- retombait dans « À prospecter »). L'agence qui s'endort (6 tentatives) n'est plus rappelée.
      insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, source)
      values (p_agence_id, coalesce(p_contact_id, v_rappel_contact), 'tache', now(), public.demarchage_echeance(1), v_compte, p_compte_nom, v_rappel_titre, coalesce(p_source, 'session'))
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
end $function$;
grant execute on function public.appel_enregistrer(uuid, uuid, text, text, text, text, text, integer, text, timestamptz, timestamptz, text, text, text, uuid) to authenticated;

-- ── C. Le lead né après l'appel du jour (D42) ──────────────────────────────────────────────────────────
create or replace function public.demarchage_repos()
 returns table(agence_id uuid, raison text, du_jour boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
             or exists (select 1 from public.activites t, j where t.agence_id = a.id and t.type in ('tache', 'rdv') and t.fait_le is null and t.echeance < j.fin_jour)
             -- 25/11/2026 : un lead ouvert, ou une demande d'appel d'une campagne, n'attend pas la fin du repos.
             or exists (select 1 from public.leads_demarchage l where l.agence_id = a.id and l.statut = 'a_traiter')
             or exists (select 1 from public.cmp_taches k where k.contact_ref = a.id::text and k.type = 'appel' and k.faite_le is null) as exempte,
           -- 25/11/2026 : un rappel ou un RDV dû maintenant : la fiche passe, même déjà appelée aujourd'hui.
           exists (select 1 from public.activites t where t.agence_id = a.id and t.type in ('tache', 'rdv') and t.fait_le is null and t.echeance <= now())
             -- 27/11/2026 (décision 4) : un lead ouvert né APRÈS le dernier appel de la fiche passe aussi (même règle qu'appel_verifier).
             or exists (select 1 from public.leads_demarchage l where l.agence_id = a.id and l.statut = 'a_traiter'
                           and l.cree_le > coalesce((select max(x.date) from public.activites x where x.agence_id = a.id and x.type = 'appel' and x.sens <> 'entrant'), '-infinity'::timestamptz)) as du_maintenant
      from public.agences a
  ),
  raisons as (
    -- 1. Aujourd'hui : la fiche elle-même, ou son standard composé sur une autre fiche (sauf rappel dû maintenant).
    select g.id, 1 as ordre, true as du_jour,
           'Ce numéro a déjà été appelé aujourd''hui (par toi ou un collègue) : on ne le recompose pas.' as raison
      from g, j where not g.du_maintenant
                  and (exists (select 1 from ap where ap.agence_id = g.id and ap.date >= j.debut_jour)
                   or (length(g.tel) >= 9 and exists (select 1 from ap where ap.tel = g.tel and ap.date >= j.debut_jour)))
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
$function$;
grant execute on function public.demarchage_repos() to authenticated;

create or replace function public.appel_verifier(p_agence_id uuid, p_numero text, p_direct boolean default false)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  a public.agences%rowtype;
  v_tel text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g');
  v_debut_jour timestamptz := date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  v_lance timestamptz;
  v_raison text;
  v_du_maintenant boolean;
begin
  select * into a from public.agences where id = p_agence_id;
  if not found then return 'Agence introuvable.'; end if;

  select max(date) into v_lance from public.activites where agence_id = p_agence_id and type = 'appel' and resultat = 'lance';
  if v_lance is not null then
    return 'Note d''abord le résultat de l''appel du ' || to_char(v_lance at time zone 'Europe/Paris', 'DD/MM à HH24"h"MI') || '.';
  end if;

  -- 25/11/2026 : le rappel ou le RDV convenu pour maintenant passe, même si le numéro a déjà été composé aujourd'hui.
  v_du_maintenant := exists (select 1 from public.activites t where t.agence_id = p_agence_id and t.type in ('tache', 'rdv') and t.fait_le is null and t.echeance <= now())
    -- 27/11/2026 (décision 4) : un lead ouvert né APRÈS le dernier appel de la fiche (plaquette ouverte après l'appel) :
    -- on le rappelle le jour même (même règle que demarchage_repos).
    or exists (select 1 from public.leads_demarchage l where l.agence_id = p_agence_id and l.statut = 'a_traiter'
                  and l.cree_le > coalesce((select max(x.date) from public.activites x where x.agence_id = p_agence_id and x.type = 'appel' and x.sens <> 'entrant'), '-infinity'::timestamptz));
  if not v_du_maintenant and length(v_tel) >= 9 and exists (
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
end $function$;
grant execute on function public.appel_verifier(uuid, text, boolean) to authenticated;

-- ── D. La fusion reprend les champs (D48) ──────────────────────────────────────────────────────────────
-- ── D48 (décision 5) : la fusion de deux fiches reporte ce que savait celle qui disparaît ──────────────────────
-- Avant : contacts, appels, mails, leads… passaient sur la fiche gardée, mais pas les champs de la fiche
-- elle-même. Fusionner une cliente DANS une fiche « à prospecter » (District Saint-Germain-des-Prés) lui faisait
-- perdre l'étape cliente, le premier OS, le chargé d'affaires et la désinscription.
-- Désormais, sur la fiche gardée :
--   · l'étape cliente prime (si l'une des deux est cliente, la fiche gardée l'est) ; sinon on garde son étape,
--     sauf si elle était encore « à prospecter » : elle prend alors celle de l'autre fiche (avec son motif) ;
--   · le premier OS le plus ancien ; la désinscription (la plus ancienne) est conservée ;
--   · le chargé d'affaires de la fiche gardée, sinon celui de l'autre ;
--   · les champs vides (enseigne, adresse, standard, e-mail, site, secteur, compte ouvert…) complétés depuis l'autre ;
--   · le dernier signal le plus récent, les tentatives et les « joint » additionnés (ils suivent les appels déplacés).
create or replace function public.agences_fusionner(p_garder uuid, p_supprimer uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_garder text := p_garder::text;
  v_suppr text := p_supprimer::text;
  v_lead_garde uuid;
  v_lead_suppr uuid;
  v_nb integer;
  v_bilan jsonb := '{}'::jsonb;
  g public.agences%rowtype;
  z public.agences%rowtype;
  v_etape text;
  v_type text;
  v_de_l_autre boolean;
  v_commercial uuid;
begin
  if not public.est_membre() then raise exception 'Fusion réservée aux membres de l''équipe.' using errcode = '42501'; end if;
  if p_garder is null or p_supprimer is null or p_garder = p_supprimer then raise exception 'Il faut deux fiches différentes.'; end if;
  -- Les deux fiches verrouillées, toujours dans le même ordre (deux fusions croisées ne se bloquent pas).
  perform 1 from public.agences where id in (p_garder, p_supprimer) order by id for update;
  select * into g from public.agences where id = p_garder;
  if not found then raise exception 'La fiche à garder est introuvable.'; end if;
  select * into z from public.agences where id = p_supprimer;
  if not found then raise exception 'La fiche à fusionner est introuvable (déjà fusionnée ?).'; end if;
  perform set_config('app.fusion_en_cours', '1', true);

  -- Contacts : un seul contact principal (celui de la fiche gardée).
  update public.contacts set principal = false
   where agence_id = p_supprimer and principal and exists (select 1 from public.contacts where agence_id = p_garder and principal);
  update public.contacts set agence_id = p_garder where agence_id = p_supprimer;
  get diagnostics v_nb = row_count; v_bilan := v_bilan || jsonb_build_object('contacts', v_nb);

  update public.activites set agence_id = p_garder where agence_id = p_supprimer;
  get diagnostics v_nb = row_count; v_bilan := v_bilan || jsonb_build_object('activites', v_nb);

  -- Leads : un seul « à traiter » par agence. Le plus ancien reste ouvert (avec le signal le plus récent), l'autre est fermé.
  select id into v_lead_garde from public.leads_demarchage where agence_id = p_garder and statut = 'a_traiter';
  select id into v_lead_suppr from public.leads_demarchage where agence_id = p_supprimer and statut = 'a_traiter';
  if v_lead_garde is not null and v_lead_suppr is not null then
    update public.leads_demarchage l set dernier_signal_le = (select max(dernier_signal_le) from public.leads_demarchage where id in (v_lead_garde, v_lead_suppr))
     where l.id = (select id from public.leads_demarchage where id in (v_lead_garde, v_lead_suppr) order by cree_le, id limit 1);
    update public.leads_demarchage set statut = 'traite', traite_le = now(), traite_par = auth.uid(), resultat = 'fusion'
     where id = (select id from public.leads_demarchage where id in (v_lead_garde, v_lead_suppr) order by cree_le desc, id desc limit 1);
  end if;
  update public.leads_demarchage set agence_id = p_garder where agence_id = p_supprimer;
  get diagnostics v_nb = row_count; v_bilan := v_bilan || jsonb_build_object('leads', v_nb);

  update public.messages set agence_id = p_garder where agence_id = p_supprimer;
  get diagnostics v_nb = row_count; v_bilan := v_bilan || jsonb_build_object('messages', v_nb);

  update public.appels_ia set agence_id = p_garder where agence_id = p_supprimer;
  get diagnostics v_nb = row_count; v_bilan := v_bilan || jsonb_build_object('appels_ia', v_nb);

  -- Les liens des mails déjà envoyés (jeton inchangé) : ils continuent de marcher, vers la fiche gardée.
  update public.liens_suivis set agence_id = p_garder where agence_id = p_supprimer;
  get diagnostics v_nb = row_count; v_bilan := v_bilan || jsonb_build_object('liens_suivis', v_nb);

  update public.clients_signales set agence_id = p_garder, maj_le = now() where agence_id = p_supprimer;
  get diagnostics v_nb = row_count; v_bilan := v_bilan || jsonb_build_object('clients_signales', v_nb);

  -- Campagnes : une inscription par campagne et par fiche. Si les deux étaient inscrites à la même campagne,
  -- on garde celle de la fiche gardée ; un désabonnement ou un rebond de l'autre lui est reporté (plus d'envoi),
  -- et les envois de l'autre lui sont rattachés avant que l'inscription en double soit retirée.
  update public.cmp_inscriptions ig set statut = iz.statut, sortie_le = coalesce(iz.sortie_le, now())
    from public.cmp_inscriptions iz
   where iz.contact_ref = v_suppr and ig.contact_ref = v_garder and ig.campagne_id = iz.campagne_id
     and iz.statut in ('desinscrit', 'rebond') and ig.statut not in ('desinscrit', 'rebond');
  update public.cmp_envois e set inscription_id = ig.id
    from public.cmp_inscriptions iz join public.cmp_inscriptions ig on ig.campagne_id = iz.campagne_id and ig.contact_ref = v_garder
   where iz.contact_ref = v_suppr and e.inscription_id = iz.id;
  delete from public.cmp_inscriptions iz
   where iz.contact_ref = v_suppr and exists (select 1 from public.cmp_inscriptions ig where ig.campagne_id = iz.campagne_id and ig.contact_ref = v_garder);
  update public.cmp_inscriptions set contact_ref = v_garder where contact_ref = v_suppr;
  get diagnostics v_nb = row_count; v_bilan := v_bilan || jsonb_build_object('cmp_inscriptions', v_nb);
  update public.cmp_envois set contact_ref = v_garder where contact_ref = v_suppr;
  get diagnostics v_nb = row_count; v_bilan := v_bilan || jsonb_build_object('cmp_envois', v_nb);
  update public.cmp_evenements set contact_ref = v_garder where contact_ref = v_suppr;
  get diagnostics v_nb = row_count; v_bilan := v_bilan || jsonb_build_object('cmp_evenements', v_nb);
  update public.cmp_taches set contact_ref = v_garder where contact_ref = v_suppr;
  get diagnostics v_nb = row_count; v_bilan := v_bilan || jsonb_build_object('cmp_taches', v_nb);
  update public.cmp_reponses set contact_ref = v_garder where contact_ref = v_suppr;
  delete from public.cmp_progression pz
   where pz.contact_ref = v_suppr and exists (select 1 from public.cmp_progression pg where pg.campagne_id = pz.campagne_id and pg.etape_id = pz.etape_id and pg.contact_ref = v_garder);
  update public.cmp_progression set contact_ref = v_garder where contact_ref = v_suppr;
  delete from public.cmp_textes_ia tz
   where tz.contact_ref = v_suppr and exists (select 1 from public.cmp_textes_ia tg where tg.campagne_id = tz.campagne_id and tg.variante_id = tz.variante_id and tg.contact_ref = v_garder);
  update public.cmp_textes_ia set contact_ref = v_garder where contact_ref = v_suppr;

  -- Les archives (anciens prospects) suivent aussi.
  delete from archive.prospect_agence pz
   where pz.agence_id = p_supprimer and exists (select 1 from archive.prospect_agence pg where pg.prospect_id = pz.prospect_id and pg.agence_id = p_garder);
  update archive.prospect_agence set agence_id = p_garder where agence_id = p_supprimer;
  update archive.prospects_conversion set agence_id = p_garder where agence_id = p_supprimer;

  -- Plus rien n'est rattaché à l'ancienne fiche : elle disparaît.
  delete from public.agences where id = p_supprimer;

  -- 27/11/2026 (décision 5) : ce que savait la fiche disparue est reporté sur la fiche gardée.
  v_type := g.type;
  if z.etape = 'client' and g.etape <> 'client' then
    v_etape := 'client';
    v_type := z.type; -- la fiche cliente est l'agence (l'autre pouvait être notée apporteur)
  elsif g.etape = 'a_prospecter' and z.etape <> 'a_prospecter' and g.type <> 'apporteur' then
    v_etape := z.etape;
  else
    v_etape := g.etape;
  end if;
  v_de_l_autre := v_etape is distinct from g.etape;
  perform set_config('app.source', 'fusion', true);
  update public.agences set
    etape = v_etape,
    type = v_type,
    motif = case when v_de_l_autre then z.motif else motif end,
    reveil_le = case when v_de_l_autre then z.reveil_le else reveil_le end,
    premier_os_le = least(g.premier_os_le, z.premier_os_le),
    ne_plus_ecrire_le = least(g.ne_plus_ecrire_le, z.ne_plus_ecrire_le),
    compte_ouvert_le = coalesce(g.compte_ouvert_le, z.compte_ouvert_le),
    compte_email = coalesce(nullif(g.compte_email, ''), z.compte_email),
    dernier_signal_le = case when z.dernier_signal_le > coalesce(g.dernier_signal_le, '-infinity'::timestamptz) then z.dernier_signal_le else g.dernier_signal_le end,
    dernier_signal = case when z.dernier_signal_le > coalesce(g.dernier_signal_le, '-infinity'::timestamptz) then z.dernier_signal else g.dernier_signal end,
    derniere_activite_le = greatest(g.derniere_activite_le, z.derniere_activite_le),
    tentatives = g.tentatives + z.tentatives,
    joint_fois = g.joint_fois + z.joint_fois,
    secteur = coalesce(g.secteur, z.secteur),
    enseigne = coalesce(nullif(g.enseigne, ''), z.enseigne),
    adresse = coalesce(nullif(g.adresse, ''), nullif(z.adresse, ''), g.adresse),
    arrondissement = coalesce(nullif(g.arrondissement, ''), nullif(z.arrondissement, ''), g.arrondissement),
    logo_url = coalesce(nullif(g.logo_url, ''), nullif(z.logo_url, ''), g.logo_url),
    telephone = coalesce(nullif(g.telephone, ''), z.telephone),
    email = coalesce(nullif(g.email, ''), z.email),
    site = coalesce(nullif(g.site, ''), z.site),
    numero_emission = coalesce(nullif(g.numero_emission, ''), z.numero_emission),
    source = coalesce(nullif(g.source, ''), z.source),
    nb_lots = case when g.nb_lots = 0 then z.nb_lots else g.nb_lots end,
    prospect_id = coalesce(g.prospect_id, z.prospect_id),
    fichier_id = coalesce(g.fichier_id, z.fichier_id)
  where id = p_garder;
  -- Le chargé d'affaires : à part, pour que le secteur complété ci-dessus ne le remplace pas.
  v_commercial := coalesce(g.commercial_id, z.commercial_id);
  if v_commercial is not null then
    update public.agences set commercial_id = v_commercial where id = p_garder and commercial_id is distinct from v_commercial;
  end if;
  v_bilan := v_bilan || jsonb_build_object('etape', v_etape);

  perform set_config('app.fusion_en_cours', '', true);
  return v_bilan;
end $function$;

-- ── E. Rattrapage D41 : un rappel reposé pour les agences perdues dans « À prospecter » ─────────────────
-- Le dernier rappel « Rappeler… » fermé depuis le 15/10 par un appel « pas de réponse » ou « standard »,
-- sur une agence encore en démarchage, sans tâche ni RDV ouverts et sans aucun appel depuis.
-- Reposé au prochain jour ouvré à l'heure des relances, même titre, même contact, même auteur.
-- Rejouable : une fois reposé, la tâche ouverte écarte l'agence.
insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, note, source)
select distinct on (t.agence_id)
       t.agence_id, t.contact_id, 'tache', now(), public.demarchage_echeance(1), t.compte_id, t.compte_nom, t.titre,
       'Rappel reposé le ' || to_char(now() at time zone 'Europe/Paris', 'DD/MM') || ' : le précédent (prévu le '
         || to_char(t.echeance at time zone 'Europe/Paris', 'DD/MM') || ') avait été fermé par un appel sans gestionnaire le '
         || to_char(t.fait_le at time zone 'Europe/Paris', 'DD/MM') || '.',
       'rattrapage'
  from public.activites t
  join public.agences a on a.id = t.agence_id
 where t.type = 'tache' and t.titre like 'Rappeler%' and t.fait_le >= '2026-10-15'
   and a.type <> 'apporteur' and a.etape not in ('client', 'pas_interesse', 'hors_cible', 'endormie')
   and exists (select 1 from public.activites x where x.agence_id = t.agence_id and x.type = 'appel' and x.sens <> 'entrant'
                  and x.resultat in ('pas_de_reponse', 'standard') and x.date between t.fait_le - interval '1 day' and t.fait_le)
   and not exists (select 1 from public.activites o where o.agence_id = t.agence_id and o.type in ('tache', 'rdv') and o.fait_le is null)
   and not exists (select 1 from public.activites y where y.agence_id = t.agence_id and y.type = 'appel' and y.sens <> 'entrant' and y.date > t.fait_le)
 order by t.agence_id, t.fait_le desc;

-- ── F. Rattrapage D52 : les relances automatiques à venir posées un week-end ou un jour férié ──────────
-- (les relances « Relancer… » posées par la base, à l'heure des relances ; le reste, tapé à la main, ne bouge pas)
update public.activites t
   set echeance = (n.jour + (t.echeance at time zone 'Europe/Paris')::time) at time zone 'Europe/Paris'
  from (select x.id, (select min(j)::date from generate_series((x.echeance at time zone 'Europe/Paris')::date + 1, (x.echeance at time zone 'Europe/Paris')::date + 10, interval '1 day') j
                       where extract(isodow from j) not in (6, 7) and not public.jour_ferie(j::date)) as jour
          from public.activites x
         where x.type = 'tache' and x.fait_le is null and x.titre like 'Relancer%' and x.echeance > now()
           and extract(minute from (x.echeance at time zone 'Europe/Paris')) = 0
           and extract(hour from (x.echeance at time zone 'Europe/Paris')) = public.reglage_demarchage('heure_relance')
           and (extract(isodow from (x.echeance at time zone 'Europe/Paris')) in (6, 7) or public.jour_ferie((x.echeance at time zone 'Europe/Paris')::date))) n
 where t.id = n.id and n.jour is not null;

-- ── G. Le contrôle de santé (sante_demarchage) : empreintes des règles redéfinies ici ──────────────────
do $do$
declare
  v_def text;
  v_nom text;
  v_nouvelle text;
begin
  v_def := pg_get_functiondef('public.sante_demarchage()'::regprocedure);
  foreach v_nom in array array['appel_enregistrer', 'appel_verifier', 'demarchage_repos', 'demarchage_echeance'] loop
    select md5(replace(p.prosrc, chr(13), '')) into v_nouvelle from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = v_nom;
    if v_def !~ ('\(''' || v_nom || ''', ''[0-9a-f]{32}''\)') then
      raise notice 'sante_demarchage : pas d''empreinte pour %, rien changé pour elle.', v_nom;
    end if;
    v_def := regexp_replace(v_def, '\(''' || v_nom || ''', ''[0-9a-f]{32}''\)', '(''' || v_nom || ''', ''' || v_nouvelle || ''')');
  end loop;
  execute v_def;
end $do$;

commit;

-- ── Contrôle (chiffres attendus si collé le vendredi 27/11) ─────────────────────────────────────────────
select 'A. Prochain jour ouvré des relances (attendu : 30/11 10:00, un lundi = 1, si collé le 27/11)' as quoi,
       to_char(public.demarchage_echeance(1) at time zone 'Europe/Paris', 'DD/MM HH24:MI') || ' · jour ' || extract(isodow from public.demarchage_echeance(1) at time zone 'Europe/Paris') as valeur
union all
select 'A. Jours fériés reconnus (attendu : 4 = 25/12/2026, 29/03/2027, 06/05/2027, 17/05/2027)',
       (select count(*)::text from (values ('2026-12-25'::date), ('2027-03-29'), ('2027-05-06'), ('2027-05-17')) v(j) where public.jour_ferie(j))
union all
select 'B. Le rappel sans réponse est reposé (appel_enregistrer)',
       case when exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'appel_enregistrer' and prosrc like '%v_rappel_titre%') then 'en place' else 'ABSENT' end
union all
select 'C. Lead né après l''appel : appelable le jour même (appel_verifier, demarchage_repos)',
       case when (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('appel_verifier', 'demarchage_repos') and prosrc like '%l.cree_le >%') = 2 then 'en place' else 'ABSENT' end
union all
select 'D. La fusion reprend les champs (agences_fusionner)',
       case when exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'agences_fusionner' and prosrc like '%premier_os_le = least(g.premier_os_le, z.premier_os_le)%') then 'en place' else 'ABSENT' end
union all
select 'E. Rappels reposés par le rattrapage (attendu : 23)',
       (select count(*)::text from public.activites where source = 'rattrapage' and type = 'tache' and titre like 'Rappeler%' and note like 'Rappel reposé le %')
union all
select 'E. Dont encore ouverts (attendu : 23, tant que personne ne les a traités)',
       (select count(*)::text from public.activites where source = 'rattrapage' and type = 'tache' and titre like 'Rappeler%' and note like 'Rappel reposé le %' and fait_le is null)
union all
select 'F. Relances automatiques à venir encore un week-end ou un jour férié (attendu : 0)',
       (select count(*)::text from public.activites x where x.type = 'tache' and x.fait_le is null and x.titre like 'Relancer%' and x.echeance > now()
          and extract(minute from (x.echeance at time zone 'Europe/Paris')) = 0
          and extract(hour from (x.echeance at time zone 'Europe/Paris')) = public.reglage_demarchage('heure_relance')
          and (extract(isodow from (x.echeance at time zone 'Europe/Paris')) in (6, 7) or public.jour_ferie((x.echeance at time zone 'Europe/Paris')::date)))
union all
select 'G. Contrôle de santé à jour (attendu : oui)',
       case when exists (select 1 from public.sante_demarchage() s where s.code = 'regle_modifiee') then 'NON : règle signalée modifiée' else 'oui' end;
