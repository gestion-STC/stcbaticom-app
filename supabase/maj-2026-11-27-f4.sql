-- ════════════════════════════════════════════════════════════════════════════
-- LOT 4 DE L'AUDIT DU 26/11 (27/11/2026) : signaux, robots, leads et désinscriptions.
-- À coller AVANT la fusion (evenements-site redéployée appelle site_robot_recent ; resend-evenements, lien-st,
-- instantly-evenements et l'écran appellent st_exclure). Puis redéployer : evenements-site, resend-evenements,
-- formulaire-campagne, lien-st, instantly-evenements, synchro-clients. Rejouable : rien n'est supprimé.
--
--   A. Robots (D28, D29, D27) : un clic moins d'une minute après le dernier mail envoyé à l'agence est un robot
--      (personne ne lit et ne clique aussi vite : Paris Autrement, 2 s). Un clic reconnu robot ferme « robot » le lead
--      faible né de la même rafale. La page « Créer un compte » signalée par STC Bâtiment est jugée sur les liens
--      eux-mêmes (rafale, lien stop, clic trop tôt), même hors campagne.
--   B. Leads (D34, D35, D38) : la garde des 3 jours ne vaut que pour les signaux faibles (plaquette, page compte,
--      campagne) et ignore les fermetures « robot » ou « désinscrit » ; la désinscription ne ferme que les leads
--      faibles ; le seuil « N fois en X jours » ne compte plus les clics de robots.
--   C. Premier OS (D51) : venant de STC Bâtiment, la date la plus ancienne l'emporte. Rattrapage : Médicis
--      Villepinte (12/05 → 14/04) et JOYFUL ANEST (04/08 → 25/07). Empreinte de sante_demarchage mise à jour.
--   D. Liste d'exclusion des artisans (D91) : st_exclure complète la ligne de l'adresse avec le numéro au lieu de
--      refuser ; les 4 artisans désinscrits par plainte reçoivent leur numéro.
--   E. Données (D27) : les 2 faux leads encore ouverts (Orpi Nouallet, Paris Autrement) fermés « robot » ;
--      l'inscription d'Orpi Nouallet à « histoires » remise en cours (étape 2).
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── A. Les robots ──────────────────────────────────────────────────────────────────────────────────────────
-- A1. Un clic arrivé moins d'une minute après un mail envoyé à l'agence : un robot de sécurité (D28).
create or replace function public.site_clic_trop_tot(p_agence uuid, p_quand timestamptz)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.messages m
                  where m.agence_id = p_agence and m.sens = 'sortant'
                    and m.created_at > p_quand - interval '60 seconds' and m.created_at <= p_quand)
$$;
revoke all on function public.site_clic_trop_tot(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.site_clic_trop_tot(uuid, timestamptz) to service_role;

-- A2. Le clic d'un lien suivi : robot, doublon ou vrai clic.
create or replace function public.site_noter_clic(p_lien uuid, p_quand timestamp with time zone, p_titre text, p_note text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  l record;
  d record;
begin
  select id, agence_id, contact_id into l from public.liens_suivis where id = p_lien;
  if l.agence_id is null then return 'sans_agence'; end if;
  perform pg_advisory_xact_lock(hashtext('clic:' || l.agence_id::text));
  -- Robot : un AUTRE lien du même contact ouvert dans les 5 secondes, ou le lien de désinscription ouvert dans les 5 secondes,
  -- ou (27/11/2026) un clic moins d'une minute après un mail envoyé à l'agence.
  if exists (select 1 from public.liens_suivis x
              where x.agence_id = l.agence_id
                and ((x.id <> l.id and x.dernier_clic_le between p_quand - interval '5 seconds' and p_quand + interval '5 seconds')
                  or x.stop_vu_le between p_quand - interval '5 seconds' and p_quand + interval '5 seconds'))
     or public.site_clic_trop_tot(l.agence_id, p_quand) then
    if not exists (select 1 from public.cmp_evenements e where e.contact_ref = l.agence_id::text and e.robot and e.le > p_quand - interval '30 seconds') then
      select * into d from public.cmp_dernier_envoi(l.agence_id::text, p_quand);
      if d.envoi_id is not null then
        insert into public.cmp_evenements (campagne_id, envoi_id, contact_ref, type, le, robot)
        values (d.campagne_id, d.envoi_id, l.agence_id::text, 'clic', p_quand, true);
      end if;
    end if;
    -- (27/11/2026) Un clic de la même rafale jugé « vrai » avant que le robot soit reconnu : son lead faible est fermé
    -- « robot » et son événement de campagne marqué robot. Un lead n'existe que si au moins un signal vient d'une personne.
    update public.cmp_evenements set robot = true
     where contact_ref = l.agence_id::text and type = 'clic' and not robot
       and le between p_quand - interval '1 minute' and p_quand + interval '1 minute';
    update public.leads_demarchage set statut = 'traite', traite_le = now(), resultat = 'robot'
     where agence_id = l.agence_id and statut = 'a_traiter' and source in ('plaquette', 'page_compte', 'campagne')
       and cree_le between p_quand - interval '1 minute' and p_quand + interval '1 minute';
    return 'robot';
  end if;
  if exists (select 1 from public.activites a
              where a.agence_id = l.agence_id and a.type = 'note' and a.source = 'site' and a.titre = p_titre
                and a.date between p_quand - interval '30 seconds' and p_quand + interval '30 seconds') then
    return 'doublon';
  end if;
  insert into public.activites (agence_id, contact_id, type, titre, note, date, compte_nom, source)
  values (l.agence_id, l.contact_id, 'note', p_titre, p_note, p_quand, 'Site STC Bâtiment', 'site');
  update public.agences set dernier_signal_le = p_quand, dernier_signal = p_titre where id = l.agence_id;
  return 'ok';
end $function$;

-- A3. La page « Créer un compte » signalée par STC Bâtiment (D29) : un robot vient-il de passer sur les liens de
--     l'agence ? Rafale (2 liens à 5 s près), lien de désinscription ouvert, clic moins d'une minute après le mail,
--     ou clic de robot déjà noté dans une campagne. Fenêtre : les 5 minutes avant la page (et 30 s après).
create or replace function public.site_robot_recent(p_agence uuid, p_quand timestamptz)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.liens_suivis x
                  where x.agence_id = p_agence
                    and ((x.dernier_clic_le between p_quand - interval '5 minutes' and p_quand + interval '30 seconds'
                          and (public.site_clic_trop_tot(p_agence, x.dernier_clic_le)
                               or exists (select 1 from public.liens_suivis y
                                           where y.agence_id = p_agence and y.id <> x.id
                                             and y.dernier_clic_le between x.dernier_clic_le - interval '5 seconds' and x.dernier_clic_le + interval '5 seconds')))
                      or x.stop_vu_le between p_quand - interval '5 minutes' and p_quand + interval '30 seconds'))
      or exists (select 1 from public.cmp_evenements e
                  where e.contact_ref = p_agence::text and e.robot
                    and e.le between p_quand - interval '5 minutes' and p_quand + interval '30 seconds')
$$;
revoke all on function public.site_robot_recent(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.site_robot_recent(uuid, timestamptz) to service_role;

-- ── B. Les leads ───────────────────────────────────────────────────────────────────────────────────────────
-- B1. lead_poser : la garde des 3 jours (décision 2).
create or replace function public.lead_poser(p_agence uuid, p_contact uuid, p_source text, p_signal text, p_detail text, p_quand timestamp with time zone default now())
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a record;
  v uuid;
begin
  select type, etape, ne_plus_ecrire_le into a from public.agences where id = p_agence;
  if not found or (a.type = 'apporteur' and public.cmp_campagne_qui_decide(p_agence::text) is null) or a.etape in ('client', 'hors_cible') then return null; end if;
  -- Désinscrite : un clic ou une page ouverte ne fait plus un lead (une réponse écrite ou un compte ouvert, si).
  if a.ne_plus_ecrire_le is not null and p_source in ('plaquette', 'page_compte', 'campagne') then return null; end if;
  -- Lead déjà ouvert : la date du dernier signal avance ; un signal PLUS FORT remplace aussi le signal et la source
  -- (une plaquette puis un compte ouvert : le commercial doit voir « compte ouvert »).
  update public.leads_demarchage l set
      dernier_signal_le = greatest(l.dernier_signal_le, p_quand),
      contact_id = coalesce(l.contact_id, p_contact),
      signal = case when public.lead_force(p_source) > public.lead_force(l.source) then p_signal else l.signal end,
      detail = case when public.lead_force(p_source) > public.lead_force(l.source) then coalesce(p_detail, '') else l.detail end,
      source = case when public.lead_force(p_source) > public.lead_force(l.source) then p_source else l.source end
   where l.agence_id = p_agence and l.statut = 'a_traiter' returning l.id into v;
  if v is not null then return v; end if;
  -- Garde des 3 jours après un lead traité (27/11/2026, décision 2) : seulement pour un signal faible (plaquette, page,
  -- campagne) ; une réponse écrite, un formulaire ou un compte ouvert font toujours un lead. Une fermeture par la
  -- machine (« robot », « désinscrit ») ne garde rien.
  if p_source in ('plaquette', 'page_compte', 'campagne')
     and exists (select 1 from public.leads_demarchage where agence_id = p_agence and statut = 'traite' and traite_le > p_quand - interval '3 days'
                   and resultat not in ('robot', 'desinscrit')) then
    return null;
  end if;
  insert into public.leads_demarchage (agence_id, contact_id, source, signal, detail, cree_le, dernier_signal_le)
  values (p_agence, p_contact, p_source, p_signal, coalesce(p_detail, ''), p_quand, p_quand)
  on conflict (agence_id) where statut = 'a_traiter' do update set
      dernier_signal_le = greatest(leads_demarchage.dernier_signal_le, excluded.dernier_signal_le),
      signal = case when public.lead_force(excluded.source) > public.lead_force(leads_demarchage.source) then excluded.signal else leads_demarchage.signal end,
      detail = case when public.lead_force(excluded.source) > public.lead_force(leads_demarchage.source) then excluded.detail else leads_demarchage.detail end,
      source = case when public.lead_force(excluded.source) > public.lead_force(leads_demarchage.source) then excluded.source else leads_demarchage.source end
  returning id into v;
  return v;
end $function$;

-- B2. La désinscription ne ferme que les leads faibles (D35, décision 2) : une réponse écrite, un formulaire ou un
--     compte ouvert restent à appeler (la désinscription vise les mails, pas l'appel).
create or replace function public.leads_fermer_si_desinscrit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.ne_plus_ecrire_le is not null and old.ne_plus_ecrire_le is null then
    update public.leads_demarchage set statut = 'traite', traite_le = now(), resultat = 'desinscrit'
     where agence_id = new.id and statut = 'a_traiter' and source in ('plaquette', 'page_compte', 'campagne');
  end if;
  return new;
end $function$;

-- B3. Le seuil « N fois en X jours » d'une campagne ne compte plus les clics de robots (D38).
create or replace function public.cmp_lead_depuis_evenement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c record;
  r jsonb;
  m record;
  v_canal text;
  v_action text;
  n integer;
begin
  select id, base_id, origine, config into c from public.cmp_campagnes where id = new.campagne_id;
  if not found or c.base_id not in ('agences', 'apporteurs') or coalesce(c.config ->> 'v', '') <> '1' or c.origine is not distinct from 'tracabilite' then return new; end if;
  if new.type = 'reponse' then
    select x.tri, x.tri_detail, x.corps_text, x.contact_id, x.objet into m from public.messages x
     where x.agence_id::text = new.contact_ref and x.created_at = new.le and x.sens = 'entrant' and x.espace = 'demarchage' and public.lead_mail_est_humain(x.objet)
     limit 1;
    if not found then return new; end if;
    v_action := public.cmp_action_reponse(c.config, m.tri, m.corps_text);
    if v_action = 'dead' then
      perform public.cmp_poser_dead(new.contact_ref::uuid, m.corps_text);
    elsif v_action = 'lead' then
      perform public.lead_poser(new.contact_ref::uuid, m.contact_id, 'mail', 'A répondu au mail', case when coalesce(m.tri_detail ->> 'contact_nom', '') <> '' or coalesce(m.tri_detail ->> 'contact_email', '') <> '' then left('Renvoie vers ' || concat_ws(' · ', nullif(m.tri_detail ->> 'contact_nom', ''), nullif(m.tri_detail ->> 'contact_email', ''), nullif(m.tri_detail ->> 'contact_telephone', '')), 160) else left('« ' || coalesce(nullif(m.objet, ''), '(sans objet)') || ' »', 160) end, new.le);
    end if;
    return new;
  end if;
  select canal into v_canal from public.cmp_envois where id = new.envoi_id;
  for r in select * from jsonb_array_elements(coalesce(c.config #> '{qualification,interet}', '[]'::jsonb)) loop
    if not coalesce(public.cmp_evenement_correspond(r ->> 'evenement', new.type, new.lien, v_canal), false) then continue; end if;
    select count(*) into n from public.cmp_evenements e left join public.cmp_envois x on x.id = e.envoi_id
     where e.campagne_id = new.campagne_id and e.contact_ref = new.contact_ref and not e.robot
       and e.le > new.le - make_interval(days => greatest(coalesce((r ->> 'jours')::int, 7), 1)) and e.le <= new.le
       and coalesce(public.cmp_evenement_correspond(r ->> 'evenement', e.type, e.lien, x.canal), false);
    if n >= greatest(coalesce((r ->> 'fois')::int, 1), 1) then
      perform public.lead_poser(new.contact_ref::uuid, null, case when new.lien = 'plaquette' then 'plaquette' when new.lien = 'principal' then 'page_compte' else 'campagne' end,
        r ->> 'evenement', case when n > 1 then n || ' fois' else '' end, new.le);
      return new;
    end if;
  end loop;
  return new;
exception when others then
  raise warning 'cmp_lead_depuis_evenement : %', sqlerrm;
  return new;
end $function$;

-- ── C. Le premier OS (D51) : même texte que supabase/regles-demarchage.sql ─────────────────────────────────
create or replace function public.agence_premier_os(p_agence_id uuid, p_date date default null, p_source text default 'fiche')
returns void
language plpgsql
set search_path to 'public', 'extensions', 'pg_temp'
as $$
begin
  perform set_config('app.source', coalesce(p_source, 'fiche'), true);
  -- Venant de STC Bâtiment (27/11/2026), la date la plus ancienne l'emporte : une fiche datée plus tard est recalée.
  update public.agences set etape = 'client',
         premier_os_le = case when p_source = 'stc_batiment' and p_date is not null then least(premier_os_le, p_date)
                              else coalesce(premier_os_le, p_date, (now() at time zone 'Europe/Paris')::date) end,
         derniere_activite_le = now()
   where id = p_agence_id;
end $$;

-- Rattrapage : les clientes dont STC Bâtiment connaît un premier OS plus ancien (2 au 27/11).
do $do$
declare
  r record;
begin
  for r in
    select a.id, s.d
      from (select c.agence_id, min((c.premier_os_le at time zone 'Europe/Paris')::date) as d
              from public.clients_signales c
             where c.statut in ('confirme', 'deja_client') and c.agence_id is not null and c.premier_os_le is not null
             group by c.agence_id) s
      join public.agences a on a.id = s.agence_id
     where a.etape = 'client' and a.premier_os_le is not null and s.d < a.premier_os_le
  loop
    perform public.agence_premier_os(r.id, r.d, 'stc_batiment');
  end loop;
end $do$;

-- Le contrôle de santé (sante_demarchage) : l'empreinte d'agence_premier_os devient celle de sa nouvelle version.
do $do$
declare
  v_def text;
  v_nom text;
  v_nouvelle text;
begin
  v_def := pg_get_functiondef('public.sante_demarchage()'::regprocedure);
  foreach v_nom in array array['agence_premier_os'] loop
    select md5(replace(p.prosrc, chr(13), '')) into v_nouvelle from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = v_nom;
    if v_def !~ ('\(''' || v_nom || ''', ''[0-9a-f]{32}''\)') then
      raise notice 'sante_demarchage : pas d''empreinte pour %, rien changé pour elle.', v_nom;
    end if;
    v_def := regexp_replace(v_def, '\(''' || v_nom || ''', ''[0-9a-f]{32}''\)', '(''' || v_nom || ''', ''' || v_nouvelle || ''')');
  end loop;
  execute v_def;
end $do$;

-- ── D. La liste d'exclusion des artisans (D91) ─────────────────────────────────────────────────────────────
-- Ajouter une adresse et/ou un numéro : la ligne de l'adresse est complétée par le numéro au lieu de refuser
-- l'ajout ; un numéro déjà exclu n'est pas ajouté deux fois. Droits de l'appelant (règles d'accès de la table).
create or replace function public.st_exclure(p_email text, p_telephone text, p_motif text)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_tel text := nullif(trim(coalesce(p_telephone, '')), '');
  v_ligne record;
begin
  if v_email is null and v_tel is null then return; end if;
  if v_email is not null then
    select id, telephone into v_ligne from public.st_exclusions where lower(email) = v_email limit 1;
    if not found then
      insert into public.st_exclusions (email, telephone, motif) values (v_email, v_tel, coalesce(p_motif, ''))
      on conflict (email) do update set telephone = coalesce(nullif(st_exclusions.telephone, ''), excluded.telephone);
      return;
    end if;
    if v_tel is null or regexp_replace(coalesce(v_ligne.telephone, ''), '\D', '', 'g') = regexp_replace(v_tel, '\D', '', 'g') then return; end if;
    if coalesce(v_ligne.telephone, '') = '' then
      update public.st_exclusions set telephone = v_tel where id = v_ligne.id;
      return;
    end if;
  end if;
  -- Un numéro seul (ou différent de celui déjà rangé avec l'adresse) : sa propre ligne, une seule fois.
  if not exists (select 1 from public.st_exclusions where regexp_replace(coalesce(telephone, ''), '\D', '', 'g') = regexp_replace(v_tel, '\D', '', 'g')) then
    insert into public.st_exclusions (email, telephone, motif) values (null, v_tel, coalesce(p_motif, ''));
  end if;
end $$;
revoke all on function public.st_exclure(text, text, text) from public, anon;
grant execute on function public.st_exclure(text, text, text) to authenticated, service_role;

-- Les artisans désinscrits par plainte : leur numéro rejoint leur adresse (4 au 27/11).
select public.st_exclure(s.email, s.telephone, 'signalé comme indésirable')
  from public.st_sous_traitants s
 where s.desinscrit_canal = 'plainte' and coalesce(s.telephone, '') <> '';

-- ── E. Les 2 faux leads de robots encore ouverts (D27) ─────────────────────────────────────────────────────
-- Orpi Nouallet (rafale du 23/11, 8 s après le mail) et Paris Autrement (page ouverte 2 s après le mail, 05/11).
update public.leads_demarchage set statut = 'traite', traite_le = now(), resultat = 'robot'
 where id in ('594b2963-45c4-4059-ab6a-8e7e8990d3dd', 'e7326fd6-c12a-4b9e-ba65-7a3d4ccacf72') and statut = 'a_traiter';
-- Orpi Nouallet reprend « histoires » là où elle en était (étape 2), comme les 3 autres agences de la rafale.
update public.cmp_inscriptions set statut = 'en_cours', sortie_le = null
 where campagne_id = '7f7abd6c-5065-431b-8109-6a058d7927c4' and contact_ref = '0e9575bf-407e-475b-af9b-fa3a1bf0869c' and statut = 'lead';

commit;

-- ── Contrôle. Attendu au 27/11 :
--   faux_leads_ouverts 0 · orpi_inscription en_cours/2 · leads_robot 8
--   premier_os_medicis 2026-04-14 · premier_os_joyful 2026-07-25 · sante_regle_modifiee 0
--   plaintes_sans_numero 0 · fonctions 4 (site_clic_trop_tot, site_robot_recent, st_exclure, et site_noter_clic à jour)
--   garde_faible true · desinscription_faible true · seuil_sans_robot true
select
  (select count(*) from public.leads_demarchage where id in ('594b2963-45c4-4059-ab6a-8e7e8990d3dd', 'e7326fd6-c12a-4b9e-ba65-7a3d4ccacf72') and statut = 'a_traiter') as faux_leads_ouverts,
  (select statut || '/' || etape_index from public.cmp_inscriptions where campagne_id = '7f7abd6c-5065-431b-8109-6a058d7927c4' and contact_ref = '0e9575bf-407e-475b-af9b-fa3a1bf0869c') as orpi_inscription,
  (select count(*) from public.leads_demarchage where resultat = 'robot') as leads_robot,
  (select premier_os_le from public.agences where nom = 'Médicis Immobilier Neuf Villepinte') as premier_os_medicis,
  (select premier_os_le from public.agences where nom = 'JOYFUL ANEST') as premier_os_joyful,
  (select count(*) from public.sante_demarchage() s where s.code = 'regle_modifiee') as sante_regle_modifiee,
  (select count(*) from public.st_sous_traitants s where s.desinscrit_canal = 'plainte' and coalesce(s.telephone, '') <> ''
     and not exists (select 1 from public.st_exclusions x where regexp_replace(coalesce(x.telephone, ''), '\D', '', 'g') = regexp_replace(s.telephone, '\D', '', 'g'))) as plaintes_sans_numero,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
     and (proname in ('site_clic_trop_tot', 'site_robot_recent', 'st_exclure') or (proname = 'site_noter_clic' and prosrc like '%site_clic_trop_tot%'))) as fonctions,
  (select prosrc like '%resultat not in (''robot'', ''desinscrit'')%' from pg_proc where pronamespace = 'public'::regnamespace and proname = 'lead_poser') as garde_faible,
  (select prosrc like '%source in (''plaquette'', ''page_compte'', ''campagne'')%' from pg_proc where pronamespace = 'public'::regnamespace and proname = 'leads_fermer_si_desinscrit') as desinscription_faible,
  (select prosrc like '%and not e.robot%' from pg_proc where pronamespace = 'public'::regnamespace and proname = 'cmp_lead_depuis_evenement') as seuil_sans_robot;
