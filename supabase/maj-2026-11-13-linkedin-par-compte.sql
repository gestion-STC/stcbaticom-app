-- ════════════════════════════════════════════════════════════════════════════
-- LINKEDIN : LE PLAFOND COMPTE PAR COMPTE (Mahdi, 13/11/2026)
-- Chaque action LinkedIn partie note le compte qui l'a envoyée. Le moteur compte alors les plafonds (jour, semaine)
-- compte par compte : LinkedIn surveille chaque compte séparément, et deux comptes ne se partagent plus 20 actions.
-- Additif : une colonne vide, rien d'autre ne change. Les envois d'avant (aucun le 13/11) restent sans compte.
-- ════════════════════════════════════════════════════════════════════════════
do $$
begin
  if to_regclass('public.cmp_envois') is null then
    raise exception 'MAUVAIS PROJET : ce fichier est pour STC Baticom (table cmp_envois absente).';
  end if;
end $$;

alter table public.cmp_envois add column if not exists compte_linkedin text;

create index if not exists cmp_envois_linkedin_compte on public.cmp_envois (compte_linkedin, le) where canal = 'linkedin';

-- Vérification : la colonne existe.
select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'cmp_envois' and column_name = 'compte_linkedin';
