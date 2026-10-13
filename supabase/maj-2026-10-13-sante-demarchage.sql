-- ═══════════════════════════════════════════════════════════════════════════
--  13/10/2026 — La santé du démarchage, vérifiée à chaque ouverture d'« Aujourd'hui »
--
--  Bloc 9 du plan de contrôle : les contrôles qui ont validé la base le 13/10
--  tournent désormais tout seuls. Chaque ligne doit valoir 0 ; un écart s'affiche
--  en rouge sur « Aujourd'hui », avec les agences concernées.
--
--  À coller en une fois dans l'éditeur SQL du projet Baticom. Rejouable.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.sante_demarchage()
returns table (code text, libelle text, nombre integer, exemples text)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with b as (select * from public.agences_liste where type <> 'apporteur'),
  ouv as (select agence_id, count(*) n, count(*) filter (where titre like 'Relancer%') nr
            from public.activites where type in ('tache', 'rdv') and fait_le is null group by 1),
  ecarts as (
    select 'interessee_sans_relance' code, 'Intéressée ou RDV sans relance prévue (elle ne reviendrait plus)' libelle, b.nom
      from b where b.etape in ('interesse', 'rdv_planifie') and b.prochaine_echeance is null
    union all
    select 'relance_sur_sortie', 'Relance ouverte sur une agence pas intéressée, hors cible ou cliente', b.nom
      from b join ouv on ouv.agence_id = b.id where b.etape in ('pas_interesse', 'hors_cible', 'client')
    union all
    select 'relances_en_double', 'Plusieurs relances ouvertes sur la même agence', a.nom
      from public.agences a join ouv on ouv.agence_id = a.id where ouv.nr > 1
    union all
    select 'tache_apporteur', 'Tâche ouverte sur un apporteur d''affaires', a.nom
      from public.agences a join ouv on ouv.agence_id = a.id where a.type = 'apporteur'
    union all
    select 'appel_non_note', 'Appel lancé depuis plus d''une heure sans résultat noté', a.nom || ' (' || coalesce(nullif(x.compte_nom, ''), '?') || ', ' || to_char(x.date at time zone 'Europe/Paris', 'DD/MM HH24:MI') || ')'
      from public.activites x join public.agences a on a.id = x.agence_id
     where x.type = 'appel' and x.resultat = 'lance' and x.date < now() - interval '1 hour'
    union all
    select 'compteurs_faux', 'Tentatives ou joints différents de l''historique de la fiche', a.nom
      from public.agences a
     where a.joint_fois <> (select count(*) from public.activites x where x.agence_id = a.id and x.type = 'appel' and x.sens <> 'entrant' and x.resultat = 'joint')
        or a.tentatives <> (select count(*) from public.activites x where x.agence_id = a.id and x.type = 'appel' and x.sens <> 'entrant'
                              and x.resultat in ('pas_de_reponse', 'standard')
                              and x.date > coalesce((select max(y.date) from public.activites y where y.agence_id = a.id and y.type = 'appel' and y.sens <> 'entrant' and y.resultat = 'joint'), '-infinity'::timestamptz))
    union all
    select 'proprietaire_hors_secteur', 'Agence attribuée à quelqu''un d''autre que le démarcheur de son secteur', a.nom
      from public.agences a join public.secteurs s on s.code = a.secteur
     where a.type <> 'apporteur' and a.commercial_id is distinct from s.commercial_id
    union all
    select 'mail_sans_agence', 'E-mail de démarchage envoyé sans agence (invisible sur les fiches)', m.a
      from public.messages m where m.espace = 'demarchage' and m.sens = 'sortant' and m.agence_id is null and m.created_at >= '2026-10-09'
    union all
    select 'endormie_sans_reveil', 'Endormie sans date de réveil ou pour plus de 30 jours', b.nom
      from b where b.etape = 'endormie' and (b.reveil_le is null or b.reveil_le > (b.etape_depuis at time zone 'Europe/Paris')::date + 30)
    union all
    select 'client_sans_os', 'Cliente sans date de premier OS (absente de l''objectif du mois)', b.nom
      from b where b.etape = 'client' and b.premier_os_le is null
  )
  select code, min(libelle), count(*)::integer, string_agg(nom, ' · ' order by nom) filter (where nom is not null)
    from ecarts group by code
$$;
grant execute on function public.sante_demarchage() to authenticated;

-- Contrôle : la liste des écarts d'aujourd'hui (attendu : seulement « appel_non_note » s'il en reste).
select code, nombre, left(exemples, 200) as exemples from public.sante_demarchage();
