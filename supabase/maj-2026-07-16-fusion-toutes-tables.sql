-- Fusion de doublons — CORRECTIF : prendre en compte TOUTES les tables liées
-- à un prospect, y compris celles ajoutées après coup.
--
-- POURQUOI : la version précédente déplaçait l'historique de 4 tables connues
-- (appels, rdv, emails_envoyes, prospect_agence). Depuis, la table `messages`
-- (boîte mail) a été ajoutée avec une colonne prospect_id. La fusion tentait
-- donc de supprimer une fiche encore référencée par des messages :
--   - soit la base refusait la suppression  → « la fusion a échoué »,
--   - soit elle supprimait les messages en cascade → perte de l'historique,
-- alors que la fusion promet justement de TOUT garder.
--
-- CORRECTIF : au lieu d'énumérer les tables à la main (à refaire à chaque
-- nouvelle table), on réaffecte automatiquement toute table publique qui
-- possède une colonne `prospect_id`. Les prochaines tables seront donc prises
-- en charge toutes seules.
--
-- À exécuter une fois dans Supabase : SQL Editor → coller → Run.
-- Sans danger : ce script ne fait que REMPLACER la fonction (aucune donnée
-- n'est touchée). L'avertissement « opérations destructives » affiché par
-- Supabase vient du mot « delete » présent dans le corps de la fonction.

create or replace function public.fusionner_prospects(
  p_garde  uuid,
  p_autres uuid[],
  p_champs jsonb
) returns void
language plpgsql
as $$
declare
  t record;
begin
  if p_garde is null then
    raise exception 'Fiche à garder manquante';
  end if;
  -- rien à fusionner : sortie sans effet
  if p_autres is null or array_length(p_autres, 1) is null then
    return;
  end if;
  -- garde-fou : la fiche conservée ne doit jamais figurer parmi les supprimées
  if p_garde = any(p_autres) then
    raise exception 'La fiche à garder ne peut pas être dans la liste à supprimer';
  end if;

  -- 1) Liens agence D'ABORD : cas particulier, car un lien (prospect, agence)
  --    est unique. On RATTACHE les agences des fiches absorbées à la fiche
  --    gardée en ignorant les liens déjà présents, puis on retire les anciens.
  --
  --    NB : cette table n'a PAS de colonne « id » (sa clé est le couple
  --    prospect_id + agence_id). La version précédente s'appuyait sur un « id »
  --    inexistant : toute fusion échouait avec « column "id" does not exist ».
  if to_regclass('public.prospect_agence') is not null then
    insert into public.prospect_agence (prospect_id, agence_id)
    select distinct p_garde, pa.agence_id
    from public.prospect_agence pa
    where pa.prospect_id = any(p_autres)
    on conflict do nothing;

    delete from public.prospect_agence where prospect_id = any(p_autres);
  end if;

  -- 2) Toutes les autres tables liées : réaffectation AUTOMATIQUE.
  --    Couvre appels, rdv, emails_envoyes, messages… et toute table ajoutée
  --    plus tard avec une colonne prospect_id. (prospect_agence est exclue :
  --    elle vient d'être traitée ci-dessus, avec sa règle d'unicité.)
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema
     and tb.table_name  = c.table_name
    where c.table_schema = 'public'
      and c.column_name  = 'prospect_id'
      and tb.table_type  = 'BASE TABLE'
      and c.table_name  <> 'prospect_agence'
  loop
    execute format(
      'update public.%I set prospect_id = $1 where prospect_id = any($2)', t.table_name
    ) using p_garde, p_autres;
  end loop;

  -- 3) Écrire les champs fusionnés sur la fiche gardée
  --    (on ne remplace que si une valeur fusionnée est fournie).
  update public.prospects set
    entreprise     = coalesce(p_champs->>'entreprise',     entreprise),
    contact        = coalesce(p_champs->>'contact',        contact),
    email          = coalesce(p_champs->>'email',          email),
    telephone      = coalesce(p_champs->>'telephone',      telephone),
    adresse        = coalesce(p_champs->>'adresse',        adresse),
    arrondissement = coalesce(p_champs->>'arrondissement', arrondissement),
    volume_os      = coalesce(p_champs->>'volume_os',      volume_os),
    commentaire    = coalesce(p_champs->>'commentaire',    commentaire)
  where id = p_garde;

  -- 4) Supprimer les autres fiches (leur historique est déjà déplacé).
  delete from public.prospects where id = any(p_autres);
end;
$$;

grant execute on function public.fusionner_prospects(uuid, uuid[], jsonb) to anon, authenticated;
