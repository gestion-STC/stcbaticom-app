-- ════════════════════════════════════════════════════════════════════════════
-- LOT 8 (27/11/2026) : recrutement. Peut se coller AVANT ou APRÈS la fusion (aucun écran ne dépend de ce SQL pour
-- s'afficher). Rejouable : rien n'est supprimé (la tâche planifiée est mise en pause, pas effacée).
--
--   A. Décision 12 : l'ancienne machine des artisans (sequenceur-st) est abandonnée au profit des campagnes. Sa tâche
--      planifiée (toutes les 15 min) est mise à l'arrêt (active = false). Pour la relancer un jour :
--        select cron.alter_job(job_id := jobid, active := true) from cron.job where jobname = 'sequenceur-st';
--   B. Le pack de contrats DocuSign ne s'écrit plus que par un administrateur : l'écran « Contrats DocuSign » n'est
--      offert qu'à eux (Réglages › Recrutement). La lecture reste à toute l'équipe (la fenêtre « Envoyer les contrats »
--      lit le pack). Politiques RESTRICTIVES ajoutées à côté de « acces_connecte » : rien n'est retiré.
--   C. ELEC BEST ONE (D78) : son compte STC Bâtiment existe depuis le 22/10 à 13:29 (connecté le 24/10), Baticom l'ignorait
--      et affichait « lien envoyé ». La fiche passe « accès ouvert » à la date de création du compte.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── A. La machine des artisans : tâche planifiée à l'arrêt ───────────────────────────────────────────────────
select cron.alter_job(job_id := jobid, active := false)
  from cron.job
 where jobname = 'sequenceur-st' and active;

-- ── B. Le pack DocuSign : écriture réservée aux administrateurs ──────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'st_contrats_modeles' and policyname = 'modeles_ajout_admin') then
    create policy modeles_ajout_admin on public.st_contrats_modeles as restrictive for insert to authenticated with check (public.est_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'st_contrats_modeles' and policyname = 'modeles_modif_admin') then
    create policy modeles_modif_admin on public.st_contrats_modeles as restrictive for update to authenticated using (public.est_admin()) with check (public.est_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'st_contrats_modeles' and policyname = 'modeles_retrait_admin') then
    create policy modeles_retrait_admin on public.st_contrats_modeles as restrictive for delete to authenticated using (public.est_admin());
  end if;
end $$;

-- ── C. ELEC BEST ONE : accès ouvert (compte STC Bâtiment créé le 22/10/2026 à 13:29:28 UTC) ───────────────────
update public.st_sous_traitants
   set acces_ouvert_le = '2026-10-22 13:29:28+00', acces_email = 'contact@elecbestone.com'
 where id = '8a32b5f8-751d-46cd-bbb5-6ee96f5fd4a3' and acces_ouvert_le is null;

commit;

-- ── Contrôle (attendu : sequenceur_st_actif = false ; politiques_admin = 3 ; elec_best_one_ouvert = 2026-10-22 13:29:28+00) ──
select
  (select active from cron.job where jobname = 'sequenceur-st') as sequenceur_st_actif,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'st_contrats_modeles' and policyname like 'modeles\_%\_admin') as politiques_admin,
  (select acces_ouvert_le from public.st_sous_traitants where id = '8a32b5f8-751d-46cd-bbb5-6ee96f5fd4a3') as elec_best_one_ouvert;
