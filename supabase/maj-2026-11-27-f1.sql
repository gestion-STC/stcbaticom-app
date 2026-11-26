-- ════════════════════════════════════════════════════════════════════════════
-- LOT 1 « sécurité et droits » (audit du 26/11, correctif du 27/11/2026). Rejouable, rien n'est supprimé (aucune
-- donnée, aucune règle effacée : les nouvelles règles s'AJOUTENT en « restrictive », la règle de suppression des
-- pièces jointes est fermée sans être retirée).
-- Peut se coller avant ou après la fusion : aucun écran du lot n'en dépend. Le plus tôt est le mieux.
--
-- Règle du gérant : ce qui n'est pas offert à l'écran d'un rôle est refusé côté serveur. Chaque restriction ci-dessous
-- a été vérifiée écran par écran (aujourd'hui, 3 comptes, tous admin : rien ne change pour eux).
--
--   D2. Stockage « pieces-jointes » : la règle pj_suppr est fermée (plus aucun effacement de fichier depuis le
--       logiciel ; les mails partis, les modèles, la bibliothèque et les liens des campagnes gardent leurs fichiers).
--   D3. Droits par rôle :
--       · agences et secteurs : seul un admin change le chargé d'affaires (commercial_id). Le changement de secteur
--         (déclencheur agence_suit_son_secteur), attribuer_secteur, l'attribution des leads et la fusion passent
--         toujours (ce sont des fonctions serveur). Suppression d'une agence ou d'un secteur : admins seulement ;
--       · activites : un membre ne supprime que les tâches et RDV qu'il a posés ou ceux de ses agences (ce que
--         l'Agenda lui montre) ; appels, notes et étapes : admins seulement ;
--       · cmp_campagnes, st_pilotage, st_contrats_modeles : écriture admins seulement (lecture inchangée) ;
--       · avis et avis_contacts (noms et mobiles des locataires) : admins seulement, lecture comprise ;
--       · tables st_* (base artisans) : comptes qui ont le recrutement seulement (mes_espaces()), comme messages ;
--       · st_envois : suppression admins seulement.
--   D4. Journal des mails (messages) : en mise à jour, seulement « lu » et le rattachement d'un ENVOI à sa fiche ;
--       en ajout, seulement des envois (sens = 'sortant').
--   D5. lead_poser et lead_depuis_note ne sont plus appelables par les comptes (déclencheurs et clé de service : inchangé).
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── D3-a. Le chargé d'affaires d'une agence ou d'un secteur : admins seulement ────────────────────────────────
-- « current_user = authenticated » : la requête vient directement d'un compte (PostgREST). Les fonctions serveur
-- (security definer : attribuer_secteur, cmp_attribuer_lead, agences_fusionner, agence_suit_son_secteur) tournent sous
-- leur propriétaire et passent ; la clé de service aussi.
create or replace function public.garde_commercial_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.est_admin()
     and new.commercial_id is distinct from (case when tg_op = 'INSERT' then null else old.commercial_id end) then
    raise exception 'Seul un administrateur attribue % à un chargé d''affaires.',
      case when tg_table_name = 'secteurs' then 'un secteur' else 'une agence' end
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.garde_commercial_admin() from public, anon, authenticated;

do $$ begin
  -- Nommé pour passer AVANT agences_suit_son_secteur (ordre alphabétique) : il juge ce que le compte a demandé,
  -- pas la valeur que le secteur pose ensuite.
  if not exists (select 1 from pg_trigger where tgrelid = 'public.agences'::regclass and tgname = 'agences_garde_commercial') then
    create trigger agences_garde_commercial before insert or update of commercial_id on public.agences
      for each row execute function public.garde_commercial_admin();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.secteurs'::regclass and tgname = 'secteurs_garde_commercial') then
    create trigger secteurs_garde_commercial before insert or update of commercial_id on public.secteurs
      for each row execute function public.garde_commercial_admin();
  end if;
end $$;

-- ── D3-b. Règles « restrictives » : elles s'ajoutent à acces_connecte (est_membre), qui reste en place ─────────
do $$
declare
  t text;
begin
  -- Suppression : admins seulement (aucun écran ne supprime d'agence, de secteur ni d'envoi d'artisan).
  foreach t in array array['agences', 'secteurs', 'st_envois'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'garde_suppression_admins') then
      execute format('create policy garde_suppression_admins on public.%I as restrictive for delete to authenticated using ((select public.est_admin()))', t);
    end if;
  end loop;

  -- Écriture : admins seulement (Campagnes et réglages de l'ancienne machine des artisans : écrans réservés aux admins).
  foreach t in array array['cmp_campagnes', 'st_pilotage', 'st_contrats_modeles'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'garde_ajout_admins') then
      execute format('create policy garde_ajout_admins on public.%I as restrictive for insert to authenticated with check ((select public.est_admin()))', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'garde_modification_admins') then
      execute format('create policy garde_modification_admins on public.%I as restrictive for update to authenticated using ((select public.est_admin())) with check ((select public.est_admin()))', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'garde_suppression_admins') then
      execute format('create policy garde_suppression_admins on public.%I as restrictive for delete to authenticated using ((select public.est_admin()))', t);
    end if;
  end loop;

  -- Avis des locataires (page Avis, réservée aux admins) : tout, lecture comprise.
  foreach t in array array['avis', 'avis_contacts'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'garde_admins') then
      execute format('create policy garde_admins on public.%I as restrictive for all to authenticated using ((select public.est_admin())) with check ((select public.est_admin()))', t);
    end if;
  end loop;

  -- La base artisans : les comptes qui ont le recrutement (admin, « Recrutement », ou fonction pas encore posée).
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'st\_%' order by 1 loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'garde_espace_recrutement') then
      execute format('create policy garde_espace_recrutement on public.%I as restrictive for all to authenticated using ((select ''recrutement'' = any (public.mes_espaces()))) with check ((select ''recrutement'' = any (public.mes_espaces())))', t);
    end if;
  end loop;

  -- Le fil d'une agence : un membre supprime seulement les tâches et RDV qu'il a posés ou ceux de ses agences
  -- (exactement ce que l'Agenda lui propose) ; appels, notes, étapes : admins seulement.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activites' and policyname = 'garde_suppression') then
    create policy garde_suppression on public.activites as restrictive for delete to authenticated using (
      (select public.est_admin())
      or (type in ('tache', 'rdv')
          and (compte_id = (select auth.uid())
               or agence_id in (select g.id from public.agences g where g.commercial_id = (select auth.uid())))));
  end if;
end $$;

-- ── D4. Le journal des mails ──────────────────────────────────────────────────────────────────────────────
-- Ajout : des envois seulement (le seul cas écrit par l'écran, envoiEmail.ts). Un faux mail « reçu » ne crée plus de lead.
alter policy messages_ajout on public.messages
  with check (
    est_membre()
    and sens = 'sortant'
    and coalesce(espace, 'demarchage') = any (mes_espaces())
    and (coalesce(espace, 'demarchage') <> 'demarchage' or (select est_admin()) or compte_id = (select auth.uid()))
  );
-- Mise à jour : « lu » et le rattachement à la fiche, rien d'autre (corps, objet, expéditeur, pièces… : intouchables).
revoke update on public.messages from authenticated, anon;
grant update (lu, agence_id) on public.messages to authenticated;

-- Le rattachement à une fiche : seulement pour un envoi (l'écran rattache le mail qu'il vient d'envoyer).
create or replace function public.messages_garde_rattachement()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and old.sens <> 'sortant' and new.agence_id is distinct from old.agence_id then
    raise exception 'Un mail reçu ne se rattache pas à la main à une autre agence.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.messages_garde_rattachement() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.messages'::regclass and tgname = 'messages_garde_rattachement') then
    create trigger messages_garde_rattachement before update of agence_id on public.messages
      for each row execute function public.messages_garde_rattachement();
  end if;
end $$;

-- ── D5. Poser un lead : les déclencheurs et le serveur seulement ──────────────────────────────────────────
revoke execute on function public.lead_poser(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.lead_depuis_note(uuid) from public, anon, authenticated;
grant execute on function public.lead_poser(uuid, uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.lead_depuis_note(uuid) to service_role;

-- ── D2. Plus aucun effacement de pièce jointe depuis le logiciel ────────────────────────────────────────────
do $$ begin
  alter policy pj_suppr on storage.objects using (false);
exception when insufficient_privilege then
  raise notice 'Stockage : droits insuffisants pour fermer pj_suppr (à faire depuis Storage › Policies : condition « false »).';
end $$;

commit;

-- ── Contrôle. Attendu le 27/11 :
--   restrictives 32 (agences 1, secteurs 1, activites 1, st_envois 2, cmp_campagnes 3, st_pilotage 4,
--   st_contrats_modeles 4, avis 1, avis_contacts 1, 14 autres tables st_* 1 chacune)
--   tables_st_gardees 17 · declencheurs 3 · messages_maj_colonnes « agence_id, lu » · ajout_envois_seuls true
--   lead_poser_comptes false · lead_poser_serveur true · lead_note_comptes false · pj_suppr_fermee true
--   comptes_non_admin 0 (les 3 comptes sont admin : rien ne change pour eux)
select
  (select count(*) from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE'
     and policyname in ('garde_suppression_admins', 'garde_ajout_admins', 'garde_modification_admins', 'garde_admins', 'garde_espace_recrutement', 'garde_suppression')) as restrictives,
  (select count(*) from pg_policies where schemaname = 'public' and policyname = 'garde_espace_recrutement') as tables_st_gardees,
  (select count(*) from pg_trigger where tgname in ('agences_garde_commercial', 'secteurs_garde_commercial', 'messages_garde_rattachement') and tgenabled <> 'D') as declencheurs,
  (select string_agg(column_name, ', ' order by column_name) from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'messages' and grantee = 'authenticated' and privilege_type = 'UPDATE') as messages_maj_colonnes,
  (select with_check like '%sens = ''sortant''::text%' from pg_policies where tablename = 'messages' and policyname = 'messages_ajout') as ajout_envois_seuls,
  has_function_privilege('authenticated', 'public.lead_poser(uuid, uuid, text, text, text, timestamptz)', 'execute') as lead_poser_comptes,
  has_function_privilege('service_role', 'public.lead_poser(uuid, uuid, text, text, text, timestamptz)', 'execute') as lead_poser_serveur,
  has_function_privilege('authenticated', 'public.lead_depuis_note(uuid)', 'execute') as lead_note_comptes,
  (select qual = 'false' from pg_policies where schemaname = 'storage' and policyname = 'pj_suppr') as pj_suppr_fermee,
  (select count(*) from auth.users where coalesce(raw_app_meta_data ->> 'role', '') <> 'admin') as comptes_non_admin;
