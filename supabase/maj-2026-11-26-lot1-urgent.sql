-- LOT 1 URGENT (26/11/2026). Réparation des données. Rien n'est supprimé. Rejouable sans effet (idempotent).
--   A. Campagne « Prospection · base existante (histoires) » : les 30 mails du 23/11 (07h00 et 07h10) notés « envoyé »
--      sans jamais être partis (Instantly sans abonnement) redeviennent « non partis » (statut erreur, cause écrite),
--      et leurs 30 agences reviennent au PREMIER mail, à renvoyer quand Instantly repart. Elles ne comptent plus comme
--      « déjà sollicitées » pour l'écart entre campagnes (seuls les envois « envoyé » comptent).
--   B. Les artisans désinscrits « par le lien » alors que c'était un robot de sécurité (le lien « stop » ouvert avec
--      d'autres liens du même mail dans les 5 secondes) sont réactivés : statut d'avant, adresse sortie de la liste
--      d'exclusion (la ligne est gardée, neutralisée), événements de la campagne marqués « robot ».
begin;

-- A1. Les envois jamais confirmés partis.
update public.cmp_envois en
   set statut = 'erreur',
       cause = 'Non parti : Instantly n''a jamais confirmé l''envoi (abonnement coupé) ; renvoyé comme premier mail'
 where en.campagne_id = '7f7abd6c-5065-431b-8109-6a058d7927c4'
   and en.statut = 'envoye' and not en.test and en.canal = 'mail'
   and en.le >= '2026-11-23 07:00:00+00' and en.le < '2026-11-23 07:15:00+00'
   and not exists (select 1 from public.cmp_evenements v where v.envoi_id = en.id and v.type = 'delivre');

-- A2. Leurs inscriptions reviennent au premier mail (étape 0), dû dès la prochaine boîte Instantly prête.
--     Seulement tant qu'aucun mail n'est reparti pour elles : rejoué plus tard, ce bloc ne touche à rien.
update public.cmp_inscriptions i
   set etape_index = 0, prochaine_le = now()
 where i.campagne_id = '7f7abd6c-5065-431b-8109-6a058d7927c4'
   and i.statut = 'en_cours' and i.etape_index <> 0
   and exists (select 1 from public.cmp_envois en where en.inscription_id = i.id and en.cause like 'Non parti : Instantly%')
   and not exists (select 1 from public.cmp_envois en where en.inscription_id = i.id and en.statut = 'envoye');

-- B0. Les artisans concernés : désinscrits par le lien, dont un clic « stop » a un autre lien ouvert à 5 s près.
create temp table lot1_robots on commit drop as
select s.id, lower(trim(s.email)) as email, s.telephone
  from public.st_sous_traitants s
 where s.statut = 'desinscrit' and s.desinscrit_canal = 'lien'
   and exists (select 1 from public.st_clics c join public.st_clics a on a.sous_traitant_id = c.sous_traitant_id
                where c.sous_traitant_id = s.id and c.destination = 'stop' and a.destination <> 'stop'
                  and a.clique_le between c.clique_le - interval '5 seconds' and c.clique_le + interval '5 seconds');

-- B1. L'adresse sort de la liste d'exclusion : la ligne posée par le lien est gardée, vidée, et dit pourquoi.
update public.st_exclusions x
   set motif = 'annulée le 26/11/2026 (robot de sécurité, pas l''artisan) : ' || coalesce(x.email, '') || ' ' || coalesce(x.telephone, ''),
       email = null, telephone = null
  from lot1_robots r
 where x.motif = 'désinscription par le lien' and lower(x.email) = r.email;

-- B2. Les événements de campagne posés par le robot (la désinscription et les clics de la même rafale).
update public.cmp_evenements e
   set robot = true
  from lot1_robots r
 where e.contact_ref = r.id::text and not e.robot and e.type in ('desinscription', 'clic')
   and exists (select 1 from public.st_clics c where c.sous_traitant_id = r.id and c.destination = 'stop'
                and e.le between c.clique_le - interval '5 seconds' and c.clique_le + interval '5 seconds');

-- B3. Leur campagne (« Recrutement · machine sous-traitants », terminée) ne les compte plus comme désinscrits.
update public.cmp_inscriptions i
   set statut = 'terminee'
  from lot1_robots r
 where i.contact_ref = r.id::text and i.statut = 'desinscrit';

-- B4. La fiche : le statut d'avant. Leur séquence (ancienne machine) est finie pour tous : « termine » (Séquence finie),
--     comme les 300 autres fiches de la même séquence ; « en_sequence » la relancerait (sequenceur-st tourne encore).
update public.st_sous_traitants s
   set statut = 'termine', termine_le = coalesce(s.termine_le, now()), desinscrit_le = null, desinscrit_canal = '',
       statut_motif = 'réactivé le 26/11/2026 : la désinscription du ' || to_char(s.desinscrit_le at time zone 'Europe/Paris', 'DD/MM HH24:MI') || ' venait d''un robot de sécurité'
  from lot1_robots r
 where s.id = r.id;

commit;

-- CONTRÔLE. Attendu : envois_non_partis 30 · inscriptions_au_premier_mail 30 · artisans_reactives 2
--   · exclusions_annulees 2 · desinscriptions_robot 3 (SOC PEINTURE : 2, DALEOS : 1)
--   · encore_envoye_sans_confirmation 0 (la campagne « histoires » n'a plus de mail « envoyé » non confirmé).
select
  (select count(*) from public.cmp_envois where cause like 'Non parti : Instantly%' and statut = 'erreur') as envois_non_partis,
  (select count(distinct i.id) from public.cmp_inscriptions i join public.cmp_envois en on en.inscription_id = i.id
    where en.cause like 'Non parti : Instantly%' and i.statut = 'en_cours' and i.etape_index = 0) as inscriptions_au_premier_mail,
  (select count(*) from public.st_sous_traitants where statut_motif like 'réactivé le 26/11/2026%') as artisans_reactives,
  (select count(*) from public.st_exclusions where motif like 'annulée le 26/11/2026%') as exclusions_annulees,
  (select count(*) from public.cmp_evenements e join public.st_sous_traitants s on e.contact_ref = s.id::text
    where s.statut_motif like 'réactivé le 26/11/2026%' and e.type = 'desinscription' and e.robot) as desinscriptions_robot,
  (select count(*) from public.cmp_envois en where en.campagne_id = '7f7abd6c-5065-431b-8109-6a058d7927c4' and en.statut = 'envoye' and not en.test
    and not exists (select 1 from public.cmp_evenements v where v.envoi_id = en.id and v.type = 'delivre')) as encore_envoye_sans_confirmation,
  (select string_agg(entreprise, ', ' order by entreprise) from public.st_sous_traitants where statut_motif like 'réactivé le 26/11/2026%') as artisans;
