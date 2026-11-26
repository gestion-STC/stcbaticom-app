-- ════════════════════════════════════════════════════════════════════════════
-- LOT 6 (26/11/2026) : défauts trouvés au contrôle final. À coller AVANT la fusion (les écrans lisent st_clics.robot),
-- puis redéployer synchro-clients et lien-st. Rejouable : rien n'est supprimé.
--
--   A. Les sous-traitants de STC Bâtiment (e-mails, paiements, missions) sortent de parametres.chiffres_stc, lisible par
--      toute l'équipe, vers parametres.chiffres_stc_st, que seuls les administrateurs lisent (dashboards Sous-traitants
--      et Campagnes). Le CA reste dans chiffres_stc.
--   B. « A cliqué » côté recrutement : UNE règle, posée en base sur chaque clic (st_clics.robot), la même que celle des
--      agences (site_noter_clic) : un AUTRE lien du même artisan ouvert à 5 s près, ou son lien de désinscription vu à
--      5 s près = un robot de sécurité. La fiche (nb_clics, dernier_clic_le, candidature_clic_le, bareme_vu_le) est
--      recalculée depuis les seuls vrais clics : Leads reçus, session d'appel, vue cmp_contacts (inchangée) et tableaux
--      de bord lisent la même chose. Les événements de campagne de ces clics sont marqués « robot ». Rattrapage des
--      clics existants avec la même règle.
--   C. La proposition de l'IA au raccroché (SQL du 07/11 jamais appliqué) : la table appels_propositions, pour que
--      proposer-resultat range sa proposition et sa transcription, et qu'analyser-appel la reprenne au lieu de la
--      repayer. Lecture : membres de l'équipe (est_membre), pas « tout compte connecté ».
--   D. conseils_avant_appel : l'encart « Avant d'appeler » de la session de call (SQL du 07/11, vérifié sur le schéma
--      actuel et sur les 229 appels analysés).
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- ── A. Les sous-traitants de STC Bâtiment, à part ──────────────────────────────────────────────────────────
alter policy parametres_lecture_membres on public.parametres
  using (est_membre() and cle not in ('analyse_passage_cle', 'ringover_webhook_cle', 'chiffres_stc_st'));

-- Le bloc déjà déposé est déplacé tout de suite (la synchro redéployée fera de même chaque heure).
insert into public.parametres (cle, valeur, maj_le)
select 'chiffres_stc_st', (p.valeur::jsonb -> 'sous_traitants')::text, now()
  from public.parametres p
 where p.cle = 'chiffres_stc' and p.valeur::jsonb ? 'sous_traitants'
on conflict (cle) do update set valeur = excluded.valeur, maj_le = excluded.maj_le;

update public.parametres
   set valeur = (valeur::jsonb - 'sous_traitants')::text, maj_le = now()
 where cle = 'chiffres_stc' and valeur::jsonb ? 'sous_traitants';

-- ── B. Les clics des artisans : robot ou non, une seule règle ──────────────────────────────────────────────
alter table public.st_clics add column if not exists robot boolean not null default false;
comment on column public.st_clics.robot is 'Robot de sécurité de messagerie (26/11/2026) : un autre lien du même artisan ouvert à 5 s près, ou son lien de désinscription vu à 5 s près. Ne compte nulle part.';
alter table public.st_sous_traitants add column if not exists stop_vu_le timestamptz;
comment on column public.st_sous_traitants.stop_vu_le is 'Dernière ouverture (sans confirmation) du lien de désinscription : trahit le robot qui ouvre tous les liens du mail.';

-- B1. LA règle (la même pour le clic qui arrive et pour le rattrapage).
create or replace function public.st_clic_est_robot(p_sous_traitant uuid, p_clic uuid, p_destination text, p_quand timestamptz)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.st_clics a
                  where a.sous_traitant_id = p_sous_traitant and a.id <> p_clic and a.destination <> p_destination
                    and a.clique_le between p_quand - interval '5 seconds' and p_quand + interval '5 seconds')
      or exists (select 1 from public.st_sous_traitants s
                  where s.id = p_sous_traitant and s.stop_vu_le between p_quand - interval '5 seconds' and p_quand + interval '5 seconds')
$$;
revoke all on function public.st_clic_est_robot(uuid, uuid, text, timestamptz) from public, anon, authenticated;

-- B2. Le clic qui arrive est jugé à l'écriture ; s'il trahit un robot, les autres liens de la même rafale aussi.
--     Un verrou par artisan : deux liens ouverts dans la même seconde se voient l'un l'autre.
--     Une désinscription confirmée (bouton, POST) vient d'une personne : jamais jugée.
create or replace function public.st_clic_juger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.destination = 'stop' then return new; end if;
  perform pg_advisory_xact_lock(hashtext('st_clic:' || new.sous_traitant_id::text));
  if public.st_clic_est_robot(new.sous_traitant_id, new.id, new.destination, new.clique_le) then
    new.robot := true;
    update public.st_clics a set robot = true
     where a.sous_traitant_id = new.sous_traitant_id and not a.robot and a.destination <> 'stop' and a.destination <> new.destination
       and a.clique_le between new.clique_le - interval '5 seconds' and new.clique_le + interval '5 seconds';
  end if;
  return new;
end $$;
drop trigger if exists st_clics_juger on public.st_clics;
create trigger st_clics_juger before insert on public.st_clics for each row execute function public.st_clic_juger();

-- B3. Le lien de désinscription ouvert (GET, sans confirmer) : noté sur la fiche, et les liens ouverts juste avant
--     deviennent robots. Appelée par lien-st (clé de service).
create or replace function public.st_noter_stop_vu(p_sous_traitant uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quand timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtext('st_clic:' || p_sous_traitant::text));
  update public.st_sous_traitants set stop_vu_le = v_quand where id = p_sous_traitant;
  update public.st_clics a set robot = true
   where a.sous_traitant_id = p_sous_traitant and not a.robot and a.destination <> 'stop'
     and a.clique_le between v_quand - interval '5 seconds' and v_quand + interval '5 seconds';
end $$;
revoke all on function public.st_noter_stop_vu(uuid) from public, anon, authenticated;

-- B4. La fiche suit le journal, robots exclus (avant : tous les clics, et lien-st écrivait les dates lui-même).
--     Un clic devenu robot : son événement de campagne l'est aussi (ni taux, ni lead, au Suivi comme ailleurs).
create or replace function public.st_clic_vers_fiche()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' and new.robot and not old.robot then
    update public.cmp_evenements e set robot = true
     where e.contact_ref = new.sous_traitant_id::text and e.le = new.clique_le and e.type in ('clic', 'desinscription') and not e.robot;
  end if;
  if new.destination = 'stop' then
    return new;
  end if;
  update public.st_sous_traitants s
     set nb_clics = (select count(*) from public.st_clics c
                      where c.sous_traitant_id = new.sous_traitant_id and c.destination <> 'stop' and not c.robot),
         dernier_clic_le = (select max(c.clique_le) from public.st_clics c
                             where c.sous_traitant_id = new.sous_traitant_id and c.destination <> 'stop' and not c.robot),
         candidature_clic_le = (select max(c.clique_le) from public.st_clics c
                                 where c.sous_traitant_id = new.sous_traitant_id and c.destination = 'candidature' and not c.robot),
         bareme_vu_le = (select max(c.clique_le) from public.st_clics c
                          where c.sous_traitant_id = new.sous_traitant_id and c.destination = 'bareme' and not c.robot)
   where s.id = new.sous_traitant_id;
  return new;
end;
$$;
drop trigger if exists st_clics_vers_fiche on public.st_clics;
create trigger st_clics_vers_fiche after insert or update of robot on public.st_clics for each row execute function public.st_clic_vers_fiche();

-- B5. L'événement de campagne d'un clic porte son verdict dès l'écriture.
create or replace function public.cmp_depuis_clic_st()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare d record;
begin
  select * into d from public.cmp_dernier_envoi(new.sous_traitant_id::text, new.clique_le);
  if d.envoi_id is not null then
    insert into public.cmp_evenements (campagne_id, envoi_id, contact_ref, type, le, lien, robot)
    values (d.campagne_id, d.envoi_id, new.sous_traitant_id::text,
      case when new.destination = 'stop' then 'desinscription' else 'clic' end, new.clique_le,
      case when new.destination = 'bareme' then 'bareme' when new.destination = 'stop' then null else 'principal' end,
      new.robot);
  end if;
  return new;
end $$;

-- B6. Rattrapage : les clics existants, avec la même règle. Chaque clic marqué recalcule sa fiche et marque son
--     événement de campagne (déclencheur B4).
update public.st_clics c
   set robot = true
 where not c.robot and public.st_clic_est_robot(c.sous_traitant_id, c.id, c.destination, c.clique_le);

-- ── C. La proposition de l'IA au raccroché ─────────────────────────────────────────────────────────────────
create table if not exists public.appels_propositions (
  activite_id   uuid primary key references public.activites(id) on delete cascade,
  agence_id     uuid references public.agences(id) on delete cascade,
  compte_id     uuid,
  call_id       text not null default '',
  ia_resultat   text check (ia_resultat in ('pas_de_reponse', 'standard', 'joint', 'faux_numero')),
  ia_issue      text not null default '' check (ia_issue in ('', 'interesse', 'rdv', 'a_rappeler', 'pas_interesse')),
  preuve        text not null default '',
  mail_objet    text not null default '',
  mail_corps    text not null default '',
  transcription text,
  duree_s       integer,
  delai_ms      integer,
  erreur        text,
  cree_le       timestamptz not null default now()
);
create index if not exists appels_propositions_compte on public.appels_propositions (compte_id, cree_le desc);
alter table public.appels_propositions enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'appels_propositions' and policyname = 'lecture_membres') then
    create policy lecture_membres on public.appels_propositions for select to authenticated using (est_membre());
  end if;
end $$;
revoke all on public.appels_propositions from anon;
revoke insert, update, delete on public.appels_propositions from authenticated;

-- ── D. Les 3 lignes avant d'appeler ────────────────────────────────────────────────────────────────────────
-- D'après le dernier appel écouté de l'agence ; sinon d'après les objections les plus fréquentes de l'équipe et la
-- réponse qui les a levées. Rien d'inventé : chaque ligne vient d'un appel analysé.
create or replace function public.conseils_avant_appel(p_agence_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  with dernier as (
    select a.cree_le, a.resume, a.analyse_detail d
    from appels_ia a
    where a.agence_id = p_agence_id and a.statut = 'pret' and a.analyse_detail is not null
    order by a.cree_le desc limit 1
  ),
  reponses as (
    select distinct on (o->>'libelle') o->>'libelle' libelle, o->>'reponse' reponse
    from appels_ia a, jsonb_array_elements(coalesce(a.analyse_detail->'objections', '[]')) o
    where a.statut = 'pret' and (o->>'levee')::boolean and coalesce(o->>'reponse', '') <> ''
    order by o->>'libelle', a.cree_le desc
  ),
  objection as (
    select o->>'libelle' libelle
    from dernier, jsonb_array_elements(coalesce(dernier.d->'objections', '[]')) o
    where not coalesce((o->>'levee')::boolean, false)
    limit 1
  ),
  frequentes as (
    select o->>'libelle' libelle, count(*) n
    from appels_ia a, jsonb_array_elements(coalesce(a.analyse_detail->'objections', '[]')) o
    where a.statut = 'pret'
    group by 1 order by 2 desc limit 2
  )
  select case
    when exists (select 1 from dernier) then jsonb_build_object(
      'source', 'd''après l''appel du ' || to_char((select cree_le from dernier) at time zone 'Europe/Paris', 'DD/MM'),
      'lignes', to_jsonb(array_remove(array[
        (select case when coalesce(d->>'prochaine_etape', '') <> '' then 'Au dernier appel : ' || (d->>'prochaine_etape')
                     else 'Au dernier appel : ' || regexp_replace(split_part(coalesce(resume, ''), E'\n', 1), '^\s*-\s*', '') end from dernier),
        (select 'Objection entendue : « ' || o.libelle || ' ».' || coalesce(' Ce qui a marché chez nous : « ' || r.reponse || ' »', '')
           from objection o left join reponses r on r.libelle = o.libelle),
        (select 'À faire cette fois : ' || (d->'a_ameliorer'->>0) from dernier where coalesce(d->'a_ameliorer'->>0, '') <> '')
      ], null)))
    else jsonb_build_object(
      'source', 'jamais écoutée · d''après les appels de l''équipe',
      'lignes', coalesce((select jsonb_agg('Objection fréquente : « ' || f.libelle || ' ».' || coalesce(' Ce qui a marché : « ' || r.reponse || ' »', '') order by f.n desc)
                            from frequentes f left join reponses r on r.libelle = f.libelle), '[]'::jsonb))
  end
$$;
grant execute on function public.conseils_avant_appel(uuid) to authenticated;
revoke execute on function public.conseils_avant_appel(uuid) from anon, public;

commit;

-- ── Contrôle. Attendu au 26/11 (14 h) :
--   chiffres_stc_sans_st true · chiffres_stc_st 40 · st_cache_aux_membres true
--   clics_robot 38 · fiches_avec_clic 126 (132 avant : 6 artisans n'avaient que des clics de robot)
--   fiches_fausses 0 (nb_clics = vrais clics du journal) · evenements_robot_artisans 38 (12 déjà marqués au lot 1, 26 de plus)
--   declencheurs 3 · propositions_table 1 · conseils_ok true
select
  (select not (valeur::jsonb ? 'sous_traitants') from public.parametres where cle = 'chiffres_stc') as chiffres_stc_sans_st,
  (select jsonb_array_length(valeur::jsonb) from public.parametres where cle = 'chiffres_stc_st') as chiffres_stc_st,
  (select qual like '%chiffres_stc_st%' from pg_policies where tablename = 'parametres' and policyname = 'parametres_lecture_membres') as st_cache_aux_membres,
  (select count(*) from public.st_clics where robot) as clics_robot,
  (select count(*) from public.st_sous_traitants where nb_clics > 0) as fiches_avec_clic,
  (select count(*) from public.st_sous_traitants s
    where s.nb_clics <> (select count(*) from public.st_clics c where c.sous_traitant_id = s.id and c.destination <> 'stop' and not c.robot)) as fiches_fausses,
  (select count(*) from public.cmp_evenements e join public.st_clics c on e.contact_ref = c.sous_traitant_id::text and e.le = c.clique_le
    where c.robot and e.robot and e.type in ('clic', 'desinscription')) as evenements_robot_artisans,
  (select count(*) from pg_trigger where tgrelid = 'public.st_clics'::regclass and tgname in ('st_clics_juger', 'st_clics_vers_fiche', 'cmp_clic_st') and tgenabled <> 'D') as declencheurs,
  (select count(*) from pg_class where relname = 'appels_propositions') as propositions_table,
  (select jsonb_typeof(public.conseils_avant_appel((select agence_id from public.appels_ia where statut = 'pret' and agence_id is not null order by cree_le desc limit 1)) -> 'lignes') = 'array') as conseils_ok;
