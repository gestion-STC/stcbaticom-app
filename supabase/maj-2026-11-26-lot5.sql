-- LOT 5 (26/11/2026) — protections contre les pertes, recrutement. Rien n'est supprimé. Rejouable sans effet (idempotent).
-- À COLLER AVANT LA FUSION DE LA PR (l'écran et la machine lisent les nouvelles colonnes).
--   A. Supprimer une étape (ou une séquence) ne supprime plus son historique d'envoi : l'envoi reste, sans étape,
--      avec le nom de l'étape au moment de la suppression (st_envois.etape_libelle).
--   B. Une fiche artisan qui a un contrat, un dossier déposé ou une formation ne peut plus être supprimée par un
--      membre (écran ou API) : on l'archive (« Ne plus contacter », statut « Exclu »).
--   C. Un dossier détaché à la main n'est plus rattaché d'office à la même fiche par la machine (dossiers_st.detache_le).
--   D. Droits : la table parametres ne s'écrit qu'en administrateur, sauf les clés que les écrans d'un
--      téléprospecteur écrivent aujourd'hui ; le code secret du relais Ringover ne se lit qu'en administrateur ;
--      plus personne ne supprime un mail (messages) depuis l'application.
begin;

-- ── A. L'historique d'envoi survit à la suppression d'une étape ────────────────────────────────────────────
alter table public.st_envois add column if not exists etape_libelle text not null default '';
alter table public.st_envois alter column etape_id drop not null;

-- Le nom de l'étape, posé sur ses envois juste avant qu'elle disparaisse (même format que la chronologie des fiches).
create or replace function public.st_etape_garder_libelle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.st_envois
     set etape_libelle = (case when old.canal = 'sms' then 'SMS' else 'E-mail' end) || ' J+' || old.delai_jours
                         || case when coalesce(old.objet, '') <> '' then ' · ' || old.objet else '' end
   where etape_id = old.id;
  return old;
end $$;

drop trigger if exists st_etape_garder_libelle on public.st_etapes;
create trigger st_etape_garder_libelle before delete on public.st_etapes
  for each row execute function public.st_etape_garder_libelle();

-- La clé étrangère : « supprimer l'étape efface ses envois » (cascade) devient « l'envoi perd son étape » (set null).
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'st_envois_etape_id_fkey' and confdeltype <> 'n') then
    alter table public.st_envois drop constraint st_envois_etape_id_fkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'st_envois_etape_id_fkey') then
    alter table public.st_envois add constraint st_envois_etape_id_fkey
      foreign key (etape_id) references public.st_etapes(id) on delete set null;
  end if;
end $$;

-- ── B. Pas de suppression d'une fiche qui a un contrat, un dossier déposé ou une formation ──────────────────
-- Vaut pour tout appel venu de l'application (connecté ou non) ; l'éditeur SQL et les fonctions serveur passent.
create or replace function public.st_garde_suppression() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
begin
  if v_role in ('authenticated', 'anon')
     and (old.depose_le is not null or old.dossier_id is not null or old.statut = 'depose'
          or coalesce(old.contrat_statut, '') <> ''
          or exists (select 1 from public.st_contrats c where c.sous_traitant_id = old.id)
          or exists (select 1 from public.st_formations f where f.sous_traitant_id = old.id)
          or exists (select 1 from public.dossiers_st d where d.sous_traitant_id = old.id)) then
    raise exception 'Fiche protégée : elle a un contrat, un dossier déposé ou une formation. Archivez-la (« Ne plus contacter » ou statut « Exclu ») au lieu de la supprimer.';
  end if;
  return old;
end $$;

drop trigger if exists st_garde_suppression on public.st_sous_traitants;
create trigger st_garde_suppression before delete on public.st_sous_traitants
  for each row execute function public.st_garde_suppression();

-- ── C. Le détachement d'un dossier est retenu ─────────────────────────────────────────────────────────────
alter table public.dossiers_st add column if not exists detache_le timestamptz;

-- ── D. Droits ────────────────────────────────────────────────────────────────────────────────────────────
-- D1. parametres : l'ancienne règle « tout membre lit et écrit tout » devient « tout, en administrateur ».
alter policy acces_connecte on public.parametres
  using (est_admin() and cle <> 'analyse_passage_cle')
  with check (est_admin() and cle <> 'analyse_passage_cle');

-- D2. Un membre lit tout, sauf les deux codes secrets.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'parametres' and policyname = 'parametres_lecture_membres') then
    create policy parametres_lecture_membres on public.parametres for select to authenticated
      using (est_membre() and cle not in ('analyse_passage_cle', 'ringover_webhook_cle'));
  end if;
end $$;

-- D3. Un membre n'écrit que les clés que ses écrans écrivent aujourd'hui :
--   Réglages › Mes signatures → signatures_<son compte> ;
--   Réglages › Objectif et règles d'appel, et le Dashboard des gestionnaires → objectif_os_mensuel et les 12 règles d'appel ;
--   Réglages › Script d'appel, et la Session de call → script_appel ;
--   Réglages › Modèles d'e-mail (nom des envois automatiques) → commercial.
create or replace function public.parametre_ecrit_par_membre(p_cle text) returns boolean
language sql stable set search_path = public as $$
  select p_cle in ('commercial', 'objectif_os_mensuel', 'script_appel',
                   'repos_appel_jours', 'repos_standard_jours', 'relance_interesse_jours', 'heure_relance',
                   'sommeil_apres_tentatives', 'sommeil_jours', 'quota_appels_jour', 'sonnerie_secondes',
                   'cadence_auto_secondes', 'rdv_rappel_avant_minutes', 'rdv_rappel_apres_minutes', 'a_completer_minutes')
      or p_cle = 'signatures_' || coalesce(auth.uid()::text, '-')
$$;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'parametres' and policyname = 'parametres_ajout_membres') then
    create policy parametres_ajout_membres on public.parametres for insert to authenticated
      with check (est_membre() and parametre_ecrit_par_membre(cle));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'parametres' and policyname = 'parametres_maj_membres') then
    create policy parametres_maj_membres on public.parametres for update to authenticated
      using (est_membre() and parametre_ecrit_par_membre(cle))
      with check (est_membre() and parametre_ecrit_par_membre(cle));
  end if;
end $$;

-- D4. Les mails ne se suppriment jamais (règle du gérant) : la règle de suppression ne laisse plus rien passer.
alter policy messages_suppression on public.messages using (false);

commit;

-- CONTRÔLE. Attendu : envois 11337 (aucun perdu, plus les envois faits entre-temps) · fk_etape 'n' (set null)
--   · etape_id_nullable YES · garde_libelle 1 · garde_suppression 1 · fiches_protegees 14 (au 26/11)
--   · detache_le 1 · politiques_parametres 4 · ringover_cache_aux_membres true · messages_suppression 'false'.
select
  (select count(*) from public.st_envois) as envois,
  (select confdeltype from pg_constraint where conname = 'st_envois_etape_id_fkey') as fk_etape,
  (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'st_envois' and column_name = 'etape_id') as etape_id_nullable,
  (select count(*) from pg_trigger where tgname = 'st_etape_garder_libelle') as garde_libelle,
  (select count(*) from pg_trigger where tgname = 'st_garde_suppression') as garde_suppression,
  (select count(*) from public.st_sous_traitants s
    where s.depose_le is not null or s.dossier_id is not null or s.statut = 'depose' or coalesce(s.contrat_statut, '') <> ''
       or exists (select 1 from public.st_contrats c where c.sous_traitant_id = s.id)
       or exists (select 1 from public.st_formations f where f.sous_traitant_id = s.id)
       or exists (select 1 from public.dossiers_st d where d.sous_traitant_id = s.id)) as fiches_protegees,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'dossiers_st' and column_name = 'detache_le') as detache_le,
  (select count(*) from pg_policies where tablename = 'parametres') as politiques_parametres,
  (select qual like '%ringover_webhook_cle%' from pg_policies where tablename = 'parametres' and policyname = 'parametres_lecture_membres') as ringover_cache_aux_membres,
  (select qual from pg_policies where tablename = 'messages' and policyname = 'messages_suppression') as messages_suppression;
