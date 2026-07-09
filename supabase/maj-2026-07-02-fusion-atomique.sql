-- Fusion de doublons « tout ou rien » (transaction atomique).
--
-- Une fonction Postgres s'exécute TOUJOURS dans une seule transaction : si une
-- étape échoue (coupure réseau, table verrouillée…), TOUT est annulé et aucune
-- fiche n'est supprimée ni modifiée. On ne peut donc jamais se retrouver avec
-- un historique à moitié déplacé.
--
-- À exécuter une fois dans Supabase : SQL Editor → coller → Run.
-- Tant que ce script n'est pas exécuté, l'appli utilise l'ancienne méthode
-- (étape par étape, non atomique) automatiquement, donc rien ne casse.

create or replace function public.fusionner_prospects(
  p_garde  uuid,
  p_autres uuid[],
  p_champs jsonb
) returns void
language plpgsql
as $$
begin
  if p_garde is null then
    raise exception 'Fiche à garder manquante';
  end if;
  -- rien à fusionner : sortie sans effet
  if p_autres is null or array_length(p_autres, 1) is null then
    return;
  end if;

  -- 1) Réaffecter l'historique des « autres » vers la fiche gardée.
  update public.appels set prospect_id = p_garde where prospect_id = any(p_autres);
  update public.rdv    set prospect_id = p_garde where prospect_id = any(p_autres);

  -- Table optionnelle : on ne la touche que si elle existe.
  if to_regclass('public.emails_envoyes') is not null then
    execute 'update public.emails_envoyes set prospect_id = $1 where prospect_id = any($2)'
      using p_garde, p_autres;
  end if;

  -- 2) Liens agence : déplacer sans jamais créer de doublon de lien.
  if to_regclass('public.prospect_agence') is not null then
    -- On supprime tous les liens des « autres » SAUF un seul par agence encore
    -- absente de la fiche gardée ; ce survivant sera ensuite rattaché à la gardée.
    execute '
      delete from public.prospect_agence pa
      where pa.prospect_id = any($2)
        and pa.id not in (
          select distinct on (agence_id) id
          from public.prospect_agence
          where prospect_id = any($2)
            and agence_id not in (
              select agence_id from public.prospect_agence where prospect_id = $1
            )
          order by agence_id, id
        )'
      using p_garde, p_autres;
    execute 'update public.prospect_agence set prospect_id = $1 where prospect_id = any($2)'
      using p_garde, p_autres;
  end if;

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

-- Autoriser l'appli (clé anon) à appeler la fonction.
grant execute on function public.fusionner_prospects(uuid, uuid[], jsonb) to anon, authenticated;
