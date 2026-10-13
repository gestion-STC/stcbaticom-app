-- ═══════════════════════════════════════════════════════════════════════════
--  13/10/2026 — Check-up de la base de démarchage
--
--  1. Les notes, tâches et RDV posés depuis une fiche n'avaient pas de compte
--     (seulement le nom) : le compte connecté est désormais posé par défaut.
--  2. 23 agences où un gestionnaire avait dit « rappelez-moi » ont perdu leur
--     rappel (nettoyage du 10/10) : le rappel est reposé demain 10 h.
--  3. 2 agences « RDV planifié » sans rien de prévu : une relance demain 10 h.
--
--  À coller en une fois dans l'éditeur SQL du projet Baticom. Rejouable
--  (les rappels ne sont pas posés deux fois).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Le compte de l'auteur, par défaut.
alter table public.activites alter column compte_id set default auth.uid();

-- 2. Les « à rappeler » perdus : dernier appel = joint + à rappeler, rien de prévu, pas rappelé depuis.
insert into public.activites (agence_id, contact_id, type, date, echeance, compte_id, compte_nom, titre, note, source)
select a.id, d.contact_id, 'tache', now(),
       (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day 10 hours') at time zone 'Europe/Paris',
       d.compte_id, coalesce(d.compte_nom, ''), 'Rappeler',
       'Rappel reposé le 13/10 : le gestionnaire avait demandé à être rappelé (appel du ' || to_char(d.date at time zone 'Europe/Paris', 'DD/MM') || ').', 'checkup'
  from public.agences a
  join lateral (select x.* from public.activites x where x.agence_id = a.id and x.type = 'appel' order by x.date desc limit 1) d on true
 where a.type <> 'apporteur' and a.etape in ('a_prospecter', 'gestionnaire_joint')
   and d.resultat = 'joint' and d.issue = 'a_rappeler'
   and not exists (select 1 from public.activites t where t.agence_id = a.id and t.type in ('tache', 'rdv') and t.fait_le is null)
   and not exists (select 1 from public.activites t where t.agence_id = a.id and t.source = 'checkup');

-- 3. Les RDV planifiés sans rien de prévu.
insert into public.activites (agence_id, type, date, echeance, compte_nom, titre, note, source)
select a.id, 'tache', now(),
       (date_trunc('day', now() at time zone 'Europe/Paris') + interval '1 day 10 hours') at time zone 'Europe/Paris',
       '', 'Relancer', 'Relance reposée le 13/10 : RDV planifié sans suite prévue.', 'checkup'
  from public.agences a
 where a.type <> 'apporteur' and a.etape = 'rdv_planifie'
   and not exists (select 1 from public.activites t where t.agence_id = a.id and t.type in ('tache', 'rdv') and t.fait_le is null)
   and not exists (select 1 from public.activites t where t.agence_id = a.id and t.source = 'checkup');

-- Contrôle : environ 25 rappels posés demain.
select count(*) as rappels_reposes from public.activites where source = 'checkup';
