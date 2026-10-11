-- ============================================================================
--  À COLLER DANS LE PROJET **STCBATICOM** (ifvrmsiwlwppinfdmeao).
--
--  « Dossier complet » (Mahdi, 11/10) : quand les contrats sont signés par les
--  deux parties, le PDF signé rejoint les pièces du dossier déposé, et le
--  dossier passe « complet » : c'est le dossier final de l'artisan.
-- ============================================================================
do $$ begin
  if to_regclass('public.dossiers_st') is null then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans STCBATICOM (ifvrmsiwlwppinfdmeao).';
  end if;
end $$;

alter table public.dossiers_st add column if not exists complet_le timestamptz;

-- Le serveur (docusign-evenements) range le PDF signé dans le bucket des pièces du dossier : il doit pouvoir y écrire.
-- (le service_role passe déjà ; rien à ouvrir côté utilisateurs : lecture par lien signé, comme les autres pièces)

-- Contrôle
select raison_sociale, traite_le is not null as traite, complet_le is not null as complet from public.dossiers_st order by created_at desc;
