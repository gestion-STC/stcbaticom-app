-- ════════════════════════════════════════════════════════════════════════════
-- LINKEDIN DANS LES CAMPAGNES (Mahdi, 11/11/2026 : « option une »)
--   · le profil LinkedIn d'un contact (rempli par l'import d'un fichier Sales Navigator, ou à la main) ;
--   · la base des campagnes le connaît (champ « linkedin ») ;
--   · un nouvel événement : « connexion » (l'invitation LinkedIn est acceptée).
-- À coller dans Baticom. Rejouable.
-- ════════════════════════════════════════════════════════════════════════════
do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'cmp_campagnes') then
    raise exception 'MAUVAIS PROJET : ce SQL se colle dans Baticom.';
  end if;
end $$;

alter table public.contacts add column if not exists linkedin text;

alter table public.cmp_evenements drop constraint if exists cmp_evenements_type_check;
alter table public.cmp_evenements add constraint cmp_evenements_type_check
  check (type = any (array['delivre', 'ouvert', 'clic', 'reponse', 'desinscription', 'rebond', 'connexion']));

-- La base des campagnes : le profil LinkedIn du contact principal, dans les champs.
do $$
declare d text;
begin
  d := pg_get_viewdef('public.cmp_contacts'::regclass);
  if position('''linkedin''' in d) > 0 then return; end if;
  if position('SELECT c.prenom,' in d) = 0 or position('''prenom'', COALESCE(pc.prenom, ''''::text),' in d) = 0 then
    raise exception 'La vue cmp_contacts a changé : rien n''est modifié.';
  end if;
  d := replace(d, 'SELECT c.prenom,', 'SELECT c.linkedin, c.prenom,');
  d := replace(d, '''prenom'', COALESCE(pc.prenom, ''''::text),', '''prenom'', COALESCE(pc.prenom, ''''::text), ''linkedin'', COALESCE(pc.linkedin, ''''::text),');
  execute 'create or replace view public.cmp_contacts with (security_invoker = true) as ' || d;
end $$;

select position('''linkedin''' in pg_get_viewdef('public.cmp_contacts'::regclass)) > 0 as base_avec_linkedin,
       exists (select 1 from information_schema.columns where table_name = 'contacts' and column_name = 'linkedin') as colonne_ok;
