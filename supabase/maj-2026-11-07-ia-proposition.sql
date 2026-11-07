-- ════════════════════════════════════════════════════════════════════════════
-- L'IA PROPOSE LE RÉSULTAT DE L'APPEL (07/11/2026, Mahdi : « l'IA analyse l'appel et propose
-- le résultat ; le commercial valide ou modifie ; on voit si elle analyse bien »).
--
-- 1. `appels_propositions` : ce que l'IA a proposé au raccroché, pour CHAQUE appel écouté (même
--    sans réponse). Le choix du commercial reste dans `activites` (resultat, issue) : comparer les
--    deux mesure la justesse de l'IA. Table À PART de `appels_ia` : les écrans d'analyse et
--    « Mails à envoyer » ne voient rien changer. La transcription y est gardée : l'analyse complète
--    (analyser-appel, après la validation) la reprend au lieu de la payer une 2e fois.
-- 2. `conseils_avant_appel(agence)` : les 3 lignes de l'IA sur la fiche, avant d'appeler.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Les propositions ──
create table if not exists public.appels_propositions (
  activite_id   uuid primary key references public.activites(id) on delete cascade,
  agence_id     uuid references public.agences(id) on delete cascade,
  compte_id     uuid,
  call_id       text not null default '',          -- TEXTE : dépasse 2^53
  ia_resultat   text check (ia_resultat in ('pas_de_reponse', 'standard', 'joint', 'faux_numero')),
  ia_issue      text not null default '' check (ia_issue in ('', 'interesse', 'rdv', 'a_rappeler', 'pas_interesse')),
  preuve        text not null default '',
  mail_objet    text not null default '',
  mail_corps    text not null default '',
  transcription text,
  duree_s       integer,
  delai_ms      integer,                           -- du début du travail à la proposition (l'objectif : 10 s)
  erreur        text,
  cree_le       timestamptz not null default now()
);
create index if not exists appels_propositions_compte on public.appels_propositions (compte_id, cree_le desc);

-- Lecture pour les comptes connectés (le futur écran « justesse de l'IA ») ; l'écriture, la fonction seule (clé de service).
alter table public.appels_propositions enable row level security;
drop policy if exists "lecture_connecte" on public.appels_propositions;
create policy "lecture_connecte" on public.appels_propositions for select to authenticated using (true);
revoke all on public.appels_propositions from anon;
revoke insert, update, delete on public.appels_propositions from authenticated;

-- ── 2. Les 3 lignes avant d'appeler ──
-- D'après le dernier appel écouté de l'agence ; sinon d'après les objections les plus fréquentes de
-- l'équipe et la réponse qui les a levées. Rien d'inventé : chaque ligne vient d'un appel analysé.
create or replace function public.conseils_avant_appel(p_agence_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  with dernier as (
    select a.cree_le, a.resume, a.analyse_detail d
    from appels_ia a
    where a.agence_id = p_agence_id and a.statut = 'pret' and a.analyse_detail is not null
    order by a.cree_le desc limit 1
  ),
  reponses as (                                    -- la réponse la plus récente qui a levé chaque objection
    select distinct on (o->>'libelle') o->>'libelle' libelle, o->>'reponse' reponse
    from appels_ia a, jsonb_array_elements(coalesce(a.analyse_detail->'objections', '[]')) o
    where a.statut = 'pret' and (o->>'levee')::boolean and coalesce(o->>'reponse', '') <> ''
    order by o->>'libelle', a.cree_le desc
  ),
  objection as (                                   -- l'objection restée ouverte au dernier appel
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
