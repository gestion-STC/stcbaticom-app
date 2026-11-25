-- ════════════════════════════════════════════════════════════════════════════
-- FICHES ET APPELS (25/11/2026) — à coller en entier dans l'éditeur SQL Supabase (Baticom).
-- Additif : aucun drop. Les fonctions existantes sont recopiées de la base, avec le minimum de changement.
--   1. agences_fusionner      : la fusion de deux fiches déplace TOUT, en une transaction (nouvelle).
--   2. leads_depuis_mail      : se tait pendant une fusion (les mails déplacés ne sont pas de nouvelles réponses).
--   3. appel_enregistrer      : un résultat d'appel ne ferme plus que ce qui est ÉCHU (plus les RDV à venir du jour).
--      + sante_demarchage     : son empreinte de appel_enregistrer est mise à jour (sinon « règle modifiée »).
--   4. client_signale_confirmer : « C'est elle » / « Créer l'agence cliente » en une transaction (nouvelle).
--   5. Les 8 analyses d'appel en erreur depuis le 13/11 (crédit IA épuisé) : remises en attente.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 2. leads_depuis_mail : le drapeau de fusion (une ligne ajoutée) ──
create or replace function public.leads_depuis_mail()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE' and old.agence_id is not distinct from new.agence_id then return new; end if;
  -- Fusion de deux fiches (25/11/2026) : les mails déplacés ne sont pas de nouvelles réponses.
  if current_setting('app.fusion_en_cours', true) = '1' then return new; end if;
  perform public.lead_depuis_message(new.id);
  return new;
end $function$;

-- ── 1. agences_fusionner ──
-- Toutes les tables liées à une agence (pg_constraint au 25/11/2026) : activites, appels_ia, clients_signales,
-- contacts, leads_demarchage, liens_suivis, messages, archive.prospect_agence, archive.prospects_conversion ;
-- et les colonnes texte contact_ref (= id de l'agence) : cmp_inscriptions, cmp_envois, cmp_evenements, cmp_taches,
-- cmp_progression, cmp_reponses, cmp_textes_ia.
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
begin
  if not public.est_membre() then raise exception 'Fusion réservée aux membres de l''équipe.' using errcode = '42501'; end if;
  if p_garder is null or p_supprimer is null or p_garder = p_supprimer then raise exception 'Il faut deux fiches différentes.'; end if;
  -- Les deux fiches verrouillées, toujours dans le même ordre (deux fusions croisées ne se bloquent pas).
  perform 1 from public.agences where id in (p_garder, p_supprimer) order by id for update;
  if not exists (select 1 from public.agences where id = p_garder) then raise exception 'La fiche à garder est introuvable.'; end if;
  if not exists (select 1 from public.agences where id = p_supprimer) then raise exception 'La fiche à fusionner est introuvable (déjà fusionnée ?).'; end if;
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
  perform set_config('app.fusion_en_cours', '', true);
  return v_bilan;
end $function$;
revoke all on function public.agences_fusionner(uuid, uuid) from public, anon;
grant execute on function public.agences_fusionner(uuid, uuid) to authenticated;

-- ── 3. appel_enregistrer : étape 1, seulement ce qui est échu (le reste est recopié de la base) ──
-- Cas réel : un RDV du 27/10 à 16 h fermé par un appel noté à 14 h 58. Avant : « echeance < v_fin_jour ».
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

-- Le contrôle de santé (sante_demarchage) compare chaque règle à son empreinte : celle de appel_enregistrer
-- est remplacée par l'empreinte de la nouvelle version (le reste de sante_demarchage est inchangé).
do $do$
declare
  v_def text;
  v_ancienne constant text := '4643e64638e09b991293bdf459f60179';
  v_nouvelle text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_nouvelle from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'appel_enregistrer';
  v_def := pg_get_functiondef('public.sante_demarchage()'::regprocedure);
  if position('''appel_enregistrer'', ''' || v_ancienne || '''' in v_def) > 0 then
    execute replace(v_def, '''appel_enregistrer'', ''' || v_ancienne || '''', '''appel_enregistrer'', ''' || v_nouvelle || '''');
  else
    raise notice 'sante_demarchage : empreinte de appel_enregistrer introuvable (déjà mise à jour ?), rien changé.';
  end if;
end $do$;

-- ── 4. client_signale_confirmer : « C'est elle » (p_agence_id donné) ou « Créer l'agence cliente » (p_agence_id nul) ──
-- Tout ou rien : l'agence (si elle est créée), le passage en cliente datée du premier OS, le gestionnaire en contact,
-- la note dans son fil, le signalement confirmé. Un second clic ne crée pas de doublon : le signalement est verrouillé,
-- et s'il est déjà confirmé, on renvoie l'agence déjà liée.
create or replace function public.client_signale_confirmer(
  p_id uuid, p_agence_id uuid default null, p_compte_nom text default '', p_nom text default '', p_nom_cle text default null, p_secteur text default null
) returns uuid
 language plpgsql
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  c public.clients_signales%rowtype;
  v_agence uuid := p_agence_id;
  v_date date;
  v_quoi text;
  v_nom text;
begin
  if not public.est_membre() then raise exception 'Réservé aux membres de l''équipe.' using errcode = '42501'; end if;
  select * into c from public.clients_signales where id = p_id for update;
  if not found then raise exception 'Ce client signalé est introuvable.'; end if;
  if c.statut = 'confirme' and c.agence_id is not null then return c.agence_id; end if; -- déjà fait (double clic, nouvel essai)
  if c.statut <> 'a_confirmer' then raise exception 'Ce client signalé a déjà été traité (%).', c.statut; end if;

  if v_agence is null then
    v_nom := trim(coalesce(p_nom, ''));
    if v_nom = '' then raise exception 'Le nom de l''agence à créer manque.'; end if;
    insert into public.agences (nom, nom_cle, secteur, telephone, email, source)
    values (v_nom, coalesce(p_nom_cle, lower(regexp_replace(v_nom, '\s+', ' ', 'g'))), nullif(p_secteur, ''), coalesce(c.telephones[1], ''), coalesce(c.email, ''), 'saisie')
    returning id into v_agence;
  elsif not exists (select 1 from public.agences where id = v_agence) then
    raise exception 'L''agence choisie est introuvable.';
  end if;

  -- Le jour LOCAL (Paris) du premier OS.
  v_date := coalesce((c.premier_os_le at time zone 'Europe/Paris')::date, (now() at time zone 'Europe/Paris')::date);
  perform public.agence_premier_os(v_agence, v_date, 'stc_batiment');

  if coalesce(c.email, '') <> '' and not exists (select 1 from public.contacts where agence_id = v_agence and lower(trim(email)) = lower(trim(c.email))) then
    insert into public.contacts (agence_id, prenom, nom, role, email, ligne_directe, mobile, note)
    values (v_agence,
            coalesce(substring(regexp_replace(trim(coalesce(c.nom, '')), '\s+', ' ', 'g') from '^\S+'), ''),
            coalesce(substring(regexp_replace(trim(coalesce(c.nom, '')), '\s+', ' ', 'g') from '^\S+ (.*)$'), ''),
            'gestionnaire', c.email, coalesce(c.telephones[1], ''),
            coalesce((select t from unnest(c.telephones) t where regexp_replace(t, '[\s.]', '', 'g') ~ '^(\+33|0)[67]' limit 1), ''),
            'Gestionnaire relevé sur les ordres de service STC Bâtiment.');
  end if;

  v_quoi := case when coalesce(c.premier_os_numero, '') <> '' then 'OS ' || c.premier_os_numero else 'ordre de service' end;
  insert into public.activites (agence_id, type, note, compte_nom, source)
  values (v_agence, 'note', 'Premier ' || v_quoi || ' reçu dans STC Bâtiment le ' || to_char(v_date, 'DD/MM/YYYY') || ' (' || coalesce(c.nb_os, 0) || ' OS au total). Confirmé par ' || coalesce(p_compte_nom, '') || '.',
          coalesce(p_compte_nom, ''), 'stc_batiment');

  update public.clients_signales set statut = 'confirme', agence_id = v_agence, decide_par = coalesce(p_compte_nom, ''), decide_le = now(), maj_le = now()
   where id = p_id;
  return v_agence;
end $function$;
revoke all on function public.client_signale_confirmer(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.client_signale_confirmer(uuid, uuid, text, text, text, text) to authenticated;

-- ── 5. Les analyses d'appel abandonnées le 13/11 (crédit IA épuisé, revenu depuis) ──
-- analyser-appel ne reprend que statut en_attente / erreur avec tentatives < 12 et prochain_essai passé : ces 8 lignes
-- (12 essais) n'étaient plus jamais reprises. Remises en attente, compteur à zéro ; la transcription déjà payée est gardée.
update public.appels_ia
   set statut = 'en_attente', tentatives = 0, prochain_essai = now(), erreur = null, verrou_le = null, maj_le = now()
 where statut = 'erreur' and tentatives >= 12 and erreur ilike '%credit balance is too low%';

-- ── Ce qui est en place ──
select 'Fusion de deux fiches (agences_fusionner)' as quoi,
       case when exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'agences_fusionner' and prosecdef) then 'en place' else 'ABSENTE' end as etat
union all
select 'Mails déplacés sans faux lead (leads_depuis_mail)',
       case when exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'leads_depuis_mail' and prosrc like '%app.fusion_en_cours%') then 'en place' else 'ABSENT' end
union all
select 'Un appel ne ferme que ce qui est échu (appel_enregistrer)',
       case when exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'appel_enregistrer' and prosrc like '%echeance <= now()%' and prosrc not like '%echeance < v_fin_jour%') then 'en place' else 'ABSENT' end
union all
select 'Contrôle de santé à jour (aucune règle signalée modifiée)',
       case when exists (select 1 from public.sante_demarchage() s where s.code = 'regle_modifiee') then 'NON : règle signalée modifiée' else 'oui' end
union all
select 'Confirmer un client signalé en une fois (client_signale_confirmer)',
       case when exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'client_signale_confirmer') then 'en place' else 'ABSENTE' end
union all
select 'Analyses d''appel encore en erreur définitive',
       (select count(*)::text from public.appels_ia where statut = 'erreur' and tentatives >= 12) || ' (attendu : 0)'
union all
select 'Analyses d''appel remises en attente (reprises 4 toutes les 2 min)',
       (select count(*)::text from public.appels_ia where statut in ('en_attente', 'en_cours') and transcription is not null);
