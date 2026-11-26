-- LOT 2 (27/11/2026) : moteur des campagnes. Rien n'est supprimé. Rejouable sans effet (idempotent).
--   D9  : une campagne créée ou dupliquée depuis l'écran ne part plus en mode test (valeur par défaut de mode_test à false).
--         Les 4 campagnes existantes ne changent pas (« Recrutement · machine », terminée, reste à true).
--   D16 : les liens COURTS des SMS d'avis (« ?a=<code> ») : la table qui relie un code au lien signé. Lue et écrite
--         seulement par les fonctions serveur (RLS active, aucune politique : ni l'écran ni le public n'y ont accès).
-- À coller avant ou après la fusion, peu importe : sans la table, le moteur garde le long lien (rien ne casse).
begin;

alter table public.cmp_campagnes alter column mode_test set default false;

create table if not exists public.cmp_liens_courts (
  code        text primary key,
  campagne_id uuid not null,
  creatif_id  text not null,
  contact_ref text not null,
  test        boolean not null default false,
  cree_le     timestamptz not null default now()
);
create unique index if not exists cmp_liens_courts_contact_idx on public.cmp_liens_courts (campagne_id, creatif_id, contact_ref, test);
alter table public.cmp_liens_courts enable row level security;
revoke all on public.cmp_liens_courts from anon, authenticated;

commit;

-- Contrôle. Attendu : defaut_mode_test = false ; table_liens_courts = 1 ; rls = true ; politiques = 0 ;
-- campagnes_en_test = 1 (« Recrutement · machine sous-traitants », terminée).
select
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'cmp_campagnes' and column_name = 'mode_test') as defaut_mode_test,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'cmp_liens_courts') as table_liens_courts,
  (select relrowsecurity from pg_class where oid = 'public.cmp_liens_courts'::regclass) as rls,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'cmp_liens_courts') as politiques,
  (select count(*) from public.cmp_campagnes where mode_test) as campagnes_en_test;
