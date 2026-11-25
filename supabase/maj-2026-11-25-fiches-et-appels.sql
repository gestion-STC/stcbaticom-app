-- ════════════════════════════════════════════════════════════════════════════
-- FICHES ET APPELS (25/11/2026) — à coller en entier dans l'éditeur SQL Supabase (Baticom).
-- Additif : aucun drop. Les fonctions existantes sont recopiées de la base, avec le minimum de changement.
--   1. agences_fusionner      : la fusion de deux fiches déplace TOUT, en une transaction (nouvelle).
--   2. leads_depuis_mail      : se tait pendant une fusion (les mails déplacés ne sont pas de nouvelles réponses).
--   3. appel_enregistrer      : un résultat d'appel ne ferme plus que ce qui est ÉCHU (plus les RDV à venir du jour).
--      + sante_demarchage     : son empreinte de appel_enregistrer est mise à jour (sinon « règle modifiée »).
--   4. client_signale_confirmer : « C'est elle » / « Créer l'agence cliente » en une transaction (nouvelle).
--   5. Les 8 analyses d'appel en erreur depuis le 13/11 (crédit IA épuisé) : remises en attente.
--  10. appel_verifier + demarchage_repos : un rappel ou un RDV dû maintenant passe, même déjà appelée aujourd'hui.
--  11. demarchage_repos : un lead ouvert ou une demande d'appel de campagne ne sont plus refusés pour « repos ».
--  12. message_agence_probable (nouvelle) + messages_rattacher_agence : un mail reçu d'une adresse sur plusieurs
--      fiches va sur la fiche du dernier mail envoyé ; rattrapage des mails reçus depuis le 01/11.
--  13. leads_suivre_appel : un lead arrivé pendant l'appel est fermé par le résultat de cet appel.
--  14. appels_ia : les mails de suivi partis avant le 05/11 sont notés envoyés (99 lignes, 93 « Mail prêt »).
--      + sante_demarchage : empreintes mises à jour pour les règles redéfinies (sinon « règle modifiée »).
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

-- ── 10 et 11. Le repos : le rappel dû passe ce jour-là ; un lead ou une demande de campagne n'attend pas ──
-- demarchage_repos (recopiée de la base) : deux changements, signalés « 25/11/2026 ».
--   · g.du_maintenant : une tâche ou un RDV dû MAINTENANT (échéance passée, pas fait). Le repos « du jour »
--     (déjà appelée aujourd'hui) ne vaut plus pour elle : le rappel convenu ce matin pour 15 h passe à 15 h.
--   · g.exempte : aussi un lead ouvert (leads_demarchage à traiter) ou une demande d'appel de campagne ouverte.
-- pile_demarchage n'a pas besoin de changer : elle retire les fiches d'après cette fonction (r.du_jour).
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
           exists (select 1 from public.activites t where t.agence_id = a.id and t.type in ('tache', 'rdv') and t.fait_le is null and t.echeance <= now()) as du_maintenant
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

-- appel_verifier (recopiée de la base) : le refus « déjà appelé aujourd'hui » ne vaut plus pour une fiche
-- qui a un rappel ou un RDV dû maintenant (il passait AVANT tout autre test, même en appel direct).
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
  v_du_maintenant := exists (select 1 from public.activites t where t.agence_id = p_agence_id and t.type in ('tache', 'rdv') and t.fait_le is null and t.echeance <= now());
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

-- ── 12. Un mail reçu d'une adresse présente sur plusieurs fiches n'est plus perdu ──
-- L'agence probable d'un mail : 1) la réponse à un mail connu (in_reply_to) ; 2) l'adresse sur une seule fiche
-- (contacts, puis e-mail de l'agence : la règle d'avant) ; 3) sinon, l'agence du dernier mail envoyé à cette adresse
-- (parmi les fiches candidates s'il y en a).
create or replace function public.message_agence_probable(p_sens text, p_de text, p_a text, p_in_reply_to text, p_avant timestamptz default now())
 returns uuid
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_adresse text;
  v_agences uuid[];
  v uuid;
begin
  if coalesce(trim(p_in_reply_to), '') <> '' then
    select m.agence_id into v from public.messages m
     where m.message_id = trim(p_in_reply_to) and m.agence_id is not null order by m.created_at desc limit 1;
    if v is not null then return v; end if;
  end if;
  -- L'adresse de l'autre côté : le destinataire pour un envoi, l'expéditeur pour une réponse.
  v_adresse := lower(trim(split_part(split_part(case when p_sens = 'sortant' then p_a else p_de end, ' · ', 1), ',', 1)));
  if v_adresse ~ '<.+>' then v_adresse := substring(v_adresse from '<([^>]+)>'); end if;
  if v_adresse is null or position('@' in v_adresse) = 0 then return null; end if;

  select array_agg(distinct c.agence_id) into v_agences from public.contacts c where lower(trim(c.email)) = v_adresse;
  if coalesce(array_length(v_agences, 1), 0) = 0 then
    select array_agg(distinct g.id) into v_agences from public.agences g
     where g.type <> 'apporteur' and position(v_adresse in lower(coalesce(g.email, ''))) > 0;
  end if;
  if array_length(v_agences, 1) = 1 then return v_agences[1]; end if;

  -- Le repli « dernier mail envoyé » ne vaut que pour un mail reçu (un envoi sans fiche, une demande d'avis
  -- par exemple, reste sans fiche).
  if p_sens <> 'entrant' then return null; end if;
  select m.agence_id into v from public.messages m
   where m.sens = 'sortant' and m.agence_id is not null and m.created_at <= coalesce(p_avant, now())
     and position(v_adresse in lower(coalesce(m.a, ''))) > 0
     and (coalesce(array_length(v_agences, 1), 0) = 0 or m.agence_id = any (v_agences))
   order by m.created_at desc limit 1;
  return v;
end $function$;
revoke all on function public.message_agence_probable(text, text, text, text, timestamptz) from public, anon;
grant execute on function public.message_agence_probable(text, text, text, text, timestamptz) to authenticated;
create index if not exists messages_message_id_idx on public.messages (message_id);

-- messages_rattacher_agence (recopiée de la base) : la recherche passe par message_agence_probable.
create or replace function public.messages_rattacher_agence()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.agence_id is not null or coalesce(new.espace, 'demarchage') <> 'demarchage' then return new; end if;
  -- 25/11/2026 : réponse à un mail connu, adresse sur une seule fiche, ou fiche du dernier mail envoyé à cette adresse.
  new.agence_id := public.message_agence_probable(new.sens, new.de, new.a, new.in_reply_to, coalesce(new.created_at, now()));
  return new;
end $function$;

-- Rattrapage : les mails reçus depuis le 01/11 restés sans agence et qui en ont désormais une évidente
-- (3 au 25/11 : real31 Asnières, Garance Immo, Human Location). Les déclencheurs habituels suivent
-- (lead si la réponse est intéressée, suite de campagne, commercial de la fiche).
update public.messages m set agence_id = x.agence
  from (select id, public.message_agence_probable(sens, de, a, in_reply_to, created_at) as agence
          from public.messages
         where espace = 'demarchage' and sens = 'entrant' and agence_id is null and created_at >= '2026-11-01') x
 where x.id = m.id and x.agence is not null;

-- ── 13. leads_suivre_appel (recopiée de la base) : un lead arrivé PENDANT l'appel est fermé par son résultat ──
-- On comparait la date de lancement de l'appel à la création du lead ; on prend l'heure où le résultat est noté.
create or replace function public.leads_suivre_appel()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  l record;
begin
  if new.type <> 'appel' or new.sens <> 'sortant' or new.resultat in ('', 'lance') then return new; end if;
  if tg_op = 'UPDATE' and old.resultat is not distinct from new.resultat and old.issue is not distinct from new.issue then return new; end if;
  if new.resultat in ('joint', 'apporteur') and tg_op = 'UPDATE' then
    update public.leads_demarchage set resultat = coalesce(nullif(new.issue, ''), new.resultat)
     where agence_id = new.agence_id and statut = 'traite' and traite_le >= new.date - interval '2 minutes';
  end if;
  select * into l from public.leads_demarchage where agence_id = new.agence_id and statut = 'a_traiter';
  -- 25/11/2026 : l'heure du résultat (appel lancé puis noté) et non celle du lancement.
  if not found or (case when tg_op = 'UPDATE' and old.resultat = 'lance' then now() else new.date end) < l.cree_le - interval '2 minutes' then return new; end if;
  if new.resultat in ('joint', 'apporteur') then
    update public.leads_demarchage
       set statut = 'traite', traite_le = now(), traite_par = new.compte_id, resultat = coalesce(nullif(new.issue, ''), new.resultat), dernier_essai_le = new.date
     where id = l.id;
  else
    update public.leads_demarchage set tentatives = l.tentatives + 1, dernier_essai_le = new.date where id = l.id;
  end if;
  return new;
end $function$;

-- ── 14. Les mails de suivi partis avant le 05/11 mais jamais notés « envoyés » (« Mail prêt » à tort) ──
-- Un mail envoyé à l'agence dans les 2 jours après l'appel (date de l'appel, pas celle de l'inscription de
-- l'analyse, posée plus tard) : 99 lignes au 25/11, dont 93 affichées « Mail prêt ».
-- Pour voir avant : select count(*) from public.appels_ia a join public.activites x on x.id = a.activite_id
--   where a.mail_envoye_le is null and x.date < '2026-11-05' and exists (select 1 from public.messages m
--   where m.sens = 'sortant' and m.agence_id = a.agence_id and m.created_at >= x.date and m.created_at < x.date + interval '2 days');
update public.appels_ia a
   set mail_envoye_le = (select min(m.created_at) from public.messages m
                          where m.sens = 'sortant' and m.agence_id = a.agence_id and m.created_at >= x.date and m.created_at < x.date + interval '2 days'),
       maj_le = now()
  from public.activites x
 where x.id = a.activite_id and a.mail_envoye_le is null and x.date < '2026-11-05'
   and exists (select 1 from public.messages m where m.sens = 'sortant' and m.agence_id = a.agence_id and m.created_at >= x.date and m.created_at < x.date + interval '2 days');

-- ── Le contrôle de santé (sante_demarchage) compare chaque règle à son empreinte : celles des règles
-- redéfinies ici sont remplacées par l'empreinte de leur nouvelle version (le reste est inchangé).
do $do$
declare
  v_def text;
  v_nom text;
  v_nouvelle text;
begin
  v_def := pg_get_functiondef('public.sante_demarchage()'::regprocedure);
  foreach v_nom in array array['appel_enregistrer', 'appel_verifier', 'demarchage_repos', 'messages_rattacher_agence'] loop
    select md5(replace(p.prosrc, chr(13), '')) into v_nouvelle from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = v_nom;
    if v_def !~ ('\(''' || v_nom || ''', ''[0-9a-f]{32}''\)') then
      raise notice 'sante_demarchage : pas d''empreinte pour %, rien changé pour elle.', v_nom;
    end if;
    v_def := regexp_replace(v_def, '\(''' || v_nom || ''', ''[0-9a-f]{32}''\)', '(''' || v_nom || ''', ''' || v_nouvelle || ''')');
  end loop;
  execute v_def;
end $do$;

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
select 'Le rappel dû passe même déjà appelée aujourd''hui (appel_verifier, demarchage_repos)',
       case when (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('appel_verifier', 'demarchage_repos') and prosrc like '%du_maintenant%') = 2 then 'en place' else 'ABSENT' end
union all
select 'Lead ou demande de campagne dispensés de repos (demarchage_repos)',
       case when exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'demarchage_repos' and prosrc like '%cmp_taches%') then 'en place' else 'ABSENT' end
union all
select 'Mail reçu rattaché même si l''adresse est sur plusieurs fiches (messages_rattacher_agence)',
       case when exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'messages_rattacher_agence' and prosrc like '%message_agence_probable%') then 'en place' else 'ABSENT' end
union all
select 'Réponses « intéressé » reçues depuis le 01/11 encore sans agence',
       (select count(*)::text from public.messages where espace = 'demarchage' and sens = 'entrant' and agence_id is null and tri = 'interesse' and created_at >= '2026-11-01') || ' (attendu : 0)'
union all
select 'Un lead arrivé pendant l''appel est fermé par son résultat (leads_suivre_appel)',
       case when exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'leads_suivre_appel' and prosrc like '%old.resultat = ''lance'' then now()%') then 'en place' else 'ABSENT' end
union all
select 'Mails de suivi partis avant le 05/11 encore affichés « Mail prêt »',
       (select count(*)::text from public.appels_ia a join public.activites x on x.id = a.activite_id
         where a.mail_envoye_le is null and x.date < '2026-11-05'
           and exists (select 1 from public.messages m where m.sens = 'sortant' and m.agence_id = a.agence_id and m.created_at >= x.date and m.created_at < x.date + interval '2 days')) || ' (attendu : 0)'
union all
select 'Analyses d''appel encore en erreur définitive',
       (select count(*)::text from public.appels_ia where statut = 'erreur' and tentatives >= 12) || ' (attendu : 0)'
union all
select 'Analyses d''appel remises en attente (reprises 4 toutes les 2 min)',
       (select count(*)::text from public.appels_ia where statut in ('en_attente', 'en_cours') and transcription is not null);
