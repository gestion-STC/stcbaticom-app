-- ============================================================================
--  À COLLER DANS LE PROJET **STCBATICOM** (ifvrmsiwlwppinfdmeao).
--
--  Le lien « ouvrir mon accès » (11/10/2026) : quand les contrats sont signés
--  par les deux parties, STC Bâtiment envoie à l'artisan un lien pour ouvrir
--  lui-même son accès à l'Espace Partenaire. La fiche de recrutement note
--  quand le lien est parti et quand l'accès a été ouvert.
-- ============================================================================
do $$ begin
  if to_regclass('public.st_sous_traitants') is null then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans STCBATICOM (ifvrmsiwlwppinfdmeao).';
  end if;
end $$;

alter table public.st_sous_traitants
  add column if not exists acces_envoye_le timestamptz,       -- le lien est parti
  add column if not exists acces_ouvert_le timestamptz,       -- l'artisan a ouvert son accès sur STC Bâtiment
  add column if not exists acces_email     text not null default '';

-- Contrôle
select count(*) filter (where acces_envoye_le is not null) as liens_envoyes, count(*) filter (where acces_ouvert_le is not null) as acces_ouverts from public.st_sous_traitants;
